// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*═══════════════════════════════════════════════════════════════════════════
  DEPLOY A POLYGON MAINNET (chainId 137) — PRE-ARMADO, NO EJECUTAR TODAVÍA
═══════════════════════════════════════════════════════════════════════════

  ⛔ ESTE SCRIPT NO SE CORRE HASTA QUE:
     1) los contratos pasen una AUDITORÍA PROFESIONAL externa (regla del
        proyecto: mainnet solo con auditoría — ver CLAUDE.md);
     2) esté resuelto lo LEGAL (licencia de juego / habilitación en la
        jurisdicción que corresponda);
     3) estén los mínimos de juego responsable (límites de depósito,
        autoexclusión, AML/KYC) que exige la fase de dinero real.

  Diferencias vs. el deploy de Amoy (Deploy.s.sol):
   • NO despliega MockUSDC — usa el USDC NATIVO de Circle en Polygon.
   • Exige treasury SEPARADA del deployer (nunca la misma wallet que firma/relayea).
   • Candados que hacen IMPOSIBLE correrlo por accidente o en la red equivocada.
   • Deja la factory lista para pasar el owner a un MULTISIG (Ownable2Step).

  Cómo se correría (el día que corresponda):
     export MAINNET_DEPLOY_CONFIRMED=SI_AUDITADO_Y_LEGAL
     export PRIVATE_KEY=0x...            # wallet de deploy (con POL para gas)
     export TREASURY=0x...               # multisig que cobra la comisión (≠ deployer)
     export OWNER_MULTISIG=0x...         # (opcional) multisig admin de la factory
     forge script script/DeployMainnet.s.sol --rpc-url polygon --broadcast --verify

  Verificaciones a mano ANTES de correr:
   • Confirmar la dirección del USDC nativo contra la doc oficial de Circle
     (abajo, USDC_NATIVE). Si Circle la cambia, se actualiza acá.
   • El USDC nativo usa el dominio EIP-2612 name "USD Coin" — el front (permit)
     hoy firma con "Mock USDC": actualizar apps/web/src/services/chainBetting.js
     al name real ANTES de habilitar el gasless en mainnet, o el permit revierte.
═══════════════════════════════════════════════════════════════════════════*/

import {Script, console2} from "forge-std/Script.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {BetFactory} from "../contracts/P2PBetting.sol";

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

contract DeployMainnet is Script {
    // --- red y token (constantes de Polygon PoS mainnet) ---
    uint256 constant POLYGON_MAINNET = 137;
    // USDC NATIVO de Circle en Polygon PoS (NO el USDC.e bridgeado).
    // VERIFICAR contra https://developers.circle.com antes de correr.
    address constant USDC_NATIVE = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    // --- comisiones FIJAS (mismas que Amoy): total SIEMPRE 10% ---
    uint16 constant PLATFORM_FEE_BPS       = 300; // normal: 3% plataforma
    uint16 constant CREATOR_FEE_BPS        = 700; // normal: 7% creador
    uint16 constant FLASH_PLATFORM_FEE_BPS = 100; // relámpago: 1% plataforma
    uint16 constant FLASH_CREATOR_FEE_BPS  = 900; // relámpago: 9% creador
    uint64 constant GRACE_PERIOD           = 4 hours;

    function run() external {
        // ── CANDADO 1: confirmación explícita e intencional ──
        // Sin esta env var EXACTA, el script aborta. Imposible de correr "sin querer".
        string memory confirm = vm.envOr("MAINNET_DEPLOY_CONFIRMED", string(""));
        require(
            keccak256(bytes(confirm)) == keccak256(bytes("SI_AUDITADO_Y_LEGAL")),
            "MAINNET bloqueado: setea MAINNET_DEPLOY_CONFIRMED=SI_AUDITADO_Y_LEGAL solo tras auditoria + legal"
        );

        // ── CANDADO 2: red correcta ──
        require(block.chainid == POLYGON_MAINNET, "No estas en Polygon mainnet (chainId != 137)");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = vm.envAddress("TREASURY");

        // ── CANDADO 3: treasury sana y separada ──
        require(treasury != address(0), "TREASURY = 0");
        require(treasury != deployer, "TREASURY no puede ser la wallet de deploy (separar roles)");

        // ── CANDADO 4: el USDC nativo existe y es el esperado (6 decimales) ──
        require(USDC_NATIVE.code.length > 0, "USDC nativo sin codigo en esta red");
        require(IERC20Meta(USDC_NATIVE).decimals() == 6, "USDC no tiene 6 decimales: token equivocado");

        console2.log("== DEPLOY BARDOOO A POLYGON MAINNET ==");
        console2.log("deployer :", deployer);
        console2.log("treasury :", treasury);
        console2.log("USDC     :", USDC_NATIVE);
        console2.log("USDC sym :", IERC20Meta(USDC_NATIVE).symbol());

        vm.startBroadcast(pk);

        // 1) Forwarder ERC-2771 (gasless: el usuario firma, la plataforma paga)
        ERC2771Forwarder forwarder = new ERC2771Forwarder("BardoooForwarder");

        // 2) Factory sobre el USDC NATIVO (nunca MockUSDC en mainnet)
        BetFactory factory = new BetFactory(
            address(forwarder),
            USDC_NATIVE,
            treasury,
            PLATFORM_FEE_BPS,
            CREATOR_FEE_BPS,
            FLASH_PLATFORM_FEE_BPS,
            FLASH_CREATOR_FEE_BPS,
            GRACE_PERIOD
        );

        // 3) (opcional) pasar el owner a un multisig — Ownable2Step: acá se PROPONE,
        //    el multisig debe llamar acceptOwnership() para completar. Si no se setea
        //    OWNER_MULTISIG, el owner queda en el deployer (cambiar a mano después).
        address ownerMultisig = vm.envOr("OWNER_MULTISIG", address(0));
        if (ownerMultisig != address(0)) {
            factory.transferOwnership(ownerMultisig);
            console2.log("Ownership PROPUESTO a:", ownerMultisig);
            console2.log("-> el multisig debe llamar factory.acceptOwnership() para tomarlo");
        }

        vm.stopBroadcast();

        console2.log("Forwarder :", address(forwarder));
        console2.log("BetFactory:", address(factory));
        console2.log("");
        console2.log("SIGUIENTE (a mano):");
        console2.log(" 1) Actualizar packages/core/src/addresses.ts: usdc=USDC nativo,");
        console2.log("    betFactory, forwarder, chainId=137, deployBlock, rpc de mainnet.");
        console2.log(" 2) Regenerar ABIs con forge inspect (el contrato cambio post-auditoria).");
        console2.log(" 3) Front: permit EIP-2612 con domain name 'USD Coin' (no 'Mock USDC').");
        console2.log(" 4) Verificar ambos contratos en Polygonscan mainnet.");
        console2.log(" 5) Fondear el relayer con POL y setear el fusible relayBudgetMilli.");
        console2.log(" 6) NO hay faucet: los usuarios cargan USDC real (onramp/deposito).");
    }
}
