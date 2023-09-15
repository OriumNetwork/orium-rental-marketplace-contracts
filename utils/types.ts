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
