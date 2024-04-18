// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
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

library LibOriumNftMarketplace {
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
        require(
            msg.sender == IERC721(_offer.tokenAddress).ownerOf(_offer.tokenId) ||
                msg.sender == IERC7432VaultExtension(_rolesRegistry).ownerOf(_offer.tokenAddress, _offer.tokenId),
            'OriumNftMarketplace: only token owner can call this function'
        );
        require(
            IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).isTrustedFeeTokenAddressForToken(
                _offer.tokenAddress,
                _offer.feeTokenAddress
            ),
            'OriumNftMarketplace: tokenAddress is not trusted'
        );
        require(
            _offer.deadline <= block.timestamp + IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).maxDuration() &&
                _offer.deadline > block.timestamp,
            'OriumNftMarketplace: Invalid deadline'
        );
        require(_offer.nonce != 0, 'OriumNftMarketplace: Nonce cannot be 0');
        require(msg.sender == _offer.lender, 'OriumNftMarketplace: Sender and Lender mismatch');
        require(_offer.roles.length > 0, 'OriumNftMarketplace: roles should not be empty');
        require(
            _offer.roles.length == _offer.rolesData.length,
            'OriumNftMarketplace: roles and rolesData should have the same length'
        );
        require(
            _offer.borrower != address(0) || _offer.feeAmountPerSecond > 0,
            'OriumNftMarketplace: feeAmountPerSecond should be greater than 0'
        );
        require(_offer.minDuration <= _offer.deadline - block.timestamp, 'OriumNftMarketplace: minDuration is invalid');
        require(_nonceDeadline == 0, 'OriumNftMarketplace: nonce already used');
    }
}
