// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7589 } from "../interfaces/IERC7589.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

library LibOriumSftMarketplace {
    /// @dev 100 ether is 100%
    uint256 public constant MAX_PERCENTAGE = 100 ether;

    /// @dev 2.5 ether is 2.5%
    uint256 public constant DEFAULT_FEE_PERCENTAGE = 2.5 ether;

    /**
     * @notice Gets the rental offer hash.
     * @param _offer The rental offer struct to be hashed.
     */
    function hashRentalOffer(RentalOffer memory _offer) external pure returns (bytes32) {
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

    /**
     * @dev All values needs to be in wei.
     * @param _amount The amount to calculate the percentage from.
     * @param _percentage The percentage to calculate.
     */
    function getAmountFromPercentage(uint256 _amount, uint256 _percentage) external pure returns (uint256) {
        return (_amount * _percentage) / MAX_PERCENTAGE;
    }

    /**
     * @notice Validates the commitmentId.
     * @param _commitmentId The commitmentId to validate.
     * @param _tokenAddress The token address.
     * @param _tokenId The token id.
     * @param _tokenAmount The token amount.
     * @param _lender The lender address.
     * @param _rolesRegistryAddress The roles registry address.
     */
    function validateCommitmentId(
        uint256 _commitmentId,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _tokenAmount,
        address _lender,
        address _rolesRegistryAddress
    ) external view {
        IERC7589 _rolesRegistry = IERC7589(_rolesRegistryAddress);
        require(
            _rolesRegistry.tokenAmountOf(_commitmentId) == _tokenAmount,
            "OriumSftMarketplace: commitmentId token amount does not match offer's token amount"
        );

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
     * @notice Validates the rental offer.
     * @param _offer The rental offer struct to be validated.
     */
    function validateOffer(RentalOffer memory _offer) external view {
        require(_offer.tokenAmount > 0, "OriumSftMarketplace: tokenAmount should be greater than 0");
        require(_offer.nonce != 0, "OriumSftMarketplace: Nonce cannot be 0");
        require(msg.sender == _offer.lender, "OriumSftMarketplace: Sender and Lender mismatch");
        require(_offer.roles.length > 0, "OriumSftMarketplace: roles should not be empty");
        require(
            _offer.roles.length == _offer.rolesData.length,
            "OriumSftMarketplace: roles and rolesData should have the same length"
        );
        require(
            _offer.borrower != address(0) || _offer.feeAmountPerSecond > 0,
            "OriumSftMarketplace: feeAmountPerSecond should be greater than 0"
        );
    }

    /**
     * @notice Transfers the fees.
     * @dev The fee token address should be approved before calling this function.
     * @param _feeTokenAddress The fee token address.
     * @param _marketplaceFeeAmount The marketplace fee amount.
     * @param _royaltyAmount The royalty amount.
     * @param _lenderAmount The lender amount.
     * @param _marketplaceTreasuryAddress The marketplace treasury address.
     * @param _royaltyTreasuryAddress The royalty treasury address.
     * @param _lenderAddress The lender address.
     */
    function transferFees(
        address _feeTokenAddress,
        uint256 _marketplaceFeeAmount,
        uint256 _royaltyAmount,
        uint256 _lenderAmount,
        address _marketplaceTreasuryAddress,
        address _royaltyTreasuryAddress,
        address _lenderAddress
    ) external {
        if (_marketplaceFeeAmount > 0) {
            require(
                IERC20(_feeTokenAddress).transferFrom(msg.sender, _marketplaceTreasuryAddress, _marketplaceFeeAmount),
                "OriumSftMarketplace: Transfer failed"
            );
        }

        if (_royaltyAmount > 0) {
            require(
                IERC20(_feeTokenAddress).transferFrom(
                    msg.sender,
                    _royaltyTreasuryAddress,
                    _royaltyAmount
                ),
                "OriumSftMarketplace: Transfer failed"
            );
        }

        require(
            IERC20(_feeTokenAddress).transferFrom(msg.sender, _lenderAddress, _lenderAmount),
            "OriumSftMarketplace: Transfer failed"
        );
    }
}
