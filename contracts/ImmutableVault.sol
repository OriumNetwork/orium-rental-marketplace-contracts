// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ImmutableVault
/// @dev This contract is used by the marketplace to store tokens and role assignment roles to them.
/// @author Orium Network Team - security@orium.network
contract ImmutableVault is AccessControl {
    bytes32 public MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");
    address rolesRegistry;

    // tokenAddress => tokenId => owner
    mapping(address => mapping(uint256 => NftInfo)) public nftInfo;

    // tokenAddress => tokenId => nonce => highestExpirationDate
    mapping(address => mapping(uint256 => mapping(uint256 => uint64))) public nonceExpirationDate;

    struct RoleAssignment {
        bytes32 role;
        address grantee;
    }

    struct NftInfo {
        address owner;
        uint64 deadline;
        RoleAssignment[] roleAssignments;
        uint256 nonce;
    }

    event Deposit(address indexed tokenAddress, uint256 indexed tokenId, address indexed owner, uint64 deadline);
    event Withdraw(address indexed tokenAddress, uint256 indexed tokenId, address indexed owner);
    event ExtendDeadline(address indexed tokenAddress, uint256 indexed tokenId, uint64 newDeadline);

    modifier onlyOwner(address _tokenAddress, uint256 _tokenId) {
        require(msg.sender == nftInfo[_tokenAddress][_tokenId].owner, "ImmutableVault: sender is not the token owner");
        _;
    }

    constructor(address _operator, address _rolesRegistry, address _marketplace) {
        rolesRegistry = _rolesRegistry;

        _setupRole(DEFAULT_ADMIN_ROLE, _operator);
        _setupRole(MARKETPLACE_ROLE, _marketplace);
    }

    /// @notice Deposit a token
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the token to be role assignment roles
    function deposit(address _tokenAddress, uint256 _tokenId, uint64 _deadline) external {
        _deposit(msg.sender, _tokenAddress, _tokenId, _deadline);
    }

    /// @notice Deposit a token on behalf of someone else
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the token to be role assignment roles
    function depositOnBehalfOf(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _deadline
    ) external onlyRole(MARKETPLACE_ROLE) {
        _deposit(IERC721(_tokenAddress).ownerOf(_tokenId), _tokenAddress, _tokenId, _deadline);
    }

    /// @notice Read documentation above
    function _deposit(address _tokenOwner, address _tokenAddress, uint256 _tokenId, uint64 _deadline) internal {
        nftInfo[_tokenAddress][_tokenId].owner = _tokenOwner;
        nftInfo[_tokenAddress][_tokenId].deadline = _deadline;

        emit Deposit(_tokenAddress, _tokenId, _tokenOwner, _deadline);

        // Check-Effects-Interaction-Effects pattern
        IERC721(_tokenAddress).transferFrom(_tokenOwner, address(this), _tokenId);
    }

    /// @notice Withdraw a token
    /// @param _tokenAddress Address of the token to withdraw
    /// @param _tokenId ID of the token to withdraw
    function withdraw(address _tokenAddress, uint256 _tokenId) external onlyOwner(_tokenAddress, _tokenId) {
        require(msg.sender == nftInfo[_tokenAddress][_tokenId].owner, "ImmutableVault: sender is not the token owner");

        uint256 _currentNonce = nftInfo[_tokenAddress][_tokenId].nonce;

        require(
            nonceExpirationDate[_tokenAddress][_tokenId][_currentNonce] < block.timestamp,
            "ImmutableVault: token has an active role role assignment"
        );

        delete nftInfo[_tokenAddress][_tokenId];
        delete nonceExpirationDate[_tokenAddress][_tokenId][_currentNonce];

        emit Withdraw(_tokenAddress, _tokenId, msg.sender);

        IERC721(_tokenAddress).transferFrom(address(this), msg.sender, _tokenId);
    }

    /// @notice Withdraw a token on behalf of someone else
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _tokenAddress Address of the token to withdraw
    /// @param _tokenId ID of the token to withdraw
    function withdrawOnBehalfOf(address _tokenAddress, uint256 _tokenId) external onlyRole(MARKETPLACE_ROLE) {
        uint256 _currentNonce = nftInfo[_tokenAddress][_tokenId].nonce;
        address _tokenOwner = nftInfo[_tokenAddress][_tokenId].owner;

        require(
            nonceExpirationDate[_tokenAddress][_tokenId][_currentNonce] < block.timestamp,
            "ImmutableVault: token has an active role role assignment"
        );

        delete nftInfo[_tokenAddress][_tokenId];
        delete nonceExpirationDate[_tokenAddress][_tokenId][_currentNonce];

        emit Withdraw(_tokenAddress, _tokenId, _tokenOwner);

        IERC721(_tokenAddress).transferFrom(address(this), _tokenOwner, _tokenId);
    }

    /// @notice RoleAssignment a role to a token
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _nonce The nonce of the token owner.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _roleAssignments The role assignment struct.
    function batchRoleAssignmentRole(
        uint256 _nonce,
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        RoleAssignment[] memory _roleAssignments,
        bytes[] memory _data
    ) external onlyRole(MARKETPLACE_ROLE) {
        require(
            _roleAssignments.length == _data.length,
            "ImmutableVault: role assignment roles and data length mismatch"
        );
        require(
            nonceExpirationDate[_tokenAddress][_tokenId][_nonce] < block.timestamp,
            "ImmutableVault: token has an active role assignment"
        );
        require(
            nftInfo[_tokenAddress][_tokenId].deadline >= _expirationDate,
            "ImmutableVault: token deadline is before the role assignment expiration date"
        );

        for (uint256 i = 0; i < _roleAssignments.length; i++) {
            _grantRole(_tokenAddress, _tokenId, _expirationDate, _data[i], _roleAssignments[i]);
            nftInfo[_tokenAddress][_tokenId].roleAssignments.push(_roleAssignments[i]);
        }

        nftInfo[_tokenAddress][_tokenId].nonce = _nonce;
        nonceExpirationDate[_tokenAddress][_tokenId][_nonce] = _expirationDate;
    }

    /// @notice RoleAssignment internal function
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _expirationDate The expiration date of the role assignment.
    /// @param _data The data to pass to the role assignment.
    /// @param _roleAssignment The role assignment struct.
    function _grantRole(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes memory _data,
        RoleAssignment memory _roleAssignment
    ) internal {
        IRolesRegistry(rolesRegistry).grantRole(
            _roleAssignment.role,
            _tokenAddress,
            _tokenId,
            _roleAssignment.grantee,
            _expirationDate,
            _data
        );
    }

    /// @notice Revoke all role assignment roles from a token
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _nonce The nonce of the token owner.
    function batchRevokeRole(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _nonce
    ) external onlyRole(MARKETPLACE_ROLE) {
        address _tokenOwner = nftInfo[_tokenAddress][_tokenId].owner;
        RoleAssignment[] memory _roleAssignments = nftInfo[_tokenOwner][_tokenId].roleAssignments;

        for (uint256 i = 0; i < _roleAssignments.length; i++) {
            _revokeRole(_roleAssignments[i].role, _tokenAddress, _tokenId, _roleAssignments[i].grantee);
        }

        delete nftInfo[_tokenOwner][_tokenId].roleAssignments; // free storage and refund gas
        delete nonceExpirationDate[_tokenAddress][_tokenId][_nonce]; // free storage and refund gas
    }

    /// @notice Revoke a role from a token
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _role The role identifier.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _grantee The address to revoke the role from.
    function _revokeRole(bytes32 _role, address _tokenAddress, uint256 _tokenId, address _grantee) internal {
        IRolesRegistry(rolesRegistry).revokeRole(_role, _tokenAddress, _tokenId, _grantee);
    }

    /// @notice Extend the deadline for a token
    /// @dev This function is only callable by the token owner
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _newDeadline The new deadline.
    function extendDeadline(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _newDeadline
    ) external onlyOwner(_tokenAddress, _tokenId) {
        require(
            _newDeadline > nftInfo[_tokenAddress][_tokenId].deadline,
            "ImmutableVault: new deadline must be greater than the current one"
        );
        nftInfo[_tokenAddress][_tokenId].deadline = _newDeadline;
        emit ExtendDeadline(_tokenAddress, _tokenId, _newDeadline);
    }
}
