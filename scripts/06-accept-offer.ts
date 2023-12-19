import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../addresses'
import { colors, print, confirmOrDie } from '../utils/misc'
import { BigNumber } from 'ethers'
import { RentalOffer } from '../utils/types'
import { AddressZero, ONE_DAY } from '../utils/constants'
import { role2, role2Data } from './data/metadata'
import { toWei } from '../utils/bignumber'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  await confirmOrDie(
    `Are you sure you want to accept a rental offer ${config[NETWORK].RolesRegistry.address} for ${CONTRACT_NAME} on ${NETWORK} network?`,
  )

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const rentalOffer: RentalOffer = {
    nonce: '61050836279445536311651312414412730495440679733663147630707576233369883431442',
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    borrower: '0x0000000000000000000000000000000000000000',
    tokenAddress: '0x86935F11C86623deC8a25696E1C19a8659CbF95d',
    tokenId: 16640,
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',
    feeAmountPerSecond: toWei('0'),
    deadline: 1704310317,
    roles: [role2],
    rolesData: [role2Data],
  }
  const duration = ONE_DAY * 3
  const tx = await contract.acceptRentalOffer(rentalOffer, duration)

  print(colors.highlight, `Transaction hash: ${tx.hash}`)
  print(colors.success, `Accepted rental offer in ${CONTRACT_NAME} on ${NETWORK} network!`)
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
