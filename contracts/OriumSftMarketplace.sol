// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC7589 } from "./interfaces/IERC7589.sol";
import { ICommitTokensAndGrantRoleExtension } from "./interfaces/ICommitTokensAndGrantRoleExtension.sol";
import { LibOriumSftMarketplace, RentalOffer, CommitAndGrantRoleParams } from "./libraries/LibOriumSftMarketplace.sol";
import { IOriumMarketplaceRoyalties } from "./interfaces/IOriumMarketplaceRoyalties.sol";

/**
 * @title Orium Marketplace - Marketplace for renting SFTs
 * @dev This contract is used to manage SFTs rentals, powered by ERC-7589 Semi-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumSftMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Constants ########### **/

    /** ######### Global Variables ########### **/

    /// @dev oriumMarketplaceRoyalties stores the collection royalties and fees
    address public oriumMarketplaceRoyalties;

    /// @dev hashedOffer => bool
    mapping(bytes32 => bool) public isCreated;

    /// @dev lender => nonce => deadline
    mapping(address => mapping(uint256 => uint64)) public nonceDeadline;

    /// @dev rolesRegistry => commitmentId => nonce
    mapping(address => mapping(uint256 => uint256)) public commitmentIdToNonce;

    /// @dev hashedOffer => Rental
    mapping(bytes32 => Rental) public rentals;

    /** ######### Structs ########### **/

    /// @dev Rental info.
    struct Rental {
        address borrower;
        uint64 expirationDate;
    }

    /** ######### Events ########### **/

    /**
     * @param nonce The nonce of the rental offer
     * @param tokenAddress The address of the contract of the SFT to rent
     * @param tokenId The tokenId of the SFT to rent
     * @param tokenAmount The amount of SFT to rent
     * @param commitmentId The commitmentId of the SFT to rent
     * @param lender The address of the user lending the SFT
     * @param borrower The address of the user renting the SFT
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
        uint256 tokenAmount,
        uint256 commitmentId,
        address lender,
        address borrower,
        address feeTokenAddress,
        uint256 feeAmountPerSecond,
        uint256 deadline,
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

    /** ######### Modifiers ########### **/

    /** ######### Initializer ########### **/
    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner The owner of the protocol.
     * @param _oriumMarketplaceRoyalties The address of the OriumMarketplaceRoyalties contract.
     */
    function initialize(address _owner, address _oriumMarketplaceRoyalties) public initializer {
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
    function createRentalOffer(RentalOffer memory _offer) external whenNotPaused {
        address _rolesRegistryAddress = IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(
            _offer.tokenAddress
        );
        _validateCreateRentalOffer(_offer, _rolesRegistryAddress);

        if (_offer.commitmentId == 0) {
            _offer.commitmentId = IERC7589(_rolesRegistryAddress).commitTokens(
                _offer.lender,
                _offer.tokenAddress,
                _offer.tokenId,
                _offer.tokenAmount
            );
        }

        nonceDeadline[msg.sender][_offer.nonce] = _offer.deadline;
        isCreated[LibOriumSftMarketplace.hashRentalOffer(_offer)] = true;
        commitmentIdToNonce[_rolesRegistryAddress][_offer.commitmentId] = _offer.nonce;

        emit RentalOfferCreated(
            _offer.nonce,
            _offer.tokenAddress,
            _offer.tokenId,
            _offer.tokenAmount,
            _offer.commitmentId,
            _offer.lender,
            _offer.borrower,
            _offer.feeTokenAddress,
            _offer.feeAmountPerSecond,
            _offer.deadline,
            _offer.roles,
            _offer.rolesData
        );
    }

    /**
     * @notice Accepts a rental offer.
     * @dev The borrower can be address(0) to allow anyone to rent the SFT.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     * @param _duration The duration of the rental.
     */
    function acceptRentalOffer(RentalOffer calldata _offer, uint64 _duration) external {
        uint64 _expirationDate = uint64(block.timestamp + _duration);
        bytes32 _offerHash = LibOriumSftMarketplace.hashRentalOffer(_offer);

        require(
            rentals[_offerHash].expirationDate <= block.timestamp,
            "OriumSftMarketplace: This offer has an ongoing rental"
        );
        require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
        require(
            address(0) == _offer.borrower || msg.sender == _offer.borrower,
            "OriumSftMarketplace: Sender is not allowed to rent this SFT"
        );
        require(
            nonceDeadline[_offer.lender][_offer.nonce] > _expirationDate,
            "OriumSftMarketplace: expiration date is greater than offer deadline"
        );

        _transferFees(_offer.tokenAddress, _offer.feeTokenAddress, _offer.feeAmountPerSecond, _duration, _offer.lender);

        IERC7589 _rolesRegistry = IERC7589(
            IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(_offer.tokenAddress)
        );
        for (uint256 i = 0; i < _offer.roles.length; i++) {
            _rolesRegistry.grantRole(
                _offer.commitmentId,
                _offer.roles[i],
                msg.sender,
                _expirationDate,
                false,
                _offer.rolesData[i]
            );
        }

        rentals[_offerHash] = Rental({ borrower: msg.sender, expirationDate: _expirationDate });

        emit RentalStarted(_offer.lender, _offer.nonce, msg.sender, _expirationDate);
    }

    /**
     * @notice Cancels a rental offer.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function cancelRentalOffer(RentalOffer calldata _offer) external {
        bytes32 _offerHash = LibOriumSftMarketplace.hashRentalOffer(_offer);
        require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
        require(msg.sender == _offer.lender, "OriumSftMarketplace: Only lender can cancel a rental offer");
        require(
            nonceDeadline[_offer.lender][_offer.nonce] > block.timestamp,
            "OriumSftMarketplace: Nonce expired or not used yet"
        );

        // if There are no active Rentals, release tokens (else, tokens will be released via `batchReleaseTokens`)
        if (rentals[_offerHash].expirationDate < block.timestamp) {
            IERC7589(IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(_offer.tokenAddress))
                .releaseTokens(_offer.commitmentId);
        }

        nonceDeadline[msg.sender][_offer.nonce] = uint64(block.timestamp);
        emit RentalOfferCancelled(_offer.lender, _offer.nonce);
    }

    /**
     * @notice Ends the rental.
     * @dev Can only be called by the borrower.
     * @dev Borrower needs to approve marketplace to revoke the roles.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function endRental(RentalOffer memory _offer) external {
        bytes32 _offerHash = LibOriumSftMarketplace.hashRentalOffer(_offer);

        require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
        require(msg.sender == rentals[_offerHash].borrower, "OriumSftMarketplace: Only borrower can end a rental");
        require(
            rentals[_offerHash].expirationDate > block.timestamp,
            "OriumSftMarketplace: There are no active Rentals"
        );

        IERC7589 _rolesRegistry = IERC7589(
            IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(_offer.tokenAddress)
        );
        address _borrower = rentals[_offerHash].borrower;

        for (uint256 i = 0; i < _offer.roles.length; i++) {
            _rolesRegistry.revokeRole(_offer.commitmentId, _offer.roles[i], _borrower);
        }

        rentals[_offerHash].expirationDate = uint64(block.timestamp);

        emit RentalEnded(_offer.lender, _offer.nonce);
    }

    /**
     * @notice Releases the tokens of a rental offer.
     * @dev Can only be called by the lender.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     */
    function batchReleaseTokens(RentalOffer[] calldata _offer) external {
        for (uint256 i = 0; i < _offer.length; i++) {
            bytes32 _offerHash = LibOriumSftMarketplace.hashRentalOffer(_offer[i]);
            require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
            require(msg.sender == _offer[i].lender, "OriumSftMarketplace: Only lender can release tokens");
            require(
                rentals[_offerHash].expirationDate < block.timestamp,
                "OriumSftMarketplace: Offer has an active Rental"
            );
            require(
                nonceDeadline[_offer[i].lender][_offer[i].nonce] < block.timestamp,
                "OriumSftMarketplace: Offer still active"
            );

            IERC7589(IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(_offer[i].tokenAddress))
                .releaseTokens(_offer[i].commitmentId);
        }
    }

    /**
     * @notice batchCommitTokensAndGrantRole commits tokens and grant role in a single transaction.
     * @param _params The array of CommitAndGrantRoleParams.
     */
    function batchCommitTokensAndGrantRole(CommitAndGrantRoleParams[] calldata _params) external {
        for (uint256 i = 0; i < _params.length; i++) {
            require(IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).isTrustedTokenAddress(_params[i].tokenAddress), "OriumSftMarketplace: tokenAddress is not trusted");
            ICommitTokensAndGrantRoleExtension(
                IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).sftRolesRegistryOf(_params[i].tokenAddress)
            ).commitTokensAndGrantRole(
                    msg.sender,
                    _params[i].tokenAddress,
                    _params[i].tokenId,
                    _params[i].tokenAmount,
                    _params[i].role,
                    _params[i].grantee,
                    _params[i].expirationDate,
                    _params[i].revocable,
                    _params[i].data
                );
        }
    }

    /** ######### Getters ########### **/

    /** ######### Internals ########### **/
    /**
     * @dev Validates the create rental offer.
     * @param _offer The rental offer struct.
     */
    function _validateCreateRentalOffer(RentalOffer memory _offer, address _rolesRegistryAddress) internal view {
        require(
            IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).isTrustedTokenAddress(_offer.tokenAddress) &&
                IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).isTrustedTokenAddress(_offer.feeTokenAddress),
            "OriumSftMarketplace: tokenAddress is not trusted"
        );
        LibOriumSftMarketplace.validateOffer(_offer);
        require(
            _offer.deadline <= block.timestamp +  IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).maxDeadline() && _offer.deadline > block.timestamp,
            "OriumSftMarketplace: Invalid deadline"
        );
        require(nonceDeadline[_offer.lender][_offer.nonce] == 0, "OriumSftMarketplace: nonce already used");

        if (_offer.commitmentId != 0) {
            uint256 _commitmentNonce = commitmentIdToNonce[_rolesRegistryAddress][_offer.commitmentId];

            if (_commitmentNonce != 0) {
                require(
                    nonceDeadline[_offer.lender][_commitmentNonce] < block.timestamp,
                    "OriumSftMarketplace: commitmentId is in an active rental offer"
                );
            }

            LibOriumSftMarketplace.validateCommitmentId(
                _offer.commitmentId,
                _offer.tokenAddress,
                _offer.tokenId,
                _offer.tokenAmount,
                _offer.lender,
                _rolesRegistryAddress
            );
        } else {
            require(
                IERC1155(_offer.tokenAddress).balanceOf(msg.sender, _offer.tokenId) >= _offer.tokenAmount,
                "OriumSftMarketplace: caller does not have enough balance for the token"
            );
        }
    }

    /**
     * @dev Transfers the fees to the marketplace, the creator and the lender.
     * @param _feeTokenAddress The address of the ERC20 token for rental fees.
     * @param _feeAmountPerSecond  The amount of fee per second.
     * @param _duration The duration of the rental.
     * @param _lenderAddress The address of the lender.
     */
    function _transferFees(
        address _tokenAddress,
        address _feeTokenAddress,
        uint256 _feeAmountPerSecond,
        uint64 _duration,
        address _lenderAddress
    ) internal {
        uint256 _feeAmount = _feeAmountPerSecond * _duration;
        if (_feeAmount == 0) return;

        uint256 _marketplaceFeeAmount = LibOriumSftMarketplace.getAmountFromPercentage(
            _feeAmount,
            IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).marketplaceFeeOf(_tokenAddress)
        );
        IOriumMarketplaceRoyalties.RoyaltyInfo memory _royaltyInfo = IOriumMarketplaceRoyalties(oriumMarketplaceRoyalties).royaltyInfoOf(_tokenAddress);

        uint256 _royaltyAmount = LibOriumSftMarketplace.getAmountFromPercentage(
            _feeAmount,
            _royaltyInfo.royaltyPercentageInWei
        );
        uint256 _lenderAmount = _feeAmount - _royaltyAmount - _marketplaceFeeAmount;

        LibOriumSftMarketplace.transferFees(
            _feeTokenAddress,
            _marketplaceFeeAmount,
            _royaltyAmount,
            _lenderAmount,
            owner(),
            _royaltyInfo.treasury,
            _lenderAddress
        );
    }

    /** ============================ Core Functions  ================================== **/

    /** ######### Setters ########### **/

    /**
     * @notice Pauses the contract.
     * @dev Only owner can pause the contract.
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

    function setOriumMarketplaceRoyalties(address _oriumMarketplaceRoyalties) external onlyOwner {
        oriumMarketplaceRoyalties = _oriumMarketplaceRoyalties;
    }

    /** ######### Getters ########### **/
}
