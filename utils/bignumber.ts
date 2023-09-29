import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

/**
 * @dev Converts decimal to wei
 * @param amount amount in string format
 * @param decimals optional field to specify the decimals, default is 18.
 * @returns
 */
export function toWei(amount: string, decimals = 18) {
  return ethers.utils.parseUnits(amount, decimals)
}

/**
 * @dev Converts wei to decimal
 * @param amount BigNumber amount in wei
 * @param decimals optional field to specify the decimals, default is 18.
 * @returns amount in string format
 */
export function fromWei(amount: BigNumber, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals)
}

export function amountFromPercentage(amount: BigNumber, percentage: BigNumber) {
  return amount.mul(percentage).div(toWei('100', 18))
}
