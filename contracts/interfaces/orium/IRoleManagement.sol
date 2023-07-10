// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

struct Role {
    bytes32 role;
    string name;
    string desc;
    bytes data;
}

/// @notice The Role Management interface enables the creation and destruction of roles.
/// Developers can use this interface to create roles for NFTs, such as "Parcel Builder"
/// and "Parcel Farmer".
/// @dev Designed to be used by creators to define the roles users can use
/// (e.g. used by Pixelcraft)
interface IRoleManagement {

    /// @notice Emitted when a role is created.
    /// @dev specifies all the different attributes of a given role.
    /// @param _creator The address of the creator of the role.
    /// @param _role The role identifier.
    /// @param _name Human-readable name of the role.
    /// @param _desc Human-readable description of the role.
    /// @param _data Any additional data about the role.
    event RoleCreated(address indexed _creator, bytes32 indexed _role, string _name, string _desc, bytes _data);

    /// @notice Emitted when a role is destroyed.
    /// @param _destroyer The address of the destroyer of the role.
    /// @param _role The role identifier.
    event RoleDestroyed(address indexed _destroyer, bytes32 indexed _role);

    /// @notice Creates a new role.
    /// @param _role The role identifier.
    /// @param _name Human-readable name of the role.
    /// @param _desc Human-readable description of the role.
    /// @param _data Any additional data about the role.
    function createRole(bytes32 _role, string calldata _name, string calldata _desc, bytes calldata _data) external;

    /// @notice Destroys a role.
    /// @param _role The role identifier.
    function destroyRole(bytes32 _role) external;
}

