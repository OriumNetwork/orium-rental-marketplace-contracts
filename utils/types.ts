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

export interface DirectRental {
  tokenAddress: string
  tokenId: number
  lender: string
  borrower: string
  duration: number
  roles: string[]
  rolesData: string[]
}

export interface SftRentalOffer extends RentalOffer {
  minDuration: number
  tokenAmount: BigNumber
  commitmentId: BigNumber
}

export interface CommitAndGrantRoleParams {
  commitmentId: BigNumber
  tokenAddress: string
  tokenId: number
  tokenAmount: BigNumber
  role: string
  grantee: string
  expirationDate: number
  revocable: boolean
  data: string
}
