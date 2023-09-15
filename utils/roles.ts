import { ethers } from 'ethers'

export const USER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('USER_ROLE'))
