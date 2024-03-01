// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { SetupTest } from "./SetupTest.sol";
import { RentalOffer } from "../libraries/LibOriumSftMarketplace.sol";

contract OriumSftMarketplaceTest is SetupTest {
    uint256 nonceCounter;

    constructor() {
        setUp();
    }

    function test_fuzz_createRentalOffer(address lenderFuzz, address borrowerFuzz) public {
        vm.assume(lenderFuzz != address(0));

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

    function invariant_offerHash() public {
        bytes32[] memory roles = new bytes32[](1);
        roles[0] = UNIQUE_ROLE;

        bytes[] memory rolesData = new bytes[](1);
        rolesData[0] = "0x";

        RentalOffer memory _offer = RentalOffer({
            lender: lender,
            borrower: borrower,
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
                _offer.commitmentId,
                _offer.deadline,
                _offer.roles,
                _offer.rolesData
            )
        );
        bool _isCreated = marketplace.isCreated(_offerHashInContract);
        assertEq(_isCreated, true);
    }
}
