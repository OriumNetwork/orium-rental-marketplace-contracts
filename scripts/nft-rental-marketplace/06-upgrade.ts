import { print, colors } from '../../utils/misc'
import { upgradeProxy } from '../../utils/upgrade-proxy'

async function main() {
  await upgradeProxy('NftRentalMarketplace', ['LibNftRentalMarketplace'])
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
