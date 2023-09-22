// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import { ERC165Checker } from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
/**
 * @title Orium Marketplace - Marketplace for renting NFTs
 * @dev This contract is used to manage NFTs rentals, powered by ERC-7432 Non-Fungible Token Roles
 * @author Orium Network Team - developers@orium.network
 */
contract OriumMarketplace is Initializable, OwnableUpgradeable, PausableUpgradeable, EIP712Upgradeable {
    /** ######### Constants ########### **/

    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;
    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;

    /** ######### Global Variables ########### **/

    /// @dev rolesRegistry is a ERC-7432 contract
    address public rolesRegistry;
    /// @dev deadline is set in seconds
    uint256 public maxDeadline;

    /// @dev tokenAddress => feePercentageInWei
    mapping(address => FeeInfo) public feeInfo;

    /// @dev tokenAddress => royaltyInfo
    mapping(address => RoyaltyInfo) public royaltyInfo;

    /// @dev nonce => hashedOffer => isPresigned
    mapping(uint256 => mapping(bytes32 => bool)) public preSignedOffer;

    /// @dev lender => nonce => bool
    mapping(address => mapping(uint256 => uint256)) public nonceDeadline;

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
        address feeTokenAddress;
        uint256 feeAmountPerSecond;
        uint256 nonce;
        uint64 deadline;
        bytes32[] roles;
        bytes[] rolesData;
    }

    /** ######### Events ########### **/

    /**
     * @param tokenAddress The NFT address.
     * @param feePercentageInWei The fee percentage in wei.
     * @param isCustomFee If the fee is custom or not. Used to allow collections with no fee.
     */
    event MarketplaceFeeSet(address indexed tokenAddress, uint256 feePercentageInWei, bool isCustomFee);
    /**
     * @param tokenAddress The NFT address.
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
     * @param nonce The nonce of the rental offer
     * @param lender The address of the user lending the NFT
     * @param borrower The address of the user renting the NFT
     * @param tokenAddress The address of the contract of the NFT to rent
     * @param tokenId The tokenId of the NFT to rent
     * @param feeTokenAddress The address of the ERC20 token for rental fees
     * @param feeAmountPerSecond The amount of fee per second
     * @param deadline The deadline until when the rental offer is valid
     * @param roles The array of roles to be assigned to the borrower
     * @param rolesData The array of data for each role
     */
    event RentalOfferCreated(
        uint256 indexed nonce,
        address indexed lender,
        address borrower,
        address tokenAddress,
        uint256 tokenId,
        address feeTokenAddress,
        uint256 feeAmountPerSecond,
        uint256 deadline,
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
        if (isERC1155(_tokenAddress)) {
            require(
                IERC1155(_tokenAddress).balanceOf(msg.sender, _tokenId) > 0,
                "OriumMarketplace: only token owner can call this function"
            );
        } else if(isERC721(_tokenAddress)) {
            require(
                msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId),
                "OriumMarketplace: only token owner can call this function"
            );
        } else {
            revert("OriumMarketplace: token address is not ERC1155 or ERC721");
        }
        _;
    }

    /** ######### Initializer ########### **/
    /**
     * @notice Initializes the contract.
     * @dev The owner of the contract will be the owner of the protocol.
     * @param _owner the owner of the protocol.
     * @param _rolesRegistry the address of the roles registry.
     * @param _maxDeadline the maximum deadline.
     */
    function initialize(address _owner, address _rolesRegistry, uint256 _maxDeadline) public initializer {
        __Pausable_init();
        __Ownable_init();

        rolesRegistry = _rolesRegistry;
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
    ) external onlyTokenOwner(_offer.tokenAddress, _offer.tokenId) {
        require(msg.sender == _offer.lender, "OriumMarketplace: Sender and Lender mismatch");
        require(
            _offer.roles.length == _offer.rolesData.length,
            "OriumMarketplace: roles and rolesData should have the same length"
        );
        require(
            _offer.deadline <= block.timestamp + maxDeadline && _offer.deadline > block.timestamp,
            "OriumMarketplace: Invalid deadline"
        );
        require(nonceDeadline[_offer.lender][_offer.nonce] == 0, "OriumMarketplace: Nonce already used");

        nonceDeadline[_offer.lender][_offer.nonce] = _offer.deadline;
        preSignedOffer[_offer.nonce][hashRentalOffer(_offer)] = true;

        emit RentalOfferCreated(
            _offer.nonce,
            _offer.lender,
            _offer.borrower,
            _offer.tokenAddress,
            _offer.tokenId,
            _offer.feeTokenAddress,
            _offer.feeAmountPerSecond,
            _offer.deadline,
            _offer.roles,
            _offer.rolesData
        );
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the rental offer hash.
     * @param _offer The rental offer struct to be hashed.
     */
    function hashRentalOffer(RentalOffer memory _offer) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "RentalOffer(address lender,address borrower,address tokenAddress,uint256 tokenId,address feeTokenAddress,uint256 feeAmountPerSecond,uint256 nonce,uint64 deadline,bytes32[] roles,bytes[] rolesData)"
                        ),
                        _offer.lender,
                        _offer.borrower,
                        _offer.tokenAddress,
                        _offer.tokenId,
                        _offer.feeTokenAddress,
                        _offer.feeAmountPerSecond,
                        _offer.nonce,
                        _offer.deadline,
                        _offer.roles,
                        _offer.rolesData
                    )
                )
            );
    }

    function isERC1155(address _tokenAddress) public view returns (bool) {
        return ERC165Checker.supportsInterface(_tokenAddress, type(IERC1155).interfaceId);
    }

    function isERC721(address _tokenAddress) public view returns (bool) {
        return ERC165Checker.supportsInterface(_tokenAddress, type(IERC721).interfaceId);
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

    /**
     * @notice Sets the marketplace fee for a collection.
     * @dev If no fee is set, the default fee will be used.
     * @param _tokenAddress The NFT address.
     * @param _feePercentageInWei The fee percentage in wei.
     * @param _isCustomFee If the fee is custom or not.
     */
    function setMarketplaceFeeForCollection(
        address _tokenAddress,
        uint256 _feePercentageInWei,
        bool _isCustomFee
    ) external onlyOwner {
        uint256 _royaltyPercentage = royaltyInfo[_tokenAddress].royaltyPercentageInWei;
        require(
            _royaltyPercentage + _feePercentageInWei < MAX_PERCENTAGE,
            "OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        feeInfo[_tokenAddress] = FeeInfo({ feePercentageInWei: _feePercentageInWei, isCustomFee: _isCustomFee });

        emit MarketplaceFeeSet(_tokenAddress, _feePercentageInWei, _isCustomFee);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _tokenAddress The NFT address.
     * @param _creator The address of the creator.
     */
    function setCreator(address _tokenAddress, address _creator) external onlyOwner {
        _setRoyalty(_creator, _tokenAddress, 0, address(0));
    }

    /**
     * @notice Sets the royalty info.
     * @param _tokenAddress The NFT address.
     * @param _royaltyPercentageInWei The royalty percentage in wei.
     * @param _treasury The address where the fees will be sent. If the treasury is address(0), the fees will be burned.
     */
    function setRoyaltyInfo(address _tokenAddress, uint256 _royaltyPercentageInWei, address _treasury) external {
        require(
            msg.sender == royaltyInfo[_tokenAddress].creator,
            "OriumMarketplace: Only creator can set royalty info"
        );

        _setRoyalty(msg.sender, _tokenAddress, _royaltyPercentageInWei, _treasury);
    }

    /**
     * @notice Sets the royalty info.
     * @dev Only owner can associate a collection with a creator.
     * @param _creator The address of the creator.
     * @param _tokenAddress The NFT address.
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
            "OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%"
        );

        royaltyInfo[_tokenAddress] = RoyaltyInfo({
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
        require(_maxDeadline > 0, "OriumMarketplace: Max deadline should be greater than 0");
        maxDeadline = _maxDeadline;
    }

    /** ######### Getters ########### **/

    /**
     * @notice Gets the marketplace fee for a collection.
     * @dev If no custom fee is set, the default fee will be used.
     * @param _tokenAddress The NFT address.
     */
    function marketplaceFeeOf(address _tokenAddress) public view returns (uint256) {
        return feeInfo[_tokenAddress].isCustomFee ? feeInfo[_tokenAddress].feePercentageInWei : DEFAULT_FEE_PERCENTAGE;
    }
}
