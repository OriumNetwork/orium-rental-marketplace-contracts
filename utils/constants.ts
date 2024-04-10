import { ethers } from 'hardhat'

export const RolesRegistryAddress = '0xB2aD616e84e1eF7A9ED0fA3169AAF31Ee51EA824' // RolesRegistry has the same address on all networks
export const ONE_DAY = 60 * 60 * 24
export const ONE_HOUR = 60 * 60
export const THREE_MONTHS = 60 * 60 * 24 * 30 * 3
export const EMPTY_BYTES = '0x'
export const MAX_PERCENTAGE = ethers.parseEther('100')
export const DIRECT_RENTAL_NONCE = 0
export const { ZeroHash: HashZero, ZeroAddress: AddressZero } = ethers
