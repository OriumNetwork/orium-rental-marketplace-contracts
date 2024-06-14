// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/**
 * @title MockERC20
 * @dev Mock contract for testing purposes.
 */

contract MockERC20 is ERC20 {
    bool public revertTransfer;
    uint256 public revertTransferCount;

    constructor() ERC20('PaymentToken', 'PAY') {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferReverts(bool _reverts, uint256 _revertTransferCount) external {
        revertTransfer = _reverts;
        revertTransferCount = _revertTransferCount;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        if (revertTransfer && revertTransferCount == 0) {
            return false;
        } else if (revertTransfer && revertTransferCount > 0) {
            revertTransferCount--;
            return super.transferFrom(sender, recipient, amount);
        } else {
            return super.transferFrom(sender, recipient, amount);
        }
    }
}
