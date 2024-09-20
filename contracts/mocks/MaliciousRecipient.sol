// SPDX-License-Identifier: CC0-1.0


pragma solidity ^0.8.9;

contract MaliciousRecipient {
    // Fallback function that reverts when receiving Ether
    fallback() external payable {
        revert("MaliciousRecipient: Reverting on receive");
    }

    receive() external payable {
        revert("MaliciousRecipient: Reverting on receive");
    }
}
