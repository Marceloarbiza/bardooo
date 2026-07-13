// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BetFactory, Bet} from "../contracts/P2PBetting.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

/*  USDC con LISTA NEGRA, como el nativo de Circle en Polygon: transfer a una
    direccion bloqueada REVIERTE. Sirve para probar que el fee de la plataforma
    no queda rehen de un creador bloqueado.                                    */
contract BlacklistUSDC is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("Blacklist USDC", "bUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
    function setBlocked(address a, bool v) external { blocked[a] = v; }
    function _update(address from, address to, uint256 v) internal override {
        require(!blocked[from] && !blocked[to], "blacklisted");
        super._update(from, to, v);
    }
}

/*  Regresion de la auditoria pre-mainnet (2026-07-13).
    Cada test FIJA un fix: si alguien reintroduce el bug, esto se pone rojo.   */
contract AuditTest is Test {
    MockUSDC usdc;
    BetFactory factory;
    address treasury = makeAddr("treasury");
    address creator  = makeAddr("creator");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");

    uint64 closeT;
    uint64 resolveT;

    function setUp() public {
        usdc = new MockUSDC();
        factory = new BetFactory(address(0), address(usdc), treasury, 300,700,100,900, 4 hours);
        closeT   = uint64(block.timestamp + 1 hours);
        resolveT = uint64(block.timestamp + 3 hours);
    }

    function _cfgN(uint8 n) internal view returns (Bet.Config memory) {
        return Bet.Config({
            description: "n-opt", numOptions: n, stakeMode: Bet.StakeMode.Free,
            fixedAmount: 0, maxStake: 0, minStake: 1e6, maxBettors: 0,
            closeTime: closeT, resolveTime: resolveT, isFlash: false
        });
    }

    function _bet(Bet b, address who, uint8 opt, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.startPrank(who);
        usdc.approve(address(b), amt);
        b.placeBet(opt, amt);
        vm.stopPrank();
    }

    // ============================================================
    // HIGH — fix 1 (factory): la factory NO deja crear N != 2. Cierra la
    // superficie del "resolver a opcion vacia" desde la puerta de entrada.
    // ============================================================
    function test_Fix_Factory_RejectsNonBinary() public {
        vm.prank(creator);
        vm.expectRevert("solo binario");
        factory.createBet(_cfgN(3));
    }

    // ============================================================
    // HIGH — fix 2 (defensa en profundidad): incluso creando un Bet DIRECTO
    // (sin pasar por la factory) con N=3, resolver a una opcion vacia REVIERTE
    // con EmptyWinningPool. La plata ya no queda atrapada.
    // ============================================================
    function test_Fix_Resolve_EmptyWinningPool_Reverts() public {
        // Bet directo, N=3, para saltear la guarda de la factory y probar resolve
        Bet b = new Bet(address(0), address(usdc), treasury, 300, 700, 4 hours, creator, _cfgN(3));
        _bet(b, alice, 0, 100e6);
        _bet(b, bob,   1, 100e6);

        vm.warp(resolveT);
        vm.prank(creator);
        vm.expectRevert(Bet.EmptyWinningPool.selector);
        b.resolve(2); // opcion 2 = VACIA -> ya no se puede resolver ahi

        // resolver a una opcion CON pozo sigue funcionando
        vm.prank(creator);
        b.resolve(1);
        assertEq(uint8(b.status()), uint8(Bet.Status.Resolved));
        vm.prank(bob); b.claim();
        assertGe(usdc.balanceOf(bob), 100e6, "el ganador cobra normal");
    }

    // el binario nunca estuvo expuesto: _hasContest exige ambos lados con plata
    function test_Binary_IsSafe_FromEmptyWinner() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfgN(2)));
        _bet(b, alice, 0, 50e6);
        _bet(b, bob,   1, 50e6);
        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(1);
        vm.prank(bob); b.claim();
        assertGe(usdc.balanceOf(bob), 50e6);
    }

    // ============================================================
    // MEDIUM — fix (withdrawFees desacoplado): un creador BLOQUEADO para recibir
    // el token no debe impedir que treasury cobre su parte. Cada fee es un
    // pull-payment independiente.
    // ============================================================
    function test_Fix_PlatformFee_IndependentFromCreator() public {
        // token con blacklist real (como el USDC de Circle) y una factory sobre el
        BlacklistUSDC bl = new BlacklistUSDC();
        BetFactory f = new BetFactory(address(0), address(bl), treasury, 300,700,100,900, 4 hours);

        vm.prank(creator);
        Bet b = Bet(f.createBet(_cfgN(2)));

        bl.mint(alice, 60e6); vm.startPrank(alice); bl.approve(address(b), 60e6); b.placeBet(0, 60e6); vm.stopPrank();
        bl.mint(bob,   70e6); vm.startPrank(bob);   bl.approve(address(b), 70e6); b.placeBet(1, 70e6); vm.stopPrank();

        vm.warp(resolveT);
        vm.prank(creator); b.resolve(1);

        // Circle bloquea al creador DESPUES de resolver
        bl.setBlocked(creator, true);

        // el fee del creador revierte (esta bloqueado)...
        vm.expectRevert("blacklisted");
        b.withdrawCreatorFee();

        // ...pero treasury SI cobra su parte, sin quedar rehen del creador
        b.withdrawPlatformFee();
        assertEq(bl.balanceOf(treasury), 3_900_000, "plataforma cobra igual");
        assertTrue(b.platformFeePaid());
        assertFalse(b.creatorFeePaid());

        // y los ganadores cobran normal, en su propia funcion
        vm.prank(bob); b.claim();
        assertGe(bl.balanceOf(bob), 70e6);
    }

    // el atajo withdrawFees() sigue existiendo (comodidad) y no permite doble cobro
    function test_WithdrawFees_NoDoubleSpend() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfgN(2)));
        _bet(b, alice, 0, 60e6);
        _bet(b, bob,   1, 70e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(1);

        b.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 3_900_000);
        assertEq(usdc.balanceOf(creator),  9_100_000);
        // segunda vez: cada parte ya pagada, no vuelve a transferir
        b.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 3_900_000, "sin doble cobro plataforma");
        assertEq(usdc.balanceOf(creator),  9_100_000, "sin doble cobro creador");
    }

    // ============================================================
    // LOW — fix (Ownable2Step + zero-checks): el traspaso de dueño es en dos
    // pasos y rechaza address(0). Un dedazo ya no brickea la gobernanza.
    // ============================================================
    function test_Fix_Ownable2Step() public {
        address newOwner = makeAddr("newOwner");
        // paso 1: el dueño propone (no cambia el owner todavia)
        factory.transferOwnership(newOwner);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), newOwner);

        // un tercero no puede aceptar
        vm.prank(carol);
        vm.expectRevert(BetFactory.NotOwner.selector);
        factory.acceptOwnership();

        // paso 2: el propuesto acepta
        vm.prank(newOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), newOwner);
        assertEq(factory.pendingOwner(), address(0));
    }

    function test_Fix_ZeroAddressChecks() public {
        vm.expectRevert(BetFactory.ZeroAddress.selector);
        factory.transferOwnership(address(0));
        vm.expectRevert(BetFactory.ZeroAddress.selector);
        factory.setTreasury(address(0));
    }
}
