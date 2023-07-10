// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @notice The ERC-721 Roles Registry interface enables granting and revoking temporary roles for ERC-721 tokens.
interface IERC721RolesRegistry {

    /// @notice Emitted when a role is assigned to a user.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role assignment.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC721 token identifier.
    /// @param _data Any additional data about the role assignment.
    event RoleGranted(
        bytes32 indexed _role,
        address indexed _account,
        uint64 indexed _expirationDate,
        address _nftAddress,
        uint256 _tokenId,
        bytes _data
    );

    /// @notice Revokes a role from a user.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role revocation.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC-721 token identifier.
    event RoleRevoked(
        bytes32 indexed _role,
        address indexed _account,
        address _nftAddress,
        uint256 indexed _tokenId
    );

    /// @notice Grants a role to a user.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role assignment.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC721 token identifier.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _data Any additional data about the role assignment.
    function grantRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external;

    /// @notice Revokes a role from a user.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role revocation.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC-721 token identifier.
    function revokeRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external;

    /// @notice Checks if a user has a role.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC-721 token identifier.
    function hasRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external view returns (bool);

    /// @notice Returns the custom data and expiration date of a role assignment.
    /// @param _role The role identifier.
    /// @param _account The user that receives the role.
    /// @param _nftAddress The ERC721 token address.
    /// @param _tokenId The ERC-721 token identifier.
    function roleData(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external view returns (uint64 expirationDate_, bytes memory data_);

}