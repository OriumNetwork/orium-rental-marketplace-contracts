// SPDX-License-Identifier: CC0-1.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MaliciousERC20 is ERC20 {
    constructor() ERC20("MaliciousToken", "MTK") {}

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        return false;
    }

    // Mint function for testing purposes
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
