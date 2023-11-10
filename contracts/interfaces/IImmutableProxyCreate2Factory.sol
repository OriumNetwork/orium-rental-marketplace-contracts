// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;


interface IImmutableProxyCreate2Factory {
    function deploy(bytes32 salt, bytes memory bytecode) external returns (address);
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address);
    function deployAndCall(bytes32 salt, bytes memory bytecode, bytes memory _callData) external returns (address addr);
}
