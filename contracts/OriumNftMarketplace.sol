// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import { IERC7432VaultExtension } from './interfaces/IERC7432VaultExtension.sol';
import { IOriumMarketplaceRoyalties } from './interfaces/IOriumMarketplaceRoyalties.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { Initializable } from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

/**
 * @title Orium NFT Marketplace - Marketplace for renting NFTs
 * @dev This contract is used to manage NFTs rentals, powered by ERC-7432 Non-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumNftMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Global Variables ########### **/

    /// @dev oriumMarketplaceRoyalties stores the collection royalties and fees
    address public oriumMarketplaceRoyalties;

    /// @dev hashedOffer => bool
    mapping(bytes32 => bool) public isCreated;

    /// @dev lender => nonce => deadline
    mapping(address => mapping(uint256 => uint64)) public nonceDeadline;

    /// @dev role => tokenAddress => tokenId => deadline
    mapping(bytes32 => mapping(address => mapping(uint256 => uint64))) public roleDeadline;

    /** ######### Structs ########### **/

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

    /** ######### Modifiers ########### **/

    /**
     * @notice Checks the ownership of the token.
     * @dev Throws if the caller is not the owner of the token.
     * @param _tokenAddress The NFT address.
     * @param _tokenId The id of the token.
     */
    modifier onlyTokenOwner(address _tokenAddress, uint256 _tokenId) {
        address _rolesRegistry = IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).nftRolesRegistryOf(
            _tokenAddress
        );
        require(
            msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId) ||
                msg.sender == IERC7432VaultExtension(_rolesRegistry).ownerOf(_tokenAddress, _tokenId),
            'OriumNftMarketplace: only token owner can call this function'
        );
        _;
    }

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
    function createRentalOffer(
        RentalOffer calldata _offer
    ) external onlyTokenOwner(_offer.tokenAddress, _offer.tokenId) {
        _validateCreateRentalOffer(_offer);

        bytes32 _offerHash = hashRentalOffer(_offer);

        nonceDeadline[msg.sender][_offer.nonce] = _offer.deadline;
        isCreated[_offerHash] = true;
        for (uint256 i = 0; i < _offer.roles.length; i++) {
            require(
                roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] < block.timestamp,
                'OriumNftMarketplace: role still has an active offer'
            );
            roleDeadline[_offer.roles[i]][_offer.tokenAddress][_offer.tokenId] = _offer.deadline;
        }

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

    /** ######### Getters ########### **/

    /**
     * @notice Gets the rental offer hash.
     * @param _offer The rental offer struct to be hashed.
     */
    function hashRentalOffer(RentalOffer memory _offer) public pure returns (bytes32) {
        return keccak256(abi.encode(_offer));
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

    /** ######### Internals ########### **/

    /**
     * @dev Validates the create rental offer.
     * @param _offer The rental offer struct.
     */
    function _validateCreateRentalOffer(RentalOffer calldata _offer) internal view {
        require(
            IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).isTrustedFeeTokenAddressForToken(
                _offer.tokenAddress,
                _offer.feeTokenAddress
            ),
            'OriumSftMarketplace: tokenAddress is not trusted'
        );
        require(
            _offer.deadline <= block.timestamp + IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).maxDuration() &&
                _offer.deadline > block.timestamp,
            'OriumNftMarketplace: Invalid deadline'
        );
        require(nonceDeadline[_offer.lender][_offer.nonce] == 0, 'OriumNftMarketplace: nonce already used');

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
    }
}
