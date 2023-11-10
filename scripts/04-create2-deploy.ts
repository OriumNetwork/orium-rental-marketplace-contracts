import hre, { ethers, network, upgrades } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { confirmOrDie, print, colors } from '../utils/misc'
import addresses, { Network } from '../addresses'
import { THREE_MONTHS } from '../utils/constants'
import { keccak256 } from 'ethers/lib/utils'
import {
  abi as proxyAbi,
  bytecode as proxyBytecode,
} from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json'
import {
  abi as proxyAdminAbi,
  bytecode as proxyAdminBytecode,
} from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json'
import { updateJsonFile } from '../utils/json'
import { defaultAbiCoder as abi, concat } from 'ethers/lib/utils'
import { Contract, ContractFactory } from 'ethers'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}

const NETWORK = network.name as Network
const { Multisig, RolesRegistry, IImmutableProxyCreate2Factory } = addresses[NETWORK]

const CONTRACT_NAME = 'OriumMarketplace'
const OPERATOR_ADDRESS = Multisig.address
const MAX_DEADLINE = THREE_MONTHS.toString()
const INITIALIZER_ARGUMENTS: string[] = [OPERATOR_ADDRESS, RolesRegistry.address, MAX_DEADLINE]
const SALT = '0x00000000000000000000000000000000000000008b99e5a778edb02572010000'

const networkConfig: any = network.config
const provider = new ethers.providers.JsonRpcProvider(networkConfig.url || '')
const FEE_DATA: any = {
  maxFeePerGas: ethers.utils.parseUnits('215', 'gwei'),
  maxPriorityFeePerGas: ethers.utils.parseUnits('5', 'gwei'),
}
provider.getFeeData = async () => FEE_DATA
const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()
  const create2Factory = await ethers.getContractAt(
    'IImmutableProxyCreate2Factory',
    IImmutableProxyCreate2Factory.address,
    deployer,
  )

  await confirmOrDie(
    `Are you sure you want to deploy ${CONTRACT_NAME} to ${NETWORK} using ${deployerAddress} for deployer and ${OPERATOR_ADDRESS} as operator?`,
  )

  print(colors.highlight, `Deploying ProxyAdmin to ${NETWORK}...`)
  const ProxyAdminFactory = await ethers.getContractFactory(proxyAdminAbi, proxyAdminBytecode, deployer)
  const callData = generateTransferOwnershipCallData(OPERATOR_ADDRESS)
  const proxyAdminAddress = await create2DeployWithFactory(create2Factory, ProxyAdminFactory, [], SALT, callData)
  print(colors.success, `ProxyAdmin deployed to ${NETWORK} at ${proxyAdminAddress}`)

  print(colors.highlight, `Deploying implementation to ${NETWORK}...`)
  const ImplementationFactory = await ethers.getContractFactory(CONTRACT_NAME, deployer)
  const implementationAddress = await create2DeployWithFactory(create2Factory, ImplementationFactory, [], SALT)
  print(colors.success, `Implementation deployed to ${NETWORK} at ${implementationAddress}`)

  print(colors.highlight, `Deploying proxy to ${NETWORK} with CREATE2...`)
  const ProxyFactory = await ethers.getContractFactory(proxyAbi, proxyBytecode, deployer)
  const initializerData = ImplementationFactory.interface.encodeFunctionData('initialize', INITIALIZER_ARGUMENTS)
  const proxyConstructorArgs = [implementationAddress, proxyAdminAddress, '0x']
  const proxyContractAddress = await create2DeployWithFactory(
    create2Factory,
    ProxyFactory,
    proxyConstructorArgs,
    SALT,
    initializerData,
  )
  print(colors.success, `Proxy deployed to ${proxyContractAddress}`)

  // We need this to import to the network files the implementation WITH proxy address
  try {
    print(colors.highlight, `Fetching proxy network files...`)
    await upgrades.forceImport(proxyContractAddress, ImplementationFactory, { kind: 'transparent' })
    print(colors.success, `Proxy network files fetched`)
  } catch (e) {
    print(colors.error, `Proxy network files not found`)
    console.error(e)
  }

  // it will fail to verify proxy because transaction hash is different than the one used to verify
  // but it will still verify the implementation and link the proxy to the implementation
  try {
    print(colors.highlight, `Verifying proxy...`)
    await hre.run('verify:verify', {
      address: proxyContractAddress,
      constructorArguments: [],
    })
    print(colors.success, `Proxy verified!`)
  } catch (e) {
    console.error(e)
  }

  // THE FOLLOWING CODE IS THE SAME AS THE 01-deploy.ts (previous deploy script)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [CONTRACT_NAME]: {
      address: proxyContractAddress,
      operator: OPERATOR_ADDRESS,
      implementation: implementationAddress,
      proxyAdmin: proxyAdminAddress,
    },
  }

  console.log(deploymentInfo)

  updateJsonFile(`addresses/${NETWORK}/index.json`, deploymentInfo)

  print(colors.success, 'Config files updated!')
}

async function create2DeployWithFactory(
  create2Factory: Contract,
  factory: ContractFactory,
  args: any[],
  salt: string,
  callData?: string,
) {
  if (factory.interface.deploy.inputs.length !== args.length) {
    throw new Error('Arguments length does not match factory inputs length')
  }
  print(colors.highlight, `Deploying contract to ${NETWORK} with CREATE2...`)

  let bytecode: string | Uint8Array = factory.bytecode
  console.log('factory.interface.deploy.inputs.length: ', factory.interface.deploy.inputs.length)
  if (factory.interface.deploy.inputs.length > 0) {
    const encodedArgs = abi.encode(
      factory.interface.deploy.inputs.map(paramType => paramType.type),
      args,
    )
    bytecode = concat([factory.bytecode, encodedArgs])
  }

  const deploymentAddress = await create2Factory.computeAddress(salt, keccak256(bytecode))
  console.log('deploymentAddress: ', deploymentAddress)
  let tx
  if (callData) {
    tx = await create2Factory.deployAndCall(salt, bytecode, callData)
  } else {
    tx = await create2Factory.deploy(salt, bytecode)
  }
  print(colors.highlight, `Waiting for transaction to be mined..., tx: ${tx.hash}`)
  await tx.wait()
  print(colors.success, `Contract deployed to ${deploymentAddress}`)
  return deploymentAddress
}

function generateTransferOwnershipCallData(newOwner: string) {
  // encode transferOwnership call with newOwner as argument
  // to be call as adddress.call(transferOwnershipCallData)

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

  return new ethers.utils.Interface(abi).encodeFunctionData('transferOwnership', [newOwner])
}

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
