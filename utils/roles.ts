import { AbiCoder } from 'ethers'
import { ethers } from 'hardhat'

export const abi = AbiCoder.defaultAbiCoder()
export const USER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('USER_ROLE'))
export const UNIQUE_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UNIQUE_ROLE'))
export const PLAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('Player()'))
