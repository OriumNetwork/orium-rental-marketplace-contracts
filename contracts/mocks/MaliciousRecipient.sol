// SPDX-License-Identifier: CC0-1.0

// contracts/MaliciousRecipient.sol
pragma solidity ^0.8.0;

contract MaliciousRecipient {
    // Fallback function that reverts when receiving Ether
    fallback() external payable {
        revert("MaliciousRecipient: Reverting on receive");
    }

    receive() external payable {
        revert("MaliciousRecipient: Reverting on receive");
    }
}
