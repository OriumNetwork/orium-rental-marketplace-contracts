// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @notice The Roles Registry interface enables granting and revoking temporary roles for tokens.
interface IRolesRegistry {

    /// @notice Emitted when a role is assigned to a user.
    /// @param _role The role identifier.
    /// @param _grantee The user that receives the role assignment.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _data Any additional data about the role assignment.
    event RoleGranted(
        bytes32 _role,
        address _grantee,
        uint64  _expirationDate,
        address indexed _tokenAddress,
        uint256 indexed _tokenId,
        bytes _data
    );

    /// @notice Revokes a role from a user.
    /// @param _role The role identifier.
    /// @param _grantee The user that receives the role revocation.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    event RoleRevoked(
        bytes32 _role,
        address _grantee,
        address indexed _tokenAddress,
        uint256 indexed _tokenId
    );

    /// @notice Grants a role to a user.
    /// @param _role The role identifier.
    /// @param _grantee The user that receives the role assignment.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _data Any additional data about the role assignment.
    function grantRole(
        bytes32 _role,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external;

    /// @notice Revokes a role from a user.
    /// @param _role The role identifier.
    /// @param _grantee The user that receives the role revocation.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function revokeRole(
        bytes32 _role,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId
    ) external;

    /// @notice Checks if a user has a role.
    /// @param _role The role identifier.
    /// @param _granter The role creator
    /// @param _grantee The user that receives the role.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _supportsMultipleAssignments if false, will return true only if account is the last role grantee
    function hasRole(
        bytes32 _role,
		address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
		bool _supportsMultipleAssignments
    ) external view returns (bool);

    /// @notice Returns the custom data and expiration date of a role assignment.
    /// @param _role The role identifier.
    /// @param _granter The role creator
    /// @param _grantee The user that receives the role.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function roleData(
        bytes32 _role,
		address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId
    ) external view returns (uint64 expirationDate_, bytes memory data_);

}