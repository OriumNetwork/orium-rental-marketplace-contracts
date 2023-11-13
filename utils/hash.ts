import { DirectRental } from './types'
import { keccak256, defaultAbiCoder as abi } from 'ethers/lib/utils'

export function hashDirectRental(directRental: DirectRental) {
  const encodedDirectRental = abi.encode(
    ['address', 'uint256', 'address', 'address', 'uint64', 'bytes32[]', 'bytes[]'],
    [
      directRental.tokenAddress,
      directRental.tokenId,
      directRental.lender,
      directRental.borrower,
      directRental.duration,
      directRental.roles,
      directRental.rolesData,
    ],
  )

  return keccak256(encodedDirectRental)
}
