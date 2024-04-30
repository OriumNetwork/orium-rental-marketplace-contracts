import { AbiCoder } from 'ethers'
import { ethers } from 'hardhat'

export const abi = AbiCoder.defaultAbiCoder()
export const USER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('USER_ROLE'))
export const USER_ROLE_MOONBEAM = ethers.keccak256(ethers.toUtf8Bytes('User()'))
export const UNIQUE_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UNIQUE_ROLE'))
export const PLAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('Player()'))
