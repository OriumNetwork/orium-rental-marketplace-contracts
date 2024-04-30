import hre, { ethers, network, upgrades } from 'hardhat'
import { print, confirmOrDie, colors } from './misc'
import { Network } from '../addresses'
import { updateJsonFile } from './json'
import { AwsKmsSigner } from './ethers-aws-kms-signer'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}
const NETWORK = network.name as Network
const networkConfig: any = network.config
const provider = new ethers.JsonRpcProvider(networkConfig.url || '')
const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)
export async function deployUpgradeableContract(
  PROXY_CONTRACT_NAME: string,
  OPERATOR_ADDRESS: string,
  INITIALIZER_ARGUMENTS: string[],
  LIBRARIES_CONTRACT_NAME?: string[],
  CUSTOM_FEE_DATA?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
) {
  if (CUSTOM_FEE_DATA !== undefined) {
    const FEE_DATA: any = CUSTOM_FEE_DATA
    provider.getFeeData = async () => FEE_DATA
  }
  const deployerAddress = await deployer.getAddress()
  const libraries: { [key: string]: string } = {}

  await confirmOrDie(
    `Deploying ${PROXY_CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`,
  )

  if (LIBRARIES_CONTRACT_NAME !== undefined) {
    print(colors.highlight, 'Deploying libraries...')

    for (const LIBRARY_CONTRACT_NAME of LIBRARIES_CONTRACT_NAME) {
      const LibraryFactory = await ethers.getContractFactory(LIBRARY_CONTRACT_NAME, deployer)
      const library = await LibraryFactory.deploy()
      await library.waitForDeployment()
      libraries[LIBRARY_CONTRACT_NAME] = await library.getAddress()
    }

    print(colors.success, 'Libraries deployed!')
  }

  print(colors.highlight, 'Deploying proxy contract...')
  console.log('INITIALIZER_ARGUMENTS', INITIALIZER_ARGUMENTS)
  const ContractFactory = await ethers.getContractFactory(PROXY_CONTRACT_NAME, {
    libraries,
    signer: deployer,
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
    const proxyAdminContract = new ethers.Contract(deploymentInfo[PROXY_CONTRACT_NAME].proxyAdmin, abi, deployer)
    await proxyAdminContract.transferOwnership(OPERATOR_ADDRESS)
    print(colors.success, `Proxy admin ownership transferred to: ${OPERATOR_ADDRESS}`)
  } catch (e) {
    print(colors.error, `Error transferring proxy admin ownership: ${e}`)
  }

  if (LIBRARIES_CONTRACT_NAME) {
    print(colors.highlight, 'Verifying libraries on Etherscan...')
    for (const LIBRARY_CONTRACT_NAME of LIBRARIES_CONTRACT_NAME) {
      try {
        print(colors.highlight, `Verifying library ${LIBRARY_CONTRACT_NAME}...`)
        await hre.run('verify:verify', {
          address: libraries[LIBRARY_CONTRACT_NAME],
          constructorArguments: [],
        })
        print(colors.success, `${LIBRARY_CONTRACT_NAME} verified!`)
      } catch (e) {
        print(colors.error, `Error verifying library ${LIBRARY_CONTRACT_NAME}: ${e}`)
      }
    }
  }

  print(colors.highlight, 'Verifying contract on Etherscan...')
  await hre.run('verify:verify', {
    address: await contract.getAddress(),
    constructorArguments: [],
  })
  print(colors.success, `${PROXY_CONTRACT_NAME} verified!`)
}
