// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC7432 } from '../interfaces/IERC7432.sol';
import { IERC7432VaultExtension } from '../interfaces/IERC7432VaultExtension.sol';
import { IOriumMarketplaceRoyalties } from '../interfaces/IOriumMarketplaceRoyalties.sol';

/// @dev Rental offer info.
struct RentalOffer {
    address lender;
    address borrower;
    address tokenAddress;
    uint256 tokenId;
    address feeTokenAddress;
    uint256 feeAmountPerSecond;
    uint256 nonce;
    uint64 deadline;
    uint64 minDuration;
    bytes32[] roles;
    bytes[] rolesData;
}

/// @dev Rental info.
struct Rental {
    address borrower;
    uint64 expirationDate;
}

library LibNftRentalMarketplace {
    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;

    /**
     * @notice Gets the rental offer hash.
     * @dev This function is used to hash the rental offer struct
     * @param _offer The rental offer struct to be hashed.
     */
    function hashRentalOffer(RentalOffer memory _offer) external pure returns (bytes32) {
        return keccak256(abi.encode(_offer));
    }

    /**
     * @notice Validates the rental offer.
     * @param _offer The rental offer struct to be validated.
     */
    function validateCreateRentalOfferParams(
        address _oriumMarketplaceRoyalties,
        RentalOffer calldata _offer,
        uint64 _nonceDeadline
    ) external view {
        address _rolesRegistry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).nftRolesRegistryOf(
            _offer.tokenAddress
        );
        address _nftOwner = IERC721(_offer.tokenAddress).ownerOf(_offer.tokenId);
        require(
            msg.sender == _nftOwner ||
                (msg.sender == IERC7432VaultExtension(_rolesRegistry).ownerOf(_offer.tokenAddress, _offer.tokenId) &&
                    _rolesRegistry == _nftOwner),
            'NftRentalMarketplace: only token owner can call this function'
        );
        require(
            IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).isTrustedFeeTokenAddressForToken(
                _offer.tokenAddress,
                _offer.feeTokenAddress
            ),
            'NftRentalMarketplace: tokenAddress or feeTokenAddress is not trusted'
        );
        require(
            _offer.deadline <= block.timestamp + IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).maxDuration() &&
                _offer.deadline > block.timestamp,
            'NftRentalMarketplace: Invalid deadline'
        );
        require(_offer.nonce != 0, 'NftRentalMarketplace: Nonce cannot be 0');
        require(msg.sender == _offer.lender, 'NftRentalMarketplace: Sender and Lender mismatch');
        require(_offer.roles.length > 0, 'NftRentalMarketplace: roles should not be empty');
        require(
            _offer.roles.length == _offer.rolesData.length,
            'NftRentalMarketplace: roles and rolesData should have the same length'
        );
        require(
            _offer.borrower != address(0) || _offer.feeAmountPerSecond > 0,
            'NftRentalMarketplace: feeAmountPerSecond should be greater than 0'
        );
        require(
            _offer.minDuration <= _offer.deadline - block.timestamp,
            'NftRentalMarketplace: minDuration is invalid'
        );
        require(_nonceDeadline == 0, 'NftRentalMarketplace: nonce already used');
    }

     /**
     * @dev All values needs to be in wei.
     * @param _amount The amount to calculate the percentage from.
     * @param _percentage The percentage to calculate.
     */
    function getAmountFromPercentage(uint256 _amount, uint256 _percentage) public pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
    }

     /**
     * @notice Transfers the fees.
     * @dev The fee token address should be approved before calling this function.
     * @param _feeTokenAddress The fee token address.
     * @param _marketplaceTreasuryAddress The marketplace treasury address.
     * @param _lenderAddress The lender address.
     * @param _royaltiesAddress The Orium marketplace royalties contract address.
     * @param _tokenAddress The token address.
     * @param _feeAmountPerSecond The fee amount per second.
     * @param _duration The duration of the rental.
     */
    function transferFees(
        address _feeTokenAddress,
        address _marketplaceTreasuryAddress,
        address _lenderAddress,
        address _royaltiesAddress,
        address _tokenAddress,
        uint256 _feeAmountPerSecond,
        uint64 _duration
    ) external {
        uint256 _totalAmount = _feeAmountPerSecond * _duration;
        if (_totalAmount == 0) return;

        IOriumMarketplaceRoyalties _royalties = IOriumMarketplaceRoyalties(_royaltiesAddress);
        uint256 _marketplaceFeePercentageInWei = _royalties.marketplaceFeeOf(_tokenAddress);
        IOriumMarketplaceRoyalties.RoyaltyInfo memory _royaltyInfo = _royalties.royaltyInfoOf(_tokenAddress);

        uint256 _marketplaceAmount = getAmountFromPercentage(_totalAmount, _marketplaceFeePercentageInWei);
        uint256 _royaltyAmount = getAmountFromPercentage(_totalAmount, _royaltyInfo.royaltyPercentageInWei);
        uint256 _lenderAmount = _totalAmount - _royaltyAmount - _marketplaceAmount;

        _transferAmount(_feeTokenAddress, msg.sender, _marketplaceTreasuryAddress, _marketplaceAmount);
        _transferAmount(_feeTokenAddress, msg.sender, _royaltyInfo.treasury, _royaltyAmount);
        _transferAmount(_feeTokenAddress, msg.sender, _lenderAddress, _lenderAmount);
    }

    /**
     * @notice Transfers an amount to a receipient.
     * @dev This function is used to make an ERC20 transfer.
     * @param _tokenAddress The token address.
     * @param _from The sender address.
     * @param _to The recipient address.
     * @param _amount The amount to transfer.
     */
    function _transferAmount(address _tokenAddress, address _from, address _to, uint256 _amount) internal {
        if (_amount == 0) return;
        require(IERC20(_tokenAddress).transferFrom(_from, _to, _amount), 'OriumNftMarketplace: Transfer failed');
    }

    function validateAcceptRentalOfferParams(
        address _borrower,
        uint64 _minDuration,
        bool _isCreated,
        uint64 _previousRentalExpirationDate,
        uint64 _duration,
        uint256 _nonceDeadline,
        uint64 _expirationDate
    ) external view {
        require(_isCreated, 'OriumNftMarketplace: Offer not created');
        require(
            _previousRentalExpirationDate <= block.timestamp,
            'OriumNftMarketplace: This offer has an ongoing rental'
        );
        require(_duration >= _minDuration, 'OriumNftMarketplace: Duration is less than the offer minimum duration');
        require(
            _nonceDeadline > _expirationDate,
            'OriumNftMarketplace: expiration date is greater than offer deadline'
        );
        require(
            address(0) == _borrower || msg.sender == _borrower,
            'OriumNftMarketplace: Sender is not allowed to rent this NFT'
        );
    }

    /**
     * @notice grants roles for the same NFT.
     * @dev This function is used to batch grant roles for the same NFT.
     * @param _oriumMarketplaceRoyalties The Orium marketplace royalties contract address.
     * @param _tokenAddress The token address.
     * @param _tokenId The token id.
     * @param _recipient The recipient address.
     * @param _expirationDate The expiration date.
     * @param _roleIds The role ids.
     * @param _data The data.
     */
    function grantRoles(
        address _oriumMarketplaceRoyalties,
        address _tokenAddress,
        uint256 _tokenId,
        address _recipient,
        uint64 _expirationDate,
        bytes32[] calldata _roleIds,
        bytes[] calldata _data
    ) external {
        address _rolesRegsitry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).nftRolesRegistryOf(
            _tokenAddress
        );

        for (uint256 i = 0; i < _roleIds.length; i++) {
            IERC7432(_rolesRegsitry).grantRole(
                IERC7432.Role({
                    roleId: _roleIds[i],
                    tokenAddress: _tokenAddress,
                    tokenId: _tokenId,
                    recipient: _recipient,
                    expirationDate: _expirationDate,
                    revocable: false,
                    data: _data[i]
                })
            );
        }
    }

}
