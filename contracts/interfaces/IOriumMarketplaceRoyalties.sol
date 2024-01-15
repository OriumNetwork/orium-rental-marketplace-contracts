// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IOriumMarketplaceRoyalties {
    /// @dev Royalty info. Used to charge fees for the creator.
    struct RoyaltyInfo {
        address creator;
        uint256 royaltyPercentageInWei;
        address treasury;
    }

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The NFT address.
     */
    function nftRolesRegistryOf(address _tokenAddress) external view returns (address);

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The SFT address.
     */
    function sftRolesRegistryOf(address _tokenAddress) external view returns (address);

    /**
     * @notice Gets the marketplace fee for a collection.
     * @dev If no custom fee is set, the default fee will be used.
     * @param _tokenAddress The SFT address.
     */
    function marketplaceFeeOf(address _tokenAddress) external view returns (uint256);

    /**
     * @notice Gets the trusted token addresses.
     * @param _tokenAddresses The SFT addresses.
     */
    function isTrustedTokenAddress(address _tokenAddresses) external view returns (bool);

    /**
     * @notice Gets the royalty info.
     * @param _tokenAddress The SFT address.
     */
    function royaltyInfoOf(address _tokenAddress) external view returns (RoyaltyInfo memory _royaltyInfo);

    /**
     * @notice Gets the max deadline.
     * @dev The max deadline is the max amount of seconds a rental offer can be.
     */
    function maxDeadline() external view returns (uint64);
}
