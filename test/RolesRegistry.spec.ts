import hre, { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { randomHash } from './utils'

const { HashZero } = ethers.constants
const ONE_DAY = 60 * 60 * 24

describe('Roles Registry', () => {
  let rolesRegistry: Contract
  let mockERC721: Contract

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let roleCreator: SignerWithAddress
  let userOne: SignerWithAddress
  let userTwo: SignerWithAddress

  const role = randomHash()

  before(async function () {
    // eslint-disable-next-line prettier/prettier
    ;[deployer, roleCreator, userOne, userTwo] = await ethers.getSigners()
  })

  beforeEach(async () => {
    const RoleRegistryFactory = await ethers.getContractFactory('RolesRegistry')
    rolesRegistry = await RoleRegistryFactory.deploy()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy('Mock ERC721', 'mERC721')
  })

  describe('Role registry', async () => {
    let expirationDate: number
    const tokenId = 1
    const data = HashZero

    beforeEach(async () => {
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)
      expirationDate = block.timestamp + ONE_DAY

      await mockERC721.mint(roleCreator.address, tokenId)
    })

    describe('Grant role', async () => {
      it('should grant role', async () => {
        await expect(
          rolesRegistry
            .connect(roleCreator)
            .grantRole(role, userOne.address, mockERC721.address, tokenId, expirationDate, data),
        )
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(role, roleCreator.address, userOne.address, expirationDate, mockERC721.address, tokenId, data)
      })
      it('should NOT grant role if expiration date is in the past', async () => {
        const blockNumber = await hre.ethers.provider.getBlockNumber()
        const block = await hre.ethers.provider.getBlock(blockNumber)
        const expirationDateInThePast = block.timestamp - ONE_DAY

        await expect(
          rolesRegistry
            .connect(roleCreator)
            .grantRole(role, userOne.address, mockERC721.address, tokenId, expirationDateInThePast, HashZero),
        ).to.be.revertedWith('RolesRegistry: expiration date must be in the future')
      })
    })

    describe('Revoke role', async () => {
      it('should revoke role', async () => {
        await expect(rolesRegistry.connect(roleCreator).revokeRole(role, userOne.address, mockERC721.address, tokenId))
          .to.emit(rolesRegistry, 'RoleRevoked')
          .withArgs(role, roleCreator.address, userOne.address, mockERC721.address, tokenId)
      })
    })

    describe('Has role', async () => {
      beforeEach(async () => {
        await expect(
          rolesRegistry
            .connect(roleCreator)
            .grantRole(role, userOne.address, mockERC721.address, tokenId, expirationDate, HashZero),
        )
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(role, roleCreator.address, userOne.address, expirationDate, mockERC721.address, tokenId, HashZero)

        await expect(
          rolesRegistry
            .connect(roleCreator)
            .grantRole(role, userTwo.address, mockERC721.address, tokenId, expirationDate, HashZero),
        )
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(role, roleCreator.address, userTwo.address, expirationDate, mockERC721.address, tokenId, HashZero)
      })

      describe('Single User Roles', async () => {
        const supportMultipleUsers = false

        it('should return true for the last user granted, and false for the others', async () => {
          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userOne.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(false)

          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userTwo.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(true)
        })
        it('should NOT return true for the last user if role is expired', async () => {
          await hre.ethers.provider.send('evm_increaseTime', [ONE_DAY + 1])
          await hre.ethers.provider.send('evm_mine', [])

          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userOne.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(false)
        })
      })

      describe('Multiple Users Roles', async () => {
        const supportMultipleUsers = true

        it('should return true for all users', async () => {
          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userOne.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(true)

          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userTwo.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(true)
        })
        it("should NOT return true for all users if role is expired'", async () => {
          await hre.ethers.provider.send('evm_increaseTime', [ONE_DAY + 1])
          await hre.ethers.provider.send('evm_mine', [])

          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userOne.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(false)

          expect(
            await rolesRegistry.hasRole(
              role,
              roleCreator.address,
              userTwo.address,
              mockERC721.address,
              tokenId,
              supportMultipleUsers,
            ),
          ).to.be.equal(false)
        })
      })
    })

    describe('Role Data', async () => {
      it('should grant role with data', async () => {
        const customData = '0x1234'

        await expect(
          rolesRegistry
            .connect(roleCreator)
            .grantRole(role, userOne.address, mockERC721.address, tokenId, expirationDate, customData),
        )
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(role, roleCreator.address, userOne.address, expirationDate, mockERC721.address, tokenId, customData)

        const returnedData = await rolesRegistry.roleData(
          role,
          roleCreator.address,
          userOne.address,
          mockERC721.address,
          tokenId,
        )

        expect(returnedData.data_).to.equal(customData)
      })
    })
  })
})
