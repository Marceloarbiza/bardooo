// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////////////////
    PLATAFORMA DE APUESTAS P2P  —  ESQUELETO (binario, escalable a N opciones)
    --------------------------------------------------------------------------
    Diseño acordado:
      - Apuesta binaria SI / NO, pero las opciones se guardan INDEXADAS POR
        NUMERO (poolByOption[0]=NO, [1]=SI). numOptions=2 hoy; subir a N en el
        futuro NO cambia la matematica de reparto, solo un parametro y la UI.
      - Token: USDC en Polygon (6 decimales). Toda la aritmetica es en unidades
        minimas del token (1 USDC = 1_000_000), nunca en "dolares con coma".
      - Reparto proporcional: payout = stake * poteNeto / poteGanador.
        Se MULTIPLICA antes de dividir (Math.mulDiv) -> sin perder precision y
        truncando siempre hacia abajo (el contrato queda solvente; sobra "dust").
      - Comision sobre el TOTAL apostado, pero topeada al pozo perdedor:
        comision = min(bps * total / 10000, pozoPerdedor).
        Esto garantiza que ningun ganador cobre menos que su stake.
      - Cobro tipo "pull": cada ganador llama a claim() (evita loops y reentrada).
      - Confianza en el creador (sin oraculo) + valvula de escape: si no resuelve
        dentro del plazo de gracia, cualquiera puede gatillar la devolucion.
      - Gasless: ERC-2771 (meta-transacciones). La plataforma puede pagar el gas;
        el usuario solo toca USDC. Por eso se usa _msgSender() y nunca msg.sender.

    ADVERTENCIA: esto es un ESQUELETO de arranque. NO esta auditado ni testeado.
    Falta hardening, tests exhaustivos y una auditoria antes de tocar mainnet.
//////////////////////////////////////////////////////////////////////////*/

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/*//////////////////////////////////////////////////////////////////////////
                                  FACTORY
    Crea cada apuesta y guarda la config a nivel plataforma (token, treasury,
    comision de la plataforma, techo de comision del creador, forwarder gasless).
    El dinero NUNCA pasa por la factory: vive dentro de cada contrato Bet.
//////////////////////////////////////////////////////////////////////////*/
contract BetFactory is ERC2771Context {
    address public immutable forwarder;     // trusted forwarder (ERC-2771)
    address public immutable token;         // USDC en Polygon
    address public owner;                   // admin de la plataforma
    address public treasury;                // recibe la comision de la plataforma
    uint16  public platformFeeBps;          // ej. 300 = 3%
    uint16  public maxCreatorFeeBps;        // techo del creador, ej. 1000 = 10%
    uint64  public gracePeriod;             // seg. tras resolveTime para habilitar devolucion (ej. 48h = 172800)

    address[] public allBets;

    event BetCreated(address indexed bet, address indexed creator, string description);

    error NotOwner();
    error CreatorFeeTooHigh();

    modifier onlyOwner() {
        if (_msgSender() != owner) revert NotOwner();
        _;
    }

    constructor(
        address _forwarder,
        address _token,
        address _treasury,
        uint16  _platformFeeBps,
        uint16  _maxCreatorFeeBps,
        uint64  _gracePeriod
    ) ERC2771Context(_forwarder) {
        forwarder        = _forwarder;
        token            = _token;
        treasury         = _treasury;
        owner            = _msgSender();
        platformFeeBps   = _platformFeeBps;
        maxCreatorFeeBps = _maxCreatorFeeBps;
        gracePeriod      = _gracePeriod;
    }

    /// @notice Crea una nueva apuesta. Para binario, cfg.numOptions = 2.
    function createBet(Bet.Config calldata cfg) external returns (address) {
        if (cfg.creatorFeeBps > maxCreatorFeeBps) revert CreatorFeeTooHigh();

        Bet bet = new Bet(
            forwarder,
            token,
            treasury,
            platformFeeBps,
            gracePeriod,      // periodo de gracia fijado por la plataforma
            _msgSender(),     // creador real, incluso via meta-tx
            cfg
        );
        allBets.push(address(bet));
        emit BetCreated(address(bet), _msgSender(), cfg.description);
        return address(bet);
    }

    function totalBets() external view returns (uint256) {
        return allBets.length;
    }

    // --- admin ---
    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setPlatformFee(uint16 bps) external onlyOwner { platformFeeBps = bps; }
    function setMaxCreatorFee(uint16 bps) external onlyOwner { maxCreatorFeeBps = bps; }
    function setGracePeriod(uint64 secs) external onlyOwner { gracePeriod = secs; }
    function transferOwnership(address n) external onlyOwner { owner = n; }

    // NOTA escalabilidad/gas: para abaratar el despliegue de muchas apuestas,
    // migrar de `new Bet(...)` a clones EIP-1167 (OpenZeppelin Clones) + initialize().
}

/*//////////////////////////////////////////////////////////////////////////
                              CONTRATO BET
    Una instancia por apuesta. Guarda los pozos por opcion, recibe stakes,
    deja que el creador resuelva (con candado de tiempo) y que cada ganador
    cobre por su cuenta. Maneja anulacion, cancelacion y devolucion.
//////////////////////////////////////////////////////////////////////////*/
contract Bet is ERC2771Context, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Locked, Resolved, Cancelled }
    enum StakeMode { Fixed, Free, Capped }

    struct Config {
        string    description;    // la pregunta (ej. "Persona A da el primer golpe?")
        uint8     numOptions;     // 2 = binario (0=NO, 1=SI). Escalable a N.
        StakeMode stakeMode;      // Fixed / Free / Capped
        uint256   fixedAmount;    // si Fixed: monto exacto que todos apuestan
        uint256   maxStake;       // si Capped: tope por usuario
        uint256   minStake;       // minimo de apuesta (evita que el gas se coma apuestas chicas)
        uint256   maxBettors;     // 0 = sin limite; >0 = tope TOTAL de apostadores
        uint64    closeTime;      // cierre de apuestas (5 min antes del evento)
        uint64    resolveTime;    // a partir de cuando el creador puede resolver
        uint16    creatorFeeBps;  // comision del creador (la factory ya valido <= techo)
    }

    // --- inmutables / plataforma ---
    address public immutable token;
    address public immutable treasury;
    address public immutable creator;
    uint16  public immutable platformFeeBps;
    uint64  public immutable gracePeriod;   // fijado por la plataforma (BetFactory)

    // --- config ---
    Config public config;

    // --- estado ---
    Status  public status;
    uint8   public winningOption;
    uint256 public totalBettors;
    uint256 public totalPool;
    bool    public feesWithdrawn;

    mapping(uint8 => uint256) public poolByOption;                  // pozo por opcion
    mapping(address => mapping(uint8 => uint256)) public stakeOf;   // stake del usuario por opcion
    mapping(address => bool) public hasBet;                         // para contar apostadores unicos
    mapping(address => bool) public settled;                        // ya cobro o ya se le devolvio

    // --- eventos ---
    event BetPlaced(address indexed user, uint8 indexed option, uint256 amount);
    event LockedEvent();
    event Resolved(uint8 indexed option);
    event Cancelled(string reason);
    event Claimed(address indexed user, uint256 amount);
    event Refunded(address indexed user, uint256 amount);
    event FeesWithdrawn(uint256 platformCut, uint256 creatorCut);

    // --- errores ---
    error NotCreator();
    error BadState();
    error BettingClosed();
    error InvalidOption();
    error WrongAmount();
    error BelowMin();
    error OverCap();
    error AlreadyOnOtherSide();
    error AlreadySettled();
    error NothingToClaim();
    error TooEarly();
    error GraceNotOver();

    constructor(
        address _forwarder,
        address _token,
        address _treasury,
        uint16  _platformFeeBps,
        uint64  _gracePeriod,
        address _creator,
        Config memory cfg
    ) ERC2771Context(_forwarder) {
        require(cfg.numOptions >= 2, "min 2 opciones");
        require(cfg.closeTime < cfg.resolveTime, "tiempos invalidos");
        require(cfg.minStake > 0, "min > 0");
        if (cfg.stakeMode == StakeMode.Fixed)  require(cfg.fixedAmount >= cfg.minStake, "fijo < min");
        if (cfg.stakeMode == StakeMode.Capped) require(cfg.maxStake   >= cfg.minStake, "tope < min");

        token          = _token;
        treasury       = _treasury;
        creator        = _creator;
        platformFeeBps = _platformFeeBps;
        gracePeriod    = _gracePeriod;
        config         = cfg;
        status         = Status.Open;
    }

    /*//////////////////////////////////////////////////////////
                              APOSTAR
    //////////////////////////////////////////////////////////*/
    /// @dev El usuario debe haber hecho approve(USDC) a este contrato antes.
    function placeBet(uint8 option, uint256 amount) external nonReentrant {
        if (status != Status.Open) revert BadState();
        if (block.timestamp >= config.closeTime) revert BettingClosed();
        if (option >= config.numOptions) revert InvalidOption();

        // Validacion segun el modo de monto (la unica diferencia entre los 3 modos)
        if (config.stakeMode == StakeMode.Fixed) {
            if (amount != config.fixedAmount) revert WrongAmount();
        } else {
            if (amount < config.minStake) revert BelowMin();
            if (config.stakeMode == StakeMode.Capped) {
                if (stakeOf[_msgSender()][option] + amount > config.maxStake) revert OverCap();
            }
        }

        address user = _msgSender();

        // Un usuario queda atado a UN solo lado: si ya tiene stake en otra
        // opcion, no puede apostar a la contraria (si puede sumar a la misma).
        // Generico: recorre todas las opciones, asi escala a N sin cambios.
        for (uint8 i = 0; i < config.numOptions; i++) {
            if (i != option && stakeOf[user][i] > 0) revert AlreadyOnOtherSide();
        }

        if (!hasBet[user]) {
            hasBet[user] = true;
            totalBettors += 1;
        }

        IERC20(token).safeTransferFrom(user, address(this), amount);

        stakeOf[user][option] += amount;
        poolByOption[option]  += amount;
        totalPool             += amount;
        emit BetPlaced(user, option, amount);

        // Tope TOTAL de apostadores: al llenarse, se bloquea (no entra nadie mas).
        if (config.maxBettors != 0 && totalBettors >= config.maxBettors) {
            status = Status.Locked;
            emit LockedEvent();
        }
    }

    /*//////////////////////////////////////////////////////////
                            RESOLVER
    //////////////////////////////////////////////////////////*/
    /// @notice Solo el creador, y solo despues de resolveTime (candado de tiempo).
    function resolve(uint8 option) external {
        if (_msgSender() != creator) revert NotCreator();
        if (status != Status.Open && status != Status.Locked) revert BadState();
        if (block.timestamp < config.resolveTime) revert TooEarly();
        if (option >= config.numOptions) revert InvalidOption();

        // Anulacion automatica: si no hubo "contienda" (menos de 2 opciones con
        // dinero, ej. todos de un solo lado), se cancela y todos recuperan su stake.
        if (!_hasContest()) {
            status = Status.Cancelled;
            emit Cancelled("sin contraparte");
            return;
        }

        winningOption = option;
        status = Status.Resolved;
        emit Resolved(option);
    }

    /// @notice Empate / evento cancelado: el creador anula y todos recuperan su stake, sin comision.
    function cancel() external {
        if (_msgSender() != creator) revert NotCreator();
        if (status != Status.Open && status != Status.Locked) revert BadState();
        status = Status.Cancelled;
        emit Cancelled("cancelada por el creador");
    }

    /// @notice Valvula de escape: si el creador no resolvio dentro del plazo de
    ///         gracia, CUALQUIERA puede gatillar la devolucion. La plata nunca queda atrapada.
    function forceRefund() external {
        if (status != Status.Open && status != Status.Locked) revert BadState();
        if (block.timestamp <= uint256(config.resolveTime) + gracePeriod) revert GraceNotOver();
        status = Status.Cancelled;
        emit Cancelled("creador no resolvio");
    }

    /*//////////////////////////////////////////////////////////
                              COBRAR
    //////////////////////////////////////////////////////////*/
    /// @notice Cada ganador retira su parte. payout = stake * neto / poteGanador.
    function claim() external nonReentrant {
        if (status != Status.Resolved) revert BadState();
        address user = _msgSender();
        if (settled[user]) revert AlreadySettled();

        uint256 userStake = stakeOf[user][winningOption];
        if (userStake == 0) revert NothingToClaim();

        settled[user] = true;

        uint256 winningPool = poolByOption[winningOption];
        uint256 net = totalPool - totalCommission();    // pote neto a repartir
        // Multiplicar antes de dividir. mulDiv evita overflow del intermedio y
        // trunca hacia abajo -> el ganador nunca cobra MENOS que su stake (porque net >= poteGanador).
        uint256 payout = Math.mulDiv(userStake, net, winningPool);

        IERC20(token).safeTransfer(user, payout);
        emit Claimed(user, payout);
    }

    /// @notice Reembolso cuando la apuesta fue anulada/cancelada. Devuelve todo el stake del usuario.
    function refund() external nonReentrant {
        if (status != Status.Cancelled) revert BadState();
        address user = _msgSender();
        if (settled[user]) revert AlreadySettled();
        settled[user] = true;

        uint256 amount;
        for (uint8 i = 0; i < config.numOptions; i++) {
            amount += stakeOf[user][i];
        }
        if (amount == 0) revert NothingToClaim();

        IERC20(token).safeTransfer(user, amount);
        emit Refunded(user, amount);
    }

    /// @notice Envia las comisiones a plataforma y creador. Llamable una sola vez tras resolver.
    function withdrawFees() external nonReentrant {
        if (status != Status.Resolved) revert BadState();
        require(!feesWithdrawn, "ya retiradas");
        feesWithdrawn = true;

        uint256 commission = totalCommission();
        if (commission == 0) return;

        // Reparto proporcional del tope entre plataforma y creador (segun sus bps).
        uint256 totalBps    = uint256(platformFeeBps) + config.creatorFeeBps;
        uint256 platformCut = Math.mulDiv(commission, platformFeeBps, totalBps);
        uint256 creatorCut  = commission - platformCut;

        if (platformCut > 0) IERC20(token).safeTransfer(treasury, platformCut);
        if (creatorCut  > 0) IERC20(token).safeTransfer(creator,  creatorCut);
        emit FeesWithdrawn(platformCut, creatorCut);
    }

    /*//////////////////////////////////////////////////////////
                          VISTAS / HELPERS
    //////////////////////////////////////////////////////////*/
    /// @notice Comision total: bps sobre el total, TOPEADA al pozo perdedor.
    function totalCommission() public view returns (uint256) {
        uint256 gross  = Math.mulDiv(totalPool, uint256(platformFeeBps) + config.creatorFeeBps, 10000);
        uint256 losing = totalPool - poolByOption[winningOption];
        return gross > losing ? losing : gross;
    }

    /// @notice Cuanto cobraria un usuario si reclamara ahora (para mostrar en la UI).
    function previewPayout(address user) external view returns (uint256) {
        if (status != Status.Resolved) return 0;
        uint256 winningPool = poolByOption[winningOption];
        if (winningPool == 0) return 0;
        uint256 net = totalPool - totalCommission();
        return Math.mulDiv(stakeOf[user][winningOption], net, winningPool);
    }

    /// @dev Hay "contienda" si al menos 2 opciones tienen dinero.
    function _hasContest() internal view returns (bool) {
        uint8 sides;
        for (uint8 i = 0; i < config.numOptions; i++) {
            if (poolByOption[i] > 0) {
                sides++;
                if (sides >= 2) return true;
            }
        }
        return false;
    }

    // NOTA "dust": por el truncamiento hacia abajo puede quedar polvo (millonesimas
    // de USDC) en el contrato tras todos los claim(). Se puede agregar una funcion
    // sweepDust() hacia el treasury, PERO protegida con un timelock largo para no
    // poder vaciar fondos antes de que todos hayan cobrado. Se deja como mejora futura.
}
