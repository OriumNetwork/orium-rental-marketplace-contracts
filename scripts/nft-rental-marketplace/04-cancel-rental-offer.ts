import { print, colors } from '../../utils/misc'
import { callContractFunction } from '../../utils/write-contract'
import { etherPerDayToWeiPerSecond } from '../../utils/bignumber'
import { EMPTY_BYTES } from '../../utils/constants'
import { USER_ROLE_MOONBEAM } from '../../utils/roles'
import { RentalOffer } from '../../utils/types'

const CONTRACT_NAME = 'NftRentalMarketplace'
const CONTRACT_FUNCTION = 'cancelRentalOffer'

async function main() {
  const RENTAL_OFFER: RentalOffer = {
    nonce: '41073076454465649804684789998370311225937584494094599799884085085462612297440',
    lender: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    borrower: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
    tokenId: 1994,
    tokenAddress: '0xcb13945ca8104f813992e4315f8ffefe64ac49ca', // GLMR jungle address
    feeTokenAddress: '0xd10078fdbc835726c79533a4a19db40cfad69d7f', // GLMB address
    feeAmountPerSecond: etherPerDayToWeiPerSecond('0'),
    deadline: 1714599360,
    minDuration: 0,
    roles: [USER_ROLE_MOONBEAM],
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
