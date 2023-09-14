// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract OriumRentalProtocol is Initializable, AccessControlUpgradeable, EIP712Upgradeable, PausableUpgradeable {
    string public constant SIGNING_DOMAIN = "Orium-Rental-Marketplace";
    string public constant SIGNATURE_VERSION = "1";
    bytes public constant EMPTY_BYTES = "";
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_PERCENTAGE = 100 ether; // 100%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether; // 2.5%

    address public rolesRegistry;
    uint256 public maxDeadline;

    /// @dev nonce => isPresigned
    mapping(bytes32 => bool) public preSignedOffer;

    /// @dev maker => nonce => bool
    mapping(address => mapping(uint256 => bool)) public invalidNonce;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => uint256) public feesPerCollection;

    /// @dev tokenAddress => collectionFeeInfo
    mapping(address => CollectionFeeInfo) public collectionFeeInfo;

    struct RentalOffer {
        address maker;
        address taker;
        address tokenAddress;
        uint256 tokenId;
        address feeToken;
        uint256 feeAmount;
        uint256 nonce;
        uint64 expirationDate;
    }

    struct CollectionFeeInfo {
        address creator;
        uint256 feePercentageInWei;
        address treasury;
    }

    enum SignatureType {
        PRE_SIGNED,
        EIP_712,
        EIP_1271
    }

    /**
     * @param nonce nonce of the rental offer
     * @param maker address of the user renting his NFTs
     * @param taker address of the allowed tenant if private rental or `0x0` if public rental
     * @param tokenAddress address of the contract of the NFT to rent
     * @param tokenId tokenId of the NFT to rent
     * @param feeToken address of the ERC20 token for rental fees
     * @param feeAmount amount of the upfront rental cost
     * @param deadline until when the rental offer is valid
     */
    event RentalOfferCreated(
        uint256 indexed nonce,
        address indexed maker,
        address taker,
        address tokenAddress,
        uint256 tokenId,
        address feeToken,
        uint256 feeAmount,
        uint256 deadline
    );

    /**
     * @param nonce nonce of the rental offer
     * @param maker address of the user renting his NFTs
     */
    event RentalOfferCancelled(uint256 indexed nonce, address indexed maker);

    /**
     * @param nonce nonce of the rental offer
     * @param lender address of the lender
     * @param tenant address of the tenant
     * @param token address of the contract of the NFT rented
     * @param tokenId tokenId of the rented NFT
     * @param expirationDate when the rent ends
     */
    event RentalStarted(
        uint256 indexed nonce,
        address indexed lender,
        address indexed tenant,
        address token,
        uint256 tokenId,
        uint256 expirationDate
    );

    /**
     * @param lender address of the lender
     * @param tenant address of the tenant
     * @param token address of the contract of the NFT rented
     * @param tokenId tokenId of the rented NFT
     */
    event RentalEnded(address indexed lender, address indexed tenant, address token, uint256 tokenId);

    modifier onlyTokenOwner(address _tokenAddress, uint256 _tokenId) {
        require(
            msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId),
            "OriumRentalProtocol: Caller does not have the required permission"
        );
        _;
    }

    function initialize(address _owner, address _rolesRegistry, uint256 _maxDeadline) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);

        __AccessControl_init();
        __Pausable_init();

        rolesRegistry = _rolesRegistry;
        maxDeadline = _maxDeadline;

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(PAUSER_ROLE, _owner);
    }

    function preSignRentalOffer(RentalOffer calldata offer) external onlyTokenOwner(offer.tokenAddress, offer.tokenId) {
        require(msg.sender == offer.maker, "Signer and Maker mismatch");
        require(
            msg.sender == IERC721(offer.tokenAddress).ownerOf(offer.tokenId),
            "OriumRentalProtocol: Sender is not the owner of the NFT"
        );
        require(maxDeadline >= offer.expirationDate, "OriumRentalProtocol: Expiration date is too far in the future");

        preSignedOffer[hashRentalOffer(offer)] = true;

        emit RentalOfferCreated(
            offer.nonce,
            offer.maker,
            offer.taker,
            offer.tokenAddress,
            offer.tokenId,
            offer.feeToken,
            offer.feeAmount,
            offer.expirationDate
        );
    }

    function cancelRentalOffer(uint256 nonce) external {
        require(!invalidNonce[msg.sender][nonce], "OriumRentalProtocol: Nonce already used"); // Avoid multiple cancellations
        invalidNonce[msg.sender][nonce] = true;
        emit RentalOfferCancelled(nonce, msg.sender);
    }

    function rent(
        RentalOffer calldata offer,
        SignatureType signatureType,
        bytes calldata signature
    ) external whenNotPaused {
        require(offer.expirationDate >= block.timestamp, "OriumRentalProtocol: Offer expired");
        require(!invalidNonce[offer.maker][offer.nonce], "OriumRentalProtocol: Nonce already used");
        require(
            msg.sender == offer.taker || offer.taker == address(0),
            "OriumRentalProtocol: Caller is not allowed to rent this NFT"
        );

        if (signatureType == SignatureType.PRE_SIGNED) {
            require(preSignedOffer[hashRentalOffer(offer)] == true, "OriumRentalProtocol: Presigned offer not found");
        } else if (signatureType == SignatureType.EIP_712) {
            bytes32 _hash = hashRentalOffer(offer);
            address signer = ECDSAUpgradeable.recover(_hash, signature);
            require(signer == offer.maker, "OriumRentalProtocol: Signer is not maker");
        } else {
            revert("OriumRentalProtocol: Unsupported signature type");
        }

        if (offer.feeAmount > 0) {
            _chargeFee(offer);
        }

        address _taker = offer.taker == address(0) ? msg.sender : offer.taker;

        IRolesRegistry(rolesRegistry).grantRoleFrom(
            USER_ROLE,
            offer.tokenAddress,
            offer.tokenId,
            offer.maker,
            _taker,
            offer.expirationDate,
            EMPTY_BYTES
        );

        invalidNonce[offer.maker][offer.nonce] = true;

        emit RentalStarted(offer.nonce, offer.maker, _taker, offer.tokenAddress, offer.tokenId, offer.expirationDate);
    }

    function _chargeFee(RentalOffer memory offer) internal {
        // Charge the marketplace fee
        uint256 _marketplaceFeePercentage = feesPerCollection[offer.tokenAddress] == 0
            ? DEFAULT_FEE_PERCENTAGE
            : feesPerCollection[offer.tokenAddress];
        uint256 _marketplaceFee = _valueFromPercentage(_marketplaceFeePercentage, offer.feeAmount);
        require(
            IERC20(offer.feeToken).transferFrom(msg.sender, address(this), _marketplaceFee),
            "OriumRentalProtocol: Marketplace Fee transfer failed"
        );

        // Charge the fee to the maker
        uint256 _makerFee = offer.feeAmount - _marketplaceFee;
        require(
            IERC20(offer.feeToken).transferFrom(msg.sender, offer.maker, _makerFee),
            "OriumRentalProtocol: Maker Fee transfer failed"
        );

        // Charge the fee to the creator
        address _creator = collectionFeeInfo[offer.tokenAddress].creator;
        if (_creator == address(0)) return;

        uint256 _creatorFeePercentage = collectionFeeInfo[offer.tokenAddress].feePercentageInWei;
        if (_creatorFeePercentage == 0) return;

        uint256 _creatorFee = _valueFromPercentage(_creatorFeePercentage, offer.feeAmount);
        require(
            IERC20(offer.feeToken).transferFrom(msg.sender, _creator, _creatorFee),
            "OriumRentalProtocol: Creator Fee transfer failed"
        );
    }

    function _valueFromPercentage(uint256 _percentage, uint256 _amount) internal pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
    }

    function endRental(address _tokenAddress, uint256 _tokenId) external {
        address _owner = IERC721(_tokenAddress).ownerOf(_tokenId);
        address _taker = IRolesRegistry(rolesRegistry).lastGrantee(USER_ROLE, _owner, _tokenAddress, _tokenId);
        require(
            IRolesRegistry(rolesRegistry).hasUniqueRole(USER_ROLE, _tokenAddress, _tokenId, _owner, _taker),
            "OriumRentalProtocol: Invalid role"
        );

        require(msg.sender == _taker, "OriumRentalProtocol: Only taker can end rental");
        require(_taker != address(0), "OriumRentalProtocol: NFT is not rented");

        if (msg.sender == _owner) {
            uint64 _expirationDate = IRolesRegistry(rolesRegistry).roleExpirationDate(
                USER_ROLE,
                _tokenAddress,
                _tokenId,
                _owner,
                _taker
            );
            require(block.timestamp > _expirationDate, "OriumRentalProtocol: Rental hasn't ended yet");
        }

        IRolesRegistry(rolesRegistry).revokeRoleFrom(USER_ROLE, _tokenAddress, _tokenId, _owner, _taker);

        emit RentalEnded(_owner, _taker, _tokenAddress, _tokenId);
    }

    function hashRentalOffer(RentalOffer memory offer) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "RentalOffer(address maker,address taker,address tokenAddress,uint256 tokenId,address feeToken,uint256 feeAmount,uint256 nonce,uint64 expirationDate)"
                        ),
                        offer.maker,
                        offer.taker,
                        offer.tokenAddress,
                        offer.tokenId,
                        offer.feeToken,
                        offer.feeAmount,
                        offer.nonce,
                        offer.expirationDate
                    )
                )
            );
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setRolesRegistry(address _rolesRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //TODO: we keep this function?
        rolesRegistry = _rolesRegistry;
    }

    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _feePercentageInWei <= MAX_PERCENTAGE,
            "OriumRentalProtocol: Fee percentage cannot be greater than 100%"
        );
        feesPerCollection[_tokenAddress] = _feePercentageInWei;
    }

    function setCollectionFeeInfo(address _tokenAddress, uint256 _feePercentageInWei, address _treasury) external {
        require(
            msg.sender == collectionFeeInfo[_tokenAddress].creator || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "OriumRentalProtocol: Only creator or operator can set collection fee"
        );
        require(
            _feePercentageInWei <= MAX_PERCENTAGE,
            "OriumRentalProtocol: Fee percentage cannot be greater than 100%"
        );

        collectionFeeInfo[_tokenAddress] = CollectionFeeInfo({
            creator: collectionFeeInfo[_tokenAddress].creator,
            feePercentageInWei: _feePercentageInWei,
            treasury: _treasury
        });
    }
}
