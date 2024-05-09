import { print, colors } from '../../utils/misc'
import { upgradeProxy } from '../../utils/upgrade-proxy'

const CONTRACT_NAME = 'NftRentalMarketplace'

async function main() {
  await upgradeProxy(CONTRACT_NAME)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
