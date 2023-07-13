// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/orium/IRolesRegistry.sol";

struct RoleData {
    uint64 expirationDate;
    bytes data;
}

contract RolesRegistry is IRolesRegistry {

    // owner => user => nftAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData))))) public roleAssignments;

    // owner => nftAddress => tokenId => role => user
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => address)))) public lastRoleAssignment;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external validExpirationDate(_expirationDate) {
        roleAssignments[msg.sender][_account][_nftAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        lastRoleAssignment[msg.sender][_nftAddress][_tokenId][_role] = _account;
        emit RoleGranted(_role, _account, _expirationDate, _nftAddress, _tokenId, _data);
    }

    function revokeRole(
        bytes32 _role,
        address _account,
        address _nftAddress,
        uint256 _tokenId
    ) external {
        delete roleAssignments[msg.sender][_account][_nftAddress][_tokenId][_role];
        delete lastRoleAssignment[msg.sender][_nftAddress][_tokenId][_role];
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
        return lastRoleAssignment[_owner][_nftAddress][_tokenId][_role] == _account && roleAssignments[_owner][_account][_nftAddress][_tokenId][_role].expirationDate > block.timestamp;
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
