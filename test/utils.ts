import crypto from 'crypto'
import { utils } from 'ethers'

function randomString() {
  return crypto.randomBytes(20).toString('hex')
}

function randomHash() {
  const randomStr = randomString().substring(0, 7)
  return utils.formatBytes32String(randomStr)
}

export { randomString, randomHash }
