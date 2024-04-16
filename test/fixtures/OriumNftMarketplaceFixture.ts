import { ethers, upgrades } from 'hardhat'
import { AddressZero, RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { IERC7432, MockERC20, MockERC721, OriumMarketplaceRoyalties, OriumNftMarketplace } from '../../typechain-types'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, marketplaceRoyalties, rolesRegistry, mockERC721, mockERC20]
 */
export async function deployNftMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  const rolesRegistry: IERC7432 = await ethers.getContractAt('IERC7432', RolesRegistryAddress)

  const MarketplaceRoyaltiesFactory = await ethers.getContractFactory('OriumMarketplaceRoyalties')
  const marketplaceRoyaltiesProxy = await upgrades.deployProxy(MarketplaceRoyaltiesFactory, [
    operator.address,
    await rolesRegistry.getAddress(),
    AddressZero,
    THREE_MONTHS,
  ])
  await marketplaceRoyaltiesProxy.waitForDeployment()
  const marketplaceRoyalties: OriumMarketplaceRoyalties = await ethers.getContractAt(
    'OriumMarketplaceRoyalties',
    await marketplaceRoyaltiesProxy.getAddress(),
  )

  const MarketplaceFactory = await ethers.getContractFactory('OriumNftMarketplace')
  const marketplaceProxy = await upgrades.deployProxy(MarketplaceFactory, [
    operator.address,
    await marketplaceRoyalties.getAddress(),
  ])
  await marketplaceProxy.waitForDeployment()

  const marketplace: OriumNftMarketplace = await ethers.getContractAt(
    'OriumNftMarketplace',
    await marketplaceProxy.getAddress(),
  )

  const MockERC721Factory = await ethers.getContractFactory('MockERC721')
  const mockERC721: MockERC721 = await MockERC721Factory.deploy()
  await mockERC721.waitForDeployment()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20: MockERC20 = await MockERC20Factory.deploy()
  await mockERC20.waitForDeployment()

  return [marketplace, marketplaceRoyalties, rolesRegistry, mockERC721, mockERC20] as const
}
