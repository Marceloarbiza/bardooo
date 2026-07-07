// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Fase 4, tanda 1 de 2 (el faucet da 0.1 POL/día y el deploy completo pide
    ~0.15): MockUSDC con permit + ERC2771Forwarder. La BetFactory sale en la
    tanda 2 con script/DeployFactory.s.sol (USDC_ADDR y FORWARDER_ADDR por env).
      forge script script/DeployTokenAndForwarder.s.sol --rpc-url amoy \
        --broadcast --priority-gas-price 25gwei --with-gas-price 25100000000 \
        --gas-estimate-multiplier 110                                          */

import {Script, console2} from "forge-std/Script.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract DeployTokenAndForwarder is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        MockUSDC usdc = new MockUSDC();
        usdc.mint(deployer, 10_000e6);
        ERC2771Forwarder forwarder = new ERC2771Forwarder("BardoooForwarder");
        vm.stopBroadcast();

        console2.log("MockUSDC  :", address(usdc));
        console2.log("Forwarder :", address(forwarder));
        console2.log("-> Tanda 2: USDC_ADDR y FORWARDER_ADDR a DeployFactory.s.sol");
    }
}
