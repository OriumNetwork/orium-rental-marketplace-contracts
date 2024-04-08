import { ethers, upgrades } from 'hardhat'
import { RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { IERC7432, MockERC1155, MockERC20, SftRolesRegistrySingleRole } from '../../typechain-types'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, nftRolesRegistry, sftRolesRegistry, mockERC1155, mockERC20]
 */
export async function deployMarketplaceRoyaltiesContracts() {
  const [, operator] = await ethers.getSigners()

  const nftRolesRegistry: IERC7432 = await ethers.getContractAt('IERC7432', RolesRegistryAddress)

  const SftRolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistrySingleRole')
  const sftRolesRegistry: SftRolesRegistrySingleRole = await SftRolesRegistryFactory.deploy()
  await sftRolesRegistry.waitForDeployment()

  const MarketplaceRoyaltiesFactory = await ethers.getContractFactory('OriumMarketplaceRoyalties')
  const marketplaceRoyaltiesProxy = await upgrades.deployProxy(MarketplaceRoyaltiesFactory, [
    operator.address,
    await sftRolesRegistry.getAddress(),
    await nftRolesRegistry.getAddress(),
    THREE_MONTHS,
  ])
  await marketplaceRoyaltiesProxy.deployed()

  const marketplaceRoyalties = await ethers.getContractAt(
    'OriumMarketplaceRoyalties',
    await marketplaceRoyaltiesProxy.getAddress(),
  )

  const MockERC1155Factory = await ethers.getContractFactory('MockERC1155')
  const mockERC1155: MockERC1155 = await MockERC1155Factory.deploy()
  await mockERC1155.waitForDeployment()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20: MockERC20 = await MockERC20Factory.deploy()
  await mockERC20.waitForDeployment()

  return [marketplaceRoyalties, nftRolesRegistry, sftRolesRegistry, mockERC1155, mockERC20] as const
}
