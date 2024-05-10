import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'
import addresses, { Network } from '../../addresses'
import { network } from 'hardhat'

const NETWORK = network.name as Network
const CONTRACT_NAME = 'MockERC721'
const CONTRACT_FUNCTION = 'setApprovalForAll'
const FUNCTION_PARAMS = [addresses[NETWORK].NftRentalMarketplace.address, true]
const CUSTOM_CONTRACT_ADDRESS = '0xcB13945Ca8104f813992e4315F8fFeFE64ac49cA'

async function main() {
  await callContractFunction(CONTRACT_NAME, CONTRACT_FUNCTION, FUNCTION_PARAMS, { CUSTOM_CONTRACT_ADDRESS })
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
