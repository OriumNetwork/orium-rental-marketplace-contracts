// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./interfaces/orium/IRoleManagement.sol";

contract RoleManagement is IRoleManagement {
    bytes32[] public allRoles;
    mapping(bytes32 => Role) public roles;

    function createRole(
        bytes32 _role,
        string calldata _name,
        string calldata _desc,
        bytes calldata _data
    ) external virtual override {
        _addRole(_role, _name, _desc, _data);
    }

    function destroyRole(bytes32 _role) external virtual override {
        _destroyRole(_role);
    }

    function listRoles() external view virtual override returns (Role[] memory roles_) {
        roles_ = new Role[](allRoles.length);
        for (uint256 i; i < allRoles.length; i++) {
            bytes32 role = allRoles[i];
            roles_[i] = roles[role];
        }
        return roles_;
    }

    function _addRole(bytes32 _role, string memory _name, string memory _desc, bytes memory _data) internal {
        uint256 i;
        for (; i < allRoles.length; i++) {
            if (allRoles[i] == _role) {
                break;
            }
        }
        if (i == allRoles.length) {
            allRoles.push(_role);
        }
        roles[_role] = Role(_role, _name, _desc, _data);
        emit RoleCreated(msg.sender, _role, _name, _desc, _data);
    }

    function _destroyRole(bytes32 _role) internal {
        for (uint256 i; i < allRoles.length; i++) {
            if (allRoles[i] == _role) {
                allRoles[i] = allRoles[allRoles.length - 1];
                allRoles.pop();
                break;
            }
        }
        delete roles[_role];
        emit RoleDestroyed(msg.sender, _role);
    }
}
