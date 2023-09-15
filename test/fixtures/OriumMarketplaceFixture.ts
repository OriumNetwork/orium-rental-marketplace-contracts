import { ethers } from 'hardhat'

export async function deployMarketplaceContracts() {
  const MarketplaceFactory = await ethers.getContractFactory('OriumMarketplace')
  const marketplace = await MarketplaceFactory.deploy()
  await marketplace.deployed()

  const NftFactory = await ethers.getContractFactory('MockNft')
  const nft = await NftFactory.deploy()
  await nft.deployed()

  return { marketplace, nft }
}
