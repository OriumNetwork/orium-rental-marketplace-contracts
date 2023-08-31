import { ethers } from 'hardhat'

export const RolesRegistryAddress = '0x8680fC3Df31805B1F7f8BfB702f723460d360FE9' // RolesRegistry has the same address on all networks
export const ONE_DAY = 60 * 60 * 24
export const EMPTY_BYTES = '0x'
export const USER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('USER_ROLE'))
