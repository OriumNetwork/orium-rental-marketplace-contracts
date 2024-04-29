import hre, { ethers, network, upgrades } from 'hardhat'
import { print, confirmOrDie, colors } from './misc'
import { Network } from '../addresses'
import { updateJsonFile } from './json'

const NETWORK = network.name as Network
export async function deployUpgradeableContract(
  PROXY_CONTRACT_NAME: string,
  OPERATOR_ADDRESS: string,
  INITIALIZER_ARGUMENTS: string[],
  LIBRARIES_CONTRACT_NAME?: string[],
) {
  const deployerAddress = (await ethers.getSigners())[0]
  const libraries: { [key: string]: string } = {}

  confirmOrDie(`Deploying ${PROXY_CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`)

  if (LIBRARIES_CONTRACT_NAME !== undefined) {
    print(colors.highlight, 'Deploying libraries...')

    for (const LIBRARY_CONTRACT_NAME of LIBRARIES_CONTRACT_NAME) {
      const LibraryFactory = await ethers.getContractFactory(LIBRARY_CONTRACT_NAME)
      const library = await LibraryFactory.deploy()
      await library.waitForDeployment()
      libraries[LIBRARY_CONTRACT_NAME] = await library.getAddress()
    }

    print(colors.success, 'Libraries deployed!')
  }

  print(colors.highlight, 'Deploying proxy contract...')
  const ContractFactory = await ethers.getContractFactory(PROXY_CONTRACT_NAME, {
    libraries,
  })
  const contract = await upgrades.deployProxy(ContractFactory, INITIALIZER_ARGUMENTS, {
    unsafeAllowLinkedLibraries: true,
  })
  await contract.waitForDeployment()
  print(colors.success, `${PROXY_CONTRACT_NAME} deployed to: ${contract.address}`)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo: any = {
    [PROXY_CONTRACT_NAME]: {
      address: await contract.getAddress(),
      operator: OPERATOR_ADDRESS,
      implementation: await upgrades.erc1967.getImplementationAddress(await contract.getAddress()),
      proxyAdmin: await upgrades.erc1967.getAdminAddress(await contract.getAddress()),
    },
  }

  if (LIBRARIES_CONTRACT_NAME) {
    deploymentInfo[PROXY_CONTRACT_NAME].libraries = libraries
  }

  console.log(deploymentInfo)

  updateJsonFile(`addresses/${NETWORK}/index.json`, deploymentInfo)

  print(colors.success, 'Config files updated!')

  try {
    print(colors.highlight, 'Transferring proxy admin ownership...')
    const abi = [
      {
        inputs: [
          {
            internalType: 'address',
            name: 'newOwner',
            type: 'address',
          },
        ],
        name: 'transferOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ]
    const proxyAdminContract = new ethers.Contract(deploymentInfo[PROXY_CONTRACT_NAME].proxyAdmin, abi)
    await proxyAdminContract.transferOwnership(OPERATOR_ADDRESS)
    print(colors.success, `Proxy admin ownership transferred to: ${OPERATOR_ADDRESS}`)
  } catch (e) {
    print(colors.error, `Error transferring proxy admin ownership: ${e}`)
  }

  print(colors.highlight, 'Verifying contract on Etherscan...')
  await hre.run('verify:verify', {
    address: contract.address,
    constructorArguments: [],
  })
  print(colors.success, 'Contract verified!')
}
