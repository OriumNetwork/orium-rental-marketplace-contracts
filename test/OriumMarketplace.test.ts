import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/utils'
import { FeeInfo, RentalOffer, RoyaltyInfo } from '../utils/types'
import { ONE_DAY, ONE_HOUR } from '../utils/constants'
import { randomBytes } from 'crypto'

describe('OriumMarketplace', () => {
  let marketplace: Contract
  let mockERC721: Contract
  let mockERC20: Contract

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let treasury: SignerWithAddress
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
    [deployer, operator, treasury, notOperator, creator, creatorTreasury, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, mockERC721, mockERC20] = await loadFixture(deployMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      let rentalOffer: RentalOffer
      let rentalExpirationDate: number
      const tokenId = 1

      beforeEach(async () => {
        await mockERC721.mint(lender.address, tokenId)
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
        rentalOffer = {
          nonce: `0x${randomBytes(32).toString('hex')}`,
          lender: lender.address,
          borrower: borrower.address,
          tokenAddress: mockERC721.address,
          tokenId,
          feeTokenAddress: mockERC20.address,
          feeAmountPerSecond: ethers.BigNumber.from(0),
          deadline: blockTimestamp + ONE_DAY,
          roles: [],
          rolesData: [],
        }
        rentalExpirationDate = blockTimestamp + ONE_DAY
      })
      describe('Create Rental Offer', async () => {
        it('Should create a rental offer for ERC721', async () => {
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
        it('Should NOT create the same rental offer twice', async () => {
          await marketplace.connect(lender).createRentalOffer(rentalOffer)
          await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
            'OriumMarketplace: offer already created',
          )
        })
      })
      describe.only('Accept Rental Offer', async () => {
        beforeEach(async () => {
          await marketplace.connect(lender).createRentalOffer(rentalOffer)
        })
        it('Should accept a rental offer', async () => {
          await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalExpirationDate))
            .to.emit(marketplace, 'RentalStarted')
            .withArgs(
              rentalOffer.nonce,
              rentalOffer.lender,
              rentalOffer.borrower,
              rentalOffer.tokenAddress,
              rentalOffer.tokenId,
              rentalExpirationDate,
            )
        })
        it('Should execute the rental offer more than once', async () => {
          const rentalExpirationDate1 = (await ethers.provider.getBlock('latest')).timestamp + ONE_HOUR

          await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalExpirationDate1))
            .to.emit(marketplace, 'RentalStarted')
            .withArgs(
              rentalOffer.nonce,
              rentalOffer.lender,
              rentalOffer.borrower,
              rentalOffer.tokenAddress,
              rentalOffer.tokenId,
              rentalExpirationDate1,
            )

          await ethers.provider.send('evm_increaseTime', [ONE_HOUR])

          const rentalExpirationDate2 = (await ethers.provider.getBlock('latest')).timestamp + ONE_HOUR

          await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalExpirationDate2))
            .to.emit(marketplace, 'RentalStarted')
            .withArgs(
              rentalOffer.nonce,
              rentalOffer.lender,
              rentalOffer.borrower,
              rentalOffer.tokenAddress,
              rentalOffer.tokenId,
              rentalExpirationDate2,
            )
        })
        it('Should accept a rental offer by anyone if borrower is the zero address', async () => {
          rentalOffer.borrower = ethers.constants.AddressZero
          await marketplace.connect(lender).createRentalOffer(rentalOffer)
          await expect(marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, rentalExpirationDate))
            .to.emit(marketplace, 'RentalStarted')
            .withArgs(
              rentalOffer.nonce,
              rentalOffer.lender,
              notOperator.address,
              rentalOffer.tokenAddress,
              rentalOffer.tokenId,
              rentalExpirationDate,
            )
        })
        it('Should NOT accept a rental offer if caller is not the borrower', async () => {
          await expect(
            marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, rentalExpirationDate),
          ).to.be.revertedWith('OriumMarketplace: Sender is not allowed to rent this NFT')
        })
        it('Should NOT accept a rental offer if offer is expired', async () => {
          // move foward in time to expire the offer
          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
          const timeToMove = rentalOffer.deadline - blockTimestamp + 1
          await ethers.provider.send('evm_increaseTime', [timeToMove])

          await expect(
            marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalExpirationDate),
          ).to.be.revertedWith('OriumMarketplace: offer not created or expired')
        })
        it('Should NOT accept a rental offer if offer is not created', async () => {
          rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
          await expect(
            marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalExpirationDate),
          ).to.be.revertedWith('OriumMarketplace: offer not created or expired')
        })
        it('Should NOT accept a rental offer if expiration date is higher than offer deadline', async () => {
          await expect(
            marketplace.connect(borrower).acceptRentalOffer(rentalOffer, rentalOffer.deadline + 1),
          ).to.be.revertedWith('OriumMarketplace: expiration date is greater than offer deadline')
        })
        it('Should NOT accept a rental offer if expiration date is less than block timestamp', async () => {
          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
          await expect(
            marketplace.connect(borrower).acceptRentalOffer(rentalOffer, blockTimestamp - 1),
          ).to.be.revertedWith('OriumMarketplace: expiration date is in the past')
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
              .setMarketplaceFeeForCollection(mockERC721.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          )
            .to.emit(marketplace, 'MarketplaceFeeSet')
            .withArgs(mockERC721.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee)
          expect(await marketplace.feeInfo(mockERC721.address)).to.have.deep.members([
            feeInfo.feePercentageInWei,
            feeInfo.isCustomFee,
          ])
          expect(await marketplace.marketplaceFeeOf(mockERC721.address)).to.be.equal(feeInfo.feePercentageInWei)
        })
        it('Should NOT set the marketplace fee if caller is not the operator', async () => {
          await expect(
            marketplace
              .connect(notOperator)
              .setMarketplaceFeeForCollection(mockERC721.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
        it("Should NOT set the marketplace fee if marketplace fee + creator royalty it's greater than 100%", async () => {
          await marketplace.connect(operator).setCreator(mockERC721.address, creator.address)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplace
            .connect(creator)
            .setRoyaltyInfo(mockERC721.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

          const feeInfo: FeeInfo = {
            feePercentageInWei: toWei('95'),
            isCustomFee: true,
          }
          await expect(
            marketplace
              .connect(operator)
              .setMarketplaceFeeForCollection(mockERC721.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
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

            await expect(marketplace.connect(operator).setCreator(mockERC721.address, creator.address))
              .to.emit(marketplace, 'CreatorRoyaltySet')
              .withArgs(mockERC721.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

            expect(await marketplace.royaltyInfo(mockERC721.address)).to.have.deep.members([
              royaltyInfo.creator,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            ])
          })
          it('Should NOT set the creator royalties if caller is not the operator', async () => {
            await expect(
              marketplace.connect(notOperator).setCreator(mockERC721.address, creator.address),
            ).to.be.revertedWith('Ownable: caller is not the owner')
          })
        })

        describe('Creator', async () => {
          beforeEach(async () => {
            await marketplace.connect(operator).setCreator(mockERC721.address, creator.address)
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
                .setRoyaltyInfo(mockERC721.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
            )
              .to.emit(marketplace, 'CreatorRoyaltySet')
              .withArgs(mockERC721.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)
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
                .setRoyaltyInfo(mockERC721.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
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
                .setRoyaltyInfo(mockERC721.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury),
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
