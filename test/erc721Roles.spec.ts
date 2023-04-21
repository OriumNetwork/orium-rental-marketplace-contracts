import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { randomHash, randomInteger } from './utils'

const { HashZero } = ethers.constants

describe('ERC721 Roles', () => {
  let contract: Contract
  let account: SignerWithAddress

  before(async function () {
    const signers = await ethers.getSigners()
    account = signers[0]
  })

  beforeEach(async () => {
    const contractFactory = await ethers.getContractFactory('ERC721Roles')
    contract = await contractFactory.deploy()
  })

  describe('grantRole', async () => {
    it('should grant role', async () => {
      const role = randomHash()
      const tokenId = randomInteger()
      const expirationDate = Math.round(Date.now() / 1000) + 10
      await expect(contract.grantRole(role, account.address, tokenId, expirationDate, HashZero))
        .to.emit(contract, 'RoleGranted')
        .withArgs(role, account.address, tokenId, expirationDate, HashZero)
    })

    it('should revert with: expiration date must be in the future', async () => {
      const role = randomHash()
      const tokenId = randomInteger()
      const expirationDate = Math.round(Date.now() / 1000)
      await expect(contract.grantRole(role, account.address, tokenId, expirationDate, HashZero))
        .revertedWith('ERC721Roles: expiration date must be in the future')
    })
  })

  describe('revokeRole', async () => {
    it('should revoke role', async () => {
      const role = randomHash()
      const tokenId = randomInteger()
      await expect(contract.revokeRole(role, account.address, tokenId))
        .to.emit(contract, 'RoleRevoked')
        .withArgs(role, account.address, tokenId)
    })
  })

  describe('roleExpirationDate & hasRole', async () => {
    it('should have role', async () => {
      const role = randomHash()
      const tokenId = randomInteger()
      const expirationDate = Math.round(Date.now() / 1000) + 10
      await expect(contract.grantRole(role, account.address, tokenId, expirationDate, HashZero))
        .to.emit(contract, 'RoleGranted')
        .withArgs(role, account.address, tokenId, expirationDate, HashZero)

      const expectedExpirationDate = await contract.roleExpirationDate(role, account.address, tokenId)
      expect(expectedExpirationDate).to.equal(expirationDate)

      const hasRole = await contract.hasRole(role, account.address, tokenId)
      expect(hasRole).to.be.true
    })
  })

})
