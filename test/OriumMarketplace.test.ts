import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/utils'
import { FeeInfo, RentalOffer, RoyaltyInfo } from '../utils/types'
import { ONE_DAY } from '../utils/constants'
import { randomBytes } from 'crypto'

describe('OriumMarketplace', () => {
  let marketplace: Contract
  let nft: Contract
  let paymentToken: Contract

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let notOperator: SignerWithAddress
  let creator: SignerWithAddress
  let creatorTreasury: SignerWithAddress
  let lender: SignerWithAddress
  let borrower: SignerWithAddress

  // Values to be used across tests
  const maxDeadline = 1000
  const feeInfo: FeeInfo = {
    feePercentageInWei: toWei('5'),
    isCustomFee: true,
  }

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, nft, paymentToken] = await loadFixture(deployMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      describe('Create Rental Offer', async () => {
        let rentalOffer: RentalOffer
        const tokenId = 1

        beforeEach(async () => {
          await nft.mint(lender.address, tokenId)
          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            lender: lender.address,
            borrower: borrower.address,
            tokenAddress: nft.address,
            tokenId,
            feeTokenAddress: paymentToken.address,
            feeAmountPerSecond: ethers.BigNumber.from(0),
            deadline: blockTimestamp + ONE_DAY,
            roles: [],
            rolesData: [],
          }
        })
        it('Should create a rental offer', async () => {
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
            .to.emit(marketplace, 'RentalOfferCreated')
            .withArgs(
              rentalOffer.nonce,
              rentalOffer.lender,
              rentalOffer.borrower,
              rentalOffer.tokenAddress,
              rentalOffer.tokenId,
              rentalOffer.feeTokenAddress,
              rentalOffer.feeAmountPerSecond,
              rentalOffer.deadline,
              rentalOffer.roles,
              rentalOffer.rolesData,
            )
        })
        it('Should NOT create a rental offer if caller is not the lender', async () => {
          await expect(marketplace.connect(notOperator).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: only token owner can call this function',
          )
        })
        it("Should NOT create a rental offer if lender is not the caller's address", async () => {
          rentalOffer.lender = creator.address
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: Sender and Lender mismatch',
          )
        })
        it("Should NOT create a rental offer if roles and rolesData don't have the same length", async () => {
          rentalOffer.roles = [`0x${randomBytes(32).toString('hex')}`]
          rentalOffer.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: roles and rolesData should have the same length',
          )
        })
        it('Should NOT create a rental offer if deadline is greater than maxDeadline', async () => {
          rentalOffer.deadline = maxDeadline + 1
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: Invalid deadline',
          )
        })
        it("Should NOT create a rental offer if deadline is less than block's timestamp", async () => {
          rentalOffer.deadline = (await ethers.provider.getBlock('latest')).timestamp - 1
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: Invalid deadline',
          )
        })
        it('Should NOT create a rental offer if nonce is already used', async () => {
          await marketplace.connect(lender).createRentalOffer(rentalOffer)
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: Nonce already used',
          )
        })
      })
    })
    describe('Core Functions', async () => {
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
            await expect(marketplace.connect(notOperator).pause()).to.be.revertedWith(
              'Ownable: caller is not the owner',
            )
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
          await expect(
            marketplace
              .connect(operator)
              .setMarketplaceFeeForCollection(nft.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          )
            .to.emit(marketplace, 'MarketplaceFeeSet')
            .withArgs(nft.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee)
          expect(await marketplace.feeInfo(nft.address)).to.have.deep.members([
            feeInfo.feePercentageInWei,
            feeInfo.isCustomFee,
          ])
          expect(await marketplace.marketplaceFeeOf(nft.address)).to.be.equal(feeInfo.feePercentageInWei)
        })
        it('Should NOT set the marketplace fee if caller is not the operator', async () => {
          await expect(
            marketplace
              .connect(notOperator)
              .setMarketplaceFeeForCollection(nft.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
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
            marketplace
              .connect(operator)
              .setMarketplaceFeeForCollection(nft.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
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
})
