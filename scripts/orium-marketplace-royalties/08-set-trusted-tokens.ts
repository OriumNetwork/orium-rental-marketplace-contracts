import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'

const TOKEN_ADDRESSES = ['0xcb13945ca8104f813992e4315f8ffefe64ac49ca'] // GLMR Jungle address moonbeam
const FEE_TOKEN_ADDRESSES = ['0xd10078fdbc835726c79533a4a19db40cfad69d7f'] // GLMB address moonbeam
const IS_TRUSTED = [true]
const CONTRACT_NAME = 'OriumMarketplaceRoyalties'
const CONTRACT_FUNCTION = 'setTrustedFeeTokenForToken'
const CONTRACT_ARGUMENTS = [TOKEN_ADDRESSES, FEE_TOKEN_ADDRESSES, IS_TRUSTED]
async function main() {
  await callContractFunction(CONTRACT_NAME, CONTRACT_FUNCTION, CONTRACT_ARGUMENTS)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
