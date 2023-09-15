import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/utils'
import { FeeInfo, RoyaltyInfo } from '../utils/types'

describe('RolesRegistry', () => {
  let marketplace: Contract
  let nft: Contract

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let notOperator: SignerWithAddress
  let creator: SignerWithAddress

  // Values to be used across tests
  const feeInfo: FeeInfo = {
    feePercentageInWei: toWei('5'),
    isCustomFee: true,
  }

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator] = await ethers.getSigners()
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
        await marketplace.connect(operator).setMarketplaceFeeForCollection(nft.address, feeInfo)
        expect(await marketplace.feeInfo(nft.address)).to.have.deep.members([
          feeInfo.feePercentageInWei,
          feeInfo.isCustomFee,
        ])
      })
      it('Should NOT set the marketplace fee if caller is not the operator', async () => {
        await expect(
          marketplace.connect(notOperator).setMarketplaceFeeForCollection(nft.address, feeInfo),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })
    describe('Creator Royalties', async () => {
      it('Should set the creator royalties for a collection', async () => {
        const royaltyInfo: RoyaltyInfo = {
          creator: creator.address,
          royaltyPercentageInWei: toWei('0'),
          treasury: ethers.constants.AddressZero,
        }

        await marketplace.connect(operator).setCreator(nft.address, creator.address)
        expect(await marketplace.royaltyInfo(nft.address)).to.have.deep.members([
          royaltyInfo.creator,
          royaltyInfo.royaltyPercentageInWei,
          royaltyInfo.treasury,
        ])
      })
    })
  })
})
