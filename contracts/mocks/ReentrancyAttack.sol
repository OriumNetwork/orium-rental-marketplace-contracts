// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import '../OriumSftMarketplace.sol';

contract ReentrancyAttack {
    OriumSftMarketplace public marketplace;
    RentalOffer public offer;
    uint64 public duration;
    bool public reentered = false;

    constructor(OriumSftMarketplace _marketplace) {
        marketplace = _marketplace;
    }

    receive() external payable {
        if (!reentered && address(marketplace).balance > 0) {
            reentered = true;
            // Try to re-enter the marketplace
            marketplace.acceptRentalOffer{ value: msg.value / 2 }(offer, duration);
        }
    }

    function attack(RentalOffer calldata _offer, uint64 _duration) external payable {
        offer = _offer;
        duration = _duration;

        marketplace.acceptRentalOffer{ value: msg.value }(_offer, _duration);
    }

    function attackWithRecursiveCalls(RentalOffer calldata _offer, uint64 _duration, uint times) external payable {
        offer = _offer;
        duration = _duration;

        for (uint i = 0; i < times; i++) {
            marketplace.acceptRentalOffer{ value: msg.value / times }(_offer, _duration);
        }
    }
}
