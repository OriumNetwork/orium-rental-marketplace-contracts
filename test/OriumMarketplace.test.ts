import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/utils'
import { FeeInfo, RoyaltyInfo } from '../utils/types'

describe('OriumMarketplace', () => {
  let marketplace: Contract
  let nft: Contract

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let notOperator: SignerWithAddress
  let creator: SignerWithAddress
  let creatorTreasury: SignerWithAddress

  // Values to be used across tests
  const maxDeadline = 1000
  const feeInfo: FeeInfo = {
    feePercentageInWei: toWei('5'),
    isCustomFee: true,
  }

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, nft] = await loadFixture(deployMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Initialize', async () => {
      it("Should NOT initialize the contract if it's already initialized", async () => {
        await expect(marketplace.initialize(operator.address, ethers.constants.AddressZero, 0)).to.be.revertedWith(
          'Initializable: contract is already initialized',
        )
      })
    })
    describe('Pausable', async () => {
      describe('Pause', async () => {
        it('Should pause the contract', async () => {
          await marketplace.connect(operator).pause()
          expect(await marketplace.paused()).to.be.true
        })

        it('Should NOT pause the contract if caller is not the operator', async () => {
          await expect(marketplace.connect(notOperator).pause()).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })
      describe('Unpause', async () => {
        it('Should unpause the contract', async () => {
          await marketplace.connect(operator).pause()
          await marketplace.connect(operator).unpause()
          expect(await marketplace.paused()).to.be.false
        })

        it('Should NOT unpause the contract if caller is not the operator', async () => {
          await marketplace.connect(operator).pause()
          await expect(marketplace.connect(notOperator).unpause()).to.be.revertedWith(
            'Ownable: caller is not the owner',
          )
        })
      })
    })
    describe('Marketplace Fee', async () => {
      it('Should set the marketplace for a collection', async () => {
        await expect(marketplace.connect(operator).setMarketplaceFeeForCollection(nft.address, feeInfo))
          .to.emit(marketplace, 'CollectionFeeSet')
          .withArgs(nft.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee)
        expect(await marketplace.feeInfo(nft.address)).to.have.deep.members([
          feeInfo.feePercentageInWei,
          feeInfo.isCustomFee,
        ])
        expect(await marketplace.marketplaceFeeOf(nft.address)).to.be.equal(feeInfo.feePercentageInWei)
      })
      it('Should NOT set the marketplace fee if caller is not the operator', async () => {
        await expect(
          marketplace.connect(notOperator).setMarketplaceFeeForCollection(nft.address, feeInfo),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
      it("Should NOT set the marketplace fee if marketplace fee + creator royalty it's greater than 100%", async () => {
        await marketplace.connect(operator).setCreator(nft.address, creator.address)

        const royaltyInfo: RoyaltyInfo = {
          creator: creator.address,
          royaltyPercentageInWei: toWei('10'),
          treasury: creatorTreasury.address,
        }

        await marketplace
          .connect(creator)
          .setRoyaltyInfo(nft.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

        const feeInfo: FeeInfo = {
          feePercentageInWei: toWei('95'),
          isCustomFee: true,
        }
        await expect(
          marketplace.connect(operator).setMarketplaceFeeForCollection(nft.address, feeInfo),
        ).to.be.revertedWith('OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%')
      })
    })
    describe('Creator Royalties', async () => {
      describe('Operator', async () => {
        it('Should set the creator royalties for a collection', async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: ethers.constants.AddressZero,
          }

          await expect(marketplace.connect(operator).setCreator(nft.address, creator.address))
            .to.emit(marketplace, 'CreatorRoyaltySet')
            .withArgs(nft.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

          expect(await marketplace.royaltyInfo(nft.address)).to.have.deep.members([
            royaltyInfo.creator,
            royaltyInfo.royaltyPercentageInWei,
            royaltyInfo.treasury,
          ])
        })
        it('Should NOT set the creator royalties if caller is not the operator', async () => {
          await expect(marketplace.connect(notOperator).setCreator(nft.address, creator.address)).to.be.revertedWith(
            'Ownable: caller is not the owner',
          )
        })
      })

      describe('Creator', async () => {
        beforeEach(async () => {
          await marketplace.connect(operator).setCreator(nft.address, creator.address)
        })
        it("Should update the creator royalties for a collection if it's already set", async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplace
              .connect(creator)
              .setRoyaltyInfo(nft.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
          )
            .to.emit(marketplace, 'CreatorRoyaltySet')
            .withArgs(nft.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)
        })
        it('Should NOT update the creator royalties for a collection if caller is not the creator', async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplace
              .connect(notOperator)
              .setRoyaltyInfo(nft.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
          ).to.be.revertedWith('OriumMarketplace: Only creator can set royalty info')
        })
        it("Should NOT update the creator royalties for a collection if creator's royalty percentage + marketplace fee is greater than 100%", async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('99'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplace
              .connect(creator)
              .setRoyaltyInfo(nft.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
          ).to.be.revertedWith('OriumMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%')
        })
      })
    })
    describe('Max Deadline', async () => {
      it('Should set the max deadline by operator', async () => {
        await marketplace.connect(operator).setMaxDeadline(maxDeadline)
        expect(await marketplace.maxDeadline()).to.be.equal(maxDeadline)
      })
      it('Should NOT set the max deadline if caller is not the operator', async () => {
        await expect(marketplace.connect(notOperator).setMaxDeadline(maxDeadline)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        )
      })
      it('Should NOT set the max deadline 0', async () => {
        await expect(marketplace.connect(operator).setMaxDeadline(0)).to.be.revertedWith(
          'OriumMarketplace: Max deadline should be greater than 0',
        )
      })
    })
  })
})
