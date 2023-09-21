import { ethers, upgrades } from 'hardhat'
import { RolesRegistryAddress, THREE_MONTHS } from '../../utils/constants'
import { Contract } from 'ethers'
/**
 * @dev deployer and operator needs to be the first two accounts in the hardhat ethers.getSigners()
 * list respectively. This should be considered to use this fixture in tests
 * @returns [marketplace, nft, paymentToken] // TODO: TBD add rolesRegistry to the return
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

  const NftFactory = await ethers.getContractFactory('MockNft')
  const nft = await NftFactory.deploy()
  await nft.deployed()

  const PaymentTokenFactory = await ethers.getContractFactory('MockPaymentToken')
  const paymentToken = await PaymentTokenFactory.deploy()
  await paymentToken.deployed()

  return [marketplace, nft, paymentToken] as Contract[]
}
