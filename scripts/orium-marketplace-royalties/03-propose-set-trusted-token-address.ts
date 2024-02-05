import { network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { print, colors, confirmOrDie } from '../../utils/misc'
import { AdminClient } from 'defender-admin-client'

const network: Network = hardhatNetwork.name as Network
const TOKEN_ADDRESSES = ['0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f', '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7'] //wearables address polygon
const IS_APPROVED = [true, false]
async function main() {
  await confirmOrDie(
    `Are you sure you want to create Defender Proposal to set trusted Nft token address on ${network} network?`,
  )
  print(colors.highlight, `Create Defender Upgrade Proposal...`)
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
    contract: { address: config[network].OriumMarketplaceRoyalties.address, network: customNetwork },
    title: 'Proposal to set Trusted Nft Token Addresses for Orium Marketplace Royalties Contract',
    description: '',
    type: 'custom',
    functionInterface: {
      name: 'setTrustedNftTokens',
      inputs: [
        { type: 'address[]', name: '_tokenAddresses' },
        { type: 'bool[]', name: '_isTrusted' },
      ],
    },
    functionInputs: [TOKEN_ADDRESSES, IS_APPROVED],
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
