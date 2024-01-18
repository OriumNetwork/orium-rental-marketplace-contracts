import { ethers, upgrades } from 'hardhat'
import { RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { Contract } from 'ethers'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, nftRolesRegistry, sftRolesRegistry, mockERC1155, mockERC20]
 */
export async function deployMarketplaceRoyaltiesContracts() {
  const [, operator] = await ethers.getSigners()

  const nftRolesRegistry = await ethers.getContractAt('IERC7432', RolesRegistryAddress)

  const SftRolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistrySingleRole')
  const sftRolesRegistry = await SftRolesRegistryFactory.deploy()
  await sftRolesRegistry.deployed()

  const MarketplaceRoyaltiesFactory = await ethers.getContractFactory('OriumMarketplaceRoyalties')
  const marketplaceRoyalties = await upgrades.deployProxy(MarketplaceRoyaltiesFactory, [
    operator.address,
    sftRolesRegistry.address,
    nftRolesRegistry.address,
    THREE_MONTHS,
  ])
  await marketplaceRoyalties.deployed()

  const MockERC1155Factory = await ethers.getContractFactory('MockERC1155')
  const mockERC1155 = await MockERC1155Factory.deploy()
  await mockERC1155.deployed()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20 = await MockERC20Factory.deploy()
  await mockERC20.deployed()

  return [marketplaceRoyalties, nftRolesRegistry, sftRolesRegistry, mockERC1155, mockERC20] as Contract[]
}
