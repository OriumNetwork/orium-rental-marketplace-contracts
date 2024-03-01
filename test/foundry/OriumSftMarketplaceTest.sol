// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SetupTest } from "./SetupTest.sol";
import { RentalOffer } from "../../contracts/libraries/LibOriumSftMarketplace.sol";

contract OriumSftMarketplaceTest is SetupTest {
    uint256 nonceCounter;
    uint256 commitmentIdCounter;

    constructor() {
        setUp();
    }

    function test_fuzz_createRentalOffer(address lenderFuzz, address borrowerFuzz) public {
        vm.assume(lenderFuzz != address(0) && lenderFuzz.code.length == 0);
        vm.assume(borrowerFuzz != address(0) && borrowerFuzz.code.length == 0);

        bytes32[] memory roles = new bytes32[](1);
        roles[0] = UNIQUE_ROLE;

        bytes[] memory rolesData = new bytes[](1);
        rolesData[0] = "0x";

        RentalOffer memory _offer = RentalOffer({
            lender: lenderFuzz,
            borrower: borrowerFuzz,
            tokenAddress: address(sft),
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            feeTokenAddress: address(feeToken),
            feeAmountPerSecond: 0,
            nonce: ++nonceCounter,
            commitmentId: 0,
            deadline: uint64(block.timestamp + 1 days),
            roles: roles,
            rolesData: rolesData
        });

        sft.mint(lenderFuzz, tokenId, tokenAmount, "");
        vm.startPrank(lenderFuzz);
        sft.setApprovalForAll(address(rolesRegistry), true);
        rolesRegistry.setRoleApprovalForAll(address(sft), address(marketplace), true);
        marketplace.createRentalOffer(_offer);
        vm.stopPrank();
    }

   function test_fuzz_acceptRentalOffer(address lenderFuzz, address borrowerFuzz, uint64 duration) public {
        vm.assume(lenderFuzz != address(0) && lenderFuzz.code.length == 0);
        vm.assume(borrowerFuzz != address(0) && borrowerFuzz.code.length == 0);
        uint64 deadline = uint64(block.timestamp + 30 days);
        vm.assume(duration > block.timestamp && duration < deadline);

        bytes32[] memory roles = new bytes32[](1);
        roles[0] = UNIQUE_ROLE;

        bytes[] memory rolesData = new bytes[](1);
        rolesData[0] = "0x";

        RentalOffer memory _offer = RentalOffer({
            lender: lenderFuzz,
            borrower: borrowerFuzz,
            tokenAddress: address(sft),
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            feeTokenAddress: address(feeToken),
            feeAmountPerSecond: 0,
            nonce: ++nonceCounter,
            commitmentId: 0,
            deadline: deadline,
            roles: roles,
            rolesData: rolesData
        });

        vm.startPrank(lenderFuzz);
        sft.mint(lenderFuzz, tokenId, tokenAmount, "");
        sft.setApprovalForAll(address(rolesRegistry), true);
        rolesRegistry.setRoleApprovalForAll(address(sft), address(marketplace), true);
        marketplace.createRentalOffer(_offer);
        vm.stopPrank();

        _offer.commitmentId = ++commitmentIdCounter;

        vm.startPrank(borrowerFuzz);
        marketplace.acceptRentalOffer(_offer, duration);
        vm.stopPrank();
    }

    function test_fuzz_cancelRentalOffer(address lenderFuzz) public {
        vm.assume(lenderFuzz != address(0) && lenderFuzz.code.length == 0);

        bytes32[] memory roles = new bytes32[](1);
        roles[0] = UNIQUE_ROLE;

        bytes[] memory rolesData = new bytes[](1);
        rolesData[0] = "0x";

        RentalOffer memory _offer = RentalOffer({
            lender: lenderFuzz,
            borrower: address(0),
            tokenAddress: address(sft),
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            feeTokenAddress: address(feeToken),
            feeAmountPerSecond: 1,
            nonce: ++nonceCounter,
            commitmentId: 0,
            deadline: uint64(block.timestamp + 1 days),
            roles: roles,
            rolesData: rolesData
        });

        vm.startPrank(lenderFuzz);
        sft.mint(lenderFuzz, tokenId, tokenAmount, "");
        sft.setApprovalForAll(address(rolesRegistry), true);
        rolesRegistry.setRoleApprovalForAll(address(sft), address(marketplace), true);
        marketplace.createRentalOffer(_offer);
        vm.stopPrank();

        vm.startPrank(lenderFuzz);
        _offer.commitmentId = ++commitmentIdCounter;
        marketplace.cancelRentalOffer(_offer);
        vm.stopPrank();
    }

    function invariant_offerHash() public {
        bytes32[] memory roles = new bytes32[](1);
        roles[0] = UNIQUE_ROLE;

        bytes[] memory rolesData = new bytes[](1);
        rolesData[0] = "0x";

        RentalOffer memory _offer = RentalOffer({
            lender: lender,
            borrower: address(0),
            tokenAddress: address(sft),
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            feeTokenAddress: address(feeToken),
            feeAmountPerSecond: 1,
            nonce: ++nonceCounter,
            commitmentId: 0,
            deadline: uint64(block.timestamp + 1 days),
            roles: roles,
            rolesData: rolesData
        });

        sft.mint(lender, tokenId, tokenAmount, "");
        vm.startPrank(lender);
        sft.setApprovalForAll(address(rolesRegistry), true);
        rolesRegistry.setRoleApprovalForAll(address(sft), address(marketplace), true);
        marketplace.createRentalOffer(_offer);
        vm.stopPrank();

        bytes32 _offerHashInContract = keccak256(
            abi.encode(
                _offer.lender,
                _offer.borrower,
                _offer.tokenAddress,
                _offer.tokenId,
                _offer.tokenAmount,
                _offer.feeTokenAddress,
                _offer.feeAmountPerSecond,
                _offer.nonce,
                ++commitmentIdCounter,
                _offer.deadline,
                _offer.roles,
                _offer.rolesData
            )
        );
        bool _isCreated = marketplace.isCreated(_offerHashInContract);
        assertEq(_isCreated, true);
    }
}
