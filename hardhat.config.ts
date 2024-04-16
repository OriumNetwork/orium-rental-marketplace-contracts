import * as dotenv from 'dotenv'
import 'solidity-coverage'
import 'hardhat-gas-reporter'
import '@openzeppelin/hardhat-upgrades'
import 'hardhat-spdx-license-identifier'
import '@nomicfoundation/hardhat-toolbox'
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
  CRONOSSCAN_API_KEY,
  CRONOS_TESTNET_PROVIDER_URL,
  CRONOS_PROVIDER_URL,
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
      cronosTestnet: CRONOSSCAN_API_KEY,
      cronos: CRONOSSCAN_API_KEY,
    },
    customChains: [
      {
        network: 'cronosTestnet',
        chainId: 338,
        urls: {
          apiURL: 'https://cronos.org/explorer/testnet3/api',
          blockExplorerURL: 'https://cronos.org/explorer/testnet3',
        },
      },
      {
        network: 'cronos',
        chainId: 25,
        urls: {
          apiURL: 'https://api.cronoscan.com/api',
          blockExplorerURL: 'https://cronos.org/explorer',
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: POLYGON_PROVIDER_URL,
        blockNumber: 55899876,
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
        url: POLYGON_PROVIDER_URL,
        blockNumber: 55899876,
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
      pollingInterval: 15000,
    },
    cronosTestnet: {
      chainId: 338,
      url: CRONOS_TESTNET_PROVIDER_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    cronos: {
      chainId: 25,
      url: CRONOS_PROVIDER_URL,
      accounts: [PROD_PRIVATE_KEY],
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
