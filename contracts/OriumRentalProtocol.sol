// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract OriumRentalProtocol is Initializable, OwnableUpgradeable, EIP712Upgradeable {
    string public constant SIGNING_DOMAIN = "Orium-Rental-Marketplace";
    string public constant SIGNATURE_VERSION = "1";
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");
    bytes public constant EMPTY_BYTES = "";

    address public rolesRegistry;

    /// @dev nonce => isPresigned
    mapping(bytes32 => bool) public preSignedOffer;

    /// @dev maker => nonce => bool
    mapping(address => mapping(uint256 => bool)) public invalidNonce;

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

    function initialize(address _owner, address _rolesRegistry) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        __Ownable_init();
        transferOwnership(_owner);

        rolesRegistry = _rolesRegistry;
    }

    function preSignRentalOffer(RentalOffer calldata offer) external onlyTokenOwner(offer.tokenAddress, offer.tokenId) {
        require(msg.sender == offer.maker, "Signer and Maker mismatch");
        require(msg.sender == IERC721(offer.tokenAddress).ownerOf(offer.tokenId), "OriumRentalProtocol: Sender is not the owner of the NFT");

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

    function rent(RentalOffer calldata offer, SignatureType signatureType, bytes calldata signature) external {
        require(offer.expirationDate >= block.timestamp, "OriumRentalProtocol: Offer expired");
        require(!invalidNonce[offer.maker][offer.nonce], "OriumRentalProtocol: Nonce already used");
        require(
            msg.sender == offer.taker || offer.taker == address(0),
            "OriumRentalProtocol: Caller is not allowed to rent this NFT"
        );

        address _lastGrantee = IRolesRegistry(rolesRegistry).lastGrantee(
            USER_ROLE,
            offer.maker,
            offer.tokenAddress,
            offer.tokenId
        );
        
        require(
            !IRolesRegistry(rolesRegistry).hasUniqueRole(
                USER_ROLE,
                offer.tokenAddress,
                offer.tokenId,
                offer.maker,
                _lastGrantee
            ),
            "Nft is already rented"
        );

        if (signatureType == SignatureType.PRE_SIGNED) {
            require(preSignedOffer[hashRentalOffer(offer)] == true, "Presigned offer not found");
        } else if (signatureType == SignatureType.EIP_712) {
            bytes32 _hash = hashRentalOffer(offer);
            address signer = ECDSAUpgradeable.recover(_hash, signature);
            require(signer == offer.maker, "Signer is not maker");
        } else {
            revert("Unsupported signature type");
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

    function endRental(address _tokenAddress, uint256 _tokenId) external {
        address _owner = IERC721(_tokenAddress).ownerOf(_tokenId);
        address _taker = IRolesRegistry(rolesRegistry).lastGrantee(
            USER_ROLE,
            _owner,
            _tokenAddress,
            _tokenId
        );

        require(msg.sender == _taker, "Only owner or taker can end rental");
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

    function setRolesRegistry(address _rolesRegistry) external onlyOwner {
        //TODO: we keep this function? 
        rolesRegistry = _rolesRegistry;
    }
}
