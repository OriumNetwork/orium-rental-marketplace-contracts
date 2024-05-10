import config from '../../addresses'
import { createDefenderProposal } from '../../utils/defender-proposal'
import { print, colors } from '../../utils/misc'

const CONTRACT_NAME = 'OriumMarketplaceRoyalties'
const FUNCTION_NAME = 'transferOwnership'
const FUNCTION_INPUTS_TYPE = [{ type: 'address', name: '_newOwner' }]
const FUNCTION_INPUTS = [config.polygon.KMSDeployer.address]

async function main() {
  await createDefenderProposal(CONTRACT_NAME, FUNCTION_NAME, FUNCTION_INPUTS_TYPE, FUNCTION_INPUTS)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
