// SPDX-License-Identifier: CC0-1.0

import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { deploySftMarketplaceContracts } from './fixtures/OriumSftMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { CommitAndGrantRoleParams, RoyaltyInfo, SftRentalOffer } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY, ONE_HOUR, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { UNIQUE_ROLE } from '../utils/roles'
import {
  MockERC1155,
  MockERC20,
  OriumMarketplaceRoyalties,
  OriumSftMarketplace,
  SftRolesRegistrySingleRole,
  SftRolesRegistrySingleRoleLegacy,
  ReentrancyAttack,
} from '../typechain-types'

describe('OriumSftMarketplace', () => {
  let marketplace: OriumSftMarketplace
  let marketplaceRoyalties: OriumMarketplaceRoyalties
  let rolesRegistry: SftRolesRegistrySingleRole
  let SftRolesRegistrySingleRoleLegacy: SftRolesRegistrySingleRoleLegacy
  let mockERC1155: MockERC1155
  let secondMockERC1155: MockERC1155
  let wearableToken: MockERC1155
  let mockERC20: MockERC20
  let attackContract: ReentrancyAttack

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

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20, secondMockERC1155, wearableToken, SftRolesRegistrySingleRoleLegacy] = await loadFixture(deploySftMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      const duration = ONE_HOUR
      const tokenId = 1
      const tokenAmount = BigInt(2)
      const wearableAddress = '0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f'

      beforeEach(async () => {
        await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
        await secondMockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
        await marketplaceRoyalties
          .connect(operator)
          .setTrustedFeeTokenForToken(
            [await mockERC1155.getAddress(), await secondMockERC1155.getAddress(), wearableAddress],
            [await mockERC20.getAddress(), await mockERC20.getAddress(), await mockERC20.getAddress()],
            [true, true, true],
          )
        await marketplaceRoyalties
          .connect(operator)
          .setRolesRegistry(await secondMockERC1155.getAddress(), await rolesRegistry.getAddress())

        // Manually set its address to wearableAddress by redeploying the contract at that address
        await ethers.provider.send('hardhat_setCode', [
          wearableAddress,
          await ethers.provider.getCode(wearableToken.getAddress()),
        ])

        wearableToken = await ethers.getContractAt('MockERC1155', wearableAddress)

        await wearableToken.mint(lender.address, tokenId, tokenAmount, '0x')
        await wearableToken.connect(lender).setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
      })

      describe('Rental Offers', async () => {
        let rentalOffer: SftRentalOffer

        beforeEach(async () => {
          await marketplaceRoyalties
            .connect(operator)
            .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), 0, AddressZero)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplaceRoyalties
            .connect(creator)
            .setRoyaltyInfo(
              creator.address,
              await mockERC1155.getAddress(),
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )

          const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            commitmentId: BigInt(0),
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: await mockERC1155.getAddress(),
            tokenId,
            tokenAmount,
            feeTokenAddress: await mockERC20.getAddress(),
            feeAmountPerSecond: toWei('0.0000001'),
            deadline: Number(blockTimestamp) + ONE_DAY,
            minDuration: 1,
            roles: [UNIQUE_ROLE],
            rolesData: [EMPTY_BYTES],
          }

          await rolesRegistry.setTokenAddressAllowed(rentalOffer.tokenAddress, true)

          await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
          await rolesRegistry
            .connect(lender)
            .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
          await mockERC1155.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)

          await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
            await wearableToken.getAddress(),
            await marketplace.getAddress(),
            true,
          )
          await wearableToken
            .connect(lender)
            .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
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
                    rentalOffer.minDuration,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.emit(mockERC1155, 'TransferSingle')
                  .withArgs(
                    await rolesRegistry.getAddress(),
                    lender.address,
                    await rolesRegistry.getAddress(),
                    tokenId,
                    tokenAmount,
                  )
                  .to.emit(rolesRegistry, 'TokensLocked')
                  .withArgs(lender.address, 1, await mockERC1155.getAddress(), tokenId, tokenAmount)
              })
              it('Should create a rental offer if collection has a custom roles registry', async function () {
                await marketplaceRoyalties
                  .connect(operator)
                  .setRolesRegistry(await mockERC1155.getAddress(), await rolesRegistry.getAddress())
                await mockERC1155.setApprovalForAll(await rolesRegistry.getAddress(), true)
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
                    rentalOffer.minDuration,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.emit(mockERC1155, 'TransferSingle')
                  .withArgs(
                    await rolesRegistry.getAddress(),
                    lender.address,
                    await rolesRegistry.getAddress(),
                    tokenId,
                    tokenAmount,
                  )
                  .to.emit(rolesRegistry, 'TokensLocked')
                  .withArgs(lender.address, 1, await mockERC1155.getAddress(), tokenId, tokenAmount)
              })
              it('Should use IERC7589Legacy if tokenAddress matches wearableAddress', async () => {
                await marketplaceRoyalties
                  .connect(operator)
                  .setRolesRegistry(
                    await wearableToken.getAddress(),
                    await SftRolesRegistrySingleRoleLegacy.getAddress(),
                  )
                await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

                const rentalOfferLegacy = {
                  nonce: `0x${randomBytes(32).toString('hex')}`,
                  commitmentId: BigInt(0),
                  lender: lender.address,
                  borrower: AddressZero,
                  tokenAddress: wearableAddress,
                  tokenId,
                  tokenAmount,
                  feeTokenAddress: await mockERC20.getAddress(),
                  feeAmountPerSecond: toWei('0.0000001'),
                  deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  minDuration: 1,
                  roles: [UNIQUE_ROLE],
                  rolesData: [EMPTY_BYTES],
                }

                await expect(marketplace.connect(lender).createRentalOffer(rentalOfferLegacy))
                  .to.emit(marketplace, 'RentalOfferCreated')
                  .withArgs(
                    rentalOfferLegacy.nonce,
                    rentalOfferLegacy.tokenAddress,
                    rentalOfferLegacy.tokenId,
                    rentalOfferLegacy.tokenAmount,
                    1,
                    rentalOfferLegacy.lender,
                    rentalOfferLegacy.borrower,
                    rentalOfferLegacy.feeTokenAddress,
                    rentalOfferLegacy.feeAmountPerSecond,
                    rentalOfferLegacy.deadline,
                    rentalOfferLegacy.minDuration,
                    rentalOfferLegacy.roles,
                    rentalOfferLegacy.rolesData,
                  )
                  .to.emit(wearableToken, 'TransferSingle')
                  .withArgs(
                    await SftRolesRegistrySingleRoleLegacy.getAddress(),
                    lender.address,
                    await SftRolesRegistrySingleRoleLegacy.getAddress(),
                    tokenId,
                    tokenAmount,
                  )
                  .to.emit(SftRolesRegistrySingleRoleLegacy, 'TokensCommitted')
                  .withArgs(lender.address, 1, wearableToken.getAddress(), tokenId, tokenAmount)
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
                rentalOffer.deadline = Number((await ethers.provider.getBlock('latest'))?.timestamp) - 1
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
                rentalOffer.tokenAmount = BigInt(0)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: tokenAmount should be greater than 0',
                )
              })
              it('Should NOT create a rental offer with the same commitmentId is in an active rental offer', async () => {
                await marketplace.connect(lender).createRentalOffer(rentalOffer)

                rentalOffer.commitmentId = BigInt(1)
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
                rentalOffer.feeAmountPerSecond = BigInt(0)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: feeAmountPerSecond should be greater than 0',
                )
              })
              it('Should NOT create a rental offer if minDuration is invalid', async function () {
                rentalOffer.minDuration = Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY * 2
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: minDuration is invalid',
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
                rentalOffer.commitmentId = BigInt(1)
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
                    rentalOffer.minDuration,
                    rentalOffer.roles,
                    rentalOffer.rolesData,
                  )
                  .to.not.emit(rolesRegistry, 'TokensLocked')
                  .to.not.emit(mockERC1155, 'TransferSingle')
              })
              it("Should NOT create a rental offer if commitmentId grantor and offer lender's address are different", async () => {
                await mockERC1155.mint(creator.address, tokenId, tokenAmount, '0x')
                await mockERC1155.connect(creator).setApprovalForAll(await rolesRegistry.getAddress(), true)
                await rolesRegistry
                  .connect(creator)
                  .lockTokens(creator.address, rentalOffer.tokenAddress, rentalOffer.tokenId, rentalOffer.tokenAmount)
                rentalOffer.commitmentId = BigInt(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: expected grantor does not match the grantor of the commitmentId',
                )
              })
              it("Should NOT create a LEGACY rental offer if commitmentId grantor and offer lender's address are different", async () => {
                await marketplaceRoyalties
                  .connect(operator)
                  .setRolesRegistry(
                    await wearableToken.getAddress(),
                    await SftRolesRegistrySingleRoleLegacy.getAddress(),
                  )

                await wearableToken.mint(creator.address, tokenId, tokenAmount, '0x')
                await wearableToken
                  .connect(creator)
                  .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

                const rentalOfferLegacy = {
                  nonce: `0x${randomBytes(32).toString('hex')}`,
                  commitmentId: BigInt(0),
                  lender: lender.address,
                  borrower: AddressZero,
                  tokenAddress: wearableAddress,
                  tokenId,
                  tokenAmount,
                  feeTokenAddress: await mockERC20.getAddress(),
                  feeAmountPerSecond: toWei('0.0000001'),
                  deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  minDuration: 1,
                  roles: [UNIQUE_ROLE],
                  rolesData: [EMPTY_BYTES],
                }
                await SftRolesRegistrySingleRoleLegacy.connect(creator).commitTokens(
                  creator.address,
                  rentalOfferLegacy.tokenAddress,
                  rentalOfferLegacy.tokenId,
                  rentalOfferLegacy.tokenAmount,
                )
                rentalOfferLegacy.commitmentId = BigInt(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOfferLegacy)).to.be.revertedWith(
                  'OriumSftMarketplace: expected grantor does not match the grantor of the commitmentId',
                )
              })
              it('Should NOT create a rental offer if commitmentId token address and offer token address are different', async () => {
                const AnotherMockERC1155 = await ethers.getContractFactory('MockERC1155')
                const anotherMockERC1155 = await AnotherMockERC1155.deploy()
                await anotherMockERC1155.waitForDeployment()
                const marketplaceaddress = await anotherMockERC1155.getAddress()
                await rolesRegistry.setTokenAddressAllowed(marketplaceaddress, true)

                await anotherMockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
                await anotherMockERC1155.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)
                await marketplaceRoyalties
                  .connect(operator)
                  .setTrustedFeeTokenForToken(
                    [await anotherMockERC1155.getAddress()],
                    [await mockERC20.getAddress()],
                    [true],
                  )
                await rolesRegistry
                  .connect(lender)
                  .lockTokens(lender.address, await anotherMockERC1155.getAddress(), tokenId, tokenAmount)

                rentalOffer.tokenAddress = await anotherMockERC1155.getAddress()
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress",
                )
              })
              it('Should NOT create a rental offer if commitmentId token id and offer token id are different', async () => {
                const newTokenId = 2
                await mockERC1155.mint(lender.address, newTokenId, rentalOffer.tokenAmount, '0x')
                await mockERC1155.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)
                await rolesRegistry
                  .connect(lender)
                  .lockTokens(lender.address, rentalOffer.tokenAddress, newTokenId, rentalOffer.tokenAmount)
                rentalOffer.commitmentId = BigInt(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenId provided does not match commitment's tokenId",
                )
              })
              it('Should NOT create a LEGACY rental offer if commitmentId token id and offer token id are different', async () => {
                const rentalOfferLegacy = {
                  nonce: `0x${randomBytes(32).toString('hex')}`,
                  commitmentId: BigInt(0),
                  lender: lender.address,
                  borrower: AddressZero,
                  tokenAddress: wearableAddress,
                  tokenId,
                  tokenAmount,
                  feeTokenAddress: await mockERC20.getAddress(),
                  feeAmountPerSecond: toWei('0.0000001'),
                  deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  minDuration: 1,
                  roles: [UNIQUE_ROLE],
                  rolesData: [EMPTY_BYTES],
                }

                await marketplaceRoyalties
                  .connect(operator)
                  .setRolesRegistry(
                    await wearableToken.getAddress(),
                    await SftRolesRegistrySingleRoleLegacy.getAddress(),
                  )

                const newTokenId = 2
                await wearableToken.mint(lender.address, newTokenId, rentalOfferLegacy.tokenAmount, '0x')
                await wearableToken
                  .connect(lender)
                  .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
                await SftRolesRegistrySingleRoleLegacy.connect(lender).commitTokens(
                  lender.address,
                  rentalOfferLegacy.tokenAddress,
                  newTokenId,
                  rentalOfferLegacy.tokenAmount,
                )

                rentalOfferLegacy.commitmentId = BigInt(1)
                rentalOfferLegacy.nonce = `0x${randomBytes(32).toString('hex')}`
                rentalOfferLegacy.deadline = (await time.latest()) + ONE_DAY

                rentalOffer.commitmentId = BigInt(2)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOfferLegacy)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenId provided does not match commitment's tokenId",
                )
              })
              it('Should NOT create a rental offer if commitmentId token amount and offer token amount are different', async () => {
                rentalOffer.commitmentId = BigInt(2)
                rentalOffer.tokenAmount = BigInt(3)
                await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                  "OriumSftMarketplace: tokenAmount provided does not match commitment's tokenAmount",
                )
              })
            })
          })
        })
        describe('When Rental Offer is created', async () => {
          let totalFeeAmount: bigint
          beforeEach(async () => {
            totalFeeAmount = rentalOffer.feeAmountPerSecond * BigInt(duration)
            await marketplace.connect(lender).createRentalOffer(rentalOffer)
            rentalOffer.commitmentId = BigInt(1)
            await mockERC20.mint(borrower.address, totalFeeAmount.toString())
            await mockERC20.connect(borrower).approve(await marketplace.getAddress(), totalFeeAmount.toString())
          })
          describe('Accept Rental Offer', async () => {
            it('Should accept a public rental offer', async () => {
              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should create a rental offer with feeAmountPerSecond equal to 0 if offer is private', async function () {
              rentalOffer.feeAmountPerSecond = BigInt(0)
              rentalOffer.borrower = borrower.address
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a private rental offer', async () => {
              rentalOffer.borrower = borrower.address
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer if token has a different registry', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await mockERC1155.getAddress(), await rolesRegistry.getAddress())
              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const expirationDate = Number(blockTimestamp) + duration + 1
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })
            it('Should accept a rental offer more than once', async () => {
              const rentalExpirationDate1 = Number((await ethers.provider.getBlock('latest'))?.timestamp) + duration + 1

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
              rentalOffer.borrower = ethers.ZeroAddress
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              const blockTimestamp = Number((await ethers.provider.getBlock('latest'))?.timestamp)
              await mockERC20.mint(notOperator.address, totalFeeAmount.toString())
              await mockERC20.connect(notOperator).approve(await marketplace.getAddress(), totalFeeAmount.toString())
              await expect(marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration))
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, notOperator.address, blockTimestamp + duration + 3)
            })
            it('Should accept a rental offer if duration is greater or equal minDuration', async () => {
              rentalOffer.minDuration = duration / 2
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)
              await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                marketplace,
                'RentalStarted',
              )
            })
            it('Should NOT accept a rental offer if duration is less than minDuration', async () => {
              rentalOffer.minDuration = duration
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration / 2),
              ).to.be.revertedWith('OriumSftMarketplace: Duration is less than the offer minimum duration')
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
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)
              await mockERC20.mint(notOperator.address, totalFeeAmount.toString())
              await expect(
                marketplace.connect(notOperator).acceptRentalOffer(rentalOffer, duration),
              ).to.be.revertedWith('OriumSftMarketplace: Sender is not allowed to rent this SFT')
            })
            it('Should NOT accept a rental offer if offer is expired', async () => {
              // move foward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const timeToMove = rentalOffer.deadline - Number(blockTimestamp) + 1
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
              const maxDuration =
                rentalOffer.deadline - Number((await ethers.provider.getBlock('latest'))?.timestamp) + 1
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, maxDuration),
              ).to.be.revertedWith('OriumSftMarketplace: expiration date is greater than offer deadline')
            })
            // New test case for accepting rental offer with native tokens
            it('Should accept a rental offer with native tokens', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setTrustedFeeTokenForToken([rentalOffer.tokenAddress], [AddressZero], [true])

              rentalOffer.feeTokenAddress = AddressZero
              rentalOffer.feeAmountPerSecond = toWei('0.0000001')
              totalFeeAmount = rentalOffer.feeAmountPerSecond * BigInt(duration)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const expirationDate = Number(blockTimestamp) + duration + 1

              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration, {
                  value: totalFeeAmount.toString(),
                }),
              )
                .to.emit(marketplace, 'RentalStarted')
                .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
            })

            it('Should revert when accepting a rental offer with insufficient native tokens', async function () {
              await marketplaceRoyalties
                .connect(operator)
                .setTrustedFeeTokenForToken([rentalOffer.tokenAddress], [AddressZero], [true])

              rentalOffer.feeTokenAddress = AddressZero
              rentalOffer.feeAmountPerSecond = toWei('0.0000001')
              const totalFeeAmount = rentalOffer.feeAmountPerSecond * BigInt(duration)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              const insufficientAmount = totalFeeAmount - BigInt(toWei('0.00000001')) // slightly less than required
              await expect(
                marketplace.connect(borrower).acceptRentalOffer(rentalOffer, BigInt(duration), {
                  value: insufficientAmount.toString(),
                }),
              ).to.be.revertedWith('OriumSftMarketplace: Insufficient native token amount')
            })

            it.only('should detect reentrancy attack during fee transfer', async () => {
              const AttackContract = await ethers.getContractFactory('ReentrancyAttack')
              attackContract = (await AttackContract.deploy(marketplace)) as ReentrancyAttack
              await attackContract.waitForDeployment()

              await marketplaceRoyalties
                .connect(operator)
                .setTrustedFeeTokenForToken([rentalOffer.tokenAddress], [AddressZero], [true])
              rentalOffer.minDuration = duration
              rentalOffer.feeTokenAddress = AddressZero
              rentalOffer.feeAmountPerSecond = toWei('0.0000001')
              const totalFeeAmount = rentalOffer.feeAmountPerSecond * BigInt(duration)

              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
              rentalOffer.commitmentId = BigInt(2)

              await attackContract.connect(lender).attack(rentalOffer, duration, {
                value: totalFeeAmount,
              })

              await expect(
                lender.sendTransaction({
                  to: attackContract.getAddress(),
                  value: toWei('1'),
                }),
              ).to.be.revertedWith('OriumSftMarketplace: This offer has an ongoing rental')
            })

            describe('Fees', async function () {
              const feeAmountPerSecond = toWei('1')
              const feeAmount = feeAmountPerSecond * BigInt(duration)

              beforeEach(async () => {
                rentalOffer.feeAmountPerSecond = feeAmountPerSecond
                rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
                await marketplace.connect(lender).createRentalOffer({ ...rentalOffer, commitmentId: BigInt(0) })
                rentalOffer.commitmentId = BigInt(2)
                await mockERC20.mint(borrower.address, feeAmount * BigInt(2))
                await mockERC20.connect(borrower).approve(await marketplace.getAddress(), feeAmount * BigInt(2))
              })

              it('Should accept a rental offer with fee', async () => {
                const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
                const expirationDate = Number(blockTimestamp) + duration + 1
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration))
                  .to.emit(marketplace, 'RentalStarted')
                  .withArgs(rentalOffer.lender, rentalOffer.nonce, borrower.address, expirationDate)
                  .to.emit(mockERC20, 'Transfer')
              })
              it('Should accept a rental offer if marketplace fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(operator)
                  .setMarketplaceFeeForCollection(await mockERC1155.getAddress(), 0, true)
                await expect(marketplace.connect(borrower).acceptRentalOffer(rentalOffer, duration)).to.emit(
                  marketplace,
                  'RentalStarted',
                )
              })
              it('Should accept a rental offer if royalty fee is 0', async () => {
                await marketplaceRoyalties
                  .connect(creator)
                  .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), '0', creatorTreasury.address)
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

          describe('Delist Rental Offer and Withdraw', async () => {
            it('Should delist a rental offer and releaseTokens from rolesRegistry', async () => {
              await expect(marketplace.connect(lender).delistRentalOfferAndWithdraw(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.lender, rentalOffer.nonce)
                .to.emit(rolesRegistry, 'TokensUnlocked')
                .withArgs(rentalOffer.commitmentId)
            })
            it('Should delist a LEGACY rental offer and releaseTokens from rolesRegistry', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              const rentalOfferLegacy = {
                nonce: `0x${randomBytes(32).toString('hex')}`,
                commitmentId: BigInt(0),
                lender: lender.address,
                borrower: AddressZero,
                tokenAddress: wearableAddress,
                tokenId,
                tokenAmount,
                feeTokenAddress: await mockERC20.getAddress(),
                feeAmountPerSecond: toWei('0.0000001'),
                deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                minDuration: 1,
                roles: [UNIQUE_ROLE],
                rolesData: [EMPTY_BYTES],
              }

              totalFeeAmount = rentalOfferLegacy.feeAmountPerSecond * BigInt(duration)
              await marketplace.connect(lender).createRentalOffer(rentalOfferLegacy)
              rentalOfferLegacy.commitmentId = BigInt(1)
              await mockERC20.mint(borrower.address, totalFeeAmount.toString())
              await mockERC20.connect(borrower).approve(await marketplace.getAddress(), totalFeeAmount.toString())

              await expect(marketplace.connect(lender).delistRentalOfferAndWithdraw(rentalOfferLegacy))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOfferLegacy.lender, rentalOfferLegacy.nonce)
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'TokensReleased')
                .withArgs(rentalOfferLegacy.commitmentId)
            })
            it('Should NOT delist a rental offer if tokens was released before directly from registry', async () => {
              await rolesRegistry.connect(lender).unlockTokens(rentalOffer.commitmentId)
              await expect(marketplace.connect(lender).delistRentalOfferAndWithdraw(rentalOffer)).to.be.revertedWith(
                'ERC7589RolesRegistry: sender is not owner or approved',
              )
            })
            it('Should NOT delist a rental offer if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(marketplace.connect(borrower).delistRentalOfferAndWithdraw(rentalOffer)).to.be.revertedWith(
                'Pausable: paused',
              )
            })
            it('Should NOT delist a rental offer if nonce not used yet by caller', async () => {
              await expect(
                marketplace.connect(notOperator).delistRentalOfferAndWithdraw(rentalOffer),
              ).to.be.revertedWith('OriumSftMarketplace: Only lender can cancel a rental offer')
            })
            it("Should NOT delist a rental offer after deadline's expiration", async () => {
              // move forward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const timeToMove = rentalOffer.deadline - Number(blockTimestamp) + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(lender).delistRentalOfferAndWithdraw(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Nonce expired or not used yet',
              )
            })
            it("Should NOT delist a rental offer if it's not created", async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .delistRentalOfferAndWithdraw({ ...rentalOffer, nonce: `0x${randomBytes(32).toString('hex')}` }),
              ).to.be.revertedWith('OriumSftMarketplace: Offer not created')
            })
          })

          describe('Delist Rental Offer', async () => {
            it('Should delist a rental offer and releaseTokens from rolesRegistry', async () => {
              await expect(marketplace.connect(lender).delistRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.lender, rentalOffer.nonce)
                .to.not.emit(rolesRegistry, 'TokensUnlocked')
            })
            it('Should delist a rental offer if tokens was released before directly from registry', async () => {
              await rolesRegistry.connect(lender).unlockTokens(rentalOffer.commitmentId)
              await expect(marketplace.connect(lender).delistRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCancelled')
                .withArgs(rentalOffer.lender, rentalOffer.nonce)
            })
            it('Should NOT delist a rental offer if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(marketplace.connect(borrower).delistRentalOffer(rentalOffer)).to.be.revertedWith(
                'Pausable: paused',
              )
            })
            it('Should NOT delist a rental offer if nonce not used yet by caller', async () => {
              await expect(marketplace.connect(notOperator).delistRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Only lender can cancel a rental offer',
              )
            })
            it("Should NOT delist a rental offer after deadline's expiration", async () => {
              // move forward in time to expire the offer
              const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
              const timeToMove = rentalOffer.deadline - Number(blockTimestamp) + 1
              await ethers.provider.send('evm_increaseTime', [timeToMove])

              await expect(marketplace.connect(lender).delistRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Nonce expired or not used yet',
              )
            })
            it("Should NOT delist a rental offer if it's not created", async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .delistRentalOffer({ ...rentalOffer, nonce: `0x${randomBytes(32).toString('hex')}` }),
              ).to.be.revertedWith('OriumSftMarketplace: Offer not created')
            })
          })

          describe('Batch Release Tokens', async () => {
            it('Should release tokens from rolesRegistry', async () => {
              2
              await time.increase(ONE_DAY)
              await expect(
                marketplace.connect(lender).batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
              )
                .to.emit(rolesRegistry, 'TokensUnlocked')
                .withArgs(rentalOffer.commitmentId)
            })

            it('Should release LEGACY tokens from rolesRegistry', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              const rentalOfferLegacy = {
                nonce: `0x${randomBytes(32).toString('hex')}`,
                commitmentId: BigInt(0),
                lender: lender.address,
                borrower: AddressZero,
                tokenAddress: wearableAddress,
                tokenId,
                tokenAmount,
                feeTokenAddress: await mockERC20.getAddress(),
                feeAmountPerSecond: toWei('0.0000001'),
                deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                minDuration: 1,
                roles: [UNIQUE_ROLE],
                rolesData: [EMPTY_BYTES],
              }
              expect(marketplace.connect(lender).createRentalOffer(rentalOfferLegacy))
              rentalOfferLegacy.commitmentId = BigInt(1)
              await expect(
                marketplace
                  .connect(lender)
                  .batchReleaseTokens([rentalOfferLegacy.tokenAddress], [rentalOfferLegacy.commitmentId]),
              )
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'TokensReleased')
                .withArgs(rentalOfferLegacy.commitmentId)
            })
            it('Should NOT release Legacy tokens if sender is not the grantor', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              const rentalOfferLegacy = {
                nonce: `0x${randomBytes(32).toString('hex')}`,
                commitmentId: BigInt(0),
                lender: lender.address,
                borrower: AddressZero,
                tokenAddress: wearableAddress,
                tokenId,
                tokenAmount,
                feeTokenAddress: await mockERC20.getAddress(),
                feeAmountPerSecond: toWei('0.0000001'),
                deadline: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                minDuration: 1,
                roles: [UNIQUE_ROLE],
                rolesData: [EMPTY_BYTES],
              }
              expect(marketplace.connect(lender).createRentalOffer(rentalOfferLegacy))
              rentalOfferLegacy.commitmentId = BigInt(1)
              await expect(
                marketplace
                  .connect(borrower)
                  .batchReleaseTokens([rentalOfferLegacy.tokenAddress], [rentalOfferLegacy.commitmentId]),
              ).to.be.revertedWith("OriumSftMarketplace: sender is not the commitment's grantor Legacy")
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
                marketplace
                  .connect(lender)
                  .batchReleaseTokens([await secondMockERC1155.getAddress()], [rentalOffer.commitmentId]),
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
                .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
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
                const blockTimestamp = (await ethers.provider.getBlock('latest'))?.timestamp
                const timeToMove = rentalOffer.deadline - Number(blockTimestamp) + 1
                await ethers.provider.send('evm_increaseTime', [timeToMove])

                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: There are no active Rentals',
                )
              })
              it('Should NOT end a rental if the role was revoked by borrower directly in registry', async () => {
                await rolesRegistry
                  .connect(borrower)
                  .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
                await rolesRegistry
                  .connect(borrower)
                  .revokeRole(rentalOffer.commitmentId, rentalOffer.roles[0], borrower.address)
                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'ERC7589RolesRegistry: role does not exist',
                )
              })
              it('Should NOT end rental twice', async () => {
                await marketplace.connect(borrower).endRental(rentalOffer)
                await expect(marketplace.connect(borrower).endRental(rentalOffer)).to.be.revertedWith(
                  'OriumSftMarketplace: There are no active Rentals',
                )
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
                  .to.emit(rolesRegistry, 'TokensUnlocked')
                  .withArgs(rentalOffer.commitmentId)
              })
              it('Should NOT release tokens if rental is active', async function () {
                await expect(
                  marketplace
                    .connect(lender)
                    .batchReleaseTokens([rentalOffer.tokenAddress], [rentalOffer.commitmentId]),
                ).to.be.revertedWith('ERC7589RolesRegistry: NFT is locked')
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
                  commitmentId: BigInt(0),
                  tokenAddress: await mockERC1155.getAddress(),
                  tokenId,
                  tokenAmount,
                  role: UNIQUE_ROLE,
                  grantee: borrower.address,
                  expirationDate: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  revocable: true,
                  data: EMPTY_BYTES,
                },
              ]
              await rolesRegistry
                .connect(lender)
                .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
              await mockERC1155.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)
            })
            it('Should commit tokens and grant role', async () => {
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)

              await expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))
                .to.emit(rolesRegistry, 'TokensLocked')
                .withArgs(lender.address, 1, await mockERC1155.getAddress(), tokenId, tokenAmount)
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
            it('Should use IERC7589Legacy if tokenAddress matches wearableAddress and Bach Commit Tokens ', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              await expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'TokensCommitted')
                .withArgs(lender.address, 1, await wearableToken.getAddress(), tokenId, tokenAmount)
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'RoleGranted')
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
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)

              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              await rolesRegistry
                .connect(lender)
                .lockTokens(lender.address, await mockERC1155.getAddress(), tokenId, tokenAmount)
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
            it('Should only grant Legacy role when a commitmentId is passed', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              await SftRolesRegistrySingleRoleLegacy.connect(lender).commitTokens(
                lender.address,
                await wearableToken.getAddress(),
                tokenId,
                tokenAmount,
              )
              await expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'RoleGranted')
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
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)
              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              await rolesRegistry
                .connect(lender)
                .lockTokens(lender.address, await mockERC1155.getAddress(), tokenId, tokenAmount)
              await expect(
                marketplace.connect(borrower).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith('OriumSftMarketplace: expected grantor does not match the grantor of the commitmentId')
            })
            it('Should NOT commit tokens and grant role if tokenAddress does not match the commitment', async () => {
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)
              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              commitAndGrantRoleParams[0].tokenAddress = AddressZero
              await rolesRegistry
                .connect(lender)
                .lockTokens(lender.address, await mockERC1155.getAddress(), tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenAddress provided does not match commitment's tokenAddress")
            })
            it('Should NOT commit tokens and grant role if tokenId does not match the commitment', async () => {
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)
              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              commitAndGrantRoleParams[0].tokenId = 0
              await rolesRegistry
                .connect(lender)
                .lockTokens(lender.address, await mockERC1155.getAddress(), tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenId provided does not match commitment's tokenId")
            })
            it('Should NOT commit Legacy tokens and grant role if tokenId does not match the commitment', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()
              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              commitAndGrantRoleParams[0].tokenId = 0
              await SftRolesRegistrySingleRoleLegacy.connect(lender).commitTokens(
                lender.address,
                await wearableToken.getAddress(),
                tokenId,
                tokenAmount,
              )
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenId provided does not match commitment's tokenId")
            })
            it('Should NOT commit tokens and grant role if tokenAmount does not match the commitment', async () => {
              await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)
              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              commitAndGrantRoleParams[0].tokenAmount = BigInt(0)
              await rolesRegistry
                .connect(lender)
                .lockTokens(lender.address, await mockERC1155.getAddress(), tokenId, tokenAmount)
              await expect(
                marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams),
              ).to.revertedWith("OriumSftMarketplace: tokenAmount provided does not match commitment's tokenAmount")
            })

            it('Should NOT commit LEGACY tokens and grant role if tokenAmount does not match the commitment', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].commitmentId = BigInt(1)
              commitAndGrantRoleParams[0].tokenAmount = BigInt(0)
              await SftRolesRegistrySingleRoleLegacy.connect(lender).commitTokens(
                lender.address,
                await wearableToken.getAddress(),
                tokenId,
                tokenAmount,
              )
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
                commitmentId: BigInt(0),
                tokenAddress: await mockERC1155.getAddress(),
                tokenId,
                tokenAmount,
                role: UNIQUE_ROLE,
                grantee: borrower.address,
                expirationDate: Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                revocable: true,
                data: EMPTY_BYTES,
              },
            ]
            await rolesRegistry.setTokenAddressAllowed(commitAndGrantRoleParams[0].tokenAddress, true)
            await rolesRegistry
              .connect(lender)
              .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
            await mockERC1155.connect(lender).setApprovalForAll(await rolesRegistry.getAddress(), true)
            await marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams)
          })
          describe('batchRevokeRole', async () => {
            it('Should batch revoke role', async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              )
                .to.emit(rolesRegistry, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it('Should NOT batch revoke role if contract is paused', async () => {
              await marketplace.connect(operator).pause()
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              ).to.be.revertedWith('Pausable: paused')
            })
            it("Should NOT batch revoke role if array's length are different", async () => {
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole(
                    [1],
                    [UNIQUE_ROLE, UNIQUE_ROLE],
                    [borrower.address],
                    [await mockERC1155.getAddress()],
                  ),
              ).to.be.revertedWith('OriumSftMarketplace: arrays length mismatch')
            })
            it("Should batch revoke role if sender is commitment's grantee", async () => {
              await expect(
                marketplace
                  .connect(borrower)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              )
                .to.emit(rolesRegistry, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it("Should batch revoke Legacy role if sender is commitment's grantee", async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
              expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))

              await expect(
                marketplace
                  .connect(borrower)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await wearableToken.getAddress()]),
              )
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it('Should use IERC7589Legacy if tokenAddress matches wearableAddress and Batch Revole Role ', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))

              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await wearableToken.getAddress()]),
              )
                .to.emit(SftRolesRegistrySingleRoleLegacy, 'RoleRevoked')
                .withArgs(1, UNIQUE_ROLE, borrower.address)
            })
            it("Should NOT batch revoke role if sender is not commitment's grantor neither grantee", async () => {
              await expect(
                marketplace
                  .connect(notOperator)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              ).to.be.revertedWith("OriumSftMarketplace: sender is not the commitment's grantor or grantee")
            })
            it("Should NOT batch LEGACY revoke role if sender is not commitment's grantor neither grantee", async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
              expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))

              await SftRolesRegistrySingleRoleLegacy.connect(lender).grantRole(
                1,
                UNIQUE_ROLE,
                borrower.address,
                Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                false,
                EMPTY_BYTES,
              )

              await expect(
                marketplace
                  .connect(notOperator)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await wearableToken.getAddress()]),
              ).to.be.revertedWith("OriumSftMarketplace: sender is not the commitment's grantor or grantee Legacy")
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
                  Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  false,
                  EMPTY_BYTES,
                )
              await rolesRegistry
                .connect(borrower)
                .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              ).to.be.revertedWith('OriumSftMarketplace: role is not revocable')
            })
            it('Should NOT batch LEGACY revoke role if role is not revocable', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
              expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))

              await SftRolesRegistrySingleRoleLegacy.connect(lender).grantRole(
                1,
                UNIQUE_ROLE,
                borrower.address,
                Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                false,
                EMPTY_BYTES,
              )
              await SftRolesRegistrySingleRoleLegacy.connect(borrower).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await wearableToken.getAddress()]),
              ).to.be.revertedWith('OriumSftMarketplace: role is not revocable Legacy')
            })
            it('Should NOT batch revoke role if if role is expired', async () => {
              await rolesRegistry
                .connect(lender)
                .grantRole(
                  1,
                  UNIQUE_ROLE,
                  borrower.address,
                  Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                  false,
                  EMPTY_BYTES,
                )
              await rolesRegistry
                .connect(borrower)
                .setRoleApprovalForAll(await mockERC1155.getAddress(), await marketplace.getAddress(), true)
              await time.increase(ONE_DAY)
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await mockERC1155.getAddress()]),
              ).to.be.revertedWith('OriumSftMarketplace: role is expired')
            })
            it('Should NOT batch LEGACY revoke role if role is expired', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setRolesRegistry(await wearableToken.getAddress(), await SftRolesRegistrySingleRoleLegacy.getAddress())
              await wearableToken.setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)

              commitAndGrantRoleParams[0].tokenAddress = await wearableToken.getAddress()

              await SftRolesRegistrySingleRoleLegacy.connect(lender).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await wearableToken
                .connect(lender)
                .setApprovalForAll(await SftRolesRegistrySingleRoleLegacy.getAddress(), true)
              expect(marketplace.connect(lender).batchCommitTokensAndGrantRole(commitAndGrantRoleParams))

              await SftRolesRegistrySingleRoleLegacy.connect(lender).grantRole(
                1,
                UNIQUE_ROLE,
                borrower.address,
                Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY,
                false,
                EMPTY_BYTES,
              )
              await SftRolesRegistrySingleRoleLegacy.connect(borrower).setRoleApprovalForAll(
                await wearableToken.getAddress(),
                await marketplace.getAddress(),
                true,
              )
              await time.increase(ONE_DAY)
              await expect(
                marketplace
                  .connect(lender)
                  .batchRevokeRole([1], [UNIQUE_ROLE], [borrower.address], [await wearableToken.getAddress()]),
              ).to.be.revertedWith('OriumSftMarketplace: role is expired')
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

      describe('OriumMarketplaceRoyalties', async function () {
        it('Should set the marketplace royalties contract', async function () {
          await marketplace.connect(operator).setOriumMarketplaceRoyalties(await marketplaceRoyalties.getAddress())
          expect(await marketplace.oriumMarketplaceRoyalties()).to.be.equal(await marketplaceRoyalties.getAddress())
        })
        it("Should NOT set the marketplace royalties contract if caller isn't the operator", async function () {
          await expect(
            marketplace.connect(notOperator).setOriumMarketplaceRoyalties(await marketplaceRoyalties.getAddress()),
          ).to.be.reverted
        })
      })
    })
  })
})
