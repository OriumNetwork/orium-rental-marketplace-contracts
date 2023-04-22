// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

interface IERC721Roles {
    event RoleGranted(
        bytes32 indexed _role,
        address indexed _account,
        uint256 indexed _tokenId,
        uint64 _expirationDate,
        bytes _data
    );
    event RoleRevoked(bytes32 indexed _role, address indexed _account, uint256 indexed _tokenId);

    function grantRole(
        bytes32 _role,
        address _account,
        uint256 _tokenId,
        uint64 _expirationDate,
        bytes calldata _data
    ) external;

    function revokeRole(bytes32 _role, address _account, uint256 _tokenId) external;

    function hasRole(bytes32 _role, address _account, uint256 _tokenId) external view returns (bool);

    function roleExpirationDate(bytes32 _role, address _account, uint256 _tokenId) external view returns (uint64);
}
