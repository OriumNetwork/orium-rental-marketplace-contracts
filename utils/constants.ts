import { ethers } from 'ethers'
import { encodePacked, keccak256 } from './utils'

export const MAX_UINT64 = ethers.BigNumber.from(2).pow(64).sub(1)
export const TOKEN_OWNER_ROLE = keccak256(encodePacked(['string'], ['TOKEN_OWNER_ROLE']))
export const USER_ROLE = keccak256(encodePacked(['string'], ['USER_ROLE']))
export const SUBTENANT_ROLE = keccak256(encodePacked(['string'], ['SUBTENANT_ROLE']))
export const MARKETPLACE_ROLE = keccak256(encodePacked(['string'], ['MARKETPLACE_ROLE']))
export const EMPTY_BYTES = '0x'
export const ONE_DAY = 60 * 60 * 24
