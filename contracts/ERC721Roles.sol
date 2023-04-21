// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./RoleManagement.sol";
import "./interfaces/orium/IERC721Roles.sol";

contract ERC721Roles is RoleManagement, IERC721Roles {

    // role => tokenId => account => expirationDate
    mapping(bytes32 => mapping(uint256 => mapping(address => uint64))) public roleAssignments;

    function grantRole(
        bytes32 _role, address _account, uint256 _tokenId, uint64 _expirationDate, bytes calldata _data
    ) external virtual override {
        require(_expirationDate > block.timestamp, "ERC721Roles: expiration date must be in the future");
        roleAssignments[_role][_tokenId][_account] = _expirationDate;
        emit RoleGranted(_role, _account, _tokenId, _expirationDate, _data);
    }

    function revokeRole(bytes32 _role, address _account, uint256 _tokenId) external virtual override {
        delete roleAssignments[_role][_tokenId][_account];
        emit RoleRevoked(_role, _account, _tokenId);
    }

    function roleExpirationDate(
        bytes32 _role, address _account, uint256 _tokenId
    ) public view virtual override returns (uint64) {
        return roleAssignments[_role][_tokenId][_account];
    }

    function hasRole(
        bytes32 _role, address _account, uint256 _tokenId
    ) external view virtual override returns (bool) {
        return roleExpirationDate(_role, _account, _tokenId) > block.timestamp;
    }

}