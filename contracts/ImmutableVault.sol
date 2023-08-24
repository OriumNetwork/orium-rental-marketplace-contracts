// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ImmutableVault {
    bytes32 public TOKEN_OWNER_ROLE = keccak256("TOKEN_OWNER_ROLE");
    bytes32 public DELEGATOR_ROLE = keccak256("DELEGATOR_ROLE");
    uint64 constant MAX_UINT64 = type(uint64).max;
    bytes constant EMPTY_BYTES = "";

    mapping(address => mapping(uint256 => address)) public registryOf;
    mapping(address => mapping(uint256 => address)) public ownerOf;

    modifier onlyOwner(address _tokenAddress, uint256 _tokenId) {
        require(
            ownerOf[_tokenAddress][_tokenId] == msg.sender,
            "ImmutableVault: sender is not the token owner"
        );
        _;
    }

    function deposit(address _tokenAddress, uint256 _tokenId, address _rolesRegistry) external {
        require(
            msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId),
            "ImmutableVault: sender is not the token owner"
        );

        ownerOf[_tokenAddress][_tokenId] = msg.sender;
        registryOf[_tokenAddress][_tokenId] = _rolesRegistry;

        IERC721(_tokenAddress).transferFrom(msg.sender, address(this), _tokenId);
    }

    // TODO: _rolesRegistry can be exploited to deposit a token on behalf of someone else
    function depositOnBehafOf(address _tokenAddress, uint256 _tokenId, address _rolesRegistry, address _from) external {
        require(_from == IERC721(_tokenAddress).ownerOf(_tokenId), "ImmutableVault: sender is not the token owner");

        ownerOf[_tokenAddress][_tokenId] = _from;
        registryOf[_tokenAddress][_tokenId] = _rolesRegistry;

        IERC721(_tokenAddress).transferFrom(_from, address(this), _tokenId);
    }

    function withdraw(address _tokenAddress, uint256 _tokenId) onlyOwner(_tokenAddress, _tokenId) external {
        require(ownerOf[_tokenAddress][_tokenId] == msg.sender, "ImmutableVault: sender is not the token owner");

        delete registryOf[_tokenAddress][_tokenId];
        delete ownerOf[_tokenAddress][_tokenId];

        IERC721(_tokenAddress).transferFrom(address(this), msg.sender, _tokenId);
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) external onlyOwner(_tokenAddress, _tokenId) {
        IRolesRegistry(registryOf[_tokenAddress][_tokenId]).grantRole(_role, _tokenAddress, _tokenId, _grantee, _expirationDate, _data);
    }

    function revokeRole(bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantee) onlyOwner(_tokenAddress, _tokenId) external {
        IRolesRegistry(registryOf[_tokenAddress][_tokenId]).revokeRole(_role, _tokenAddress, _tokenId, _grantee);
    }
}
