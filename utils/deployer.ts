import { ethers, network } from 'hardhat'
import { AwsKmsSigner } from './ethers-aws-kms-signer'

const kmsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // credentials for your IAM user with KMS access
  region: 'us-east-1', // region of your KMS key
  keyId: process.env.AWS_KMS_KEY_ID || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // KMS key id
}
const networkConfig: any = network.config
export const kmsProvider = new ethers.JsonRpcProvider(networkConfig.url || '')
export const kmsDeployer = new AwsKmsSigner(kmsCredentials).connect(kmsProvider)
