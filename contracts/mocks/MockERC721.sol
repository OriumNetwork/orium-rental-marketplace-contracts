// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockERC721
 * @dev Mock contract for testing purposes.
 */

contract MockERC721 is ERC721 {
    constructor() ERC721("MockNft", "MOCK") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }
}
