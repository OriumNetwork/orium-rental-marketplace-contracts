import { ethers, network as hardhatNetwork, defender, upgrades } from 'hardhat'
import hre from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { updateJsonFile } from '../../utils/json'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address
  const LIBRARY_NAME = 'LibOriumSftMarketplace'
  const OPERATOR_ADDRESS = config[NETWORK].Multisig.address

  await confirmOrDie(`Are you sure you want to propose an upgrade for ${CONTRACT_NAME} on ${NETWORK} network?`)

  print(colors.highlight, `Proposing upgrade for ${CONTRACT_NAME} on ${NETWORK} network...`)

  print(colors.highlight, 'Deploying new library...')
  const LibraryFactory = await ethers.getContractFactory(LIBRARY_NAME)
  const library = await LibraryFactory.deploy({
    maxFeePerGas: ethers.parseUnits('120', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('50', 'gwei'),
  })
  print(colors.highlight, 'Waiting for library deployment...')
  await library.waitForDeployment()
  const libraryAddress = await library.getAddress()
  print(colors.success, `Library deployed at: ${libraryAddress}`)

  const newContract = await ethers.getContractFactory(CONTRACT_NAME, {
    libraries: { [LIBRARY_NAME]: libraryAddress },
  })
  const proposal = await defender.proposeUpgrade(CONTRACT_ADDRESS, newContract, {
    unsafeAllowLinkedLibraries: true,
  })

  const tx = await proposal.txResponse?.wait()
  const implementationAddress = tx?.contractAddress

  print(colors.success, `Upgrade proposal created at: ${proposal.url}`)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [CONTRACT_NAME]: {
      address: CONTRACT_ADDRESS,
      operator: OPERATOR_ADDRESS,
      implementation: implementationAddress,
      proxyAdmin: await upgrades.erc1967.getAdminAddress(CONTRACT_ADDRESS),
      libraries: [libraryAddress],
    },
  }

  console.log(deploymentInfo)

  updateJsonFile(`addresses/${NETWORK}/index.json`, deploymentInfo)

  print(colors.success, 'Config files updated!')

  print(colors.highlight, 'Verifying Library...')
  try {
    print(colors.highlight, `Verifying ${libraryAddress}...`)
    await hre.run('verify:verify', {
      address: libraryAddress,
      network: NETWORK,
      constructorArguments: [],
    })
    print(colors.success, 'Contract verified!')
  } catch (e) {
    print(colors.error, `Error verifying library ${libraryAddress}: ${e}`)
  }

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
