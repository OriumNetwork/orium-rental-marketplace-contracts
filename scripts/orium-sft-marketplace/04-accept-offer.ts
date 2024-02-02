import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { BigNumber } from 'ethers'
import { SftRentalOffer } from '../../utils/types'
import { AddressZero, ONE_DAY } from '../../utils/constants'
import { UNIQUE_ROLE } from '../../utils/roles'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  await confirmOrDie(`Are you sure you want to accept a rental offer in ${CONTRACT_NAME} on ${NETWORK} network?`)

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const rentalOffer: SftRentalOffer = {
    nonce: '88503925159079469072461611536684263787861271681407587493144538997301870344226',
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906', // dev wallet
    borrower: AddressZero,
    tokenAddress: '0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f', // wearables
    tokenId: 350,
    tokenAmount: BigNumber.from('1'),
    commitmentId: BigNumber.from('8'),
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7', // GHST address
    feeAmountPerSecond: BigNumber.from('1'),
    deadline: 1712093925,
    roles: [UNIQUE_ROLE],
    rolesData: ['0x'],
  }
  const duration = ONE_DAY * 59
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
