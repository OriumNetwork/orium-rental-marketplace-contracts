// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC7589 } from "./interfaces/IERC7589.sol";
import { LibOriumSftMarketplace, RentalOffer } from "./libraries/LibOriumSftMarketplace.sol";

/**
 * @title Orium Marketplace - Marketplace for renting SFTs
 * @dev This contract is used to manage SFTs rentals, powered by ERC-7589 Semi-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumSftMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Constants ########### **/

    /** ######### Global Variables ########### **/

    /// @dev rolesRegistry is a ERC-7589 contract
    address public defaultRolesRegistry;

    /// @dev tokenAddress => rolesRegistry
    mapping(address => address) public tokenAddressToRolesRegistry;

    /// @dev deadline is set in seconds
    uint256 public maxDeadline;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => FeeInfo) public feeInfo;

    /// @dev tokenAddress => tokenAddressToRoyaltyInfo
    mapping(address => RoyaltyInfo) public tokenAddressToRoyaltyInfo;

    /// @dev hashedOffer => bool
    mapping(bytes32 => bool) public isCreated;

    /// @dev lender => nonce => deadline
    mapping(address => mapping(uint256 => uint64)) public nonceDeadline;

    /// @dev rolesRegistry => commitmentId => nonce
    mapping(address => mapping(uint256 => uint256)) public commitmentIdToNonce;

    /// @dev tokenAddress => bool
    mapping(address => bool) public isTrustedTokenAddress;

    /// @dev hashedOffer => Rental
    mapping(bytes32 => Rental) public rentals;

    /** ######### Structs ########### **/

    /// @dev Royalty info. Used to charge fees for the creator.
    struct RoyaltyInfo {
        address creator;
        uint256 royaltyPercentageInWei;
        address treasury;
    }

    /// @dev Marketplace fee info.
    struct FeeInfo {
        uint256 feePercentageInWei;
        bool isCustomFee;
    }

    /// @dev Rental info.
    struct Rental {
        address borrower;
        uint64 expirationDate;
    }

    /** ######### Events ########### **/

    /**
     * @param tokenAddress The SFT address.
     * @param feePercentageInWei The fee percentage in wei.
     * @param isCustomFee If the fee is custom or not. Used to allow collections with no fee.
     */
    event MarketplaceFeeSet(address indexed tokenAddress, uint256 feePercentageInWei, bool isCustomFee);
    /**
     * @param tokenAddress The SFT address.
     * @param creator The address of the creator.
     * @param royaltyPercentageInWei The royalty percentage in wei.
     * @param treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    event CreatorRoyaltySet(
        address indexed tokenAddress,
        address indexed creator,
        uint256 royaltyPercentageInWei,
        address treasury
    );

    /**
     * @param tokenAddress The SFT address.
     * @param rolesRegistry The address of the roles registry.
     */
    event RolesRegistrySet(address indexed tokenAddress, address indexed rolesRegistry);

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
     * @param nonce The nonce of the rental offer
     * @param tokenAddress The address of the contract of the SFT rented
     * @param tokenId The tokenId of the rented SFT
     * @param commitmentId The commitmentId of the rented SFT
     * @param lender The address of the lender
     * @param borrower The address of the borrower
     * @param expirationDate The expiration date of the rental
     */
    event RentalStarted(
        uint256 indexed nonce,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        uint256 commitmentId,
        address lender,
        address borrower,
        uint64 expirationDate
    );

    /**
     * @param nonce The nonce of the rental offer
     */
    event RentalOfferCancelled(uint256 indexed nonce);

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
     * @param _defaultRolesRegistry The address of the roles registry.
     * @param _maxDeadline The maximum deadline.
     */
    function initialize(address _owner, address _defaultRolesRegistry, uint256 _maxDeadline) public initializer {
        __Pausable_init();
        __Ownable_init();

        defaultRolesRegistry = _defaultRolesRegistry;
        maxDeadline = _maxDeadline;

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
        address _rolesRegistryAddress = rolesRegistryOf(_offer.tokenAddress);
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

        IERC7589 _rolesRegistry = IERC7589(rolesRegistryOf(_offer.tokenAddress));
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

        emit RentalStarted(
            _offer.nonce,
            _offer.tokenAddress,
            _offer.tokenId,
            _offer.commitmentId,
            _offer.lender,
            msg.sender,
            _expirationDate
        );
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

        if (rentals[_offerHash].expirationDate < block.timestamp) {
            IERC7589(rolesRegistryOf(_offer.tokenAddress)).releaseTokens(_offer.commitmentId);
        }

        nonceDeadline[msg.sender][_offer.nonce] = uint64(block.timestamp);
        emit RentalOfferCancelled(_offer.nonce);
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
            "OriumSftMarketplace: There is any active Rental"
        );

        IERC7589 _rolesRegistry = IERC7589(rolesRegistryOf(_offer.tokenAddress));
        address _borrower = rentals[_offerHash].borrower;

        for (uint256 i = 0; i < _offer.roles.length; i++) {
            _rolesRegistry.revokeRole(_offer.commitmentId, _offer.roles[i], _borrower);
        }

        rentals[_offerHash].expirationDate = uint64(block.timestamp);

        emit RentalEnded(_offer.lender, _offer.nonce);
    }

    function batchReleaseTokens(RentalOffer[] calldata _offer) external {
        for (uint256 i = 0; i < _offer.length; i++) {
            bytes32 _offerHash = LibOriumSftMarketplace.hashRentalOffer(_offer[i]);
            require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
            require(msg.sender == _offer[i].lender, "OriumSftMarketplace: Only lender can release tokens");
            require(
                rentals[_offerHash].expirationDate < block.timestamp,
                "OriumSftMarketplace: Offer has an active Rental"
            );

            IERC7589(rolesRegistryOf(_offer[i].tokenAddress)).releaseTokens(_offer[i].commitmentId);
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
            isTrustedTokenAddress[_offer.tokenAddress] && isTrustedTokenAddress[_offer.feeTokenAddress],
            "OriumSftMarketplace: tokenAddress is not trusted"
        );
        LibOriumSftMarketplace.validateOffer(_offer);
        require(
            _offer.deadline <= block.timestamp + maxDeadline && _offer.deadline > block.timestamp,
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
            marketplaceFeeOf(_tokenAddress)
        );
        RoyaltyInfo storage _royaltyInfo = tokenAddressToRoyaltyInfo[_tokenAddress];

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

    /**
     * @notice Sets the marketplace fee for a collection.
     * @dev If no fee is set, the default fee will be used.
     * @param _tokenAddress The SFT address.
     * @param _feePercentageInWei The fee percentage in wei.
     * @param _isCustomFee If the fee is custom or not.
     */
    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei,
        bool _isCustomFee
    ) external onlyOwner {
        uint256 _royaltyPercentage = tokenAddressToRoyaltyInfo[_tokenAddress].royaltyPercentageInWei;
        require(
            _royaltyPercentage + _feePercentageInWei < LibOriumSftMarketplace.MAX_PERCENTAGE,
            "OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        feeInfo[_tokenAddress] = FeeInfo({ feePercentageInWei: _feePercentageInWei, isCustomFee: _isCustomFee });

        emit MarketplaceFeeSet(_tokenAddress, _feePercentageInWei, _isCustomFee);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The SFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setRoyaltyInfo(
        address _creator,
        address _tokenAddress,
        uint256 _royaltyPercentageInWei,
        address _treasury
    ) external {
        if (msg.sender != owner()) {
            require(
                msg.sender == tokenAddressToRoyaltyInfo[_tokenAddress].creator,
                "OriumSftMarketplace: Only creator or owner can set the royalty info"
            );
            require(msg.sender == _creator, "OriumSftMarketplace: sender and creator mismatch");
        }

        require(
            _royaltyPercentageInWei + marketplaceFeeOf(_tokenAddress) < LibOriumSftMarketplace.MAX_PERCENTAGE,
            "OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        tokenAddressToRoyaltyInfo[_tokenAddress] = RoyaltyInfo({
            creator: _creator,
            royaltyPercentageInWei: _royaltyPercentageInWei,
            treasury: _treasury
        });

        emit CreatorRoyaltySet(_tokenAddress, _creator, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the maximum deadline.
     * @dev Only owner can set the maximum deadline.
     * @param _maxDeadline The maximum deadline.
     */
    function setMaxDeadline(uint256 _maxDeadline) external onlyOwner {
        require(_maxDeadline > 0, "OriumSftMarketplace: Max deadline should be greater than 0");
        maxDeadline = _maxDeadline;
    }

    /**
     * @notice Sets the roles registry for a collection.
     * @dev Only owner can set the roles registry for a collection.
     * @param _tokenAddress The SFT address.
     * @param _rolesRegistry The roles registry address.
     */
    function setRolesRegistry(address _tokenAddress, address _rolesRegistry) external onlyOwner {
        tokenAddressToRolesRegistry[_tokenAddress] = _rolesRegistry;
        emit RolesRegistrySet(_tokenAddress, _rolesRegistry);
    }

    /**
     * @notice Sets the default roles registry.
     * @dev Only owner can set the default roles registry.
     * @param _rolesRegistry The roles registry address.
     */
    function setDefaultRolesRegistry(address _rolesRegistry) external onlyOwner {
        defaultRolesRegistry = _rolesRegistry;
    }

    /**
     * @notice Sets the trusted token addresses.
     * @dev Can only be called by the owner. Used to allow collections with no custom fee set.
     * @param _tokenAddresses The SFT addresses.
     * @param _isTrusted The boolean array.
     */
    function setTrustedTokens(address[] calldata _tokenAddresses, bool[] calldata _isTrusted) external onlyOwner {
        require(_tokenAddresses.length == _isTrusted.length, "OriumSftMarketplace: Arrays should have the same length");
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            isTrustedTokenAddress[_tokenAddresses[i]] = _isTrusted[i];
        }
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the marketplace fee for a collection.
     * @dev If no custom fee is set, the default fee will be used.
     * @param _tokenAddress The SFT address.
     */
    function marketplaceFeeOf(address _tokenAddress) public view returns (uint256) {
        return
            feeInfo[_tokenAddress].isCustomFee
                ? feeInfo[_tokenAddress].feePercentageInWei
                : LibOriumSftMarketplace.DEFAULT_FEE_PERCENTAGE;
    }

    /**
     * @notice Gets the roles registry for a collection.
     * @dev If no custom roles registry is set, the default roles registry will be used.
     * @param _tokenAddress The SFT address.
     */
    function rolesRegistryOf(address _tokenAddress) public view returns (address) {
        return
            tokenAddressToRolesRegistry[_tokenAddress] == address(0)
                ? defaultRolesRegistry
                : tokenAddressToRolesRegistry[_tokenAddress];
    }
}
