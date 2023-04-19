// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

struct Role {
    bytes32 role;
    string name;
    string desc;
    bytes32 data;
}

interface IRoleManagement {
    event RoleCreated(address indexed _creator, bytes32 indexed _role, string _name, string _desc, bytes32 _data);
    event RoleDestroyed(address indexed _destroyer, bytes32 indexed _role);

    function createRole(bytes32 _role, string calldata _name, string calldata _desc, bytes32 _data) external;

    function destroyRole(bytes32 _role) external;

    function listRoles() external view returns (Role[] memory);
}
