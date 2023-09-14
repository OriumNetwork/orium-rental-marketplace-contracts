// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/**
 * @title Orium Rental Protocol - Marketplace for renting NFTs
 * @dev This contract is used to manage NFTs rentals, powered by ERC7432 Non-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumRentalProtocol is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether; 
    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;
    /// @dev rolesRegistry is a ERC7432 contract
    address public rolesRegistry;
    /// @dev deadline is set in seconds
    uint256 public maxDeadline;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => uint256) public feesPerCollection;

    /// @dev tokenAddress => collectionFeeInfo
    mapping(address => CollectionFeeInfo) public collectionFeeInfo;

    /// @dev Collection fee info. Used to charge fees for the creator.
    struct CollectionFeeInfo {
        address creator;
        uint256 feePercentageInWei;
        address treasury;
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

    /**
     * @notice Transfer fees to the marketplace and the creator.
     * @dev If the creator is address(0), the collection will not have a creator fee.
     * @param _tokenAddress The address of the collection.
     * @param _lender The address of the lender.
     * @param _feeToken The address of the token used to pay the fees.
     * @param _feeAmount The amount of fees.
     */
    function _chargeFee(address _tokenAddress, address _lender, address _feeToken, uint256 _feeAmount) internal {
        // TODO: With this logic a collection can't have a fee of 0. How to handle this?
        uint256 _marketplaceFeePercentage = feesPerCollection[_tokenAddress] == 0
            ? DEFAULT_FEE_PERCENTAGE
            : feesPerCollection[_tokenAddress];
        uint256 _marketplaceFee = _valueFromPercentage(_marketplaceFeePercentage, _feeAmount);
        require(
            IERC20(_feeToken).transferFrom(msg.sender, address(this), _marketplaceFee),
            "OriumRentalProtocol: Marketplace fee transfer failed"
        );

        // Charge the fee to the maker
        uint256 _makerFee = _feeAmount - _marketplaceFee;
        require(
            IERC20(_feeToken).transferFrom(msg.sender, _lender, _makerFee),
            "OriumRentalProtocol: Lender fee transfer failed"
        );

        // Charge the fee to the creator
        address _creator = collectionFeeInfo[_tokenAddress].creator;
        if (_creator == address(0)) return;

        uint256 _creatorFeePercentage = collectionFeeInfo[_tokenAddress].feePercentageInWei;
        if (_creatorFeePercentage == 0) return;

        uint256 _creatorFee = _valueFromPercentage(_creatorFeePercentage, _feeAmount);
        require(
            IERC20(_feeToken).transferFrom(msg.sender, collectionFeeInfo[_tokenAddress].treasury, _creatorFee),
            "OriumRentalProtocol: Creator fee transfer failed"
        );
    }

    /**
     * @notice Calculates the fee amount.
     * @dev The fee amount is calculated as the percentage of the amount.
     * @param _percentage The percentage in wei.
     * @param _amount The amount.
     */
    function _valueFromPercentage(uint256 _percentage, uint256 _amount) internal pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
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
     * @param _feePercentageInWei The fee percentage in wei.
     */
    function setMarketplaceFeeForCollection(address _tokenAddress, uint256 _feePercentageInWei) external onlyOwner {
        require(
            _feePercentageInWei <= MAX_PERCENTAGE,
            "OriumRentalProtocol: Fee percentage cannot be greater than 100%"
        );
        feesPerCollection[_tokenAddress] = _feePercentageInWei;
    }

    // TODO: Using the same function for the operator and the creator maybe is not ideal. Split it in two?
    // TODO: Should this function have the whenNotPaused modifier?
    /**
     * @notice Sets the collection fee info.
     * @dev If the creator is address(0), the collection will not have a creator fee.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The address of the collection.
     * @param _feePercentageInWei The fee percentage in wei. If the fee is 0, the creator fee will be disabled.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setCollectionFeeInfo(
        address _creator,
        address _tokenAddress,
        uint256 _feePercentageInWei,
        address _treasury
    ) external {
        require(
            msg.sender == collectionFeeInfo[_tokenAddress].creator || msg.sender == owner(),
            "OriumRentalProtocol: Only creator or operator can set collection fee info"
        );
        require(
            _feePercentageInWei <= MAX_PERCENTAGE,
            "OriumRentalProtocol: Fee percentage cannot be greater than 100%"
        );

        collectionFeeInfo[_tokenAddress] = CollectionFeeInfo({
            creator: _creator,
            feePercentageInWei: _feePercentageInWei,
            treasury: _treasury // TODO: we are not checking if the treasury is address(0), should we? (maybe the creator wants to burn the fees)
        });
    }
    /**
     * @notice Sets the maximum deadline.
     * @dev Only owner can set the maximum deadline.
     * @param _maxDeadline The maximum deadline.
     */
    function setMaxDeadline(uint256 _maxDeadline) external onlyOwner {
        maxDeadline = _maxDeadline; // TODO: Setting deadline to 0 would freeze the protocol. Should we allow this?
    }
}
