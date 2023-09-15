import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployMarketplaceContracts } from './fixtures/OriumMarketplaceFixture'

describe('RolesRegistry', () => {
  let marketplace: Contract
  let nft: Contract

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let lender: SignerWithAddress
  let borrower: SignerWithAddress

  const tokenId = 1

  before(async function () {
    // prettier-ignore
    [deployer, operator, lender, borrower] = await ethers.getSigners()
  })

  beforeEach(async () => {
    await loadFixture(deployMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Initialize', async () => {})
    describe('Pausable', async () => {})
    describe('Marketplace Fee', async () => {})
    describe('Creator Royalties', async () => {})
  })
})
