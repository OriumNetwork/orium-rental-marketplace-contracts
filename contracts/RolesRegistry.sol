// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/orium/IRolesRegistry.sol";

contract RolesRegistry is IRolesRegistry {
    struct RoleData {
        uint64 expirationDate;
        bytes data;
    }

    // owner => user => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData)))))
        public roleAssignments;

    // owner => tokenAddress => tokenId => role => user
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => address)))) public lastRoleAssignment;

    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes memory _data
    ) public validExpirationDate(_expirationDate) {
        roleAssignments[msg.sender][_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        lastRoleAssignment[msg.sender][_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_role, _grantee, _expirationDate, _tokenAddress, _tokenId, _data);
    }

    function revokeRole(bytes32 _role, address _grantee, address _tokenAddress, uint256 _tokenId) public {
        delete roleAssignments[msg.sender][_grantee][_tokenAddress][_tokenId][_role];
        delete lastRoleAssignment[msg.sender][_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_role, _grantee, _tokenAddress, _tokenId);
    }

    function hasRole(
        bytes32 _role,
        address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId,
        bool _supportsMultipleAssignments
    ) public view returns (bool) {
        bool isValid = roleAssignments[_granter][_grantee][_tokenAddress][_tokenId][_role].expirationDate >
            block.timestamp;

        if (_supportsMultipleAssignments) {
            return isValid;
        } else {
            return isValid && lastRoleAssignment[_granter][_tokenAddress][_tokenId][_role] == _grantee;
        }
    }

    function roleData(
        bytes32 _role,
        address _granter,
        address _grantee,
        address _tokenAddress,
        uint256 _tokenId
    ) external view returns (uint64 expirationDate_, bytes memory data_) {
        RoleData memory _roleData = roleAssignments[_granter][_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.expirationDate, _roleData.data);
    }
}
