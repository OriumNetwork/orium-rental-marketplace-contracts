import hre, { ethers, network, upgrades } from 'hardhat'
import { AwsKmsSigner } from '@govtechsg/ethers-aws-kms-signer'
import { confirmOrDie, print, colors } from '../utils/misc'
import addresses, { Network } from '../addresses'
import { THREE_MONTHS } from '../utils/constants'
import config from '../addresses'
import { keccak256 } from 'ethers/lib/utils'
import TransparentUpgradeableProxy from '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json'
import { updateJsonFile } from '../utils/json'

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
const deployer = new AwsKmsSigner(kmsCredentials).connect(provider)

async function main() {
  const deployerAddress = await deployer.getAddress()
  await confirmOrDie(
    `Are you sure you want to deploy ${CONTRACT_NAME} to ${NETWORK} using ${deployerAddress} for deployer and ${OPERATOR_ADDRESS} as operator?`,
  )

  print(colors.highlight, `Deploying ProxyAdmin to ${NETWORK}...`)
  // Deploy ProxyAdmin and update network files, if there is a ProxyAdmin already deployed it will use it
  const proxyAdminAddress = await upgrades.deployProxyAdmin(deployer)
  print(colors.success, `ProxyAdmin deployed to ${NETWORK} at ${proxyAdminAddress}`)

  print(colors.highlight, `Deploying implementation to ${NETWORK}...`)
  const ImplementationFactory = await ethers.getContractFactory(CONTRACT_NAME, deployer)
  // We are not using upgrades.deployImplementation here because it will only update the storage layout of the implementation
  // And it will clash when we try to forceImport the proxy network files
  // This way we can have both (implementation and proxy) imported in the network files
  const implementation = await ImplementationFactory.deploy()
  await implementation.deployed()
  print(colors.success, `Implementation deployed to ${NETWORK} at ${implementation.address}`)

  print(colors.highlight, `Deploying proxy to ${NETWORK} with CREATE2...`)

  const create2Factory = await ethers.getContractAt(
    'IImmutableOwnerCreate2Factory',
    config[NETWORK].ImmutableOwnerCreate2Factory.address,
    deployer,
  )

  // encoding the implementation initialize function call with the arguments
  const implementationInitData = ImplementationFactory.interface.encodeFunctionData('initialize', INITIALIZER_ARGUMENTS)
  // encoding the TransparentUpgradeableProxy constructor call with the implementation address, proxy admin address and implementation initialize function call
  // this is the bytecode that will be deployed with CREATE2
  const bytecode = ethers.utils.concat([
    TransparentUpgradeableProxy.bytecode,
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'bytes'],
      // Here we are passing the implementation address, proxy admin address that will be set for TransparentUpgradeableProxy
      // and initialize data that will be called on implementation with delegatecall (implementationInitData)
      [implementation.address, proxyAdminAddress, implementationInitData],
    ),
  ])
  const salt = '0x00000000000000000000000000000000000000008b99e5a778edb02572010000'

  // computing the proxy address that will be deployed with CREATE2
  const proxyContractAddress = await create2Factory.computeAddress(salt, keccak256(bytecode))
  print(colors.highlight, `Proxy will be deployed to ${proxyContractAddress}, deploying...`)

  // deploying the proxy with CREATE2, this will deploy the bytecode we computed above
  const tx = await create2Factory.deploy(salt, bytecode)
  print(colors.highlight, `Waiting for transaction to be mined..., tx: ${tx.hash}`)
  await tx.wait()
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
    /* print(colors.error, `Proxy not verified`)
    console.error(e) */
  }

  // THE FOLLOWING CODE IS THE SAME AS THE 01-deploy.ts (previous deploy script)

  print(colors.highlight, 'Updating config files...')
  const deploymentInfo = {
    [CONTRACT_NAME]: {
      address: proxyContractAddress,
      operator: OPERATOR_ADDRESS,
      implementation: implementation.address,
      proxyAdmin: proxyAdminAddress,
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
}

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
