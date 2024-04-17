/* eslint-disable no-unexpected-multiline */
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { RentalOffer, RoyaltyInfo } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY, ONE_HOUR, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { USER_ROLE } from '../utils/roles'
import { IERC7432, MockERC20, MockERC721, OriumMarketplaceRoyalties, OriumNftMarketplace } from '../typechain-types'
import { deployNftMarketplaceContracts } from './fixtures/OriumNftMarketplaceFixture'

describe('OriumNftMarketplace', () => {
  let marketplace: OriumNftMarketplace
  let marketplaceRoyalties: OriumMarketplaceRoyalties
  let rolesRegistry: IERC7432
  let mockERC721: MockERC721
  let mockERC20: MockERC20

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: Awaited<ReturnType<typeof ethers.getSigner>>
  let operator: Awaited<ReturnType<typeof ethers.getSigner>>
  let notOperator: Awaited<ReturnType<typeof ethers.getSigner>>
  let creator: Awaited<ReturnType<typeof ethers.getSigner>>
  let creatorTreasury: Awaited<ReturnType<typeof ethers.getSigner>>
  let lender: Awaited<ReturnType<typeof ethers.getSigner>>
  let borrower: Awaited<ReturnType<typeof ethers.getSigner>>

  // Values to be used across tests
  const maxDeadline = THREE_MONTHS
  const tokenId = 1
  const duration = ONE_HOUR

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, marketplaceRoyalties, rolesRegistry, mockERC721, mockERC20] = await loadFixture(deployNftMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      beforeEach(async () => {
        await mockERC721.mint(lender.address, tokenId)
        await rolesRegistry
          .connect(lender)
          .setRoleApprovalForAll(await mockERC721.getAddress(), await marketplace.getAddress(), true)
        await marketplaceRoyalties
          .connect(operator)
          .setTrustedFeeTokenForToken([await mockERC721.getAddress()], [await mockERC20.getAddress()], [true])
        await marketplaceRoyalties
          .connect(operator)
          .setRolesRegistry(await mockERC721.getAddress(), await rolesRegistry.getAddress())
      })

      describe('Rental Offers', async () => {
        let rentalOffer: RentalOffer

        beforeEach(async () => {
          await marketplaceRoyalties
            .connect(operator)
            .setRoyaltyInfo(creator.address, await mockERC721.getAddress(), 0, AddressZero)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplaceRoyalties
            .connect(creator)
            .setRoyaltyInfo(
              creator.address,
              await mockERC721.getAddress(),
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )

          const blockTimestamp = Number(await time.latest())

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: await mockERC721.getAddress(),
            tokenId,
            feeTokenAddress: await mockERC20.getAddress(),
            feeAmountPerSecond: toWei('0.01'),
            deadline: blockTimestamp + ONE_DAY,
            minDuration: 0,
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
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should create a rental offer with feeAmountPersSecond equal to 0. but with a specific borrower', async () => {
              rentalOffer.feeAmountPerSecond = BigInt(0)
              rentalOffer.borrower = creator.address
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
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should create more than one rental offer for the same role, if the previous deadline is already expired', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await time.increase(ONE_DAY)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
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
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should NOT create a rental offer if caller is not the lender', async () => {
              await expect(marketplace.connect(notOperator).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: only token owner can call this function',
              )
            })
            it("Should NOT create a rental offer if lender is not the caller's address", async () => {
              rentalOffer.lender = creator.address
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: Sender and Lender mismatch',
              )
            })
            it("Should NOT create a rental offer if roles and rolesData don't have the same length", async () => {
              rentalOffer.roles = [`0x${randomBytes(32).toString('hex')}`]
              rentalOffer.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: roles and rolesData should have the same length',
              )
            })
            it('Should NOT create a rental offer if deadline is greater than maxDeadline', async () => {
              rentalOffer.deadline = maxDeadline + 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: Invalid deadline',
              )
            })
            it("Should NOT create a rental offer if deadline is less than block's timestamp", async () => {
              rentalOffer.deadline = Number(await time.latest()) - 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: Invalid deadline',
              )
            })
            it('Should NOT create the same rental offer twice', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: nonce already used',
              )
            })
            it('Should NOT create a rental offer if roles or rolesData are empty', async () => {
              rentalOffer.roles = []
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: roles should not be empty',
              )
            })
            it('Should NOT create a rental offer if nonce is zero', async () => {
              rentalOffer.nonce = '0'
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: Nonce cannot be 0',
              )
            })
            it('Should NOT create a rental offer if feeAmountPerSecond is zero', async () => {
              rentalOffer.feeAmountPerSecond = BigInt(0)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: feeAmountPerSecond should be greater than 0',
              )
            })
            it('Should NOT create a rental offer if tokenAddress is not trusted', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setTrustedFeeTokenForToken([await mockERC721.getAddress()], [await mockERC20.getAddress()], [false])
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: tokenAddress is not trusted',
              )
            })
            it('Should NOT create a rental offer if deadline is less than minDuration', async () => {
              rentalOffer.minDuration = ONE_DAY * 2
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: minDuration is invalid',
              )
            })
            it('Should NOT create more than one rental offer for the same role', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumNftMarketplace: role still has an active offer',
              )
            })
          })
        })

        describe('When Rental Offer is created', async () => {
          let totalFeeAmount: bigint
          beforeEach(async () => {
            totalFeeAmount = rentalOffer.feeAmountPerSecond * BigInt(duration)
            await marketplace.connect(lender).createRentalOffer(rentalOffer)
            await mockERC20.mint(borrower.address, totalFeeAmount.toString())
            await mockERC20.connect(borrower).approve(await marketplace.getAddress(), totalFeeAmount.toString())
            await mockERC721.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)
          })
          describe('Accept Rental Offer', async () => {
            it('Should accept a public rental offer', async () => {
              const blockTimestamp = await time.latest()
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a private rental offer', async () => {
              await time.increase(ONE_DAY)
              rentalOffer.borrower = borrower.address
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
              rentalOffer.feeAmountPerSecond = toWei('0')
              await marketplace.connect(lender).createRentalOffer(rentalOffer)

              const blockTimestamp = await time.latest()
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer if token has a different registry', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await mockERC721.getAddress(), await rolesRegistry.getAddress())
              const blockTimestamp = await time.latest()
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer more than once', async () => {
              const rentalExpirationDate1 = Number(await time.latest()) + duration + 1

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, rentalExpirationDate1)

              await ethers.provider.send('evm_increaseTime', [duration + 1])
              await mockERC20.mint(borrower.address, totalFeeAmount.toString())
              await mockERC20.connect(borrower).approve(await marketplace.getAddress(), totalFeeAmount.toString())

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, rentalExpirationDate1 + duration + 3)
            })
            it('Should accept a rental offer by anyone if borrower is the zero address', async () => {
              await time.increase(ONE_DAY)
              rentalOffer.borrower = ethers.ZeroAddress
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
              await marketplace.connect(lender).createRentalOffer(rentalOffer)

              const blockTimestamp = Number(await time.latest())
              await mockERC20.mint(notOperator.address, totalFeeAmount.toString())
              await mockERC20.connect(notOperator).approve(await marketplace.getAddress(), totalFeeAmount.toString())
              await expect(marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, notOperator.address, blockTimestamp + duration + 3)
            })
            it('Should accept a rental offer if duration is greater or equal minDuration', async () => {
              await time.increase(ONE_DAY)
              rentalOffer.minDuration = duration / 2
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                marketplace,
                'RentalStarted',
              )
            })
            it('Should accept rental offer if marketplace fee is zero', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setMarketplaceFeeForCollection(await mockERC721.getAddress(), 0, true)
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                marketplace,
                'RentalStarted',
              )
            })
            it('Should NOT accept a rental offer if duration is less than minDuration', async () => {
              await time.increase(ONE_DAY)
              rentalOffer.minDuration = duration
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration / 2),
              ).to.be.revertedWith('OriumNftMarketplace: Duration is less than the offer minimum duration')
            })
            it('Should NOT accept a rental offer if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'Pausable: paused',
              )
            })
            it('Should NOT accept a rental offer if caller is not the borrower', async () => {
              await time.increase(ONE_DAY)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.borrower = borrower.address
              rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await mockERC20.mint(notOperator.address, totalFeeAmount.toString())
              await expect(
                marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration),
              ).to.be.revertedWith('OriumNftMarketplace: Sender is not allowed to rent this NFT')
            })
            it('Should NOT accept a rental offer if offer is expired', async () => {
              // move foward in time to expire the offer
              const blockTimestamp = await time.latest()
              const timeToMove = rentalOffer.deadline - Number(blockTimestamp) + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumNftMarketplace: expiration date is greater than offer deadline',
              )
            })
            it('Should NOT accept a rental offer if offer is not created', async () => {
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumNftMarketplace: Offer not created',
              )
            })
            it('Should NOT accept a rental offer if expiration date is higher than offer deadline', async () => {
              const maxDuration = rentalOffer.deadline - Number(await time.latest()) + 1
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, maxDuration),
              ).to.be.revertedWith('OriumNftMarketplace: expiration date is greater than offer deadline')
            })
            describe('Fees', async function () {
              const feeAmountPerSecond = toWei('1')
              const feeAmount = feeAmountPerSecond * BigInt(duration)

              beforeEach(async () => {
                await time.increase(ONE_DAY)
                rentalOffer.feeAmountPerSecond = feeAmountPerSecond
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                rentalOffer.deadline = Number(await time.latest()) + ONE_DAY
                await marketplace.connect(lender).createRentalOffer(rentalOffer)
                await mockERC20.mint(borrower.address, feeAmount * BigInt(2))
                await mockERC20.connect(borrower).approve(await marketplace.getAddress(), feeAmount * BigInt(2))
              })

              it('Should accept a rental offer with fee', async () => {
                const blockTimestamp = await time.latest()
                const expirationDate = Number(blockTimestamp) + duration + 1
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                  .to.emit(marketplace, 'RentalStarted')
                  .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
                  .to.emit(mockERC20, 'Transfer')
              })
              it('Should accept a rental offer if marketplace fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(operator)
                  .setMarketplaceFeeForCollection(await mockERC721.getAddress(), 0, true)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should accept a rental offer if royalty fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(creator)
                  .setRoyaltyInfo(creator.address, await mockERC721.getAddress(), '0', creatorTreasury.address)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should NOT accept a rental offer if marketplace fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 0)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumNftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if royalty fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 1)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumNftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if lender fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 2)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumNftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer twice', async () => {
                await marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumNftMarketplace: This offer has an ongoing rental',
                )
              })
            })
          })
        })
      })
    })
    describe('Core Functions', async () => {
      describe('Initialize', async () => {
        it("Should NOT initialize the contract if it's already initialized", async () => {
          await expect(marketplace.initialize(operator.address, ethers.ZeroAddress)).to.be.revertedWith(
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
    })
  })
})