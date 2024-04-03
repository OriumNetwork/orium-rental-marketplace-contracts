import { ethers, upgrades } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import config from '../addresses'
import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers'

describe('OriumSftMarketplace Upgrade Simulation', () => {
  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer] = await ethers.getSigners()
  })

  it('Should upgrade', async () => {
    await impersonateAccount(config.polygon.Multisig.address)
    const signer = await ethers.getSigner(config.polygon.Multisig.address)
    const LibraryFactory = await ethers.getContractFactory('LibOriumSftMarketplace')
    const library = await LibraryFactory.deploy()
    await library.deployed()
    const MarketplaceFactory = await ethers.getContractFactory('OriumSftMarketplace', {
      libraries: { ['LibOriumSftMarketplace']: library.address },
      signer: signer,
    })
    await upgrades.forceImport(config.polygon.OriumSftMarketplace.address, MarketplaceFactory)

    // set enough balance for signer before upgrade
    await deployer.sendTransaction({
      to: signer.address,
      value: ethers.utils.parseEther('100'),
    })

    await upgrades.upgradeProxy(config.polygon.OriumSftMarketplace.address, MarketplaceFactory, {
      unsafeAllowLinkedLibraries: true,
    })
  })
})
