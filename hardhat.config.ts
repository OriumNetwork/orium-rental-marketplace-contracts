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
  MUMBAI_PROVIDER_URL,
  POLYGON_PROVIDER_URL,
  DEV_PRIVATE_KEY,
  PROD_PRIVATE_KEY,
  POLYGONSCAN_API_KEY,
  ETHER_SCAN_API_KEY,
} = process.env

const BASE_CONFIG = {
  solidity: {
    version: '0.8.9',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      goerli: ETHER_SCAN_API_KEY,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: MUMBAI_PROVIDER_URL,
        blockNumber: 40877850,
      },
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
  networks: {
    hardhat: {
      forking: {
        url: MUMBAI_PROVIDER_URL,
        blockNumber: 40877850,
      },
    },
    mumbai: {
      chainId: 80001,
      url: MUMBAI_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    polygon: {
      chainId: 137,
      url: POLYGON_PROVIDER_URL,
      accounts: [PROD_PRIVATE_KEY],
      gas: 80000000000,
      gasPrice: 80000000000,
    },
  },
  defender: {
    apiKey: DEFENDER_TEAM_API_KEY,
    apiSecret: DEFENDER_TEAM_API_SECRET_KEY,
  },
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = ENVIRONMENT === 'prod' ? PROD_CONFIG : BASE_CONFIG
