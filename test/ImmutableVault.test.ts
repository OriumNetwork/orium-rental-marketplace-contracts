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
    vault = await ImmutableVaultFactory.deploy(multisig.address, rolesRegistry.address)
    await vault.deployed()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy('Mock ERC721', 'mERC721')
    await mockERC721.deployed()

    await mockERC721.mint(nftOwner.address, tokenId)
    // await vault.connect(multisig).grantRole(await vault.MARKETPLACE_ROLE(), marketplace.address)
  })

  describe('Main functions', async () => {
    let expirationDate: number

    beforeEach(async () => {
      const blockNumber = await hre.ethers.provider.getBlockNumber()
      const block = await hre.ethers.provider.getBlock(blockNumber)
      expirationDate = block.timestamp + ONE_DAY
    })

    describe('Deposit NFT', async () => {
      it('Should deposit NFT', async () => {
        await mockERC721.connect(nftOwner).approve(vault.address, tokenId)
        await expect(vault.connect(nftOwner).deposit(mockERC721.address, tokenId, expirationDate))
          .to.emit(vault, 'Deposit')
          .withArgs(mockERC721.address, tokenId, nftOwner.address, expirationDate)
          .to.emit(vault, 'Transfer')
      })
      it('Should not deposit NFT if not approved', async () => {
        await expect(vault.connect(nftOwner).deposit(mockERC721.address, tokenId, expirationDate)).to.be.revertedWith(
          'ERC721: caller is not token owner or approved',
        )
      })
    })
  })
})
