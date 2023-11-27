import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../addresses'
import { colors, print, confirmOrDie } from '../utils/misc'
import { RentalOffer } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY } from '../utils/constants'
import { randomBytes } from 'crypto'
import { toWei } from '../utils/bignumber'
import { USER_ROLE } from '../utils/roles'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  await confirmOrDie(
    `Are you sure you want to create a rental offer ${config[NETWORK].RolesRegistry.address} for ${CONTRACT_NAME} on ${NETWORK} network?`,
  )

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp

  const rentalOffer: RentalOffer = {
    nonce: `0x${randomBytes(32).toString('hex')}`,
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    borrower: AddressZero,
    tokenAddress: '0x86935F11C86623deC8a25696E1C19a8659CbF95d',
    tokenId: 13477, //13477,
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',
    feeAmountPerSecond: toWei('0.999999999907421'),
    deadline: blockTimestamp + ONE_DAY,
    roles: [USER_ROLE],
    rolesData: [EMPTY_BYTES],
  }
  const tx = await contract.createRentalOffer(rentalOffer)

  print(colors.highlight, `Transaction hash: ${tx.hash}`)
  print(colors.success, `Created rental offer in ${CONTRACT_NAME} on ${NETWORK} network!`)
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
