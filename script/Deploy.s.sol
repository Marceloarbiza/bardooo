// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Deploy COMPLETO a Polygon Amoy (fase 4: con gasless):
      forge script script/Deploy.s.sol --rpc-url amoy --broadcast \
        --priority-gas-price 25gwei --with-gas-price 25100000000 \
        --gas-estimate-multiplier 110
    Requiere .env con PRIVATE_KEY y TREASURY, y POL de faucet en la wallet.
    Deploya: MockUSDC (con permit) + ERC2771Forwarder + BetFactory confiando
    en el forwarder. NUNCA usar en mainnet: MockUSDC tiene mint abierto.       */

import {Script, console2} from "forge-std/Script.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {BetFactory} from "../contracts/P2PBetting.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract Deploy is Script {
    // Comisiones FIJAS (decision del dueño 2026-07-05): total SIEMPRE 10%.
    uint16 constant PLATFORM_FEE_BPS       = 300; // normal: 3% plataforma
    uint16 constant CREATOR_FEE_BPS        = 700; // normal: 7% creador
    uint16 constant FLASH_PLATFORM_FEE_BPS = 100; // relampago: 1% plataforma
    uint16 constant FLASH_CREATOR_FEE_BPS  = 900; // relampago: 9% creador
    uint64 constant GRACE_PERIOD           = 4 hours; // valvula global corta

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1) USDC de prueba con ERC20Permit (como el USDC nativo de Polygon)
        MockUSDC usdc = new MockUSDC();
        usdc.mint(deployer, 10_000e6);

        // 2) Forwarder ERC-2771: el usuario firma, la plataforma paga el gas
        ERC2771Forwarder forwarder = new ERC2771Forwarder("BardoooForwarder");

        // 3) Factory que confia en el forwarder (se propaga a cada Bet)
        BetFactory factory = new BetFactory(
            address(forwarder),
            address(usdc),
            treasury,
            PLATFORM_FEE_BPS,
            CREATOR_FEE_BPS,
            FLASH_PLATFORM_FEE_BPS,
            FLASH_CREATOR_FEE_BPS,
            GRACE_PERIOD
        );

        vm.stopBroadcast();

        console2.log("MockUSDC  :", address(usdc));
        console2.log("Forwarder :", address(forwarder));
        console2.log("BetFactory:", address(factory));
        console2.log("-> Actualizar packages/core/src/addresses.ts (+deployBlock) y regenerar ABIs");
    }
}
