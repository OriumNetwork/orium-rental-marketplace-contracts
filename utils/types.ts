import { BigNumber } from 'ethers'

export interface FeeInfo {
  feePercentageInWei: BigNumber
  isCustomFee: boolean
}

export interface RoyaltyInfo {
  creator: string
  royaltyPercentageInWei: BigNumber
  treasury: string
}

export interface RentalOffer {
  nonce: string
  lender: string
  borrower: string
  tokenAddress: string
  tokenId: number
  feeTokenAddress: string
  feeAmountPerSecond: BigNumber
  deadline: number
  roles: string[]
  rolesData: string[]
}
