import { ethers, network as hardhatNetwork } from 'hardhat'
import config, { Network } from '../../addresses'
import { colors, print, confirmOrDie } from '../../utils/misc'
import { SftRentalOffer } from '../../utils/types'
import { AddressZero } from '../../utils/constants'

const SubgraphUrl =
  'https://subgraph.satsuma-prod.com/83d01390f7d3/8c268d3e8b83112a7d0c732a9b88ba1c732da600bffaf68790171b9a0b5d5394/polygon-mainnet_orium-rental-marketplace/api'
const RentalOfferId =
  '0xb1d47b09aa6d81d7b00c3a37705a6a157b83c49f-0xe3a75c99cd21674188bea652fe378ca5cf7e7906-88503925159079469072461611536684263787861271681407587493144538997301870344226'

async function main() {
  const NETWORK = hardhatNetwork.name as Network
  const CONTRACT_NAME = 'OriumSftMarketplace'
  const CONTRACT_ADDRESS = config[NETWORK][CONTRACT_NAME].address

  const rentalOffer = await fetchRentalOffer(RentalOfferId)
  console.log('Rental offer:', rentalOffer)

  await confirmOrDie(`Are you sure you want to cancel a rental offer in ${CONTRACT_NAME} on ${NETWORK} network?`)

  const contract = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS)
  const tx = await contract.cancelRentalOffer(rentalOffer)

  print(colors.highlight, `Transaction hash: ${tx.hash}`)
  print(colors.success, `Cancelled rental offer in ${CONTRACT_NAME} on ${NETWORK} network!`)
}

async function fetchRentalOffer(rentalOfferId: string): Promise<SftRentalOffer> {
  const query = `
    {
      rentalOffer(id: "${rentalOfferId}") {
        nonce
        lender {
          id
        }
        borrower {
          id
        }
        nft {
          tokenAddress
          tokenId
        }
        tokenAmount
        tokenCommitment {
          commitmentId
        }
        feeTokenAddress
        feeAmountPerSecond
        deadline
        isCancelled
        roles {
          roleHash
        }
        rolesData
      }
    }
  `

  const response = await fetch(SubgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const { data, errors } = await response.json()
  if (errors) {
    throw new Error(JSON.stringify(errors, null, 2))
  }

  // console.log('Rental offer:', data)
  if (data.rentalOffer.isCancelled) {
    throw new Error('Rental offer is already cancelled')
  }

  return {
    nonce: data.rentalOffer.nonce,
    lender: data.rentalOffer.lender.id,
    borrower: data.rentalOffer.borrower?.id.toLowerCase() || AddressZero,
    tokenAddress: data.rentalOffer.nft.tokenAddress,
    tokenId: data.rentalOffer.nft.tokenId,
    tokenAmount: data.rentalOffer.tokenAmount,
    commitmentId: data.rentalOffer.tokenCommitment.commitmentId,
    feeTokenAddress: data.rentalOffer.feeTokenAddress,
    feeAmountPerSecond: data.rentalOffer.feeAmountPerSecond,
    deadline: data.rentalOffer.deadline,
    roles: data.rentalOffer.roles.map((role: { roleHash: string }) => role.roleHash),
    rolesData: data.rentalOffer.rolesData,
  }
}

main()
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
