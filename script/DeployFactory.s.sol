// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Deploy de SOLO la BetFactory, reutilizando un MockUSDC ya desplegado.
    Nació porque el primer intento en Amoy se quedó sin gas a mitad de camino
    (el faucet dio 0.1 POL y el script completo necesitaba 0.135): MockUSDC
    quedó arriba y la factory no. Uso:
      USDC_ADDR=0x... forge script script/DeployFactory.s.sol --rpc-url amoy \
        --broadcast --priority-gas-price 25gwei --with-gas-price 25100000000 \
        --gas-estimate-multiplier 110                                          */

import {Script, console2} from "forge-std/Script.sol";
import {BetFactory} from "../contracts/P2PBetting.sol";

contract DeployFactory is Script {
    // Comisiones FIJAS (decision del dueño 2026-07-05): total SIEMPRE 10%.
    uint16 constant PLATFORM_FEE_BPS       = 300;
    uint16 constant CREATOR_FEE_BPS        = 700;
    uint16 constant FLASH_PLATFORM_FEE_BPS = 100;
    uint16 constant FLASH_CREATOR_FEE_BPS  = 900;
    uint64 constant GRACE_PERIOD           = 4 hours;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");
        address usdc = vm.envAddress("USDC_ADDR");
        // fase 4: el forwarder del gasless (address(0) = sin gasless, fase 3)
        address forwarder = vm.envOr("FORWARDER_ADDR", address(0));

        vm.startBroadcast(pk);
        BetFactory factory = new BetFactory(
            forwarder,
            usdc,
            treasury,
            PLATFORM_FEE_BPS,
            CREATOR_FEE_BPS,
            FLASH_PLATFORM_FEE_BPS,
            FLASH_CREATOR_FEE_BPS,
            GRACE_PERIOD
        );
        vm.stopBroadcast();

        console2.log("BetFactory:", address(factory));
    }
}
