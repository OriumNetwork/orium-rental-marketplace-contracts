import { ZeroAddress } from 'ethers'
import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'
import { randomBytes } from 'crypto'
import { etherPerDayToWeiPerSecond } from '../../utils/bignumber'
import { EMPTY_BYTES, ONE_DAY } from '../../utils/constants'
import { USER_ROLE } from '../../utils/roles'
import { ethers } from 'hardhat'
import { RentalOffer } from '../../utils/types'

const CONTRACT_NAME = 'NftRentalMarketplace'
const CONTRACT_FUNCTION = 'createRentalOffer'

async function main() {
  const blockTimestamp = (await ethers.provider.getBlock('latest'))!.timestamp
  const RENTAL_OFFER: RentalOffer = {
    nonce: `0x${randomBytes(32).toString('hex')}`,
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    borrower: ZeroAddress,
    tokenId: 1994,
    tokenAddress: '0xcb13945ca8104f813992e4315f8ffefe64ac49ca', // GLMR jungle address
    feeTokenAddress: '0xd10078fdbc835726c79533a4a19db40cfad69d7f', // GLMB address
    feeAmountPerSecond: etherPerDayToWeiPerSecond('0.01'),
    deadline: blockTimestamp + ONE_DAY,
    minDuration: 0,
    roles: [USER_ROLE],
    rolesData: [EMPTY_BYTES],
  }
  await callContractFunction(CONTRACT_NAME, CONTRACT_FUNCTION, [RENTAL_OFFER])
}

main()
  .then(() => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
