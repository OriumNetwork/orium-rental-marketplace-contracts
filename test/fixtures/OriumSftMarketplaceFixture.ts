import { ethers, upgrades } from 'hardhat'
import { AddressZero, THREE_MONTHS } from '../../utils/constants'
import {
  OriumMarketplaceRoyalties,
  OriumSftMarketplace,
  SftRolesRegistrySingleRole,
  MockERC1155,
  SftRolesRegistrySingleRoleLegacy,
} from '../../typechain-types'

/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20]
 */
export async function deploySftMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  const MockERC1155Factory = await ethers.getContractFactory('MockERC1155')
  const mockERC1155: MockERC1155 = await MockERC1155Factory.deploy()
  await mockERC1155.waitForDeployment()

  const marketplaceaddress = await mockERC1155.getAddress()

  const RolesRegistryFactory = await ethers.getContractFactory('SftRolesRegistrySingleRole')
  const rolesRegistry: SftRolesRegistrySingleRole = await RolesRegistryFactory.deploy(marketplaceaddress)
  await rolesRegistry.waitForDeployment()

  const SftRolesRegistrySingleRoleLegacy = await ethers.getContractFactory('SftRolesRegistrySingleRoleLegacy')
  const rolesRegistryLegacy: SftRolesRegistrySingleRoleLegacy = await SftRolesRegistrySingleRoleLegacy.deploy()
  await rolesRegistryLegacy.waitForDeployment()

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

  const LibMarketplaceFactory = await ethers.getContractFactory('LibOriumSftMarketplace')
  const libMarketplace = await LibMarketplaceFactory.deploy()
  await libMarketplace.waitForDeployment()

  const MarketplaceFactory = await ethers.getContractFactory('OriumSftMarketplace', {
    libraries: {
      LibOriumSftMarketplace: await libMarketplace.getAddress(),
    },
  })
  const marketplaceProxy = await upgrades.deployProxy(
    MarketplaceFactory,
    [operator.address, await marketplaceRoyalties.getAddress()],
    {
      unsafeAllowLinkedLibraries: true,
    },
  )
  await marketplaceProxy.waitForDeployment()
  const marketplace: OriumSftMarketplace = await ethers.getContractAt(
    'OriumSftMarketplace',
    await marketplaceProxy.getAddress(),
  )

  const WaerableFactory = await ethers.getContractFactory('MockERC1155')
  const waereableToken = await WaerableFactory.deploy()
  await waereableToken.waitForDeployment()

  const secondMockERC1155 = await MockERC1155Factory.deploy()
  await secondMockERC1155.waitForDeployment()

  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  const mockERC20 = await MockERC20Factory.deploy()
  await mockERC20.waitForDeployment()

  return [
    marketplace,
    marketplaceRoyalties,
    rolesRegistry,
    mockERC1155,
    mockERC20,
    secondMockERC1155,
    waereableToken,
    rolesRegistryLegacy,
  ] as const
}
