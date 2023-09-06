// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IERC7432 } from "./interfaces/IERC7432.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract RolesRegistry is IERC7432 {

    // grantee => tokenAddress => tokenId => role => struct(expirationDate, data)
    mapping(address => mapping(address => mapping(uint256 => mapping(bytes32 => RoleData))))
        public roleAssignments;

    // tokenAddress => tokenId => role => grantee
    mapping(address => mapping(uint256 => mapping(bytes32 => address))) public lastRoleAssignment;

    // owner => tokenAddress => tokenId => operator => isApproved
    mapping(address => mapping(address => mapping(uint256 => mapping(address => bool)))) public tokenApprovals;

    // owner => tokenAddress => operator => operatorApprovals
    mapping(address => mapping(address => mapping(address => bool))) public operatorApprovals;


    modifier validExpirationDate(uint64 _expirationDate) {
        require(_expirationDate > block.timestamp, "RolesRegistry: expiration date must be in the future");
        _;
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) external validExpirationDate(_expirationDate) {
        require(msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId), "RolesRegistry: sender must be owner");
        roleAssignments[_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        lastRoleAssignment[_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(msg.sender, _role, _tokenAddress, _tokenId, _grantee, _expirationDate, _data);
    }

    function revokeRole(bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantee) external {
        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        delete lastRoleAssignment[_tokenAddress][_tokenId][_role];
        emit RoleRevoked(msg.sender, _role, _tokenAddress, _tokenId, _grantee);
    }

    function hasRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bool) {
        return roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate > block.timestamp;
    }

    function hasUniqueRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bool) {
        bool isValid = roleAssignments[_grantee][_tokenAddress][_tokenId][_role].expirationDate >
            block.timestamp;

        return isValid && lastRoleAssignment[_tokenAddress][_tokenId][_role] == _grantee;
    }

    function roleData(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (bytes memory data_) {
        RoleData memory _roleData = roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.data);
    }

     function roleExpirationDate(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external view returns (uint64 expirationDate_){
        RoleData memory _roleData = roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        return (_roleData.expirationDate);
    }

    function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
        return interfaceId == type(IERC7432).interfaceId;
    }

    /// @notice Grants a role to a user from a role assignment.
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _grantor The role creator.
    /// @param _grantee The user that receives the role assignment.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _data Any additional data about the role assignment.
    function grantRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data
    ) external override validExpirationDate(_expirationDate) {
        require(_grantor == IERC721(_tokenAddress).ownerOf(_tokenId), "RolesRegistry: sender must be owner");
        require(tokenApprovals[_grantor][_tokenAddress][_tokenId][msg.sender] || operatorApprovals[_grantor][_tokenAddress][msg.sender], "RolesRegistry: sender must be approved");

        roleAssignments[_grantee][_tokenAddress][_tokenId][_role] = RoleData(_expirationDate, _data);
        lastRoleAssignment[_tokenAddress][_tokenId][_role] = _grantee;
        emit RoleGranted(_grantor, _role, _tokenAddress, _tokenId, _grantee, _expirationDate, _data); // TODO: We should change event to receive grantor as parameter
    }

    /// @notice Revokes a role from a user.
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _grantor The role creator.
    /// @param _grantee The user that receives the role revocation.
    function revokeRoleFrom(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantor,
        address _grantee
    ) external override {
        require(_grantor == IERC721(_tokenAddress).ownerOf(_tokenId), "RolesRegistry: sender must be owner");
        require(tokenApprovals[_grantor][_tokenAddress][_tokenId][msg.sender] || operatorApprovals[_grantor][_tokenAddress][msg.sender], "RolesRegistry: sender must be approved");
        
        delete roleAssignments[_grantee][_tokenAddress][_tokenId][_role];
        delete lastRoleAssignment[_tokenAddress][_tokenId][_role];
        emit RoleRevoked(_grantor, _role, _tokenAddress, _tokenId, _grantee); // TODO: We should change event to receive grantor as parameter
    }

    /// @notice Sets the approval for a user to grant a role to another user.
    /// @param _operator The user that can grant the role.
    /// @param _tokenAddress The token address.
    /// @param _isApproved The approval status.
    function setRoleApprovalForAll(
        address _operator,
        address _tokenAddress,
        bool _isApproved
    ) external override {
        operatorApprovals[msg.sender][_tokenAddress][_operator] = _isApproved;
        emit RoleApprovalForAll(msg.sender, _tokenAddress, _operator, _isApproved);
    }

    /// @notice Sets the approval for a user to grant a role to another user.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _operator The user that can grant the role.
    /// @param _approved The approval status.
    function approveRole(
        address _tokenAddress,
        uint256 _tokenId,
        address _operator,
        bool _approved
    ) external override {
        tokenApprovals[msg.sender][_tokenAddress][_tokenId][_operator] = _approved;
        emit RoleApproval(msg.sender, _tokenAddress, _tokenId, _operator, _approved);
    }

    /// @notice Checks if a user is tokenApprovals to grant a role to another user.
    /// @param _grantor The user that tokenApprovals the operator.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _operator The user that can grant the role.
    function getApprovedRole(
        address _grantor,
        address _tokenAddress,
        uint256 _tokenId,
        address _operator
    ) external view override returns (bool) {
        return tokenApprovals[_grantor][_tokenAddress][_tokenId][_operator];
    }

    /// @notice Checks if a user is tokenApprovals to grant a role to another user.
    /// @param _grantor The user that tokenApprovals the operator.
    /// @param _operator The user that can grant the role.
    /// @param _tokenAddress The token address.
    function isRoleApprovedForAll(
        address _grantor,
        address _operator,
        address _tokenAddress
    ) external view override returns (bool) {
        return operatorApprovals[_grantor][_tokenAddress][_operator];
    }
}
