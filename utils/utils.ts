import crypto from 'crypto'
import { ethers, utils } from 'ethers'

function randomString() {
  return crypto.randomBytes(20).toString('hex')
}

function randomInteger() {
  return Math.round(Math.random() * 10000)
}

function randomHash() {
  const randomStr = randomString().substring(0, 7)
  return utils.formatBytes32String(randomStr)
}

const abi = new ethers.utils.AbiCoder()
const keccak256 = ethers.utils.keccak256
const encodePacked = ethers.utils.solidityPack
const toWei = ethers.utils.parseEther
const fromWei = ethers.utils.formatEther

export { randomString, randomHash, randomInteger, abi, keccak256, encodePacked, toWei, fromWei }
