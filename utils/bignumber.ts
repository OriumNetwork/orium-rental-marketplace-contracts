import { ethers } from 'hardhat'

/**
 * @dev Converts decimal to wei
 * @param amount amount in string format
 * @param decimals optional field to specify the decimals, default is 18.
 * @returns
 */
export function toWei(amount: string, decimals = 18) {
  return ethers.parseUnits(amount, decimals)
}

/**
 * @dev Converts wei to decimal
 * @param amount BigNumber amount in wei
 * @param decimals optional field to specify the decimals, default is 18.
 * @returns amount in string format
 */
export function fromWei(amount: bigint, decimals = 18) {
  return ethers.formatUnits(amount, decimals)
}

/**
 * @dev Converts ether per day to wei per second
 * @param amount The amount of ether per day
 * @returns The amount of wei per second
 */
export function etherPerDayToWeiPerSecond(amount: string) {
  return toWei(amount) / BigInt(60 * 60 * 24)
}
