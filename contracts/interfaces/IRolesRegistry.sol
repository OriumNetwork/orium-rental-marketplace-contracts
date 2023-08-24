// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./IERC7432.sol";

/// @notice The Nft Roles interface enables granting and revoking temporary roles for tokens.
interface IRolesRegistry is IERC7432 {

    /// @notice Returns the last grantee of a role.
    /// @param _role The role identifier.
    /// @param _grantor The role creator
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function lastGrantee(
        bytes32 _role,
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId
    ) external view returns (address grantee_);
}
