import { network } from 'hardhat'
import { print, colors } from '../../utils/misc'
import addresses, { Network } from '../../addresses'
import { AddressZero, THREE_MONTHS } from '../../utils/constants'
import { deployUpgradeableContract } from '../../utils/deploy-upgradeable'

const NETWORK = network.name as Network
const { KMSDeployer, ERC7432WrapperForERC4907 } = addresses[NETWORK]

const CONTRACT_NAME = 'OriumMarketplaceRoyalties'
const OPERATOR_ADDRESS = KMSDeployer.address
const INITIALIZER_ARGUMENTS: string[] = [
  OPERATOR_ADDRESS,
  ERC7432WrapperForERC4907.address,
  AddressZero,
  THREE_MONTHS.toString(),
]

async function main() {
  await deployUpgradeableContract(CONTRACT_NAME, OPERATOR_ADDRESS, INITIALIZER_ARGUMENTS)
}

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
