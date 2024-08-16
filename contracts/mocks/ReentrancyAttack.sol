// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import '../OriumSftMarketplace.sol';

contract ReentrancyAttack {
    OriumSftMarketplace public marketplace;
    RentalOffer public offer;
    uint64 public duration;

    constructor(OriumSftMarketplace _marketplace) {
        marketplace = _marketplace;
    }

    receive() external payable {
        marketplace.acceptRentalOffer{ value: msg.value }(offer, duration);
    }

    function attack(RentalOffer calldata _offer, uint64 _duration) external payable {
        offer = _offer;
        duration = _duration;

        marketplace.acceptRentalOffer{ value: msg.value }(_offer, _duration);
    }
}
