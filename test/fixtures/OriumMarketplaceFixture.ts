import { ethers, upgrades } from 'hardhat'
import { RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { Contract } from 'ethers'
/**
 * @dev deployer and operator needs to be the first two accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, mockERC721, mockERC20]
 */
export async function deployMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  // const rolesRegistry = await ethers.getContractAt('IRolesRegsitry', RolesRegistryAddress) // TODO: Uncomment when RolesRegistry is deployed

  const MarketplaceFactory = await ethers.getContractFactory('OriumMarketplace')
  const marketplace = await upgrades.deployProxy(MarketplaceFactory, [
    operator.address,
    RolesRegistryAddress,
    THREE_MONTHS,
  ])
  await marketplace.deployed()

  const MockERC721Factory = await ethers.getContractFactory('MockERC721')
  const mockERC721 = await MockERC721Factory.deploy()
  await mockERC721.deployed()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20 = await MockERC20Factory.deploy()
  await mockERC20.deployed()

  return [marketplace, mockERC721, mockERC20] as Contract[]
}
