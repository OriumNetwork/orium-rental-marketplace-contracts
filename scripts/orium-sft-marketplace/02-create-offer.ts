import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { SftRentalOffer } from '../../utils/types'
import { AddressZero, ONE_DAY } from '../../utils/constants'
import { randomBytes } from 'crypto'
import { BigNumber } from 'ethers'
import { PLAYER_ROLE } from '../../utils/roles'
import { etherPerDayToWeiPerSecond } from '../../utils/bignumber'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp

  const rentalOffer: SftRentalOffer = {
    nonce: BigNumber.from(`0x${randomBytes(32).toString('hex')}`).toString(),
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906', // dev wallet
    borrower: AddressZero, // 0x31A14626579c3197B43DE563128c2171F4F840aD
    tokenAddress: '0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f', // wearables
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7', // GHST address
    roles: [PLAYER_ROLE],
    rolesData: ['0x'],
    commitmentId: BigNumber.from('0'),

    // parameters to update
    tokenAmount: BigNumber.from('1'),
    tokenId: 137,
    feeAmountPerSecond: etherPerDayToWeiPerSecond('0.173'),
    deadline: blockTimestamp + ONE_DAY * 19,
  }

  console.log('rentalOffer', rentalOffer)
  console.log(`offerId: ${rentalOffer.lender.toLowerCase()}-${BigNumber.from(rentalOffer.nonce).toString()}`)

  await confirmOrDie(
    `Are you sure you want to create a rental offer ${config[NETWORK].OriumSftMarketplace.address} for ${CONTRACT_NAME} on ${NETWORK} network?`,
  )

  const tx = await contract.createRentalOffer(rentalOffer, { gasPrice: 50 * 1e9 })

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
