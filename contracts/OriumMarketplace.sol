// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { RolesRegistry } from "./RolesRegistry.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract OriumMarketplace is RolesRegistry, EIP712 {
    string public constant SIGNING_DOMAIN = "Orium-Rental-Marketplace";
    string public constant SIGNATURE_VERSION = "1";

    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    /// @dev nonce => isPresigned
    mapping(bytes32 => bool) public preSignedOffer;

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

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {}

    function preSignRentalOffer(RentalOffer calldata offer) external {
        require(offer.maker == msg.sender, "Signer and Maker mismatch");

        preSignedOffer[hashRentalOffer(offer)] = true;
    }

    function rent(RentalOffer calldata offer, SignatureType signatureType, bytes calldata signature) external {
        if (signatureType == SignatureType.PRE_SIGNED) {
            require(preSignedOffer[hashRentalOffer(offer)] == true, "Presigned offer not found");
        } else if (signatureType == SignatureType.EIP_712) {
            bytes32 _hash = hashRentalOffer(offer);
            address signer = ECDSAUpgradeable.recover(_hash, signature);
            require(signer == offer.maker, "Signer is not maker");
        } else {
            revert("Unsupported signature type");
        }

        require(offer.expirationDate >= block.timestamp, "Offer expired");

        roleAssignments[offer.maker][offer.taker][offer.tokenAddress][offer.tokenId][USER_ROLE] = RoleData(
            offer.expirationDate,
            signature
        );
        lastRoleAssignment[offer.maker][offer.tokenAddress][offer.tokenId][USER_ROLE] = offer.taker;

        lastRoleAssignment[offer.maker][offer.tokenAddress][offer.tokenId][MARKETPLACE_ROLE] = address(this);

        // Call some function to mark NFT as rented until expiration date
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

    function endRental(address token, uint256 tokenId) external {
        address owner = IERC721(token).ownerOf(tokenId);
        address taker = lastRoleAssignment[owner][token][tokenId][USER_ROLE];
        require(msg.sender == owner || msg.sender == taker, "Only owner or taker can end rental");

        RoleData memory data = roleAssignments[owner][taker][token][tokenId][USER_ROLE];

        require(block.timestamp > data.expirationDate, "Rental hasn't ended");

        // Call some function to mark NFT as available again

        delete lastRoleAssignment[owner][token][tokenId][USER_ROLE];
        delete roleAssignments[owner][taker][token][tokenId][USER_ROLE];
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
}
