import { network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { print, colors, confirmOrDie } from '../../utils/misc'
import { AdminClient } from 'defender-admin-client'

const network: Network = hardhatNetwork.name as Network

const ACTION = 'Set Marketplace Fee For Collection'
const CONTRACT_NAME = 'OriumMarketplaceRoyalties'

// Function to call
const FUNCTION_NAME = 'setMarketplaceFeeForCollection'
const FUNCTION_INPUTS = [
  { type: 'address', name: '_tokenAddress' },
  { type: 'uint256', name: '_feePercentageInWei' },
  { type: 'bool', name: '_isCustomFee' },
]
const FUNCTION_ARGS = ['0x58de9aabcaeec0f69883c94318810ad79cc6a44f', '0', true]

async function main() {
  await confirmOrDie(`Are you sure you want to create Defender Proposal to ${ACTION} on ${network} network?`)
  print(colors.highlight, `Creating Defender Upgrade Proposal...`)
  const DEFENDER_API_KEY = process.env.DEFENDER_TEAM_API_KEY
  const DEFENDER_API_SECRET = process.env.DEFENDER_TEAM_API_SECRET_KEY

  if (!DEFENDER_API_KEY || !DEFENDER_API_SECRET) return print(colors.error, 'Missing Defender API Key or Secret')
  const adminClient = new AdminClient({
    apiKey: DEFENDER_API_KEY,
    apiSecret: DEFENDER_API_SECRET,
  })

  const customNetwork = network === 'polygon' ? 'matic' : network
  if (customNetwork === 'cronosTestnet' || customNetwork === 'cronos')
    return print(colors.error, 'Cronos not supported')

  const proposal = await adminClient.createProposal({
    contract: { address: config[network][CONTRACT_NAME].address, network: customNetwork },
    title: `Proposal to ${ACTION} for ${CONTRACT_NAME} Contract`,
    description: '',
    type: 'custom',
    functionInterface: {
      name: FUNCTION_NAME,
      inputs: FUNCTION_INPUTS,
    },
    functionInputs: FUNCTION_ARGS,
    via: config[network].Multisig.address,
    viaType: 'Gnosis Safe',
  })

  print(colors.bigSuccess, `Upgrade proposal created at: ${proposal.url}`)
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
