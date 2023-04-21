import * as dotenv from 'dotenv'
import 'solidity-coverage'
import 'hardhat-gas-reporter'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-upgrades'
import 'hardhat-spdx-license-identifier'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-defender'
import 'hardhat-contract-sizer'

dotenv.config()

const {
  ENVIRONMENT,
  DEFENDER_TEAM_API_KEY,
  DEFENDER_TEAM_API_SECRET_KEY,
} = process.env

const BASE_CONFIG = {
  solidity: {
    version: '0.8.9',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  mocha: {
    timeout: 840000,
  },
  gasReporter: {
    enabled: true,
    excludeContracts: ['contracts/test'],
    gasPrice: 100,
    token: 'MATIC',
    currency: 'USD',
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
}

const PROD_CONFIG = {
  ...BASE_CONFIG,
  defender: {
    apiKey: DEFENDER_TEAM_API_KEY,
    apiSecret: DEFENDER_TEAM_API_SECRET_KEY,
  },
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = ENVIRONMENT === 'prod' ? PROD_CONFIG : BASE_CONFIG
