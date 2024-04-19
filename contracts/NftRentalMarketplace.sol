// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
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
                'NftRentalMarketplace: role still has an active offer'
            );
            roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = _offer.deadline;
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

        rentals[_offerHash] = Rental({ borrower: msg.sender, expirationDate: _expirationDate });

        emit RentalStarted(_offer.lender, _offer.nonce, msg.sender, _expirationDate);
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