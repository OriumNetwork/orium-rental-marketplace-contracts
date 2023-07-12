import hre, { ethers } from 'hardhat'
import { Contract, utils } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { randomString, randomHash } from './utils'

const { HashZero } = ethers.constants

describe('Roles Registry', () => {
  let rolesManagement: Contract
  let rolesRegistry: Contract
  let mockERC721: Contract
  let account: SignerWithAddress

  const name = randomString()
  const desc = randomString()
  const role = randomHash()

  before(async function () {
    const signers = await ethers.getSigners()
    account = signers[0]
  })

  beforeEach(async () => {
    const RoleManagementFactory = await ethers.getContractFactory('RoleManagement')
    rolesManagement = await RoleManagementFactory.deploy()

    const RoleRegistryFactory = await ethers.getContractFactory('ERC721RolesRegistry')
    rolesRegistry = await RoleRegistryFactory.deploy()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy('Mock ERC721', 'mERC721')

    await expect(rolesManagement.createRole(role, name, desc, HashZero))
      .to.emit(rolesManagement, 'RoleCreated')
      .withArgs(account.address, role, name, desc, HashZero)
  })

  describe('Role registry', async () => {
    it('should create a role with data', async () => {
      const user = (await ethers.getSigners())[1]
      const beneficiaries = [account.address]
      const shares = [1000]
      const data = utils.defaultAbiCoder.encode(['address[]', 'uint256[]'], [beneficiaries, shares])

      const tokenId = 1
      await mockERC721.mint(account.address, tokenId)

      const ONE_DAY = 60 * 60 * 24
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)
      const expirationDate = block.timestamp + ONE_DAY

      await expect(
        rolesRegistry.connect(account).grantRole(role, user.address, mockERC721.address, tokenId, expirationDate, data),
      )
        .to.emit(rolesRegistry, 'RoleGranted')
        .withArgs(role, user.address, expirationDate, mockERC721.address, tokenId, data)

      const returnedData = await rolesRegistry.roleData(
        role,
        account.address,
        user.address,
        mockERC721.address,
        tokenId,
      )

      expect(returnedData.data_).to.equal(data)
    })
    it('should create a role that not support multiple users', async () => {
      const userOne = (await ethers.getSigners())[1]
      const userTwo = (await ethers.getSigners())[2]

      const tokenId = 1
      await mockERC721.mint(account.address, tokenId)

      const ONE_DAY = 60 * 60 * 24
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)

      const expirationDate = block.timestamp + ONE_DAY

      await expect(
        rolesRegistry
          .connect(account)
          .grantRole(role, userOne.address, mockERC721.address, tokenId, expirationDate, HashZero),
      )
        .to.emit(rolesRegistry, 'RoleGranted')
        .withArgs(role, userOne.address, expirationDate, mockERC721.address, tokenId, HashZero)

      await expect(
        rolesRegistry
          .connect(account)
          .grantRole(role, userTwo.address, mockERC721.address, tokenId, expirationDate, HashZero),
      )
        .to.emit(rolesRegistry, 'RoleGranted')
        .withArgs(role, userTwo.address, expirationDate, mockERC721.address, tokenId, HashZero)

      const supportMultipleUsers = false
      expect(
        await rolesRegistry.hasRole(
          role,
          account.address,
          userOne.address,
          mockERC721.address,
          tokenId,
          supportMultipleUsers,
        ),
      ).to.be.equal(false)

      expect(
        await rolesRegistry.hasRole(
          role,
          account.address,
          userTwo.address,
          mockERC721.address,
          tokenId,
          supportMultipleUsers,
        ),
      ).to.be.equal(true)
    })
  })
})
