// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC7589 } from "./interfaces/IERC7589.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Orium Marketplace - Marketplace for renting SFTs
 * @dev This contract is used to manage SFTs rentals, powered by ERC-7589 Semi-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumSftMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable {
    /** ######### Constants ########### **/

    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;
    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;

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

    /// @dev Rental offer info.
    struct RentalOffer {
        address lender;
        address borrower;
        address tokenAddress;
        uint256 tokenId;
        uint256 tokenAmount;
        address feeTokenAddress;
        uint256 feeAmountPerSecond;
        uint256 nonce;
        uint256 commitmentId;
        uint64 deadline;
        bytes32[] roles;
        bytes[] rolesData;
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

    /** ######### Modifiers ########### **/

    /**
     * @notice Checks if the token address is trusted.
     * @dev Throws if the token address is not trusted.
     * @param _tokenAddress The token address.
     */
    modifier onlyTrustedToken(address _tokenAddress) {
        require(isTrustedTokenAddress[_tokenAddress], "OriumSftMarketplace: tokenAddress is not trusted");
        _;
    }

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
    function createRentalOffer(
        RentalOffer calldata _offer
    ) external onlyTrustedToken(_offer.feeTokenAddress) onlyTrustedToken(_offer.tokenAddress) whenNotPaused {
        address _rolesRegistryAddress = rolesRegistryOf(_offer.tokenAddress);
        _validateCreateRentalOffer(_offer, _rolesRegistryAddress);
        _createRentalOffer(_offer, _rolesRegistryAddress);
    }

    /**
     * @notice Accepts a rental offer.
     * @dev The borrower can be address(0) to allow anyone to rent the SFT.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     * @param _duration The duration of the rental.
     */
    function acceptRentalOffer(RentalOffer calldata _offer, uint64 _duration) external {
        uint64 _expirationDate = uint64(block.timestamp + _duration);

        _validateAcceptRentalOffer(_offer, _expirationDate);

        _transferFees(_offer.tokenAddress, _offer.feeTokenAddress, _offer.feeAmountPerSecond, _duration, _offer.lender);

        _createRental(_offer, _expirationDate);
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the rental offer hash.
     * @param _offer The rental offer struct to be hashed.
     */
    function hashRentalOffer(RentalOffer memory _offer) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _offer.lender,
                    _offer.borrower,
                    _offer.tokenAddress,
                    _offer.tokenId,
                    _offer.tokenAmount,
                    _offer.feeTokenAddress,
                    _offer.feeAmountPerSecond,
                    _offer.nonce,
                    _offer.commitmentId,
                    _offer.deadline,
                    _offer.roles,
                    _offer.rolesData
                )
            );
    }

    /** ######### Internals ########### **/
    /**
     * @dev Validates the create rental offer.
     * @param _offer The rental offer struct.
     */
    function _validateCreateRentalOffer(RentalOffer calldata _offer, address _rolesRegistryAddress) internal view {
        require(_offer.tokenAmount > 0, "OriumSftMarketplace: tokenAmount should be greater than 0");
        require(_offer.nonce != 0, "OriumSftMarketplace: Nonce cannot be 0");
        require(msg.sender == _offer.lender, "OriumSftMarketplace: Sender and Lender mismatch");
        require(_offer.roles.length > 0, "OriumSftMarketplace: roles should not be empty");
        require(
            _offer.roles.length == _offer.rolesData.length,
            "OriumSftMarketplace: roles and rolesData should have the same length"
        );
        require(
            _offer.deadline <= block.timestamp + maxDeadline && _offer.deadline > block.timestamp,
            "OriumSftMarketplace: Invalid deadline"
        );
        require(nonceDeadline[_offer.lender][_offer.nonce] == 0, "OriumSftMarketplace: nonce already used");
        require(
            _offer.borrower != address(0) || _offer.feeAmountPerSecond > 0,
            "OriumSftMarketplace: feeAmountPerSecond should be greater than 0"
        );

        if (_offer.commitmentId != 0) {
            _validateCommitmentId(
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

    function _validateCommitmentId(
        uint256 _commitmentId,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        address _lender,
        address _rolesRegistryAddress
    ) internal view {
        IERC7589 _rolesRegistry = IERC7589(_rolesRegistryAddress);
        require(
            _rolesRegistry.tokenAmountOf(_commitmentId) == _tokenAmount,
            "OriumSftMarketplace: commitmentId token amount does not match offer's token amount"
        );

        uint256 _nonce = commitmentIdToNonce[_rolesRegistryAddress][_commitmentId];

        if (_nonce != 0) {
            require(
                nonceDeadline[_lender][_nonce] < block.timestamp,
                "OriumSftMarketplace: commitmentId is in an active rental offer"
            );
        }

        require(
            _rolesRegistry.grantorOf(_commitmentId) == _lender,
            "OriumSftMarketplace: commitmentId grantor does not match offer's lender"
        );
        require(
            _rolesRegistry.tokenAddressOf(_commitmentId) == _tokenAddress,
            "OriumSftMarketplace: commitmentId tokenAddress does not match offer's tokenAddress"
        );
        require(
            _rolesRegistry.tokenIdOf(_commitmentId) == _tokenId,
            "OriumSftMarketplace: commitmentId tokenId does not match offer's tokenId"
        );
    }

    /**
     * @dev creates a rental offer.
     * @param _offer The rental offer struct.
     */

    function _createRentalOffer(RentalOffer memory _offer, address _rolesRegistryAddress) internal {
        if (_offer.commitmentId == 0) {
            _offer.commitmentId = IERC7589(_rolesRegistryAddress).commitTokens(
                _offer.lender,
                _offer.tokenAddress,
                _offer.tokenId,
                _offer.tokenAmount
            );
        }

        nonceDeadline[msg.sender][_offer.nonce] = _offer.deadline;
        isCreated[hashRentalOffer(_offer)] = true;
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
     * @dev Validates the accept rental offer.
     * @param _offer The rental offer struct. It should be the same as the one used to create the offer.
     * @param _expirationDate The expiration date of the rental.
     */
    function _validateAcceptRentalOffer(RentalOffer calldata _offer, uint64 _expirationDate) internal view {
        bytes32 _offerHash = hashRentalOffer(_offer);
        require(rentals[_offerHash].expirationDate <= block.timestamp, "OriumSftMarketplace: Rental already started");
        require(isCreated[_offerHash], "OriumSftMarketplace: Offer not created");
        require(
            address(0) == _offer.borrower || msg.sender == _offer.borrower,
            "OriumSftMarketplace: Sender is not allowed to rent this SFT"
        );
        require(
            nonceDeadline[_offer.lender][_offer.nonce] > _expirationDate,
            "OriumSftMarketplace: expiration date is greater than offer deadline"
        );
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

        uint256 _marketplaceFeeAmount = _getAmountFromPercentage(_feeAmount, marketplaceFeeOf(_tokenAddress));
        if (_marketplaceFeeAmount > 0) {
            require(
                IERC20(_feeTokenAddress).transferFrom(msg.sender, owner(), _marketplaceFeeAmount),
                "OriumSftMarketplace: Transfer failed"
            );
        }

        uint256 _royaltyAmount = _getAmountFromPercentage(
            _feeAmount,
            tokenAddressToRoyaltyInfo[_tokenAddress].royaltyPercentageInWei
        );
        if (_royaltyAmount > 0) {
            require(
                IERC20(_feeTokenAddress).transferFrom(msg.sender, tokenAddressToRoyaltyInfo[_tokenAddress].treasury, _royaltyAmount),
                "OriumSftMarketplace: Transfer failed"
            );
        }

        uint256 _lenderAmount = _feeAmount - _royaltyAmount - _marketplaceFeeAmount;
        require(
            IERC20(_feeTokenAddress).transferFrom(msg.sender, _lenderAddress, _lenderAmount),
            "OriumSftMarketplace: Transfer failed"
        );
    }

    /**
     * @dev All values needs to be in wei.
     * @param _amount The amount to calculate the percentage from.
     * @param _percentage The percentage to calculate.
     */
    function _getAmountFromPercentage(uint256 _amount, uint256 _percentage) internal pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
    }

    /**
     * @dev Grants the roles to the borrower.
     * @param _commitmentId The commitment identifier.
     * @param _roles The array of roles to be assigned to the borrower
     * @param _grantee The address of the user renting the SFT
     * @param _expirationDate The deadline until when the rental offer is valid
     * @param _revocable Whether the role is revocable or not
     * @param _rolesData The array of data for each role
     * @param _tokenAddress The address of the contract of the SFT to rent
     */
    function _batchGrantRole(
        uint256 _commitmentId,
        bytes32[] memory _roles,
        address _grantee,
        uint64 _expirationDate,
        bool _revocable,
        bytes[] memory _rolesData,
        address _tokenAddress
    ) internal {
        IERC7589 _rolesRegistry = IERC7589(rolesRegistryOf(_tokenAddress));
        for (uint256 i = 0; i < _roles.length; i++) {
           _rolesRegistry.grantRole(_commitmentId, _roles[i], _grantee, _expirationDate, _revocable, _rolesData[i]);
        }
    }

    /**
     * @notice Starts the rental.
     * @param _offer The rental offer struct.
     * @param _expirationDate The period of time the SFT will be rented.
     */
    function _createRental(RentalOffer calldata _offer, uint64 _expirationDate) internal {
         _batchGrantRole(
            _offer.commitmentId,
            _offer.roles,
            msg.sender,
            _expirationDate,
            false,
            _offer.rolesData,
            _offer.tokenAddress
        );

        rentals[hashRentalOffer(_offer)] = Rental({ borrower: msg.sender, expirationDate: _expirationDate });

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
            _royaltyPercentage + _feePercentageInWei < MAX_PERCENTAGE,
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

        _setRoyalty(_creator, _tokenAddress, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The SFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function _setRoyalty(
        address _creator,
        address _tokenAddress,
        uint256 _royaltyPercentageInWei,
        address _treasury
    ) internal {
        require(
            _royaltyPercentageInWei + marketplaceFeeOf(_tokenAddress) < MAX_PERCENTAGE,
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
        return feeInfo[_tokenAddress].isCustomFee ? feeInfo[_tokenAddress].feePercentageInWei : DEFAULT_FEE_PERCENTAGE;
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
