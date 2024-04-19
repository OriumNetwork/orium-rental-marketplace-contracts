import { ethers, upgrades } from 'hardhat'
import { AddressZero, THREE_MONTHS } from '../../utils/constants'
import {
  NftRolesRegistryVault,
  MockERC20,
  MockERC721,
  OriumMarketplaceRoyalties,
  NftRentalMarketplace,
} from '../../typechain-types'
/**
 * @dev deployer, operator needs to be the first accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, marketplaceRoyalties, rolesRegistry, mockERC721, mockERC20]
 */
export async function deployNftMarketplaceContracts() {
  const [, operator] = await ethers.getSigners()

  const RolesRegistryFactory = await ethers.getContractFactory('NftRolesRegistryVault')
  const rolesRegistry: NftRolesRegistryVault = await RolesRegistryFactory.deploy()
  await rolesRegistry.waitForDeployment()

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
  const LibMarketplaceFactory = await ethers.getContractFactory('LibNftRentalMarketplace')
  const libMarketplace = await LibMarketplaceFactory.deploy()
  await libMarketplace.waitForDeployment()

  const MarketplaceFactory = await ethers.getContractFactory('NftRentalMarketplace', {
    libraries: {
      LibNftRentalMarketplace: await libMarketplace.getAddress(),
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

  const marketplace: NftRentalMarketplace = await ethers.getContractAt(
    'NftRentalMarketplace',
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
