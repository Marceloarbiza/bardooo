// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  MockUSDC — USDC de mentira SOLO para pruebas en la Remix VM / testnet.
    - 6 decimales, igual que el USDC real (1 USDC = 1_000_000 unidades).
    - mint() abierto: cualquiera se puede dar saldo de prueba.
    NUNCA usar esto en mainnet: el mint abierto significa dinero infinito.   */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Date saldo de prueba. amount en unidades de 6 decimales (100 USDC = 100000000).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
