import { ethers, upgrades } from 'hardhat'
import { RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { IERC7432, MockERC20, MockERC721, OriumMarketplace } from '../../typechain-types'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, rolesRegistry, mockERC721, mockERC20]
 */
export async function deployMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  const rolesRegistry: IERC7432 = await ethers.getContractAt('IERC7432', RolesRegistryAddress)

  const MarketplaceFactory = await ethers.getContractFactory('OriumMarketplace')
  const marketplaceProxy = await upgrades.deployProxy(MarketplaceFactory, [
    operator.address,
    await rolesRegistry.getAddress(),
    THREE_MONTHS,
  ])
  await marketplaceProxy.waitForDeployment()

  const marketplace: OriumMarketplace = await ethers.getContractAt(
    'OriumMarketplace',
    await marketplaceProxy.getAddress(),
  )

  const MockERC721Factory = await ethers.getContractFactory('MockERC721')
  const mockERC721: MockERC721 = await MockERC721Factory.deploy()
  await mockERC721.waitForDeployment()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20: MockERC20 = await MockERC20Factory.deploy()
  await mockERC20.waitForDeployment()

  return [marketplace, rolesRegistry, mockERC721, mockERC20] as const
}
