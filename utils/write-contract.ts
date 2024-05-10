import { network, ethers } from 'hardhat'
import config, { Network } from '../addresses'
import { print, colors, confirmOrDie } from '../utils/misc'
import { kmsProvider } from './deployer'
import { Signer } from 'ethers'

const NETWORK = network.name as Network

/**
 * @notice Send a transaction to a contract
 * @dev The contract must be deployed on the network and the solidity file in the contracts folder
 * @param CONTRACT_NAME The name of the contract
 * @param FUNCTION_NAME The function to call
 * @param FUNCTION_ARGUMENTS The arguments to pass to the function
 * @param OPTIONS The custom fee data, signer or contract file name
 */
export async function callContractFunction(
  CONTRACT_NAME: keyof (typeof config)[Network] | string,
  FUNCTION_NAME: string,
  FUNCTION_ARGUMENTS: any,
  OPTIONS: {
    CUSTOM_FEE_DATA?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
    CUSTOM_SIGNER?: Signer
    CUSTOM_CONTRACT_ADDRESS?: string
  },
) {
  const { CUSTOM_FEE_DATA, CUSTOM_SIGNER, CUSTOM_CONTRACT_ADDRESS } = OPTIONS
  const signer = CUSTOM_SIGNER || (await ethers.getSigners())[0]
  console.log('CONTRACT_NAME', CONTRACT_NAME)
  await confirmOrDie(
    `Are you sure you want to call ${FUNCTION_NAME} in ${CONTRACT_NAME} contract on ${NETWORK} network?`,
  )
  if (CUSTOM_FEE_DATA !== undefined) {
    const FEE_DATA: any = CUSTOM_FEE_DATA
    kmsProvider.getFeeData = async () => FEE_DATA
  }
  print(colors.warn, `Arguments:`)
  console.log(FUNCTION_ARGUMENTS)
  const contract = await ethers.getContractAt(
    CONTRACT_NAME,
    CUSTOM_CONTRACT_ADDRESS ?? config[NETWORK][CONTRACT_NAME as keyof (typeof config)[Network]].address,
    signer,
  )
  print(colors.highlight, `Sending Transaction...`)
  const response = await contract[FUNCTION_NAME](...FUNCTION_ARGUMENTS)
  print(colors.highlight, `Waiting for transaction to be mined...`)
  const transaction = await response.wait()
  print(colors.bigSuccess, `Transaction sent! txHash: ${transaction?.hash}`)
}
