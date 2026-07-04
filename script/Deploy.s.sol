// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Deploy a Polygon Amoy (testnet):
      forge script script/Deploy.s.sol --rpc-url amoy --broadcast
    Requiere .env con PRIVATE_KEY y TREASURY, y POL de faucet en la wallet.
    NUNCA usar este script en mainnet: MockUSDC tiene mint abierto.            */

import {Script, console2} from "forge-std/Script.sol";
import {BetFactory} from "../contracts/P2PBetting.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract Deploy is Script {
    uint16 constant PLATFORM_FEE_BPS    = 300;      // 3%
    uint16 constant MAX_CREATOR_FEE_BPS = 1000;     // 10%
    uint64 constant GRACE_PERIOD        = 48 hours; // 172800 s

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1) USDC de prueba (solo testnet) + saldo inicial para el deployer
        MockUSDC usdc = new MockUSDC();
        usdc.mint(deployer, 10_000e6); // 10.000 mUSDC de arranque

        // 2) Factory. Forwarder = address(0) hasta la fase gasless (ERC-2771).
        BetFactory factory = new BetFactory(
            address(0),
            address(usdc),
            treasury,
            PLATFORM_FEE_BPS,
            MAX_CREATOR_FEE_BPS,
            GRACE_PERIOD
        );

        vm.stopBroadcast();

        console2.log("MockUSDC  :", address(usdc));
        console2.log("BetFactory:", address(factory));
        console2.log("-> Copiar ambas direcciones a frontend/src/config.ts");
    }
}
