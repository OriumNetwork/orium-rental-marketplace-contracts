// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721RolesRegistry } from "./interfaces/orium/IERC721RolesRegistry.sol";

struct RoleData {
    uint64 expirationDate;
    bytes data;
}

contract ERC721RolesRegistry is IERC721RolesRegistry {

    // owner => user => nftAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData))))) public roleAssignments;

    // owner => nftAddress => tokenId => role => user
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => address)))) public roleLastAssingment;
    modifier onlyOwner(address nftAddress, uint256 tokenId) {
        require(IERC721(nftAddress).ownerOf(tokenId) == msg.sender, "ERC721RolesRegistry: msg.sender is not owner of the NFT");
        _;
    }

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "ERC721RolesRegistry: expiration date must be in the future");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external onlyOwner(_nftAddress, _tokenId) validExpirationDate(_expirationDate) {
        roleAssignments[msg.sender][_account][_nftAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        roleLastAssingment[msg.sender][_nftAddress][_tokenId][_role] = _account;
        emit RoleGranted(_role, _account, _expirationDate, _nftAddress, _tokenId, _data);
    }

    function revokeRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external onlyOwner(_nftAddress, _tokenId) {
        delete roleAssignments[msg.sender][_account][_nftAddress][_tokenId][_role];
        delete roleLastAssingment[msg.sender][_nftAddress][_tokenId][_role];
        emit RoleRevoked(_role, _account, _nftAddress, _tokenId);
    }

     function hasRole(
        bytes32 _role,
        address _owner,
        address _account,
        address _nftAddress,
        uint256 _tokenId,
        bool _supportsMultipleUsers
    ) external view returns (bool) {
        if(_supportsMultipleUsers){
        return roleAssignments[_owner][_account][_nftAddress][_tokenId][_role].expirationDate > block.timestamp;
        } else {
        return roleLastAssingment[_owner][_nftAddress][_tokenId][_role] == _account;
        }
    }

    function roleData(
        bytes32 _role,
        address _owner,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external view returns (uint64 expirationDate_, bytes memory data_) {
        RoleData storage roleDate = roleAssignments[_owner][_account][_nftAddress][_tokenId][_role];
        return (roleDate.expirationDate, roleDate.data);
    }
}
