// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import '../OriumSftMarketplace.sol';

contract ReentrancyAttack {
    OriumSftMarketplace public marketplace;

    constructor(OriumSftMarketplace _marketplace) {
        marketplace = _marketplace;
    }

    receive() external payable {}

    function attemptDoubleAccept(RentalOffer calldata _offer, uint64 _duration) external payable {
        // First accept call
        marketplace.acceptRentalOffer{ value: msg.value / 2 }(_offer, _duration);
        // Second accept call in the same transaction
        marketplace.acceptRentalOffer{ value: msg.value / 2 }(_offer, _duration);
    }
}
