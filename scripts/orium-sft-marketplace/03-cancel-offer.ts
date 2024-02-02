import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { BigNumber } from 'ethers'
import { SftRentalOffer } from '../../utils/types'
import { UNIQUE_ROLE } from '../../utils/roles'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  await confirmOrDie(`Are you sure you want to cancel a rental offer in ${CONTRACT_NAME} on ${NETWORK} network?`)

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const rentalOffer: SftRentalOffer = {
    nonce: '5928844861723570350162087238045846869618317702381369314165749520973527938609',
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906', // dev wallet
    borrower: '0x596aa1f9EF171075860dFf6062Fe2009991B2323',
    tokenAddress: '0x58de9AaBCaeEC0f69883C94318810ad79Cc6a44f', // wearables
    tokenId: 350,
    tokenAmount: BigNumber.from('1'),
    commitmentId: BigNumber.from('7'),
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7', // GHST address
    feeAmountPerSecond: BigNumber.from('1'),
    deadline: 1712092456,
    roles: [UNIQUE_ROLE],
    rolesData: ['0x'],
  }

  const tx = await contract.cancelRentalOffer(rentalOffer)

  print(colors.highlight, `Transaction hash: ${tx.hash}`)
  print(colors.success, `Cancelled rental offer in ${CONTRACT_NAME} on ${NETWORK} network!`)
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
