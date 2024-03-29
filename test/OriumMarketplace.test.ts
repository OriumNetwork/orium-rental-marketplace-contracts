import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { DirectRental, FeeInfo, RentalOffer, RoyaltyInfo } from '../utils/types'
import { AddressZero, DIRECT_RENTAL_NONCE, EMPTY_BYTES, ONE_DAY, ONE_HOUR, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { USER_ROLE } from '../utils/roles'
import { hashDirectRental } from '../utils/hash'

describe('OriumMarketplace', () => {
  let marketplace: Contract
  let rolesRegistry: Contract
  let mockERC721: Contract
  let mockERC20: Contract

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
  const maxDeadline = THREE_MONTHS
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
    [marketplace, rolesRegistry, mockERC721, mockERC20] = await loadFixture(deployMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      const duration = ONE_HOUR
      const tokenId = 1

      beforeEach(async () => {
        await mockERC721.mint(lender.address, tokenId)
        await rolesRegistry.connect(lender).setRoleApprovalForAll(mockERC721.address, marketplace.address, true)
      })

      describe('Rental Offers', async () => {
        let rentalOffer: RentalOffer

        beforeEach(async () => {
          await marketplace.connect(operator).setCreator(mockERC721.address, creator.address)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplace
            .connect(creator)
            .setRoyaltyInfo(mockERC721.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: mockERC721.address,
            tokenId,
            feeTokenAddress: mockERC20.address,
            feeAmountPerSecond: toWei('0'),
            deadline: blockTimestamp + ONE_DAY,
            roles: [USER_ROLE],
            rolesData: [EMPTY_BYTES],
          }
        })
        describe('When Rental Offer is not created', async () => {
          describe('Create Rental Offer', async () => {
            it('Should create a rental offer', async () => {
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCreated')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  rentalOffer.borrower,
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
                'OriumMarketplace: nonce already used',
              )
            })
            it('Should NOT create a rental offer if roles or rolesData are empty', async () => {
              rentalOffer.roles = []
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: roles should not be empty',
              )
            })
            it("Should NOT create a rental offer if nonce is the direct rental's nonce", async () => {
              rentalOffer.nonce = DIRECT_RENTAL_NONCE.toString()
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: Nonce cannot be 0',
              )
            })
          })
        })
        describe('When Rental Offer is created', async () => {
          beforeEach(async () => {
            await marketplace.connect(lender).createRentalOffer(rentalOffer)
          })
          describe('Accept Rental Offer', async () => {
            it('Should accept a public rental offer', async () => {
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                  expirationDate,
                )
            })
            it('Should accept a private rental offer', async () => {
              rentalOffer.borrower = borrower.address
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                  expirationDate,
                )
            })
            it('Should accept a rental offer if token has a different registry', async () => {
              await marketplace.connect(operator).setRolesRegistry(mockERC721.address, rolesRegistry.address)
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                  expirationDate,
                )
            })
            it('Should accept a rental offer more than once', async () => {
              const rentalExpirationDate1 = (await ethers.provider.getBlock('latest')).timestamp + duration + 1

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                  rentalExpirationDate1,
                )

              await ethers.provider.send('evm_increaseTime', [duration + 1])

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                  rentalExpirationDate1 + duration + 1,
                )
            })
            it('Should accept a rental offer by anyone if borrower is the zero address', async () => {
              rentalOffer.borrower = ethers.constants.AddressZero
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer(rentalOffer)

              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              await expect(marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  notOperator.address,
                  blockTimestamp + duration + 1,
                )
            })
            it('Should NOT accept a rental offer if caller is not the borrower', async () => {
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.borrower = borrower.address
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(
                marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration),
              ).to.be.revertedWith('OriumMarketplace: Sender is not allowed to rent this NFT')
            })
            it('Should NOT accept a rental offer if offer is expired', async () => {
              // move foward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const timeToMove = rentalOffer.deadline - blockTimestamp + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumMarketplace: expiration date is greater than offer deadline',
              )
            })
            it('Should NOT accept a rental offer if offer is not created', async () => {
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumMarketplace: Offer not created',
              )
            })
            it('Should NOT accept a rental offer if expiration date is higher than offer deadline', async () => {
              const maxDuration = rentalOffer.deadline - (await ethers.provider.getBlock('latest')).timestamp + 1
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, maxDuration),
              ).to.be.revertedWith('OriumMarketplace: expiration date is greater than offer deadline')
            })
            it('Should NOT accept a rental offer if expiration date is less than block timestamp', async () => {
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, 0)).to.be.revertedWith(
                'RolesRegistry: expiration date must be in the future',
              )
            })
            describe('Fees', async function () {
              const feeAmountPerSecond = toWei('1')
              const feeAmount = feeAmountPerSecond.mul(duration)

              beforeEach(async () => {
                rentalOffer.feeAmountPerSecond = feeAmountPerSecond
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                await marketplace.connect(lender).createRentalOffer(rentalOffer)
                await mockERC20.mint(borrower.address, feeAmount.mul(2))
                await mockERC20.connect(borrower).approve(marketplace.address, feeAmount.mul(2))
              })

              it('Should accept a rental offer with fee', async () => {
                const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
                const expirationDate = blockTimestamp + duration + 1
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                  .to.emit(marketplace, 'RentalStarted')
                  .withArgs(
                    rentalOffer.nonce,
                    rentalOffer.tokenAddress,
                    rentalOffer.tokenId,
                    rentalOffer.lender,
                    borrower.address,
                    expirationDate,
                  )
                  .to.emit(mockERC20, 'Transfer')
              })
              it('Should accept a rental offer if marketplace fee is 0', async () => {
                await marketplace.connect(operator).setMarketplaceFeeForCollection(mockERC721.address, 0, true)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should accept a rental offer if royalty fee is 0', async () => {
                await marketplace.connect(creator).setRoyaltyInfo(mockERC721.address, '0', creatorTreasury.address)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should NOT accept a rental offer if marketplace fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 0)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if royalty fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 1)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if lender fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 2)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer twice', async () => {
                await marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumMarketplace: Rental already started',
                )
              })
            })
          })
          describe('Cancel Rental Offer', async () => {
            it('Should cancel a rental offer', async () => {
              await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer.nonce))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.nonce, lender.address)
            })
            it('Should NOT cancel a rental offer if nonce not used yet by caller', async () => {
              await expect(marketplace.connect(notOperator).cancelRentalOffer(rentalOffer.nonce)).to.be.revertedWith(
                'OriumMarketplace: Nonce expired or not used yet',
              )
            })
            it("Should NOT cancel a rental offer after deadline's expiration", async () => {
              // move foward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const timeToMove = rentalOffer.deadline - blockTimestamp + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer.nonce)).to.be.revertedWith(
                'OriumMarketplace: Nonce expired or not used yet',
              )
            })
          })
        })
        describe('When Rental Offer is accepted', async () => {
          beforeEach(async () => {
            await marketplace.connect(lender).createRentalOffer(rentalOffer)
            await marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)
            await rolesRegistry.connect(borrower).setRoleApprovalForAll(mockERC721.address, marketplace.address, true)
          })
          describe('End Rental', async () => {
            it('Should end a rental by the borrower', async () => {
              await expect(marketplace.connect(borrower).endRental(rentalOffer))
                .to.emit(marketplace, 'RentalEnded')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                )
            })
            it('Should NOT end a rental by the lender', async () => {
              await expect(marketplace.connect(lender).endRental(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: Only borrower can end a rental',
              )
            })
            it('Should NOT end a rental if caller is not the borrower', async () => {
              await expect(marketplace.connect(notOperator).endRental(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: Only borrower can end a rental',
              )
            })
            it('Should NOT end a rental if rental is not started', async () => {
              await expect(
                marketplace
                  .connect(borrower)
                  .endRental({ ...rentalOffer, nonce: `0x${randomBytes(32).toString('hex')}` }),
              ).to.be.revertedWith('OriumMarketplace: Offer not created')
            })
            it('Should NOT end a rental if rental is expired', async () => {
              // move foward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const timeToMove = rentalOffer.deadline - blockTimestamp + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: Rental Offer expired',
              )
            })
            it('Should end a rental if the role was revoked by borrower directly in registry', async () => {
              await rolesRegistry.connect(borrower).setRoleApprovalForAll(mockERC721.address, borrower.address, true)
              await rolesRegistry
                .connect(borrower)
                .revokeRoleFrom(
                  rentalOffer.roles[0],
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                )
              await expect(marketplace.connect(borrower).endRental(rentalOffer))
                .to.emit(marketplace, 'RentalEnded')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  borrower.address,
                )
            })
            it('Should NOT end rental twice', async () => {
              await marketplace.connect(borrower).endRental(rentalOffer)
              await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                'OriumMarketplace: Rental ended',
              )
            })
          })
        })
      })

      describe('Direct Rentals', async function () {
        let directRental: DirectRental
        let directRentalHash: string
        beforeEach(async () => {
          directRental = {
            tokenAddress: mockERC721.address,
            tokenId,
            lender: lender.address,
            borrower: borrower.address,
            duration,
            roles: [USER_ROLE],
            rolesData: [EMPTY_BYTES],
          }
          directRentalHash = hashDirectRental(directRental)
        })
        describe('Create Direct Rental', async () => {
          it("Should create a direct rental if caller is the token's owner", async () => {
            await expect(marketplace.connect(lender).createDirectRental(directRental))
              .to.emit(marketplace, 'DirectRentalStarted')
              .withArgs(
                directRentalHash,
                mockERC721.address,
                tokenId,
                lender.address,
                borrower.address,
                directRental.duration,
                directRental.roles,
                directRental.rolesData,
              )
          })
          it('Should NOT create a direct rental if caller is not the token owner', async () => {
            await expect(marketplace.connect(notOperator).createDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: only token owner can call this function',
            )
          })
          it("Should NOT create a direct rental if lender address is not the token's owner", async () => {
            directRental.lender = creator.address
            await expect(marketplace.connect(lender).createDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: Sender and Lender mismatch',
            )
          })
          it("Should NOT create a direct rental if roles and rolesData don't have the same length", async () => {
            directRental.roles = [`0x${randomBytes(32).toString('hex')}`]
            directRental.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
            await expect(marketplace.connect(lender).createDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: roles and rolesData should have the same length',
            )
          })
          it('Should NOT create a direct rental if roles or rolesData are empty', async () => {
            directRental.roles = []
            await expect(marketplace.connect(lender).createDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: roles should not be empty',
            )
          })
          it('Should NOT create a direct rental if expiration date is greater than maxDeadline', async () => {
            directRental.duration += maxDeadline
            await expect(marketplace.connect(lender).createDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: Duration is greater than max deadline',
            )
          })
        })
        describe('Cancel Direct Rental', async () => {
          beforeEach(async () => {
            await marketplace.connect(lender).createDirectRental(directRental)
          })
          it('Should cancel a direct rental if caller is the lender', async () => {
            await expect(marketplace.connect(lender).cancelDirectRental(directRental))
              .to.emit(marketplace, 'DirectRentalEnded')
              .withArgs(directRentalHash, lender.address)
          })
          it('Should cancel a direct rental if caller is the borrower', async () => {
            await rolesRegistry.connect(borrower).setRoleApprovalForAll(mockERC721.address, marketplace.address, true)
            await expect(marketplace.connect(borrower).cancelDirectRental(directRental))
              .to.emit(marketplace, 'DirectRentalEnded')
              .withArgs(directRentalHash, lender.address)
          })
          it('Should NOT cancel a direct rental if caller is neither borrower or lender', async () => {
            await expect(marketplace.connect(notOperator).cancelDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: Sender and Lender/Borrower mismatch',
            )
          })
          it('Should NOT cancel a direct rental twice', async () => {
            await marketplace.connect(lender).cancelDirectRental(directRental)
            await expect(marketplace.connect(lender).cancelDirectRental(directRental)).to.be.revertedWith(
              'OriumMarketplace: Direct rental expired',
            )
          })
          it("Should NOT cancel a direct rental if rental doesn't exist", async () => {
            await expect(
              marketplace.connect(lender).cancelDirectRental({ ...directRental, duration: 0 }),
            ).to.be.revertedWith('OriumMarketplace: Direct rental not created')
          })
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

      describe('Roles Registry', async () => {
        it('Should set the roles registry for a collection', async () => {
          await expect(marketplace.connect(operator).setRolesRegistry(mockERC721.address, rolesRegistry.address))
            .to.emit(marketplace, 'RolesRegistrySet')
            .withArgs(mockERC721.address, rolesRegistry.address)
        })
        it('Should NOT set the roles registry if caller is not the operator', async () => {
          await expect(
            marketplace.connect(notOperator).setRolesRegistry(mockERC721.address, rolesRegistry.address),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })

      describe('Default Roles Registry', async () => {
        it('Should set the default roles registry for a collection', async () => {
          await expect(marketplace.connect(operator).setDefaultRolesRegistry(rolesRegistry.address)).to.not.be.reverted
        })
        it('Should NOT set the default roles registry if caller is not the operator', async () => {
          await expect(
            marketplace.connect(notOperator).setDefaultRolesRegistry(rolesRegistry.address),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })
    })
  })
})
