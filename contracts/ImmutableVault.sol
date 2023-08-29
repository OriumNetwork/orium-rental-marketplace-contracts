// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { IRolesRegistry } from "./interfaces/IRolesRegistry.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ImmutableVault {
    bytes32 public TOKEN_OWNER_ROLE = keccak256("TOKEN_OWNER_ROLE");
    bytes32 public DELEGATOR_ROLE = keccak256("DELEGATOR_ROLE");
    uint64 constant MAX_UINT64 = type(uint64).max;
    bytes constant EMPTY_BYTES = "";

    mapping(address => mapping(uint256 => address)) public registryOf;
    mapping(address => mapping(uint256 => address)) public ownerOf;

    // approved mappings
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(address => mapping(address => mapping(address => mapping(uint256 => bool)))) public isApproved;

    mapping(address => uint256) public userNonce;

    modifier onlyOwner(address _tokenAddress, uint256 _tokenId) {
        require(ownerOf[_tokenAddress][_tokenId] == msg.sender, "ImmutableVault: sender is not the token owner");
        _;
    }

    modifier onlyOwnerOrApproved(address _tokenAddress, uint256 _tokenId) {
        require(
            ownerOf[_tokenAddress][_tokenId] == msg.sender ||
                isApprovedForAll[ownerOf[_tokenAddress][_tokenId]][msg.sender] ||
                isApproved[ownerOf[_tokenAddress][_tokenId]][msg.sender][_tokenAddress][_tokenId],
            "ImmutableVault: sender is not the token owner or approved"
        );
        _;
    }

    function deposit(address _tokenAddress, uint256 _tokenId) external {
        require(
            msg.sender == IERC721(_tokenAddress).ownerOf(_tokenId),
            "ImmutableVault: sender is not the token owner"
        );

        ownerOf[_tokenAddress][_tokenId] = msg.sender;

        IERC721(_tokenAddress).transferFrom(msg.sender, address(this), _tokenId);
    }

    // TODO: _rolesRegistry can be exploited to deposit a token on behalf of someone else
    // 1 - NFT.approveForAll(vault)
    // 2 - vault.ApproveForAll(marketplace)
    // 3 - marketplace.createRentalOffer(vault)

    // 1 - marketplace.createRentalOffer(vault)
    function depositOnBehafOf(address _tokenAddress, uint256 _tokenId) external {
        // require(isApprovedForAll[_from][msg.sender] || isApproved[_from][msg.sender][_tokenAddress][_tokenId], "ImmutableVault: sender is not approved");

        address _tokenOwner = IERC721(_tokenAddress).ownerOf(_tokenId);
        ownerOf[_tokenAddress][_tokenId] = _tokenOwner;

        IERC721(_tokenAddress).transferFrom(_tokenOwner, address(this), _tokenId);
    }

    /// @notice Deposit a token on behalf of someone else
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the signature
    /// @param _msg Message signed by the token owner allowing the deposit on their behalf
    function depositPermitAndApprove(
        address _tokenAddress,
        uint256 _tokenId,
        uint64 _deadline,
        bytes calldata _msg
    ) external {
        address _tokenOwner = IERC721(_tokenAddress).ownerOf(_tokenId);
        bytes32 _functionSignature = keccak256(
            "depositPermitAndApproveForAll(address spender,address tokenAddress,uint256 tokenId,uint256 nonce,uint256 deadline,bytes msg)"
        );
        address _signer = _recoverSigner(
            _functionSignature,
            _tokenAddress,
            _tokenId,
            userNonce[_tokenOwner],
            _deadline,
            _msg
        );
        require(_signer == _tokenOwner, "ImmutableVault: invalid signature");

        /// Permit will approve the msg.sender for only this token
        isApproved[_tokenOwner][msg.sender][_tokenAddress][_tokenId] = true;

        ownerOf[_tokenAddress][_tokenId] = msg.sender;

        IERC721(_tokenAddress).transferFrom(msg.sender, address(this), _tokenId);
    }

    /// @notice Deposit a token on behalf of someone else
    /// @param _tokenAddress Address of the token to deposit
    /// @param _tokenId ID of the token to deposit
    /// @param _deadline Deadline for the signature
    /// @param _msg Message signed by the token owner allowing the deposit on their behalf
    function depositPermit(address _tokenAddress, uint256 _tokenId, uint64 _deadline, bytes calldata _msg) external {
        address _tokenOwner = IERC721(_tokenAddress).ownerOf(_tokenId);

        bytes32 _functionSignature = keccak256(
            "depositPermit(address spender,address tokenAddress,uint256 tokenId,uint256 nonce,uint256 deadline,bytes msg)"
        );
        address _signer = _recoverSigner(
            _functionSignature,
            _tokenAddress,
            _tokenId,
            userNonce[_tokenOwner],
            _deadline,
            _msg
        );
        require(_signer == _tokenOwner, "ImmutableVault: invalid signature");

        ownerOf[_tokenAddress][_tokenId] = msg.sender;

        IERC721(_tokenAddress).transferFrom(msg.sender, address(this), _tokenId);
    }

    function _recoverSigner(
        bytes32 _functionSignature,
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _nonce,
        uint64 _deadline,
        bytes calldata _msg
    ) internal view returns (address) {
        bytes32 _hash = keccak256(
            abi.encodePacked(_functionSignature, msg.sender, _tokenAddress, _tokenId, _nonce, _deadline)
        );

        return _recoverSignerFromHash(_hash, _msg);
    }

    function _recoverSignerFromHash(bytes32 _hash, bytes memory _msg) internal pure returns (address) {
        bytes32 _hashWithPrefix = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hash));

        bytes32 _r;
        bytes32 _s;
        uint8 _v;

        if (_msg.length != 65) {
            return address(0);
        }

        assembly {
            _r := mload(add(_msg, 32))
            _s := mload(add(_msg, 64))
            _v := byte(0, mload(add(_msg, 96)))
        }

        if (_v < 27) {
            _v += 27;
        }

        if (_v != 27 && _v != 28) {
            return address(0);
        }

        return ecrecover(_hashWithPrefix, _v, _r, _s);
    }

    function nonceOf(address _user) external view returns (uint256) {
        return userNonce[_user];
    }

    function withdraw(address _tokenAddress, uint256 _tokenId) external onlyOwner(_tokenAddress, _tokenId) {
        require(ownerOf[_tokenAddress][_tokenId] == msg.sender, "ImmutableVault: sender is not the token owner");
        
        delete ownerOf[_tokenAddress][_tokenId];

        IERC721(_tokenAddress).transferFrom(address(this), msg.sender, _tokenId);
    }

    function grantRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        uint64 _expirationDate,
        bytes calldata _data,
        address _rolesRegistry
    ) external onlyOwnerOrApproved(_tokenAddress, _tokenId) {
        IRolesRegistry(_rolesRegistry).grantRole(_role, _tokenAddress, _tokenId, _grantee, _expirationDate, _data);
    }
    // expirations[tokenAddress][tokenId] => expirationDate (highest one)
    // 

    function revokeRole(
        bytes32 _role,
        address _tokenAddress,
        uint256 _tokenId,
        address _grantee,
        address _rolesRegistry
    ) external onlyOwnerOrApproved(_tokenAddress, _tokenId) {
        IRolesRegistry(_rolesRegistry).revokeRole(_role, _tokenAddress, _tokenId, _grantee);
    }

    function setApprovalForAll(address _operator, bool _approved) external {
        isApprovedForAll[msg.sender][_operator] = _approved;
    }

    function setApproval(address _operator, address _tokenAddress, uint256 _tokenId, bool _approved) external {
        isApproved[msg.sender][_operator][_tokenAddress][_tokenId] = _approved;
    }
}
