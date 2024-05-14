import { upgradeProxy } from '../../utils/upgrade-proxy'

async function main() {
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const LIBRARY_NAME = 'LibOriumSftMarketplace'
  await upgradeProxy(CONTRACT_NAME, [LIBRARY_NAME])
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
