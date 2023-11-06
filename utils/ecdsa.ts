import { ethers } from 'ethers'
import { DirectRental } from './types'
import { keccak256, solidityKeccak256, defaultAbiCoder as abi, solidityPack } from 'ethers/lib/utils'
const TYPE_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'],
)

export function getSignedDirectRentalHash(
  directRental: DirectRental,
  nameHash: string,
  versionHash: string,
  chainId: number,
  address: string,
) {
  const domainSeparator = _buildDomainSeparator(TYPE_HASH, nameHash, versionHash, chainId, address)
  const structHash = hashDirectRental(directRental)
  return toTypedDataHash(domainSeparator, structHash)
}

export function hashDirectRental(directRental: DirectRental) {
  const hashedMethodSignature = solidityKeccak256(
    ['string'],
    [
      'DirectRental(address tokenAddress,uint256 tokenId,address lender,address borrower,uint64 duration,bytes32[] roles,bytes[] rolesData)',
    ],
  )

  const encodedDirectRental = abi.encode(
    ['bytes32', 'address', 'uint256', 'address', 'address', 'uint64', 'bytes32[]', 'bytes[]'],
    [
      hashedMethodSignature,
      directRental.tokenAddress,
      directRental.tokenId,
      directRental.lender,
      directRental.borrower,
      directRental.duration,
      directRental.roles,
      directRental.rolesData,
    ],
  )

  return keccak256(encodedDirectRental)
}

function toTypedDataHash(domainSeparator: string, structHash: string) {
  return keccak256(
    solidityPack(['bytes1', 'bytes1', 'bytes32', 'bytes32'], ['0x19', '0x01', domainSeparator, structHash]),
  )
}

export function _buildDomainSeparator(
  typeHash: string,
  nameHash: string,
  versionHash: string,
  chainId: number,
  address: string,
) {
  return keccak256(
    abi.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [typeHash, nameHash, versionHash, chainId, address],
    ),
  )
}
