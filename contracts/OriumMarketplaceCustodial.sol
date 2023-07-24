// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { RolesRegistry } from "./RolesRegistry.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract OriumMarketplaceCustodial is RolesRegistry, EIP712 {
    string public constant SIGNING_DOMAIN = "Orium-Rental-Marketplace";
    string public constant SIGNATURE_VERSION = "1";

    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");
    bytes32 public constant TOKEN_OWNER_ROLE = keccak256("TOKEN_OWNER_ROLE");
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    bytes public constant EMPTY_BYTES = "";

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

    event Deposit(address token, uint256 tokenId, address owner);
    event Withdraw(address token, uint256 tokenId, address owner);
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
     * @param duration how long the NFT is rented
     * @param start when the rent begins
     * @param end when the rent ends
     */
    event RentalStarted(
        uint256 indexed nonce,
        address indexed lender,
        address indexed tenant,
        address token,
        uint256 tokenId,
        uint64 duration,
        uint256 start,
        uint256 end
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
            super.hasRole(TOKEN_OWNER_ROLE, address(this), msg.sender, _tokenAddress, _tokenId, false),
            "Caller is not a token owner"
        );
        _;
    }

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {}

    function deposit(address _tokenAddress, uint256 _tokenId) external {
        grantRole(TOKEN_OWNER_ROLE, msg.sender, _tokenAddress, _tokenId, type(uint64).max, EMPTY_BYTES);

        emit Deposit(_tokenAddress, _tokenId, msg.sender);

        IERC721(_tokenAddress).transferFrom(msg.sender, address(this), _tokenId);
    }

    function withdraw(address _tokenAddress, uint256 _tokenId) external onlyTokenOwner(_tokenAddress, _tokenId) {
        revokeRole(TOKEN_OWNER_ROLE, msg.sender, _tokenAddress, _tokenId);

        emit Withdraw(_tokenAddress, _tokenId, msg.sender);

        IERC721(_tokenAddress).transferFrom(address(this), msg.sender, _tokenId);
    }

    function preSignRentalOffer(RentalOffer calldata offer) external onlyTokenOwner(offer.tokenAddress, offer.tokenId) {
        require(msg.sender == offer.maker, "Signer and Maker mismatch");

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
        invalidNonce[msg.sender][nonce] = true;
        emit RentalOfferCancelled(nonce, msg.sender);
    }

    function rent(RentalOffer calldata offer, SignatureType signatureType, bytes calldata signature) external {
        require(offer.expirationDate >= block.timestamp, "Offer expired");
        require(!invalidNonce[offer.maker][offer.nonce], "Nonce already used");

        address _lastGrantee = lastGrantee(offer.tokenAddress, offer.tokenId, USER_ROLE); //TODO: maybe implement a lastGrantee() view function to EIP?
        require(
            !hasRole(USER_ROLE, address(this), _lastGrantee, offer.tokenAddress, offer.tokenId, false),
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

        grantRole(USER_ROLE, msg.sender, offer.tokenAddress, offer.tokenId, offer.expirationDate, EMPTY_BYTES);

        invalidNonce[offer.maker][offer.nonce] = true;

        emit RentalStarted(
            offer.nonce,
            offer.maker,
            msg.sender,
            offer.tokenAddress,
            offer.tokenId,
            offer.expirationDate,
            block.timestamp,
            offer.expirationDate
        );
    }

    function endRental(address _tokenAddress, uint256 _tokenId) external {
        address taker = lastGrantee(_tokenAddress, _tokenId, USER_ROLE);
        address owner = lastGrantee(_tokenAddress, _tokenId, TOKEN_OWNER_ROLE);

        require(msg.sender == owner || msg.sender == taker, "Only owner or taker can end rental");

        RoleData memory data = roleAssignments[owner][taker][_tokenAddress][_tokenId][USER_ROLE];
        require(block.timestamp > data.expirationDate, "Rental hasn't ended");

        revokeRole(USER_ROLE, taker, _tokenAddress, _tokenId);

        emit RentalEnded(owner, taker, _tokenAddress, _tokenId);
    }

    function sublet(address token, uint256 tokenId, address subTenant) external {
        address owner = IERC721(token).ownerOf(tokenId);

        address taker = lastRoleAssignment[owner][token][tokenId][USER_ROLE];
        require(msg.sender == taker, "Only taker can sublet");

        RoleData memory data = roleAssignments[owner][taker][token][tokenId][USER_ROLE];

        require(block.timestamp < data.expirationDate, "Rental has ended");

        roleAssignments[msg.sender][subTenant][token][tokenId][USER_ROLE] = RoleData(data.expirationDate, data.data);
        lastRoleAssignment[msg.sender][token][tokenId][USER_ROLE] = subTenant;
    }

    function endSublet(address token, uint256 tokenId) external {
        address owner = IERC721(token).ownerOf(tokenId);
        address subTenant = lastRoleAssignment[owner][token][tokenId][USER_ROLE];
        require(msg.sender == subTenant, "Only subtenant can end sublet");

        RoleData memory data = roleAssignments[msg.sender][subTenant][token][tokenId][USER_ROLE];

        require(block.timestamp < data.expirationDate, "Rental has ended");

        delete lastRoleAssignment[msg.sender][token][tokenId][USER_ROLE];
        delete roleAssignments[msg.sender][subTenant][token][tokenId][USER_ROLE];
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

    function lastGrantee(address _tokenAddress, uint256 _tokenId, bytes32 _role) public view returns (address) {
        return lastRoleAssignment[address(this)][_tokenAddress][_tokenId][_role];
    }
}
