import hre, { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { RolesRegistryAddress } from '../utils/constants'

const ONE_DAY = 60 * 60 * 24
const EMPTY_BYTES = '0x'

describe('Immutable Vault', () => {
  let vault: Contract
  let rolesRegistry: Contract
  let mockERC721: Contract

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let multisig: SignerWithAddress
  let nftOwner: SignerWithAddress
  let marketplace: SignerWithAddress

  const tokenId = 1

  before(async function () {
    // eslint-disable-next-line prettier/prettier
    [deployer, multisig, nftOwner, marketplace] = await ethers.getSigners()
  })

  beforeEach(async () => {
    rolesRegistry = await ethers.getContractAt('IRolesRegistry', RolesRegistryAddress)

    const ImmutableVaultFactory = await ethers.getContractFactory('ImmutableVault')
    vault = await ImmutableVaultFactory.deploy(multisig.address, rolesRegistry.address, marketplace.address)
    await vault.deployed()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy('Mock ERC721', 'mERC721')
    await mockERC721.deployed()

    await mockERC721.mint(nftOwner.address, tokenId)
    await mockERC721.connect(nftOwner).approve(vault.address, tokenId)
  })

  describe('Main functions', async () => {
    let expirationDate: number
    let deadline: number

    beforeEach(async () => {
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)
      expirationDate = block.timestamp + ONE_DAY
      deadline = block.timestamp + ONE_DAY * 30
    })

    describe('Deposit NFT', async () => {
      it('Should deposit NFT', async () => {
        await expect(vault.connect(nftOwner).deposit(mockERC721.address, tokenId, expirationDate))
          .to.emit(vault, 'Deposit')
          .withArgs(mockERC721.address, tokenId, nftOwner.address, expirationDate)
        expect(await mockERC721.ownerOf(tokenId)).to.be.equal(vault.address)
      })
      it('Should not deposit NFT if not owner', async () => {
        await expect(vault.deposit(mockERC721.address, tokenId, expirationDate)).to.be.revertedWith(
          'ERC721: transfer from incorrect owner',
        )
      })
    })
    describe('Deposit NFT on Behaf of', async () => {
      it('Should deposit NFT on behalf of', async () => {
        await expect(vault.connect(marketplace).depositOnBehalfOf(mockERC721.address, tokenId, expirationDate))
          .to.emit(vault, 'Deposit')
          .withArgs(mockERC721.address, tokenId, nftOwner.address, expirationDate)
      })
      it('Should not deposit NFT on behalf of if not marketplace', async () => {
        await expect(
          vault.connect(nftOwner).depositOnBehalfOf(mockERC721.address, tokenId, expirationDate),
        ).to.be.revertedWith(
          `AccessControl: account ${nftOwner.address.toLowerCase()} is missing role ${await vault.MARKETPLACE_ROLE()}`,
        )
      })
    })
  })
})
