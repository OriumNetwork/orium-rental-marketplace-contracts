import { ethers } from 'ethers'

export const RolesRegistryAddress = '0x4c7E4a30a749d78935ED7674590026f7b74AFea0' // RolesRegistry has the same address on all networks
export const ONE_DAY = 60 * 60 * 24
export const ONE_HOUR = 60 * 60
export const THREE_MONTHS = 60 * 60 * 24 * 30 * 3
export const EMPTY_BYTES = '0x'
export const MAX_PERCENTAGE = ethers.utils.parseEther('100')
export const { HashZero, AddressZero } = ethers.constants
