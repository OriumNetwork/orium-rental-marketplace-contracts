import { kmsDeployer } from '../../utils/deployer'
import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'

const CONTRACT_NAME = 'OriumMarketplaceRoyalties'
const CONTRACT_FUNCTION = 'setRolesRegistry'
const TOKEN_ADDRESS = '0xcb13945ca8104f813992e4315f8ffefe64ac49ca'
const ROLES_REGISTRY = '0xc3154ccac181eb9d71ccd53f29f425bddd52d983'
const CONTRACT_ARGUMENTS = [TOKEN_ADDRESS, ROLES_REGISTRY]

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
