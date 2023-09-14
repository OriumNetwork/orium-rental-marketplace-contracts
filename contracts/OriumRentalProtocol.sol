// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract OriumRentalProtocol is Initializable, OwnableUpgradeable, PausableUpgradeable {
    uint256 public constant MAX_PERCENTAGE = 100 ether; // 100%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether; // 2.5%

    address public rolesRegistry;
    uint256 public maxDeadline;


    /// @dev tokenAddress => feePercentageInWei
    mapping(address => uint256) public feesPerCollection;

    /// @dev tokenAddress => collectionFeeInfo
    mapping(address => CollectionFeeInfo) public collectionFeeInfo;

    struct CollectionFeeInfo {
        address creator;
        uint256 feePercentageInWei;
        address treasury;
    }

    function initialize(address _owner, address _rolesRegistry, uint256 _maxDeadline) public initializer {
        __Pausable_init();
        __Ownable_init();

        rolesRegistry = _rolesRegistry;
        maxDeadline = _maxDeadline;

        transferOwnership(_owner);
    }

    function _chargeFee(address _tokenAddress, address _lender, address _feeToken, uint256 _feeAmount) internal {
        // Charge the marketplace fee
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
            IERC20(_feeToken).transferFrom(msg.sender, _creator, _creatorFee),
            "OriumRentalProtocol: Creator fee transfer failed"
        );
    }

    function _valueFromPercentage(uint256 _percentage, uint256 _amount) internal pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei
    ) external onlyOwner {
        require(
            _feePercentageInWei <= MAX_PERCENTAGE,
            "OriumRentalProtocol: Fee percentage cannot be greater than 100%"
        );
        feesPerCollection[_tokenAddress] = _feePercentageInWei;
    }

    function setCollectionFeeInfo(address _creator, address _tokenAddress, uint256 _feePercentageInWei, address _treasury) external {
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
            treasury: _treasury
        });
    }

    function setMaxDeadline(uint256 _maxDeadline) external onlyOwner {
        maxDeadline = _maxDeadline;
    }
}
