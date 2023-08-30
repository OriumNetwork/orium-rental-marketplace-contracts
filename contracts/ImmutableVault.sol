// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract ImmutableVault is AccessControl {
    bytes32 public MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");
    address rolesRegistry;

    // tokenAddress => tokenId => owner
    mapping(address => mapping(uint256 => address)) public ownerOf;

    // owner => tokenAddress => tokenId => deadline
    mapping(address => mapping(address => mapping(uint256 => uint64))) public deadlines;

    // owner => nonce => highestExpirationDate
    mapping(address => mapping(uint256 => uint64)) public nonceExpirationDate;

    // owner => nonce => grant
    mapping(address => mapping(uint256 => Grant[])) public grants;

    // owner => currentNonce
    mapping(address => uint256) public nonces;

    struct Grant {
        bytes32 role;
        address grantee;
        bytes data;
    }

    event Deposit(address indexed tokenAddress, uint256 indexed tokenId, address indexed owner, uint64 deadline);
    event Withdraw(address indexed tokenAddress, uint256 indexed tokenId, address indexed owner);
    event ExtendTokenDeadline(address indexed tokenAddress, uint256 indexed tokenId, uint64 newDeadline);
    event RolesRegistrySet(address indexed rolesRegistry);

    modifier onlyOwner(address _tokenAddress, uint256 _tokenId) {
        require(msg.sender == ownerOf[_tokenAddress][_tokenId], "ImmutableVault: sender is not the token owner");
        _;
    }

    constructor(address _operator, address _rolesRegistry) {
        _setupRole(DEFAULT_ADMIN_ROLE, _operator);
        _setRolesRegistry(_rolesRegistry);
    }

    /// @notice Deposit a token
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the token to be grant roles
    function deposit(address _tokenAddress, uint256 _tokenId, uint64 _deadline) external {
        _deposit(msg.sender, _tokenAddress, _tokenId, _deadline);
    }

    /// @notice Deposit a token on behalf of someone else
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the token to be grant roles
    function depositOnBehafOf(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _deadline
    ) external onlyRole(MARKETPLACE_ROLE) {
        _deposit(IERC721(_tokenAddress).ownerOf(_tokenId), _tokenAddress, _tokenId, _deadline);
    }

    /// @notice Read documentation above
    function _deposit(address _tokenOwner, address _tokenAddress, uint256 _tokenId, uint64 _deadline) internal {
        ownerOf[_tokenAddress][_tokenId] = _tokenOwner;
        deadlines[_tokenOwner][_tokenAddress][_tokenId] = _deadline;

        emit Deposit(_tokenAddress, _tokenId, _tokenOwner, _deadline);

        // Check-Effects-Interaction-Effects pattern
        IERC721(_tokenAddress).transferFrom(_tokenOwner, address(this), _tokenId);
    }

    /// @notice Withdraw a token
    /// @param _tokenAddress Address of the token to withdraw
    /// @param _tokenId ID of the token to withdraw
    function withdraw(address _tokenAddress, uint256 _tokenId) external onlyOwner(_tokenAddress, _tokenId) {
        require(ownerOf[_tokenAddress][_tokenId] == msg.sender, "ImmutableVault: sender is not the token owner");

        uint256 _currentNonce = nonces[msg.sender];
        require(
            nonceExpirationDate[msg.sender][_currentNonce] < block.timestamp,
            "ImmutableVault: token has an active role grant"
        );

        delete ownerOf[_tokenAddress][_tokenId];
        delete deadlines[msg.sender][_tokenAddress][_tokenId];
        delete nonceExpirationDate[msg.sender][_currentNonce];

        emit Withdraw(_tokenAddress, _tokenId, msg.sender);

        IERC721(_tokenAddress).transferFrom(address(this), msg.sender, _tokenId);
    }

    /// @notice Grant a role to a token
    /// @dev This function is only callable by some account which has MARKETPLACE_ROLE
    /// @param _nonce The nonce of the token owner.
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _grants The grant struct.
    function batchGrantRole(
        uint256 _nonce,
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        Grant[] memory _grants
    ) external onlyRole(MARKETPLACE_ROLE) {
        address _tokenOwner = ownerOf[_tokenAddress][_tokenId];
        require(
            nonceExpirationDate[_tokenOwner][_nonce] < block.timestamp,
            "ImmutableVault: token has an active grant"
        );
        require(
            deadlines[_tokenOwner][_tokenAddress][_tokenId] >= _expirationDate,
            "ImmutableVault: token deadline is before the grant expiration date"
        );

        for (uint256 i = 0; i < _grants.length; i++) {
            _grantRole(_tokenAddress, _tokenId,_expirationDate, _grants[i]);
            grants[_tokenOwner][_nonce].push(_grants[i]);
        }

        nonces[_tokenOwner] = _nonce;
        nonceExpirationDate[_tokenOwner][_nonce] = _expirationDate;
    }

    function _grantRole(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _expirationDate,
        Grant memory _grant
    ) internal {
        IRolesRegistry(rolesRegistry).grantRole(
            _grant.role,
            _tokenAddress,
            _tokenId,
            _grant.grantee,
            _expirationDate,
            _grant.data
        );
    }

    function batchRevokeRole(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _nonce
    ) external onlyRole(MARKETPLACE_ROLE) {
        address _tokenOwner = ownerOf[_tokenAddress][_tokenId];
        Grant[] memory _grants = grants[_tokenOwner][_nonce];

        for (uint256 i = 0; i < _grants.length; i++) {
            _revokeRole(_grants[i].role, _tokenAddress, _tokenId, _grants[i].grantee);
        }

        delete grants[_tokenOwner][_nonce]; // free storage and refund gas
        delete nonceExpirationDate[_tokenOwner][_nonce]; // free storage and refund gas
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

    /// @notice Set the roles registry
    /// @dev This function is only callable by some account which has DEFAULT_ADMIN_ROLE
    /// @param _rolesRegistry The address of the roles registry.
    function setRolesRegistry(address _rolesRegistry) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRolesRegistry(_rolesRegistry);
    }

    /// @notice Read documentation above
    function _setRolesRegistry(address _rolesRegistry) internal {
        rolesRegistry = _rolesRegistry;
        emit RolesRegistrySet(_rolesRegistry);
    }

    /// @notice Extend the deadline for a token
    /// @dev This function is only callable by the token owner
    /// @param _tokenAddress The token address.
    /// @param _tokenId The token identifier.
    /// @param _newDeadline The new deadline.
    function extendTokenDeadline(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _newDeadline
    ) external onlyOwner(_tokenAddress, _tokenId) {
        require(
            _newDeadline > deadlines[msg.sender][_tokenAddress][_tokenId],
            "ImmutableVault: new deadline must be greater than the current one"
        );
        deadlines[msg.sender][_tokenAddress][_tokenId] = _newDeadline;
        emit ExtendTokenDeadline(_tokenAddress, _tokenId, _newDeadline);
    }
}
