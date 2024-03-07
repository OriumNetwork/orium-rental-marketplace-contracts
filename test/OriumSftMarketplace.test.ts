import { ethers } from 'hardhat'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { deploySftMarketplaceContracts } from './fixtures/OriumSftMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { CommitAndGrantRoleParams, RoyaltyInfo, SftRentalOffer } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY, ONE_HOUR, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { UNIQUE_ROLE } from '../utils/roles'

describe('OriumSftMarketplace', () => {
  let marketplace: Contract
  let marketplaceRoyalties: Contract
  let rolesRegistry: Contract
  let mockERC1155: Contract
  let secondMockERC1155: Contract
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

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20, secondMockERC1155] = await loadFixture(deploySftMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      const duration = ONE_HOUR
      const tokenId = 1
      const tokenAmount = BigNumber.from(2)

      beforeEach(async () => {
        await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
        await secondMockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
        await marketplaceRoyalties
          .connect(operator)
          .setTrustedNftTokens([mockERC1155.address, secondMockERC1155.address], [true, true])
        await marketplaceRoyalties.connect(operator).setTrustedFeeTokens([mockERC20.address], [true])
        await marketplaceRoyalties.connect(operator).setRolesRegistry(secondMockERC1155.address, rolesRegistry.address)
      })

      describe('Rental Offers', async () => {
        let rentalOffer: SftRentalOffer

        beforeEach(async () => {
          await marketplaceRoyalties
            .connect(operator)
            .setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplaceRoyalties
            .connect(creator)
            .setRoyaltyInfo(
              creator.address,
              mockERC1155.address,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )

          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            commitmentId: BigNumber.from(0),
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: mockERC1155.address,
            tokenId,
            tokenAmount,
            feeTokenAddress: mockERC20.address,
            feeAmountPerSecond: toWei('0.0000001'),
            deadline: blockTimestamp + ONE_DAY,
            roles: [UNIQUE_ROLE],
            rolesData: [EMPTY_BYTES],
          }

          await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
          await rolesRegistry.connect(lender).setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
          await mockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
        })
        describe('When Rental Offer is not created', async () => {
          describe('Create Rental Offer', async () => {
            describe("When commitmentId doesn't exist", async () => {
              it('Should create a rental offer', async () => {
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                  .to.emit(marketplace, 'RentalOfferCreated')
                  .withArgs(
                    rentalOffer.nonce,
                    rentalOffer.tokenAddress,
                    rentalOffer.tokenId,
                    rentalOffer.tokenAmount,
                    1,
                    rentalOffer.lender,
                    rentalOffer.borrower,
                    rentalOffer.feeTokenAddress,
                    rentalOffer.feeAmountPerSecond,
                    rentalOffer.deadline,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.emit(mockERC1155, 'TransferSingle')
                  .withArgs(rolesRegistry.address, lender.address, rolesRegistry.address, tokenId, tokenAmount)
                  .to.emit(rolesRegistry, 'TokensCommitted')
                  .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
              })
              it('Should create a rental offer if collection has a custom roles registry', async function () {
                await marketplaceRoyalties
                  .connect(operator)
                  .setRolesRegistry(mockERC1155.address, rolesRegistry.address)
                await mockERC1155.setApprovalForAll(rolesRegistry.address, true)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                  .to.emit(marketplace, 'RentalOfferCreated')
                  .withArgs(
                    rentalOffer.nonce,
                    rentalOffer.tokenAddress,
                    rentalOffer.tokenId,
                    rentalOffer.tokenAmount,
                    1,
                    rentalOffer.lender,
                    rentalOffer.borrower,
                    rentalOffer.feeTokenAddress,
                    rentalOffer.feeAmountPerSecond,
                    rentalOffer.deadline,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.emit(mockERC1155, 'TransferSingle')
                  .withArgs(rolesRegistry.address, lender.address, rolesRegistry.address, tokenId, tokenAmount)
                  .to.emit(rolesRegistry, 'TokensCommitted')
                  .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
              })
              it('Should create a rental offer with feeAmountPerSecond equal to 0 if offer is private', async function () {
                rentalOffer.feeAmountPerSecond = BigNumber.from(0)
                rentalOffer.borrower = lender.address
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                  .to.emit(marketplace, 'RentalOfferCreated')
                  .withArgs(
                    rentalOffer.nonce,
                    rentalOffer.tokenAddress,
                    rentalOffer.tokenId,
                    rentalOffer.tokenAmount,
                    1,
                    rentalOffer.lender,
                    rentalOffer.borrower,
                    rentalOffer.feeTokenAddress,
                    rentalOffer.feeAmountPerSecond,
                    rentalOffer.deadline,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.emit(mockERC1155, 'TransferSingle')
                  .withArgs(rolesRegistry.address, lender.address, rolesRegistry.address, tokenId, tokenAmount)
                  .to.emit(rolesRegistry, 'TokensCommitted')
                  .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
              })
              it('Should NOT create a rental offer if caller is not the lender', async () => {
                await expect(marketplace.connect(notOperator).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Sender and Lender mismatch',
                )
              })
              it("Should NOT create a rental offer if lender is not the caller's address", async () => {
                rentalOffer.lender = creator.address
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Sender and Lender mismatch',
                )
              })
              it("Should NOT create a rental offer if roles and rolesData don't have the same length", async () => {
                rentalOffer.roles = [`0x${randomBytes(32).toString('hex')}`]
                rentalOffer.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: roles and rolesData should have the same length',
                )
              })
              it('Should NOT create a rental offer if deadline is greater than maxDeadline', async () => {
                rentalOffer.deadline = maxDeadline + 1
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Invalid deadline',
                )
              })
              it("Should NOT create a rental offer if deadline is less than block's timestamp", async () => {
                rentalOffer.deadline = (await ethers.provider.getBlock('latest')).timestamp - 1
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Invalid deadline',
                )
              })
              it('Should NOT create the same rental offer twice', async () => {
                await marketplace.connect(lender).createRentalOffer(rentalOffer)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: nonce already used',
                )
              })
              it('Should NOT create a rental offer if roles or rolesData are empty', async () => {
                rentalOffer.roles = []
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: roles should not be empty',
                )
              })
              it('Should NOT create a rental offer if nonce is 0', async () => {
                rentalOffer.nonce = '0'
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Nonce cannot be 0',
                )
              })
              it('Should NOT create a rental offer if tokenAmount is 0', async () => {
                rentalOffer.tokenAmount = BigNumber.from(0)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: tokenAmount should be greater than 0',
                )
              })
              it('Should NOT create a rental offer with the same commitmentId is in an active rental offer', async () => {
                await marketplace.connect(lender).createRentalOffer(rentalOffer)

                rentalOffer.commitmentId = BigNumber.from(1)
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: commitmentId is in an active rental offer',
                )
              })
              it("Should NOT create a rental offer if SFT address isn't trusted", async () => {
                rentalOffer.tokenAddress = AddressZero
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: tokenAddress is not trusted',
                )
              })
              it("Should NOT create a rental offer if fee token address isn't trusted", async () => {
                rentalOffer.feeTokenAddress = AddressZero
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: tokenAddress is not trusted',
                )
              })
              it('Should NOT create a rental offer if contract is paused', async () => {
                await marketplace.connect(operator).pause()
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'Pausable: paused',
                )
              })
              it('Should NOT create a rental offer if offer is public and feeAmountPerSecond is 0', async function () {
                rentalOffer.feeAmountPerSecond = BigNumber.from(0)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: feeAmountPerSecond should be greater than 0',
                )
              })
              it("Should NOT create a rental offer if lender doesn't have enough balance", async () => {
                const balance = await mockERC1155.balanceOf(lender.address, tokenId)
                await mockERC1155
                  .connect(lender)
                  .safeTransferFrom(lender.address, creator.address, tokenId, balance, '0x')
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: caller does not have enough balance for the token',
                )
              })
            })

            describe('When commitmentId exists and rental offer deadline expired', async () => {
              beforeEach(async () => {
                await marketplace.connect(lender).createRentalOffer(rentalOffer)
                await time.increase(ONE_DAY)
                rentalOffer.commitmentId = BigNumber.from(1)
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                rentalOffer.deadline = (await time.latest()) + ONE_DAY
              })
              it("Should create a rental offer if commitmentId already exists and it's not associated with an active rental offer", async () => {
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                  .to.emit(marketplace, 'RentalOfferCreated')
                  .withArgs(
                    rentalOffer.nonce,
                    rentalOffer.tokenAddress,
                    rentalOffer.tokenId,
                    rentalOffer.tokenAmount,
                    rentalOffer.commitmentId,
                    rentalOffer.lender,
                    rentalOffer.borrower,
                    rentalOffer.feeTokenAddress,
                    rentalOffer.feeAmountPerSecond,
                    rentalOffer.deadline,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.not.emit(rolesRegistry, 'TokensCommitted')
                  .to.not.emit(mockERC1155, 'TransferSingle')
              })
              it("Should NOT create a rental offer if commitmentId grantor and offer lender's address are different", async () => {
                await mockERC1155.mint(creator.address, tokenId, tokenAmount, '0x')
                await mockERC1155.connect(creator).setApprovalForAll(rolesRegistry.address, true)
                await rolesRegistry
                  .connect(creator)
                  .commitTokens(creator.address, rentalOffer.tokenAddress, rentalOffer.tokenId, rentalOffer.tokenAmount)
                rentalOffer.commitmentId = BigNumber.from(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: expected grantor does not match the grantor of the commitmentId',
                )
              })
              it('Should NOT create a rental offer if commitmentId token address and offer token address are different', async () => {
                const AnotherMockERC1155 = await ethers.getContractFactory('MockERC1155')
                const anotherMockERC1155 = await AnotherMockERC1155.deploy()
                await anotherMockERC1155.deployed()
                await anotherMockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
                await anotherMockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
                await marketplaceRoyalties.connect(operator).setTrustedNftTokens([anotherMockERC1155.address], [true])
                await rolesRegistry
                  .connect(lender)
                  .commitTokens(lender.address, anotherMockERC1155.address, tokenId, tokenAmount)

                rentalOffer.tokenAddress = anotherMockERC1155.address
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress",
                )
              })
              it('Should NOT create a rental offer if commitmentId token id and offer token id are different', async () => {
                const newTokenId = 2
                await mockERC1155.mint(lender.address, newTokenId, rentalOffer.tokenAmount, '0x')
                await mockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
                await rolesRegistry
                  .connect(lender)
                  .commitTokens(lender.address, rentalOffer.tokenAddress, newTokenId, rentalOffer.tokenAmount)
                rentalOffer.commitmentId = BigNumber.from(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenId provided does not match commitment's tokenId",
                )
              })
              it('Should NOT create a rental offer if commitmentId token amount and offer token amount are different', async () => {
                rentalOffer.commitmentId = BigNumber.from(2)
                rentalOffer.tokenAmount = BigNumber.from(3)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenAmount provided does not match commitment's tokenAmount",
                )
              })
            })
          })
        })

        describe('When Rental Offer is created', async () => {
          let totalFeeAmount: BigNumber
          beforeEach(async () => {
            totalFeeAmount = rentalOffer.feeAmountPerSecond.mul(duration)
            await marketplace.connect(lender).createRentalOffer(rentalOffer)
            rentalOffer.commitmentId = BigNumber.from(1)
            await mockERC20.mint(borrower.address, totalFeeAmount)
            await mockERC20.connect(borrower).approve(marketplace.address, totalFeeAmount)
          })
          describe('Accept Rental Offer', async () => {
            it('Should accept a public rental offer', async () => {
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a private rental offer', async () => {
              rentalOffer.borrower = borrower.address
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigNumber.from(0) })
              rentalOffer.commitmentId = BigNumber.from(2)

              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer if token has a different registry', async () => {
              await marketplaceRoyalties.connect(operator).setRolesRegistry(mockERC1155.address, rolesRegistry.address)
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const expirationDate = blockTimestamp + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer more than once', async () => {
              const rentalExpirationDate1 = (await ethers.provider.getBlock('latest')).timestamp + duration + 1

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, rentalExpirationDate1)

              await ethers.provider.send('evm_increaseTime', [duration + 1])
              await mockERC20.mint(borrower.address, totalFeeAmount)
              await mockERC20.connect(borrower).approve(marketplace.address, totalFeeAmount)

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, rentalExpirationDate1 + duration + 3)
            })
            it('Should accept a rental offer by anyone if borrower is the zero address', async () => {
              rentalOffer.borrower = ethers.constants.AddressZero
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigNumber.from(0) })
              rentalOffer.commitmentId = BigNumber.from(2)

              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              await mockERC20.mint(notOperator.address, totalFeeAmount)
              await mockERC20.connect(notOperator).approve(marketplace.address, totalFeeAmount)
              await expect(marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, notOperator.address, blockTimestamp + duration + 3)
            })
            it('Should NOT accept a rental offer if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'Pausable: paused',
              )
            })
            it('Should NOT accept a rental offer if caller is not the borrower', async () => {
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.borrower = borrower.address
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigNumber.from(0) })
              rentalOffer.commitmentId = BigNumber.from(2)
              await mockERC20.mint(notOperator.address, totalFeeAmount)
              await expect(
                marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration),
              ).to.be.revertedWith('OriumSftMarketplace: Sender is not allowed to rent this SFT')
            })
            it('Should NOT accept a rental offer if offer is expired', async () => {
              // move foward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const timeToMove = rentalOffer.deadline - blockTimestamp + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumSftMarketplace: expiration date is greater than offer deadline',
              )
            })
            it('Should NOT accept a rental offer if offer is not created', async () => {
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                'OriumSftMarketplace: Offer not created',
              )
            })
            it('Should NOT accept a rental offer if expiration date is higher than offer deadline', async () => {
              const maxDuration = rentalOffer.deadline - (await ethers.provider.getBlock('latest')).timestamp + 1
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, maxDuration),
              ).to.be.revertedWith('OriumSftMarketplace: expiration date is greater than offer deadline')
            })
            it('Should NOT accept a rental offer if expiration date is less than block timestamp', async () => {
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, 0)).to.be.revertedWith(
                'SftRolesRegistry: expiration date must be in the future',
              )
            })
            describe('Fees', async function () {
              const feeAmountPerSecond = toWei('1')
              const feeAmount = feeAmountPerSecond.mul(duration)

              beforeEach(async () => {
                rentalOffer.feeAmountPerSecond = feeAmountPerSecond
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigNumber.from(0) })
                rentalOffer.commitmentId = BigNumber.from(2)
                await mockERC20.mint(borrower.address, feeAmount.mul(2))
                await mockERC20.connect(borrower).approve(marketplace.address, feeAmount.mul(2))
              })

              it('Should accept a rental offer with fee', async () => {
                const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
                const expirationDate = blockTimestamp + duration + 1
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                  .to.emit(marketplace, 'RentalStarted')
                  .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
                  .to.emit(mockERC20, 'Transfer')
              })
              it('Should accept a rental offer if marketplace fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(operator)
                  .setMarketplaceFeeForCollection(mockERC1155.address, 0, true)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should accept a rental offer if royalty fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(creator)
                  .setRoyaltyInfo(creator.address, mockERC1155.address, '0', creatorTreasury.address)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should NOT accept a rental offer if marketplace fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 0)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumSftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if royalty fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 1)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumSftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer if lender fee transfer fails', async () => {
                await mockERC20.transferReverts(true, 2)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumSftMarketplace: Transfer failed',
                )
              })
              it('Should NOT accept a rental offer twice', async () => {
                await marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.be.revertedWith(
                  'OriumSftMarketplace: This offer has an ongoing rental',
                )
              })
            })
          })

          describe('Cancel Rental Offer', async () => {
            it('Should cancel a rental offer and releaseTokens from rolesRegistry', async () => {
              await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.lender, rentalOffer.nonce)
                .to.emit(rolesRegistry, 'TokensReleased')
                .withArgs(rentalOffer.commitmentId)
            })
            it('Should cancel a rental offer if tokens was released before directly from registry', async () => {
              await rolesRegistry.connect(lender).releaseTokens(rentalOffer.commitmentId)
              await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.lender, rentalOffer.nonce)
            })
            it('Should NOT cancel a rental offer if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(marketplace.connect(borrower).cancelRentalOffer(rentalOffer)).to.be.revertedWith(
                'Pausable: paused',
              )
            })
            it('Should NOT cancel a rental offer if nonce not used yet by caller', async () => {
              await expect(marketplace.connect(notOperator).cancelRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Only lender can cancel a rental offer',
              )
            })
            it("Should NOT cancel a rental offer after deadline's expiration", async () => {
              // move forward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
              const timeToMove = rentalOffer.deadline - blockTimestamp + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Nonce expired or not used yet',
              )
            })
            it("Should NOT cancel a rental offer if it's not created", async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .cancelRentalOffer({ ...rentalOffer, nonce: `0x${randomBytes(32).toString('hex')}` }),
              ).to.be.revertedWith('OriumSftMarketplace: Offer not created')
            })
          })

          describe('Batch Release Tokens', async () => {
            it('Should release tokens from rolesRegistry', async () => {
              await time.increase(ONE_DAY)
              await expect(
                marketplace.connect(lender).batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
              )
                .to.emit(rolesRegistry, 'TokensReleased')
                .withArgs(rentalOffer.commitmentId)
            })
            it('Should NOT release tokens if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(
                marketplace.connect(lender).batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
              ).to.be.revertedWith('Pausable: paused')
            })
            it('Should NOT release tokens if array mismatch', async () => {
              await expect(
                marketplace.connect(lender).batchReleaseTokens([rentalOffer.tokenAddress], []),
              ).to.be.revertedWith('OriumSftMarketplace: arrays length mismatch')
            })
            it('Should NOT release tokens if sender is not the grantor', async () => {
              await expect(
                marketplace
                  .connect(borrower)
                  .batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
              ).to.be.revertedWith("OriumSftMarketplace: sender is not the commitment's grantor")
            })
            it('Should NOT release tokens if tokenAddress does not match commitment', async () => {
              await expect(
                marketplace.connect(lender).batchReleaseTokens([secondMockERC1155.address], [rentalOffer.commitmentId]),
              ).to.be.revertedWith(
                "OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress",
              )
            })
          })

          describe('When Rental Offer is accepted', async () => {
            beforeEach(async () => {
              await marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)
              await rolesRegistry
                .connect(borrower)
                .setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
            })
            describe('End Rental', async () => {
              it('Should end a rental by the borrower', async () => {
                await expect(marketplace.connect(borrower).endRental(rentalOffer))
                  .to.emit(marketplace, 'RentalEnded')
                  .withArgs(rentalOffer.lender, rentalOffer.nonce)
              })
              it('Should NOT end a rental if contract is paused', async () => {
                await marketplace.connect(operator).pause()
                await expect(marketplace.connect(lender).endRental(rentalOffer)).to.be.revertedWith('Pausable: paused')
              })
              it('Should NOT end a rental by the lender', async () => {
                await expect(marketplace.connect(lender).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Only borrower can end a rental',
                )
              })
              it('Should NOT end a rental if caller is not the borrower', async () => {
                await expect(marketplace.connect(notOperator).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: Only borrower can end a rental',
                )
              })
              it('Should NOT end a rental if rental is not started', async () => {
                await expect(
                  marketplace
                    .connect(borrower)
                    .endRental({ ...rentalOffer, nonce: `0x${randomBytes(32).toString('hex')}` }),
                ).to.be.revertedWith('OriumSftMarketplace: Offer not created')
              })
              it('Should NOT end a rental if rental is expired', async () => {
                // move foward in time to expire the offer
                const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp
                const timeToMove = rentalOffer.deadline - blockTimestamp + 1
                await ethers.provider.send('evm_increaseTime', [timeToMove])

                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: There are no active Rentals',
                )
              })
              it('Should NOT end a rental if the role was revoked by borrower directly in registry', async () => {
                await rolesRegistry
                  .connect(borrower)
                  .setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
                await rolesRegistry
                  .connect(borrower)
                  .revokeRole(rentalOffer.commitmentId, rentalOffer.roles[0], borrower.address)
                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'SftRolesRegistry: grantee mismatch',
                )
              })
              it('Should NOT end rental twice', async () => {
                await marketplace.connect(borrower).endRental(rentalOffer)
                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: There are no active Rentals',
                )
              })
            })

            describe('Cancel Rental Offer', async function () {
              it('Should cancel a rental offer if it has an active rental but NOT releaseTokens from rolesRegistry', async () => {
                await expect(marketplace.connect(lender).cancelRentalOffer(rentalOffer))
                  .to.emit(marketplace, 'RentalOfferCancelled')
                  .withArgs(rentalOffer.lender, rentalOffer.nonce)
                  .to.not.emit(rolesRegistry, 'TokensReleased')
              })
            })

            describe('Batch Release Tokens', async () => {
              it('Should release tokens after rental is ended and rental offer expired', async () => {
                await marketplace.connect(borrower).endRental(rentalOffer)
                await time.increase(ONE_DAY)
                await expect(
                  marketplace
                    .connect(lender)
                    .batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
                )
                  .to.emit(rolesRegistry, 'TokensReleased')
                  .withArgs(rentalOffer.commitmentId)
              })
              it('Should NOT release tokens if rental is active', async function () {
                await expect(
                  marketplace
                    .connect(lender)
                    .batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
                ).to.be.revertedWith('SftRolesRegistry: commitment has an active non-revocable role')
              })
            })
          })
        })
      })

      describe('Direct Rentals', async () => {
        describe('When tokens are not committed', async () => {
          describe('batchCommitTokensAndGrantRole', async () => {
            let commitAndGrantRoleParams: CommitAndGrantRoleParams[]
            beforeEach(async () => {
              commitAndGrantRoleParams = [
                {
                  commitmentId: BigNumber.from(0),
                  tokenAddress: mockERC1155.address,
                  tokenId,
                  tokenAmount,
                  role: UNIQUE_ROLE,
                  grantee: borrower.address,
                  expirationDate: (await ethers.provider.getBlock('latest')).timestamp + ONE_DAY,
                  revocable: true,
                  data: EMPTY_BYTES,
                },
              ]
              await rolesRegistry.connect(lender).setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
              await mockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
            })
            it('Should commit tokens and grant role', async () => {
              await expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))
                .to.emit(rolesRegistry, 'TokensCommitted')
                .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
                .to.emit(rolesRegistry, 'RoleGranted')
                .withArgs(
                  1,
                  commitAndGrantRoleParams[0].role,
                  commitAndGrantRoleParams[0].grantee,
                  commitAndGrantRoleParams[0].expirationDate,
                  commitAndGrantRoleParams[0].revocable,
                  commitAndGrantRoleParams[0].data,
                )
            })
            it('Should only grant role when a commitmentId is passed', async () => {
              commitAndGrantRoleParams[0].commitmentId = BigNumber.from(1)
              await rolesRegistry
                .connect(lender)
                .commitTokens(lender.address, mockERC1155.address, tokenId, tokenAmount)
              await expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))
                .to.emit(rolesRegistry, 'RoleGranted')
                .withArgs(
                  1,
                  commitAndGrantRoleParams[0].role,
                  commitAndGrantRoleParams[0].grantee,
                  commitAndGrantRoleParams[0].expirationDate,
                  commitAndGrantRoleParams[0].revocable,
                  commitAndGrantRoleParams[0].data,
                )
            })
            it('Should NOT commit tokens and grant role if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.be.revertedWith('Pausable: paused')
            })
            it('Should NOT commit tokens and grant role if caller is not the grantor of the commitmentId', async () => {
              commitAndGrantRoleParams[0].commitmentId = BigNumber.from(1)
              await rolesRegistry
                .connect(lender)
                .commitTokens(lender.address, mockERC1155.address, tokenId, tokenAmount)
              await expect(
                marketplace.connect(borrower).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith('OriumSftMarketplace: expected grantor does not match the grantor of the commitmentId')
            })
            it('Should NOT commit tokens and grant role if tokenAddress does not match the commitment', async () => {
              commitAndGrantRoleParams[0].commitmentId = BigNumber.from(1)
              commitAndGrantRoleParams[0].tokenAddress = AddressZero
              await rolesRegistry
                .connect(lender)
                .commitTokens(lender.address, mockERC1155.address, tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress")
            })
            it('Should NOT commit tokens and grant role if tokenId does not match the commitment', async () => {
              commitAndGrantRoleParams[0].commitmentId = BigNumber.from(1)
              commitAndGrantRoleParams[0].tokenId = 0
              await rolesRegistry
                .connect(lender)
                .commitTokens(lender.address, mockERC1155.address, tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenId provided does not match commitment's tokenId")
            })
            it('Should NOT commit tokens and grant role if tokenAmount does not match the commitment', async () => {
              commitAndGrantRoleParams[0].commitmentId = BigNumber.from(1)
              commitAndGrantRoleParams[0].tokenAmount = BigNumber.from(0)
              await rolesRegistry
                .connect(lender)
                .commitTokens(lender.address, mockERC1155.address, tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenAmount provided does not match commitment's tokenAmount")
            })
          })
        })

        describe('When tokens are committed', async () => {
          let commitAndGrantRoleParams: CommitAndGrantRoleParams[]
          beforeEach(async () => {
            commitAndGrantRoleParams = [
              {
                commitmentId: BigNumber.from(0),
                tokenAddress: mockERC1155.address,
                tokenId,
                tokenAmount,
                role: UNIQUE_ROLE,
                grantee: borrower.address,
                expirationDate: (await ethers.provider.getBlock('latest')).timestamp + ONE_DAY,
                revocable: true,
                data: EMPTY_BYTES,
              },
            ]
            await rolesRegistry.connect(lender).setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
            await mockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
            await marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams)
          })
          describe('batchRevokeRole', async () => {
            it('Should batch revoke role', async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              )
                .to.emit(rolesRegistry, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it('Should NOT batch revoke role if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              ).to.be.revertedWith('Pausable: paused')
            })
            it("Should NOT batch revoke role if array's length are different", async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE, UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              ).to.be.revertedWith('OriumSftMarketplace: arrays length mismatch')
            })
            it("Should batch revoke role if sender is commitment's grantee", async () => {
              await expect(
                marketplace
                  .connect(borrower)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              )
                .to.emit(rolesRegistry, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it("Should NOT batch revoke role if sender is not commitment's grantor neither grantee", async () => {
              await expect(
                marketplace
                  .connect(notOperator)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              ).to.be.revertedWith("OriumSftMarketplace: sender is not the commitment's grantor")
            })
            it('Should NOT batch revoke role if tokenAddress does not match commitment', async () => {
              await expect(
                marketplace.connect(lender).batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [AddressZero]),
              ).to.be.revertedWith(
                "OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress",
              )
            })
            it('Should NOT batch revoke role if role is not revocable', async () => {
              await rolesRegistry
                .connect(lender)
                .grantRole(
                  1,
                  UNIQUE_ROLE,
                  borrower.address,
                  (await ethers.provider.getBlock('latest')).timestamp + ONE_DAY,
                  false,
                  EMPTY_BYTES,
                )
              await rolesRegistry
                .connect(borrower)
                .setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [mockERC1155.address]),
              ).to.be.revertedWith('OriumSftMarketplace: role is not revocable')
            })
          })
        })
      })
    })
    describe('Core Functions', async () => {
      describe('Initialize', async () => {
        it("Should NOT initialize the contract if it's already initialized", async () => {
          await expect(marketplace.initialize(operator.address, ethers.constants.AddressZero)).to.be.revertedWith(
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

      describe('OriumMarketplaceRoyalties', async function () {
        it('Should set the marketplace royalties contract', async function () {
          await marketplace.connect(operator).setOriumMarketplaceRoyalties(marketplaceRoyalties.address)
          expect(await marketplace.oriumMarketplaceRoyalties()).to.be.equal(marketplaceRoyalties.address)
        })
        it("Should NOT set the marketplace royalties contract if caller isn't the operator", async function () {
          await expect(marketplace.connect(notOperator).setOriumMarketplaceRoyalties(marketplaceRoyalties.address)).to
            .be.reverted
        })
      })
    })
  })
})
