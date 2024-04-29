import { network } from 'hardhat'
import { print, colors } from '../../utils/misc'
import addresses, { Network } from '../../addresses'
import { deployUpgradeableContract } from '../../utils/deploy-upgradeable'

const NETWORK = network.name as Network
const PROXY_CONTRACT_NAME = 'NftRentalMarketplace'
const OPERATOR_ADDRESS = addresses[NETWORK].Multisig.address
const INITIALIZER_ARGUMENTS: string[] = [OPERATOR_ADDRESS, addresses[NETWORK].OriumMarketplaceRoyalties.address]
const LIBRARIES_CONTRACT_NAME = ['LibNftRentalMarketplace']

async function main() {
  await deployUpgradeableContract(PROXY_CONTRACT_NAME, OPERATOR_ADDRESS, INITIALIZER_ARGUMENTS, LIBRARIES_CONTRACT_NAME)
}

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
