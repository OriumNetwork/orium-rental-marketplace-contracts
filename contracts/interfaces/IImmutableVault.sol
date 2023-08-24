// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/// @notice The Immutable Vault interface enables depositing and withdrawing tokens.
interface IImmutableVault {
    /// @notice Returns the roles registry of a token.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function registryOf(address _tokenAddress, uint256 _tokenId) external view returns (address);

    /// @notice Returns the owner of a token.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    function deposit(address _tokenAddress, uint256 _tokenId) external;

    /// @notice Returns the owner of a token.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _from The address of the token owner.
    function depositOnBehafOf(address _tokenAddress, uint256 _tokenId, address _from) external;
}
