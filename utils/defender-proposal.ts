import { network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../addresses'
import { print, colors, confirmOrDie } from '../utils/misc'
import { AdminClient } from 'defender-admin-client'

const NETWORK: Network = hardhatNetwork.name as Network
const DEFENDER_API_KEY = process.env.DEFENDER_TEAM_API_KEY
const DEFENDER_API_SECRET = process.env.DEFENDER_TEAM_API_SECRET_KEY

/**
 * @notice Create Defender Proposal
 * @dev This function creates a Defender Proposal
 * @param CONTRACT_NAME The contract name from the config file
 * @param FUNCTION_NAME The function name to be called
 * @param FUNCTION_INPUTS_TYPE The function inputs type
 * @param FUNCTION_INPUTS The function inputs
 */
export async function createDefenderProposal(
  CONTRACT_NAME: keyof (typeof config)[Network],
  FUNCTION_NAME: string,
  FUNCTION_INPUTS_TYPE: { type: string; name: string }[],
  FUNCTION_INPUTS: any[],
) {
  console.log(FUNCTION_INPUTS_TYPE)
  console.log(FUNCTION_INPUTS)
  await confirmOrDie(`Are you sure you want to create Defender Proposal to ${FUNCTION_NAME} on ${NETWORK} network?`)

  print(colors.highlight, `Create Defender Upgrade Proposal...`)
  if (!DEFENDER_API_KEY || !DEFENDER_API_SECRET) return print(colors.error, 'Missing Defender API Key or Secret')
  const adminClient = new AdminClient({
    apiKey: DEFENDER_API_KEY,
    apiSecret: DEFENDER_API_SECRET,
  })

  const customNetwork = NETWORK === 'polygon' ? 'matic' : NETWORK
  if (customNetwork === 'cronosTestnet' || customNetwork === 'cronos')
    return print(colors.error, 'Cronos not supported')

  const proposal = await adminClient.createProposal({
    contract: { address: config[NETWORK][CONTRACT_NAME].address, network: customNetwork },
    title: `Proposal to ${FUNCTION_NAME} on ${CONTRACT_NAME}`,
    description: '',
    type: 'custom',
    functionInterface: {
      name: FUNCTION_NAME,
      inputs: FUNCTION_INPUTS_TYPE,
    },
    functionInputs: FUNCTION_INPUTS,
    via: config[NETWORK].Multisig.address,
    viaType: 'Gnosis Safe',
  })

  print(colors.bigSuccess, `Upgrade proposal created at: ${proposal.url}`)
}
