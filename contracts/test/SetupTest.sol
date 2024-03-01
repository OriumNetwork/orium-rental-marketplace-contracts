// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { Test } from "forge-std/Test.sol";
import { OriumSftMarketplace } from "../OriumSftMarketplace.sol";
import { OriumMarketplaceRoyalties } from "../OriumMarketplaceRoyalties.sol";
import { SftRolesRegistrySingleRole } from "../mocks/SftRolesRegistrySingleRole.sol";
import { MockERC1155 } from "../mocks/MockERC1155.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";

contract SetupTest is Test {
    OriumSftMarketplace public marketplace;
    OriumMarketplaceRoyalties public royalties;
    SftRolesRegistrySingleRole public rolesRegistry;
    MockERC1155 public sft;
    MockERC20 public feeToken;
    
    uint64 public constant MAX_DURATION = 90 days;
    uint256 public constant tokenId = 1;
    uint256 public constant tokenAmount = 1;

    address public operator = vm.addr(1);
    address public lender = vm.addr(2);
    address public borrower = vm.addr(3);

    bytes32 public constant UNIQUE_ROLE = keccak256('UNIQUE_ROLE');

    function setUp() public virtual {
        operator = address(this);

        _deployContracts();

        _setupContracts();
    }

    function _deployContracts() internal {
        rolesRegistry = new SftRolesRegistrySingleRole();
        royalties = new OriumMarketplaceRoyalties();
        royalties.initialize(address(this), address(rolesRegistry), address(0), MAX_DURATION);
        marketplace = new OriumSftMarketplace();
        marketplace.initialize(address(this), address(royalties));
        feeToken = new MockERC20();
        sft = new MockERC1155();
    }

    function _setupContracts() internal {
        bool[] memory _isTrusted = new bool[](1);
        _isTrusted[0] = true;
        address[] memory _trustedFeeTokens = new address[](1);
        _trustedFeeTokens[0] = address(feeToken);
        address[] memory _trustedNftTokens = new address[](1);
        _trustedNftTokens[0] = address(sft);
        
        sft.mint(address(lender), tokenId, tokenAmount, "");
        royalties.setTrustedNftTokens(_trustedNftTokens, _isTrusted);
        royalties.setTrustedFeeTokens(_trustedFeeTokens, _isTrusted);
        royalties.setRolesRegistry(address(sft), address(rolesRegistry));
    }
}
