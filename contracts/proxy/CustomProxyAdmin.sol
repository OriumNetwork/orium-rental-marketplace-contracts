// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract CustomProxyAdmin is ProxyAdmin {
    constructor(address _owner) {
        transferOwnership(_owner);
    }
}
