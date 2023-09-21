// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title PaymentToken
 * @dev Mock contract for testing purposes.
 */

contract MockPaymentToken is ERC20 {
    constructor() ERC20("PaymentToken", "PAY") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}