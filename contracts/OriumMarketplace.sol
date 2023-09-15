// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/**
 * @title Orium Marketplace - Marketplace for renting NFTs
 * @dev This contract is used to manage NFTs rentals, powered by ERC-7432 Non-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;
    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;
    /// @dev rolesRegistry is a ERC-7432 contract
    address public rolesRegistry;
    /// @dev deadline is set in seconds
    uint256 public maxDeadline;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => FeeInfo) public feeInfoPerCollection;

    /// @dev tokenAddress => royaltyInfo
    mapping(address => RoyaltyInfo) public royaltyInfo;

    /// @dev Royalty info. Used to charge fees for the creator.
    struct RoyaltyInfo {
        address creator;
        uint256 feePercentageInWei;
        address treasury;
    }

    /// @dev Marketplace fee info.
    struct FeeInfo {
        uint256 feePercentageInWei;
        bool isCustomFee;
    }

    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner the owner of the protocol.
     * @param _rolesRegistry the address of the roles registry.
     * @param _maxDeadline the maximum deadline.
     */
    function initialize(address _owner, address _rolesRegistry, uint256 _maxDeadline) public initializer {
        __Pausable_init();
        __Ownable_init();

        rolesRegistry = _rolesRegistry;
        maxDeadline = _maxDeadline;

        transferOwnership(_owner);
    }

    function getMarketplaceFee(address _tokenAddress) public view returns (uint256) {
        return feeInfoPerCollection[_tokenAddress].isCustomFee ? feeInfoPerCollection[_tokenAddress].feePercentageInWei : DEFAULT_FEE_PERCENTAGE;
    }

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
     * @dev If the fee is 0, the default fee will be used.
     * @param _tokenAddress The address of the collection.
     * @param _feeInfo The fee info. Contains the fee percentage in wei and if the fee is custom.
     */
    function setMarketplaceFeeForCollection(address _tokenAddress, FeeInfo calldata _feeInfo) external onlyOwner {
        uint256 _royaltyPercentage = royaltyInfo[_tokenAddress].feePercentageInWei;
        require(_royaltyPercentage + _feeInfo.feePercentageInWei < MAX_PERCENTAGE, "OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%");
        
        feeInfoPerCollection[_tokenAddress] = _feeInfo;
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The address of the collection.
     */
    function setCreator(
        address _creator,
        address _tokenAddress
    ) external onlyOwner {
        _setRoyalty(_creator, _tokenAddress, 0, address(0));
    }

    /**
     * @notice Sets the royalty info.
     * @param _tokenAddress The address of the collection.
     * @param _royaltyPercentageInWei The royalty percentage in wei. If the fee is 0, the creator fee will be disabled.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setRoyaltyInfo(address _tokenAddress, uint256 _royaltyPercentageInWei, address _treasury) external {
        require(
            msg.sender == royaltyInfo[_tokenAddress].creator,
            "OriumMarketplace: Only creator can set royalty info"
        );

        _setRoyalty(msg.sender, _tokenAddress, _royaltyPercentageInWei, _treasury);
    }

    function _setRoyalty(
        address _creator,
        address _tokenAddress,
        uint256 _royaltyPercentageInWei,
        address _treasury
    ) internal {
        require(
            _royaltyPercentageInWei + getMarketplaceFee(_tokenAddress) < MAX_PERCENTAGE,
            "OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        royaltyInfo[_tokenAddress] = RoyaltyInfo({
            creator: _creator,
            feePercentageInWei: _royaltyPercentageInWei,
            treasury: _treasury
        });
    }

    /**
     * @notice Sets the maximum deadline.
     * @dev Only owner can set the maximum deadline.
     * @param _maxDeadline The maximum deadline.
     */
    function setMaxDeadline(uint256 _maxDeadline) external onlyOwner {
        require(_maxDeadline > 0, "OriumMarketplace: Deadline cannot be 0");
        maxDeadline = _maxDeadline;
    }
}
