export interface FeeInfo {
  feePercentageInWei: bigint
  isCustomFee: boolean
}

export interface RoyaltyInfo {
  creator: string
  royaltyPercentageInWei: bigint
  treasury: string
}

export interface RentalOffer {
  nonce: string
  lender: string
  borrower: string
  tokenAddress: string
  tokenId: number
  feeTokenAddress: string
  feeAmountPerSecond: bigint
  deadline: number
  minDuration: number
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
  tokenAmount: bigint
  commitmentId: bigint
}

export interface CommitAndGrantRoleParams {
  commitmentId: bigint
  tokenAddress: string
  tokenId: number
  tokenAmount: bigint
  role: string
  grantee: string
  expirationDate: number
  revocable: boolean
  data: string
}

export interface GrantRoleParams {
  roleId: string
  tokenAddress: string
  tokenId: number
  recipient: string
  expirationDate: number
  revocable: boolean
  data: string
}
