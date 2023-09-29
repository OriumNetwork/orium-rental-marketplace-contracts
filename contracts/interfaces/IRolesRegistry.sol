// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./IERC7432.sol";

interface IRolesRegistry is IERC7432 {
    function latestGrantees(address _grantor, address _tokenAddress, uint256 _tokenId, bytes32 _role) external view returns (address);
}