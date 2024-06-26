// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC7432 } from './interfaces/IERC7432.sol';
import { IOriumMarketplaceRoyalties } from './interfaces/IOriumMarketplaceRoyalties.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { Initializable } from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import { LibNftRentalMarketplace, RentalOffer, Rental } from './libraries/LibNftRentalMarketplace.sol';

/**
 * @title Orium NFT Marketplace - Marketplace for renting NFTs
 * @dev This contract is used to manage NFTs rentals, powered by ERC-7432 Non-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract NftRentalMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Global Variables ########### **/

    /// @dev oriumMarketplaceRoyalties stores the collection royalties and fees
    address public oriumMarketplaceRoyalties;

    /// @dev hashedOffer => bool
    mapping(bytes32 => bool) public isCreated;

    /// @dev lender => nonce => deadline
    mapping(address => mapping(uint256 => uint64)) public nonceDeadline;

    /// @dev role => tokenAddress => tokenId => deadline
    mapping(bytes32 => mapping(address => mapping(uint256 => uint64))) public roleDeadline;

    /// @dev hashedOffer => Rental
    mapping(bytes32 => Rental) public rentals;

    /** ######### Events ########### **/

    /**
     * @param nonce The nonce of the rental offer
     * @param tokenAddress The address of the contract of the NFT to rent
     * @param tokenId The tokenId of the NFT to rent
     * @param lender The address of the user lending the NFT
     * @param borrower The address of the user renting the NFT
     * @param feeTokenAddress The address of the ERC20 token for rental fees
     * @param feeAmountPerSecond The amount of fee per second
     * @param deadline The deadline until when the rental offer is valid
     * @param roles The array of roles to be assigned to the borrower
     * @param rolesData The array of data for each role
     */
    event RentalOfferCreated(
        uint256 indexed nonce,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        address lender,
        address borrower,
        address feeTokenAddress,
        uint256 feeAmountPerSecond,
        uint256 deadline,
        uint64 minDuration,
        bytes32[] roles,
        bytes[] rolesData
    );

    /**
     * @param lender The address of the lender
     * @param nonce The nonce of the rental offer
     * @param borrower The address of the borrower
     * @param expirationDate The expiration date of the rental
     */
    event RentalStarted(address indexed lender, uint256 indexed nonce, address indexed borrower, uint64 expirationDate);

    /**
     * @param lender The address of the lender
     * @param nonce The nonce of the rental offer
     */
    event RentalOfferCancelled(address indexed lender, uint256 indexed nonce);

    /**
     * @param lender The address of the lender
     * @param nonce The nonce of the rental offer
     */
    event RentalEnded(address indexed lender, uint256 indexed nonce);

    /** ######### Initializer ########### **/
    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner The owner of the protocol.
     * @param _oriumMarketplaceRoyalties The address of the OriumMarketplaceRoyalties contract.
     */
    function initialize(address _owner, address _oriumMarketplaceRoyalties) external initializer {
        __Pausable_init();
        __Ownable_init();

        oriumMarketplaceRoyalties = _oriumMarketplaceRoyalties;

        transferOwnership(_owner);
    }

    /** ============================ Rental Functions  ================================== **/

    /** ######### Setters ########### **/
    /**
     * @notice Creates a rental offer.
     * @dev To optimize for gas, only the offer hash is stored on-chain
     * @param _offer The rental offer struct.
     */
    function createRentalOffer(RentalOffer calldata _offer) external whenNotPaused {
        LibNftRentalMarketplace.validateCreateRentalOfferParams(
            oriumMarketplaceRoyalties,
            _offer,
            nonceDeadline[msg.sender][_offer.nonce]
        );

        for (uint256 i = 0; i < _offer.roles.length; i++) {
            require(
                roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] < block.timestamp,
                'NftRentalMarketplace: role still has an active offer or rental'
            );
            roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = _offer.deadline - _offer.minDuration;
        }

        bytes32 _offerHash = LibNftRentalMarketplace.hashRentalOffer(_offer);
        isCreated[_offerHash] = true;
        nonceDeadline[msg.sender][_offer.nonce] = _offer.deadline;

        emit RentalOfferCreated(
            _offer.nonce,
            _offer.tokenAddress,
            _offer.tokenId,
            _offer.lender,
            _offer.borrower,
            _offer.feeTokenAddress,
            _offer.feeAmountPerSecond,
            _offer.deadline,
            _offer.minDuration,
            _offer.roles,
            _offer.rolesData
        );
    }

    /**
     * @notice Accepts a rental offer.
     * @dev The borrower can be address(0) to allow anyone to rent the NFT.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     * @param _duration The duration of the rental.
     */
    function acceptRentalOffer(RentalOffer calldata _offer, uint64 _duration) external whenNotPaused {
        bytes32 _offerHash = LibNftRentalMarketplace.hashRentalOffer(_offer);
        uint64 _expirationDate = uint64(block.timestamp + _duration);
        LibNftRentalMarketplace.validateAcceptRentalOfferParams(
            _offer.borrower,
            _offer.minDuration,
            isCreated[_offerHash],
            rentals[_offerHash].expirationDate,
            _duration,
            nonceDeadline[_offer.lender][_offer.nonce],
            _expirationDate
        );

        LibNftRentalMarketplace.transferFees(
            _offer.feeTokenAddress,
            owner(),
            _offer.lender,
            oriumMarketplaceRoyalties,
            _offer.tokenAddress,
            _offer.feeAmountPerSecond,
            _duration
        );

        LibNftRentalMarketplace.grantRoles(
            oriumMarketplaceRoyalties,
            _offer.tokenAddress,
            _offer.tokenId,
            msg.sender,
            _expirationDate,
            _offer.roles,
            _offer.rolesData
        );

        for (uint256 i = 0; i < _offer.roles.length; i++) {
            if(_expirationDate > roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId]) {
                 roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = _expirationDate;
            }
        }

        rentals[_offerHash] = Rental({ borrower: msg.sender, expirationDate: _expirationDate });

        emit RentalStarted(_offer.lender, _offer.nonce, msg.sender, _expirationDate);
    }

    /**
     * @notice Cancels a rental offer.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function cancelRentalOffer(RentalOffer calldata _offer) external whenNotPaused {
        _cancelRentalOffer(_offer);
    }

    /**
     * @notice Cancels a rental offer and withdraws the NFT.
     * @dev Can only be called by the lender, and only withdraws the NFT if the rental has expired.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function cancelRentalOfferAndWithdraw(RentalOffer calldata _offer) external whenNotPaused {
        _cancelRentalOffer(_offer);

        address _rolesRegistry = IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).nftRolesRegistryOf(
            _offer.tokenAddress
        );
        IERC7432(_rolesRegistry).unlockToken(_offer.tokenAddress, _offer.tokenId);
    }

    /**
     * @notice Ends the rental prematurely.
     * @dev Can only be called by the borrower.
     * @dev Borrower needs to approve marketplace to revoke the roles.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function endRental(RentalOffer calldata _offer) external whenNotPaused {
        bytes32 _offerHash = LibNftRentalMarketplace.hashRentalOffer(_offer);
        Rental storage _rental = rentals[_offerHash];

        LibNftRentalMarketplace.validateEndRentalParams(
            isCreated[_offerHash],
            _rental.borrower,
            _rental.expirationDate
        );
        LibNftRentalMarketplace.revokeRoles(
            oriumMarketplaceRoyalties,
            _offer.tokenAddress,
            _offer.tokenId,
            _offer.roles
        );
             
        uint64 _offerDeadline = nonceDeadline[_offer.lender][_offer.nonce];
        if (_offerDeadline < uint64(block.timestamp)) {
            for (uint256 i = 0; i < _offer.roles.length; i++) {
                roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = uint64(block.timestamp);
            }
        }

        _rental.expirationDate = uint64(block.timestamp);
        emit RentalEnded(_offer.lender, _offer.nonce);
    }

    /**
     * @notice Withdraws NFTs from roles registry.
     * @dev Can only be called by the token owner.
     * @param _tokenAddresses The NFT tokenAddresses.
     * @param _tokenIds The NFT tokenIds.
     */
    function batchWithdraw(address[] calldata _tokenAddresses, uint256[] calldata _tokenIds) external whenNotPaused {
        LibNftRentalMarketplace.batchWithdraw(oriumMarketplaceRoyalties, _tokenAddresses, _tokenIds);
    }

    /**
     * @notice Grants multiple roles.
     * @param _params The array of role params.
     */
    function batchGrantRole(IERC7432.Role[] calldata _params) external whenNotPaused {
        LibNftRentalMarketplace.batchGrantRole(_params, oriumMarketplaceRoyalties);
    }

    /**
     * @notice Revokes multiple roles.
     * @dev owner will be msg.sender and it must approve the marketplace to revoke the roles.
     * @param _tokenAddresses The array of tokenAddresses
     * @param _tokenIds The array of tokenIds
     */
    function batchRevokeRole(
        address[] memory _tokenAddresses,
        uint256[] memory _tokenIds,
        bytes32[] memory _roleIds
    ) external whenNotPaused {
        LibNftRentalMarketplace.batchRevokeRole(_tokenAddresses, _tokenIds, _roleIds, oriumMarketplaceRoyalties);
    }

    /** ######### Internals ########### **/

    /**
     * @notice Cancels a rental offer.
     * @dev Internal function to cancel a rental offer.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function _cancelRentalOffer(RentalOffer calldata _offer) internal {
        bytes32 _offerHash = LibNftRentalMarketplace.hashRentalOffer(_offer);
        LibNftRentalMarketplace.validateCancelRentalOfferParams(
            isCreated[_offerHash],
            _offer.lender,
            nonceDeadline[_offer.lender][_offer.nonce]
        );

        nonceDeadline[msg.sender][_offer.nonce] = uint64(block.timestamp);
        for (uint256 i = 0; i < _offer.roles.length; i++) {

            if (rentals[_offerHash].expirationDate > uint64(block.timestamp)) {
                roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = rentals[_offerHash].expirationDate;
            } else {
                roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = uint64(block.timestamp);
            }
        }
        emit RentalOfferCancelled(_offer.lender, _offer.nonce);
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
}
