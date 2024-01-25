import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { RentalOffer } from '../../utils/types'
import { AddressZero, ONE_DAY } from '../../utils/constants'
import { randomBytes } from 'crypto'
import { toWei } from '../../utils/bignumber'
import { BigNumber } from 'ethers'
import { data1, data2, role1, role1Data, role2, role2Data, roleMetadata1, roleMetadata2 } from './data/metadata'
import { defaultAbiCoder as abi } from 'ethers/lib/utils'
import { inputsToTypes } from '../../utils/role-metadata'

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
    nonce: BigNumber.from(`0x${randomBytes(32).toString('hex')}`).toString(),
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    borrower: '0x596aa1f9EF171075860dFf6062Fe2009991B2323',
    tokenAddress: '0x86935F11C86623deC8a25696E1C19a8659CbF95d',
    tokenId: 13477, //13477,14733,16640
    feeTokenAddress: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',
    feeAmountPerSecond: toWei('0'),
    deadline: blockTimestamp + ONE_DAY * 60,
    roles: [role2],
    rolesData: [role2Data],
  }

  const role1DataDecoded = abi.decode(inputsToTypes(roleMetadata1.inputs), role1Data)
  const role2DataDecoded = abi.decode(inputsToTypes(roleMetadata2.inputs), role2Data)

  console.log('role1DataDecoded', role1DataDecoded)
  console.log('role2DataDecoded', role2DataDecoded)

  const tx = await contract.createRentalOffer(rentalOffer)

  console.log('rentalOffer', rentalOffer)
  console.log(`offerId: ${rentalOffer.lender.toLowerCase()}-${BigNumber.from(rentalOffer.nonce).toString()}`)

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
