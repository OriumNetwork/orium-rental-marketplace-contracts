// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IOriumMarketplaceRoyalties } from "./interfaces/IOriumMarketplaceRoyalties.sol";

/**
 * @title Orium Marketplace Royalties
 * @dev This contract is used to manage marketplace fees and royalties.
 * @author Orium Network Team - developers@orium.network
 */
contract OriumMarketplaceRoyalties is Initializable, OwnableUpgradeable, IOriumMarketplaceRoyalties {
    /** ######### Constants ########### **/

    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;

    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;

    /** ######### Global Variables ########### **/

    /// @dev sftRolesRegistry is a ERC-7589 contract
    address public defaultSftRolesRegistry;

    /// @dev nftRolesRegistry is a ERC-7432 contract
    address public defaultNftRolesRegistry;

    /// @dev tokenAddress => sftRolesRegistry
    mapping(address => address) public tokenAddressToRolesRegistry;

    /// @dev maxDuration in seconds
    uint64 public maxDuration;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => FeeInfo) public feeInfo;

    /// @dev tokenAddress => tokenAddressToRoyaltyInfo
    mapping(address => RoyaltyInfo) public tokenAddressToRoyaltyInfo;

    /// @dev tokenAddress => bool
    mapping(address => bool) public isTrustedTokenAddress;

    /// @dev feeTokenAddress => bool
    mapping(address => bool) public isTrustedFeeTokenAddress;

    /// @dev tokenAddress => feeTokenAddress => bool
    mapping(address => mapping(address => bool)) public isTrustedFeeTokenAddressForToken;

    /** ######### Structs ########### **/

    /** ######### Events ########### **/

    /**
     * @param tokenAddress The NFT or SFT address.
     * @param feePercentageInWei The fee percentage in wei.
     * @param isCustomFee If the fee is custom or not. Used to allow collections with no fee.
     */
    event MarketplaceFeeSet(address indexed tokenAddress, uint256 feePercentageInWei, bool isCustomFee);

    /**
     * @param tokenAddress The NFT or SFT address.
     * @param creator The address of the creator.
     * @param royaltyPercentageInWei The royalty percentage in wei.
     * @param treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    event CreatorRoyaltySet(
        address indexed tokenAddress,
        address indexed creator,
        uint256 royaltyPercentageInWei,
        address treasury
    );

    /**
     * @param tokenAddress The NFT or SFT address.
     * @param rolesRegistry The address of the roles registry.
     */
    event RolesRegistrySet(address indexed tokenAddress, address indexed rolesRegistry);

    /**
     * @param tokenAddress The NFT or SFT address.
     * @param isTrusted The boolean setting if the token address is trusted or not.
     */
    event TrustedTokenAddressSet(address indexed tokenAddress, bool isTrusted);

    /** ######### Modifiers ########### **/

    /** ######### Initializer ########### **/
    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner The owner of the protocol.
     * @param _defaultSftRolesRegistry The address of the roles registry.
     * @param _defaultNftRolesRegistry The address of the roles registry.
     * @param _maxDuration The maximum duration of a rental offer.
     */
    function initialize(
        address _owner,
        address _defaultSftRolesRegistry,
        address _defaultNftRolesRegistry,
        uint64 _maxDuration
    ) public initializer {
        __Ownable_init();

        defaultSftRolesRegistry = _defaultSftRolesRegistry;
        defaultNftRolesRegistry = _defaultNftRolesRegistry;
        maxDuration = _maxDuration;

        transferOwnership(_owner);
    }

    /** ============================ Core Functions  ================================== **/

    /** ######### Setters ########### **/

    /**
     * @notice Sets the marketplace fee for a collection.
     * @dev If no fee is set, the default fee will be used.
     * @param _tokenAddress The NFT or SFT address.
     * @param _feePercentageInWei The fee percentage in wei.
     * @param _isCustomFee If the fee is custom or not.
     */
    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei,
        bool _isCustomFee
    ) external onlyOwner {
        uint256 _royaltyPercentage = tokenAddressToRoyaltyInfo[_tokenAddress].royaltyPercentageInWei;
        require(
            _royaltyPercentage + _feePercentageInWei < MAX_PERCENTAGE,
            "OriumMarketplaceRoyalties: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        feeInfo[_tokenAddress] = FeeInfo({ feePercentageInWei: _feePercentageInWei, isCustomFee: _isCustomFee });

        emit MarketplaceFeeSet(_tokenAddress, _feePercentageInWei, _isCustomFee);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The NFT or SFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setRoyaltyInfo(
        address _creator,
        address _tokenAddress,
        uint256 _royaltyPercentageInWei,
        address _treasury
    ) external {
        if (msg.sender != owner()) {
            require(
                msg.sender == tokenAddressToRoyaltyInfo[_tokenAddress].creator,
                "OriumMarketplaceRoyalties: Only creator or owner can set the royalty info"
            );
            require(msg.sender == _creator, "OriumMarketplaceRoyalties: sender and creator mismatch");
        }

        require(
            _royaltyPercentageInWei + marketplaceFeeOf(_tokenAddress) < MAX_PERCENTAGE,
            "OriumMarketplaceRoyalties: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        tokenAddressToRoyaltyInfo[_tokenAddress] = RoyaltyInfo({
            creator: _creator,
            royaltyPercentageInWei: _royaltyPercentageInWei,
            treasury: _treasury
        });

        emit CreatorRoyaltySet(_tokenAddress, _creator, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the Max duration for a rental offer.
     * @dev Only owner can set the maximum duration.
     * @param _maxDuration The maximum duration of a rental offer.
     */
    function setMaxDuration(uint64 _maxDuration) external onlyOwner {
        require(_maxDuration > 0, "OriumMarketplaceRoyalties: Max duration should be greater than 0");
        maxDuration = _maxDuration;
    }

    /**
     * @notice Sets the roles registry for a collection.
     * @dev Only owner can set the roles registry for a collection.
     * @param _tokenAddress The NFT or SFT address.
     * @param _rolesRegistry The roles registry address.
     */
    function setRolesRegistry(address _tokenAddress, address _rolesRegistry) external onlyOwner {
        tokenAddressToRolesRegistry[_tokenAddress] = _rolesRegistry;
        emit RolesRegistrySet(_tokenAddress, _rolesRegistry);
    }

    /**
     * @notice Sets the default NFT roles registry.
     * @dev Only owner can set the default NFT roles registry.
     * @param _nftRolesRegistry The roles registry address.
     */
    function setDefaultNftRolesRegistry(address _nftRolesRegistry) external onlyOwner {
        defaultNftRolesRegistry = _nftRolesRegistry;
    }

    /**
     * @notice Sets the default SFT roles registry.
     * @dev Only owner can set the default SFT roles registry.
     * @param _sftRolesRegistry The roles registry address.
     */
    function setDefaultSftRolesRegistry(address _sftRolesRegistry) external onlyOwner {
        defaultSftRolesRegistry = _sftRolesRegistry;
    }

    /**
     * @notice Sets the trusted token addresses.
     * @dev Can only be called by the owner. Used to allow collections with no custom fee set.
     * @param _tokenAddresses The NFT or SFT addresses.
     * @param _isTrusted The boolean array.
     */
    function setTrustedNftTokens(address[] calldata _tokenAddresses, bool[] calldata _isTrusted) external onlyOwner {
        require(
            _tokenAddresses.length == _isTrusted.length,
            "OriumMarketplaceRoyalties: Arrays should have the same length"
        );
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            isTrustedTokenAddress[_tokenAddresses[i]] = _isTrusted[i];
        }
    }

    /**
     * @notice Sets the trusted fee token addresses.
     * @dev Can only be called by the owner.
     * @param _feeTokenAddresses The fee token addresses.
     * @param _isTrusted The boolean array.
     */
    function setTrustedFeeTokens(address[] calldata _feeTokenAddresses, bool[] calldata _isTrusted) external onlyOwner {
        require(
            _feeTokenAddresses.length == _isTrusted.length,
            "OriumMarketplaceRoyalties: Arrays should have the same length"
        );
        for (uint256 i = 0; i < _feeTokenAddresses.length; i++) {
            isTrustedFeeTokenAddress[_feeTokenAddresses[i]] = _isTrusted[i];
        }
    }

    /**
     * @notice Sets the trusted fee token addresses for a token.
     * @dev Can only be called by the owner. 
     * @param _tokenAddresses The NFT or SFT addresses.
     * @param _feeTokenAddresses The fee token addresses.
     * @param _isTrusted The boolean array.
     */
    function setTrustedFeeTokenForToken(
        address[] calldata _tokenAddresses,
        address[] calldata _feeTokenAddresses,
        bool[] calldata _isTrusted
    ) external onlyOwner {
        require(
            _tokenAddresses.length == _feeTokenAddresses.length && _tokenAddresses.length == _isTrusted.length,
            "OriumMarketplaceRoyalties: Arrays should have the same length"
        );
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            isTrustedFeeTokenAddressForToken[_tokenAddresses[i]][_feeTokenAddresses[i]] = _isTrusted[i];
        }
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the marketplace fee for a collection.
     * @dev If no custom fee is set, the default fee will be used.
     * @param _tokenAddress The NFT or SFT address.
     */
    function marketplaceFeeOf(address _tokenAddress) public view returns (uint256) {
        return feeInfo[_tokenAddress].isCustomFee ? feeInfo[_tokenAddress].feePercentageInWei : DEFAULT_FEE_PERCENTAGE;
    }

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The NFT address.
     */
    function nftRolesRegistryOf(address _tokenAddress) public view returns (address) {
        return
            tokenAddressToRolesRegistry[_tokenAddress] == address(0)
                ? defaultNftRolesRegistry
                : tokenAddressToRolesRegistry[_tokenAddress];
    }

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The SFT address.
     */
    function sftRolesRegistryOf(address _tokenAddress) public view returns (address) {
        return
            tokenAddressToRolesRegistry[_tokenAddress] == address(0)
                ? defaultSftRolesRegistry
                : tokenAddressToRolesRegistry[_tokenAddress];
    }

    /**
     * @notice Gets the royalty info.
     * @param _tokenAddress The NFT or SFT address.
     */
    function royaltyInfoOf(address _tokenAddress) public view returns (RoyaltyInfo memory _royaltyInfo) {
        _royaltyInfo = tokenAddressToRoyaltyInfo[_tokenAddress];
    }

    /**
     * @notice Gets the trusted token addresses.
     * @param _tokenAddress The NFT or SFT address.
     */
    function isTrustedTokenAddressOf(address _tokenAddress) public view returns (bool) {
        return isTrustedTokenAddress[_tokenAddress];
    }
}
