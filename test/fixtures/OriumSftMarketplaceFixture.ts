import { ethers, upgrades } from 'hardhat'
import { AddressZero, THREE_MONTHS } from '../../utils/constants'
import { Contract } from 'ethers'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20]
 */
export async function deploySftMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  const RolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistrySingleRole')
  const rolesRegistry = await RolesRegistryFactory.deploy()
  await rolesRegistry.deployed()

  const MarketplaceRoyaltiesFactory = await ethers.getContractFactory('OriumMarketplaceRoyalties')
  const marketplaceRoyalties = await upgrades.deployProxy(MarketplaceRoyaltiesFactory, [
    operator.address,
    rolesRegistry.address,
    AddressZero,
    THREE_MONTHS,
  ])
  await marketplaceRoyalties.deployed()

  const LibMarketplaceFactory = await ethers.getContractFactory('LibOriumSftMarketplace')
  const libMarketplace = await LibMarketplaceFactory.deploy()
  await libMarketplace.deployed()

  const MarketplaceFactory = await ethers.getContractFactory('OriumSftMarketplace', {
    libraries: {
      LibOriumSftMarketplace: libMarketplace.address,
    },
  })
  const marketplace = await upgrades.deployProxy(MarketplaceFactory, [operator.address, marketplaceRoyalties.address], {
    unsafeAllowLinkedLibraries: true,
  })
  await marketplace.deployed()

  const MockERC1155Factory = await ethers.getContractFactory('MockERC1155')
  const mockERC1155 = await MockERC1155Factory.deploy()
  await mockERC1155.deployed()

  const secondMockERC1155 = await MockERC1155Factory.deploy()
  await secondMockERC1155.deployed()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20 = await MockERC20Factory.deploy()
  await mockERC20.deployed()

  return [marketplace, marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20, secondMockERC1155] as Contract[]
}
