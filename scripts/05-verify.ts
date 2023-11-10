import hre, { ethers, network, upgrades } from 'hardhat'
import { print, colors } from '../utils/misc'
import { Network } from '../addresses'
import config from '../addresses'

const NETWORK = network.name as Network

const CONTRACT_NAME = 'OriumMarketplace'
const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address
async function main() {
  try {
    await upgrades.forceImport(CONTRACT_ADDRESS, await ethers.getContractFactory(CONTRACT_NAME))
  } catch (e) {
    console.error(e)
  }

  print(colors.highlight, 'Verifying contract on Etherscan...')
  await hre.run('verify:verify', {
    address: CONTRACT_ADDRESS,
    constructorArguments: [],
  })
  print(colors.success, 'Contract verified!')
}

main()
  .then(async () => {
    print(colors.bigSuccess, 'All done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
