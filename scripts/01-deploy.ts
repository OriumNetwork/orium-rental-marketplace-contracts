import hre, { ethers, network, upgrades } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { confirmOrDie, print, colors } from '../utils/misc'
import { updateJsonFile } from '../utils/json'
import addresses, { Network } from '../addresses'
import { THREE_MONTHS } from '../utils/constants'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name as Network
const { Multisig, RolesRegistry } = addresses[NETWORK]

const CONTRACT_NAME = 'OriumMarketplace'
const OPERATOR_ADDRESS = Multisig.address
const MAX_DEADLINE = THREE_MONTHS.toString()
const INITIALIZER_ARGUMENTS: string[] = [OPERATOR_ADDRESS, RolesRegistry.address, MAX_DEADLINE]

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const FEE_DATA: any = {
  maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
  maxPriorityFeePerGas: ethers.utils.parseUnits('5', 'gwei'),
}
provider.getFeeData = async () => FEE_DATA
const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()
  confirmOrDie(`Deploying ${CONTRACT_NAME} contract on: ${NETWORK} network with ${deployerAddress}. Continue?`)

  const ContractFactory = await ethers.getContractFactory(CONTRACT_NAME, deployer)
  const contract = await upgrades.deployProxy(ContractFactory, INITIALIZER_ARGUMENTS)
  await contract.deployed()
  print(colors.success, `${CONTRACT_NAME} deployed to: ${contract.address}`)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [CONTRACT_NAME]: {
      address: contract.address,
      operator: OPERATOR_ADDRESS,
      implementation: await upgrades.erc1967.getImplementationAddress(contract.address),
      proxyAdmin: await upgrades.erc1967.getAdminAddress(contract.address),
    },
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
    const proxyAdminContract = new ethers.Contract(deploymentInfo[CONTRACT_NAME].proxyAdmin, abi, deployer)
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

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
