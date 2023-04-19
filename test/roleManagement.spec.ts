import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { randomString, randomHash } from './utils'

const { HashZero } = ethers.constants

describe('Role Management', () => {
  let contract: Contract
  let account: SignerWithAddress

  before(async function () {
    const signers = await ethers.getSigners()
    account = signers[0]
  })

  beforeEach(async () => {
    const contractFactory = await ethers.getContractFactory('RoleManagement')
    contract = await contractFactory.deploy()
  })

  describe('Role Management', async () => {
    it('should create first role and replace second', async () => {
      const hash = randomHash()
      const name = randomString()
      const desc = randomString()
      await expect(contract.createRole(hash, name, desc, HashZero))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash, name, desc, HashZero)

      const name2 = randomString()
      const desc2 = randomString()
      await expect(contract.createRole(hash, name2, desc2, HashZero))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash, name2, desc2, HashZero)
    })

    it('should create and destroy role', async () => {
      const hash = randomHash()
      const name = randomString()
      const desc = randomString()
      await expect(contract.createRole(hash, name, desc, HashZero))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash, name, desc, HashZero)

      await expect(contract.destroyRole(hash)).to.emit(contract, 'RoleDestroyed').withArgs(account.address, hash)
    })

    it('should create three roles, delete one, and list all', async () => {
      const hash = randomHash()
      const name = randomString()
      const desc = randomString()
      await expect(contract.createRole(hash, name, desc, HashZero))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash, name, desc, HashZero)

      const hash2 = randomHash()
      const name2 = randomString()
      const desc2 = randomString()
      await expect(contract.createRole(hash2, name2, desc2, HashZero))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash2, name2, desc2, HashZero)

      await expect(contract.destroyRole(hash2)).to.emit(contract, 'RoleDestroyed').withArgs(account.address, hash2)

      const hash3 = randomHash()
      const name3 = randomString()
      const desc3 = randomString()
      await expect(contract.createRole(hash3, name3, desc3, hash3))
        .to.emit(contract, 'RoleCreated')
        .withArgs(account.address, hash3, name3, desc3, hash3)

      const roles = await contract.listRoles()
      expect(roles).to.have.lengthOf(2)

      expect(roles[0]).to.have.property('role', hash)
      expect(roles[0]).to.have.property('name', name)
      expect(roles[0]).to.have.property('desc', desc)
      expect(roles[0]).to.have.property('data', HashZero)

      expect(roles[1]).to.have.property('role', hash3)
      expect(roles[1]).to.have.property('name', name3)
      expect(roles[1]).to.have.property('desc', desc3)
      expect(roles[1]).to.have.property('data', hash3)
    })
  })
})
