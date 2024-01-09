// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/**
 * @title Orium Marketplace - Marketplace for renting SFTs
 * @dev This contract is used to manage SFTs rentals, powered by ERC-7589 Semi-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumSftMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Constants ########### **/

    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;
    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;

    /** ######### Global Variables ########### **/

    /// @dev rolesRegistry is a ERC-7589 contract
    address public defaultRolesRegistry;

    /// @dev tokenAddress => rolesRegistry
    mapping(address => address) public tokenRolesRegistry;

    /// @dev deadline is set in seconds
    uint256 public maxDeadline;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => FeeInfo) public feeInfo;

    /// @dev tokenAddress => royaltyInfo
    mapping(address => RoyaltyInfo) public royaltyInfo;

    /** ######### Structs ########### **/

    /// @dev Royalty info. Used to charge fees for the creator.
    struct RoyaltyInfo {
        address creator;
        uint256 royaltyPercentageInWei;
        address treasury;
    }

    /// @dev Marketplace fee info.
    struct FeeInfo {
        uint256 feePercentageInWei;
        bool isCustomFee;
    }

    /** ######### Events ########### **/

    /**
     * @param tokenAddress The SFT address.
     * @param feePercentageInWei The fee percentage in wei.
     * @param isCustomFee If the fee is custom or not. Used to allow collections with no fee.
     */
    event MarketplaceFeeSet(address indexed tokenAddress, uint256 feePercentageInWei, bool isCustomFee);
    /**
     * @param tokenAddress The SFT address.
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
     * @param tokenAddress The SFT address.
     * @param rolesRegistry The address of the roles registry.
     */
    event RolesRegistrySet(address indexed tokenAddress, address indexed rolesRegistry);

    /** ######### Modifiers ########### **/

    /** ######### Initializer ########### **/
    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner The owner of the protocol.
     * @param _defaultRolesRegistry The address of the roles registry.
     * @param _maxDeadline The maximum deadline.
     */
    function initialize(address _owner, address _defaultRolesRegistry, uint256 _maxDeadline) public initializer {
        __Pausable_init();
        __Ownable_init();

        defaultRolesRegistry = _defaultRolesRegistry;
        maxDeadline = _maxDeadline;

        transferOwnership(_owner);
    }

    /** ============================ Core Functions  ================================== **/

    /** ######### Setters ########### **/

    /**
     * @notice Sets the roles registry.
     * @dev Only owner can set the roles registry.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract.
     * @dev Only owner can unpause the contract.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Sets the marketplace fee for a collection.
     * @dev If no fee is set, the default fee will be used.
     * @param _tokenAddress The SFT address.
     * @param _feePercentageInWei The fee percentage in wei.
     * @param _isCustomFee If the fee is custom or not.
     */
    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei,
        bool _isCustomFee
    ) external onlyOwner {
        uint256 _royaltyPercentage = royaltyInfo[_tokenAddress].royaltyPercentageInWei;
        require(
            _royaltyPercentage + _feePercentageInWei < MAX_PERCENTAGE,
            "OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        feeInfo[_tokenAddress] = FeeInfo({ feePercentageInWei: _feePercentageInWei, isCustomFee: _isCustomFee });

        emit MarketplaceFeeSet(_tokenAddress, _feePercentageInWei, _isCustomFee);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _tokenAddress The SFT address.
     * @param _creator The address of the creator.
     */
    function setCreator(address _tokenAddress, address _creator) external onlyOwner {
        _setRoyalty(_creator, _tokenAddress, 0, address(0));
    }

    /**
     * @notice Sets the royalty info.
     * @param _tokenAddress The SFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setRoyaltyInfo(address _tokenAddress, uint256 _royaltyPercentageInWei, address _treasury) external {
        require(
            msg.sender == royaltyInfo[_tokenAddress].creator,
            "OriumSftMarketplace: Only creator can set royalty info"
        );

        _setRoyalty(msg.sender, _tokenAddress, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The SFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function _setRoyalty(
        address _creator,
        address _tokenAddress,
        uint256 _royaltyPercentageInWei,
        address _treasury
    ) internal {
        require(
            _royaltyPercentageInWei + marketplaceFeeOf(_tokenAddress) < MAX_PERCENTAGE,
            "OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        royaltyInfo[_tokenAddress] = RoyaltyInfo({
            creator: _creator,
            royaltyPercentageInWei: _royaltyPercentageInWei,
            treasury: _treasury
        });

        emit CreatorRoyaltySet(_tokenAddress, _creator, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the maximum deadline.
     * @dev Only owner can set the maximum deadline.
     * @param _maxDeadline The maximum deadline.
     */
    function setMaxDeadline(uint256 _maxDeadline) external onlyOwner {
        require(_maxDeadline > 0, "OriumSftMarketplace: Max deadline should be greater than 0");
        maxDeadline = _maxDeadline;
    }

    /**
     * @notice Sets the roles registry for a collection.
     * @dev Only owner can set the roles registry for a collection.
     * @param _tokenAddress The SFT address.
     * @param _rolesRegistry The roles registry address.
     */
    function setRolesRegistry(address _tokenAddress, address _rolesRegistry) external onlyOwner {
        tokenRolesRegistry[_tokenAddress] = _rolesRegistry;
        emit RolesRegistrySet(_tokenAddress, _rolesRegistry);
    }

    /**
     * @notice Sets the default roles registry.
     * @dev Only owner can set the default roles registry.
     * @param _rolesRegistry The roles registry address.
     */
    function setDefaultRolesRegistry(address _rolesRegistry) external onlyOwner {
        defaultRolesRegistry = _rolesRegistry;
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the marketplace fee for a collection.
     * @dev If no custom fee is set, the default fee will be used.
     * @param _tokenAddress The SFT address.
     */
    function marketplaceFeeOf(address _tokenAddress) public view returns (uint256) {
        return feeInfo[_tokenAddress].isCustomFee ? feeInfo[_tokenAddress].feePercentageInWei : DEFAULT_FEE_PERCENTAGE;
    }

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The SFT address.
     */
    function rolesRegistryOf(address _tokenAddress) public view returns (address) {
        return
            tokenRolesRegistry[_tokenAddress] == address(0) ? defaultRolesRegistry : tokenRolesRegistry[_tokenAddress];
    }
}
