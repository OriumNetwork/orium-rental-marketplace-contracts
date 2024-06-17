// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC7432 } from '../interfaces/IERC7432.sol';
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

        // sender must be the ERC-721 or the ERC-7432 owner to create a rental offer
        require(
            msg.sender == IERC721(_offer.tokenAddress).ownerOf(_offer.tokenId) ||
                msg.sender == IERC7432(_rolesRegistry).ownerOf(_offer.tokenAddress, _offer.tokenId),
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
     * @param _oriumRoyaltiesAddress The Orium marketplace royalties contract address.
     * @param _tokenAddress The token address.
     * @param _feeAmountPerSecond The fee amount per second.
     * @param _duration The duration of the rental.
     */
    function transferFees(
        address _feeTokenAddress,
        address _marketplaceTreasuryAddress,
        address _lenderAddress,
        address _oriumRoyaltiesAddress,
        address _tokenAddress,
        uint256 _feeAmountPerSecond,
        uint64 _duration
    ) external {
        uint256 _totalAmount = _feeAmountPerSecond * _duration;
        if (_totalAmount == 0) return;

        IOriumMarketplaceRoyalties _royalties = IOriumMarketplaceRoyalties(_oriumRoyaltiesAddress);
        uint256 _marketplaceFeePercentageInWei = _royalties.marketplaceFeeOf(_tokenAddress);
        IOriumMarketplaceRoyalties.RoyaltyInfo memory _royaltyInfo = _royalties.royaltyInfoOf(_tokenAddress);

        uint256 _marketplaceAmount = getAmountFromPercentage(_totalAmount, _marketplaceFeePercentageInWei);
        uint256 _royaltyAmount = getAmountFromPercentage(_totalAmount, _royaltyInfo.royaltyPercentageInWei);
        uint256 _lenderAmount = _totalAmount - _royaltyAmount - _marketplaceAmount;

        _transferAmount(_feeTokenAddress, _marketplaceTreasuryAddress, _marketplaceAmount);
        _transferAmount(_feeTokenAddress, _royaltyInfo.treasury, _royaltyAmount);
        _transferAmount(_feeTokenAddress, _lenderAddress, _lenderAmount);
    }

    /**
     * @notice Transfers an amount to a receipient.
     * @dev This function is used to make an ERC20 transfer.
     * @param _tokenAddress The token address.
     * @param _to The recipient address.
     * @param _amount The amount to transfer.
     */
    function _transferAmount(address _tokenAddress, address _to, uint256 _amount) internal {
        if (_amount == 0) return;
        require(IERC20(_tokenAddress).transferFrom(msg.sender, _to, _amount), 'NftRentalMarketplace: Transfer failed');
    }

    /**
     * @notice Validates the accept rental offer.
     * @dev This function is used to validate the accept rental offer params.
     * @param _borrower The borrower address
     * @param _minDuration The minimum duration of the rental
     * @param _isCreated The boolean value to check if the offer is created
     * @param _previousRentalExpirationDate The expiration date of the previous rental
     * @param _duration The duration of the rental
     * @param _nonceDeadline The deadline of the nonce
     * @param _expirationDate The expiration date of the rental
     */
    function validateAcceptRentalOfferParams(
        address _borrower,
        uint64 _minDuration,
        bool _isCreated,
        uint64 _previousRentalExpirationDate,
        uint64 _duration,
        uint256 _nonceDeadline,
        uint64 _expirationDate
    ) external view {
        require(_isCreated, 'NftRentalMarketplace: Offer not created');
        require(
            _previousRentalExpirationDate <= block.timestamp,
            'NftRentalMarketplace: This offer has an ongoing rental'
        );
        require(_duration >= _minDuration, 'NftRentalMarketplace: Duration is less than the offer minimum duration');
        require(
            _nonceDeadline > _expirationDate,
            'NftRentalMarketplace: expiration date is greater than offer deadline'
        );
        require(
            address(0) == _borrower || msg.sender == _borrower,
            'NftRentalMarketplace: Sender is not allowed to rent this NFT'
        );
    }

    /**
     * @notice Grants multiple roles to the same NFT.
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

    /**
     * @notice Validates the cancel rental offer params.
     * @dev This function is used to validate the cancel rental offer params.
     * @param _isCreated Whether the offer is created
     * @param _lender The lender address
     * @param _nonceDeadline The nonce deadline
     */
    function validateCancelRentalOfferParams(bool _isCreated, address _lender, uint256 _nonceDeadline) external view {
        require(_isCreated, 'NftRentalMarketplace: Offer not created');
        require(msg.sender == _lender, 'NftRentalMarketplace: Only lender can cancel a rental offer');
        require(_nonceDeadline > block.timestamp, 'NftRentalMarketplace: Nonce expired or not used yet');
    }

    /**
     * @notice Validates the end rental params.
     * @dev This function is used to validate the end rental params.
     * @param _isCreated The offer is created
     * @param _borrower The borrower address
     * @param _expirationDate The expiration date
     */
    function validateEndRentalParams(bool _isCreated, address _borrower, uint64 _expirationDate) external view {
        require(_isCreated, 'NftRentalMarketplace: Offer not created');
        require(msg.sender == _borrower, 'NftRentalMarketplace: Only borrower can end a rental');
        require(_expirationDate > block.timestamp, 'NftRentalMarketplace: There are no active Rentals');
    }

    /**
     * @notice Revokes roles for the same NFT.
     * @dev This function is used to batch revoke roles for the same NFT.
     * @param _oriumMarketplaceRoyalties The Orium marketplace royalties contract address.
     * @param _tokenAddress The token address.
     * @param _tokenId The token id.
     * @param _roleIds The role ids.
     */
    function revokeRoles(
        address _oriumMarketplaceRoyalties,
        address _tokenAddress,
        uint256 _tokenId,
        bytes32[] calldata _roleIds
    ) external {
        address _rolesRegsitry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).nftRolesRegistryOf(
            _tokenAddress
        );
        for (uint256 i = 0; i < _roleIds.length; i++) {
            IERC7432(_rolesRegsitry).revokeRole(_tokenAddress, _tokenId, _roleIds[i]);
        }
    }

    /**
     * @notice Withdraws tokens from registry
     * @dev Can only be called by the token owner.
     * @param _oriumMarketplaceRoyaltiesAddress The address of the OriumMarketplaceRoyalties contract.
     * @param _tokenAddresses The NFT tokenAddresses.
     * @param _tokenIds The NFT tokenIds.
     */
    function batchWithdraw(
        address _oriumMarketplaceRoyaltiesAddress,
        address[] calldata _tokenAddresses,
        uint256[] calldata _tokenIds
    ) external {
        require(_tokenAddresses.length == _tokenIds.length, 'OriumNftMarketplace: arrays length mismatch');
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            address _rolesRegistry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyaltiesAddress).nftRolesRegistryOf(
                _tokenAddresses[i]
            );
            require(
                msg.sender == IERC7432(_rolesRegistry).ownerOf(_tokenAddresses[i], _tokenIds[i]),
                "OriumNftMarketplace: sender is not the token's owner"
            );
            IERC7432(_rolesRegistry).unlockToken(_tokenAddresses[i], _tokenIds[i]);
        }
    }

    /**
     * @notice Grants multiple roles.
     * @param _params The array of role params.
     * @param _oriumMarketplaceRoyalties The Orium marketplace royalties contract address.
     */
    function batchGrantRole(IERC7432.Role[] calldata _params, address _oriumMarketplaceRoyalties) external {
        for (uint256 i = 0; i < _params.length; i++) {
            address _rolesRegistry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).nftRolesRegistryOf(
                _params[i].tokenAddress
            );
            require(
                msg.sender == IERC721(_params[i].tokenAddress).ownerOf(_params[i].tokenId) ||
                    msg.sender == IERC7432(_rolesRegistry).ownerOf(_params[i].tokenAddress, _params[i].tokenId),
                'OriumNftMarketplace: sender is not the owner'
            );

            IERC7432(_rolesRegistry).grantRole(_params[i]);
        }
    }

    /**
     * @notice Revokes multiple roles.
     * @dev only the owner and recipient can call this function. Be careful as the marketplace receives role approvals from other users.
     * @param _tokenAddresses The array of tokenAddresses
     * @param _tokenIds The array of tokenIds
     * @param _roleIds The array of roleIds
     * @param _oriumMarketplaceRoyalties The Orium marketplace royalties contract address.
     */
    function batchRevokeRole(
        address[] memory _tokenAddresses,
        uint256[] memory _tokenIds,
        bytes32[] memory _roleIds,
        address _oriumMarketplaceRoyalties
    ) external {
        require(
            _tokenIds.length == _tokenAddresses.length && _tokenIds.length == _roleIds.length,
            'OriumNftMarketplace: arrays length mismatch'
        );

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            address _rolesRegistry = IOriumMarketplaceRoyalties(_oriumMarketplaceRoyalties).nftRolesRegistryOf(
                _tokenAddresses[i]
            );
            require(
                IERC7432(_rolesRegistry).isRoleRevocable(_tokenAddresses[i], _tokenIds[i], _roleIds[i]),
                'OriumNftMarketplace: role is not revocable'
            );
            require(
                IERC7432(_rolesRegistry).roleExpirationDate(_tokenAddresses[i], _tokenIds[i], _roleIds[i]) >
                    block.timestamp,
                'OriumNftMarketplace: role is expired'
            );
            require(
                msg.sender == IERC7432(_rolesRegistry).ownerOf(_tokenAddresses[i], _tokenIds[i]) ||
                    msg.sender == IERC7432(_rolesRegistry).recipientOf(_tokenAddresses[i], _tokenIds[i], _roleIds[i]),
                "OriumNftMarketplace: sender is not the token's owner or recipient"
            );
            IERC7432(_rolesRegistry).revokeRole(_tokenAddresses[i], _tokenIds[i], _roleIds[i]);
        }
    }
}
