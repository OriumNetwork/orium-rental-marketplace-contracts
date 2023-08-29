import crypto from 'crypto'
import { utils } from 'ethers'

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

export { randomString, randomHash, randomInteger }
