import { ethers, network as hardhatNetwork, defender, upgrades } from 'hardhat'
import hre from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { updateJsonFile } from '../../utils/json'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address
  const OPERATOR_ADDRESS = config[NETWORK].Multisig.address

  await confirmOrDie(`Are you sure you want to propose an upgrade for ${CONTRACT_NAME} on ${NETWORK} network?`)

  print(colors.highlight, `Proposing upgrade for ${CONTRACT_NAME} on ${NETWORK} network...`)

  const newContract = await ethers.getContractFactory(CONTRACT_NAME)
  const proposal = await defender.proposeUpgrade(CONTRACT_ADDRESS, newContract)

  print(colors.success, `Upgrade proposal created at: ${proposal.url}`)

  const tx = await proposal.txResponse?.wait()

  const implementationAddress = tx?.contractAddress

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [CONTRACT_NAME]: {
      address: CONTRACT_ADDRESS,
      operator: OPERATOR_ADDRESS,
      implementation: implementationAddress,
      proxyAdmin: await upgrades.erc1967.getAdminAddress(CONTRACT_ADDRESS),
    },
  }

  console.log(deploymentInfo)

  updateJsonFile(`addresses/${NETWORK}/index.json`, deploymentInfo)

  print(colors.success, 'Config files updated!')

  try {
    print(colors.highlight, 'Verifying implementation...')
    await hre.run('verify:verify', {
      address: implementationAddress,
      network: NETWORK,
      constructorArguments: [],
    })
    print(colors.success, 'Contract verified!')
  } catch (e) {
    print(colors.error, `Error verifying contract: ${e}`)
  }
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
