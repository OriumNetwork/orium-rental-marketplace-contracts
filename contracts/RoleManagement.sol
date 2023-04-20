// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./interfaces/orium/IRoleManagement.sol";

contract RoleManagement is IRoleManagement {
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

    function _addRole(bytes32 _role, string memory _name, string memory _desc, bytes memory _data) internal {
        roles[_role] = Role(_role, _name, _desc, _data);
        emit RoleCreated(msg.sender, _role, _name, _desc, _data);
    }

    function _destroyRole(bytes32 _role) internal {
        delete roles[_role];
        emit RoleDestroyed(msg.sender, _role);
    }
}
