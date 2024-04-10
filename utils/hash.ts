import { AbiCoder, keccak256 } from 'ethers'
import { DirectRental } from './types'

export function hashDirectRental(directRental: DirectRental) {
  const encodedDirectRental = AbiCoder.defaultAbiCoder().encode(
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
