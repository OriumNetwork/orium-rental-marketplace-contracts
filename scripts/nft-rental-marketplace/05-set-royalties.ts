import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'
import addresses, { Network } from '../../addresses'
import { network } from 'hardhat'

const NETWORK = network.name as Network
const CONTRACT_NAME = 'NftRentalMarketplace'
const CONTRACT_FUNCTION = 'setOriumMarketplaceRoyalties'
const FUNCTION_PARAMS = [addresses[NETWORK].OriumMarketplaceRoyalties.address]

async function main() {
  await callContractFunction(CONTRACT_NAME, CONTRACT_FUNCTION, FUNCTION_PARAMS)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
