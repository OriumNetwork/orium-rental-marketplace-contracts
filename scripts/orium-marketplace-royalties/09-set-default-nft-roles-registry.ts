import { ZeroAddress } from 'ethers'
import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'
import { kmsDeployer } from '../../utils/deployer'

const CONTRACT_NAME = 'OriumMarketplaceRoyalties'
const CONTRACT_FUNCTION = 'setDefaultNftRolesRegistry'
const CONTRACT_ARGUMENTS = [ZeroAddress]
async function main() {
  await callContractFunction(CONTRACT_NAME, CONTRACT_FUNCTION, CONTRACT_ARGUMENTS, kmsDeployer as any)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
