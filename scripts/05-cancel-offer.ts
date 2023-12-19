import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../addresses'
import { colors, print, confirmOrDie } from '../utils/misc'
import { BigNumber } from 'ethers'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  await confirmOrDie(
    `Are you sure you want to cancel a rental offer ${config[NETWORK].RolesRegistry.address} for ${CONTRACT_NAME} on ${NETWORK} network?`,
  )

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)

  const nonce = BigNumber.from('0x0924aa59075f0008abf36a3cd83e2f0ff5d835f6e3fa2e80efec5bf50b2ee801')
  const tx = await contract.cancelRentalOffer(nonce)

  print(colors.highlight, `Transaction hash: ${tx.hash}`)
  print(colors.success, `Cancelled rental offer in ${CONTRACT_NAME} on ${NETWORK} network!`)
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
