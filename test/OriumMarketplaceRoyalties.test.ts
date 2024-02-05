import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { FeeInfo, RoyaltyInfo } from '../utils/types'
import { AddressZero, THREE_MONTHS } from '../utils/constants'
import { deployMarketplaceRoyaltiesContracts } from './fixtures/OriumMarketplaceRoyaltiesFixture'

describe('OriumMarketplaceRoyalties', () => {
  let marketplaceRoyalties: Contract
  let rolesRegistry: Contract
  let mockERC1155: Contract
  let mockERC20: Contract

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let operator: SignerWithAddress
  let notOperator: SignerWithAddress
  let creator: SignerWithAddress
  let creatorTreasury: SignerWithAddress

  // Values to be used across tests
  const maxDuration = THREE_MONTHS
  const feeInfo: FeeInfo = {
    feePercentageInWei: toWei('5'),
    isCustomFee: true,
  }

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplaceRoyalties, rolesRegistry, mockERC1155, mockERC20] = await loadFixture(deployMarketplaceRoyaltiesContracts)
  })

  describe('Main Functions', async () => {
    describe('Initialize', async () => {
      it("Should NOT initialize the contract if it's already initialized", async () => {
        await expect(
          marketplaceRoyalties.initialize(
            operator.address,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            0,
          ),
        ).to.be.revertedWith('Initializable: contract is already initialized')
      })
    })

    describe('Marketplace Fee', async () => {
      it('Should set the marketplaceRoyalties for a collection', async () => {
        await expect(
          marketplaceRoyalties
            .connect(operator)
            .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
        )
          .to.emit(marketplaceRoyalties, 'MarketplaceFeeSet')
          .withArgs(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee)
        expect(await marketplaceRoyalties.feeInfo(mockERC1155.address)).to.have.deep.members([
          feeInfo.feePercentageInWei,
          feeInfo.isCustomFee,
        ])
        expect(await marketplaceRoyalties.marketplaceFeeOf(mockERC1155.address)).to.be.equal(feeInfo.feePercentageInWei)
      })

      it('Should NOT set the marketplaceRoyalties fee if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties
            .connect(notOperator)
            .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it("Should NOT set the marketplaceRoyalties fee if marketplaceRoyalties fee + creator royalty it's greater than 100%", async () => {
        await marketplaceRoyalties
          .connect(operator)
          .setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)

        const royaltyInfo: RoyaltyInfo = {
          creator: creator.address,
          royaltyPercentageInWei: toWei('10'),
          treasury: creatorTreasury.address,
        }

        await marketplaceRoyalties
          .connect(creator)
          .setRoyaltyInfo(
            creator.address,
            mockERC1155.address,
            royaltyInfo.royaltyPercentageInWei,
            royaltyInfo.treasury,
          )

        const feeInfo: FeeInfo = {
          feePercentageInWei: toWei('95'),
          isCustomFee: true,
        }
        await expect(
          marketplaceRoyalties
            .connect(operator)
            .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
        ).to.be.revertedWith(
          'OriumMarketplaceRoyalties: Royalty percentage + marketplace fee cannot be greater than 100%',
        )
      })
    })

    describe('Creator Royalties', async () => {
      describe('Operator', async () => {
        it('Should set the creator royalties for a collection', async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: ethers.constants.AddressZero,
          }

          await expect(
            marketplaceRoyalties.connect(operator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero),
          )
            .to.emit(marketplaceRoyalties, 'CreatorRoyaltySet')
            .withArgs(mockERC1155.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

          expect(await marketplaceRoyalties.tokenAddressToRoyaltyInfo(mockERC1155.address)).to.have.deep.members([
            royaltyInfo.creator,
            royaltyInfo.royaltyPercentageInWei,
            royaltyInfo.treasury,
          ])
        })

        it('Should NOT set the creator royalties if caller is not the operator', async () => {
          await expect(
            marketplaceRoyalties
              .connect(notOperator)
              .setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero),
          ).to.be.revertedWith('OriumMarketplaceRoyalties: Only creator or owner can set the royalty info')
        })
      })

      describe('Creator', async () => {
        beforeEach(async () => {
          await marketplaceRoyalties
            .connect(operator)
            .setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)
        })

        it("Should update the creator royalties for a collection if it's already set", async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplaceRoyalties
              .connect(creator)
              .setRoyaltyInfo(
                creator.address,
                mockERC1155.address,
                royaltyInfo.royaltyPercentageInWei,
                royaltyInfo.treasury,
              ),
          )
            .to.emit(marketplaceRoyalties, 'CreatorRoyaltySet')
            .withArgs(mockERC1155.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)
        })

        it('Should NOT update the creator royalties for a collection if caller is not the creator', async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplaceRoyalties
              .connect(notOperator)
              .setRoyaltyInfo(
                creator.address,
                mockERC1155.address,
                royaltyInfo.royaltyPercentageInWei,
                royaltyInfo.treasury,
              ),
          ).to.be.revertedWith('OriumMarketplaceRoyalties: Only creator or owner can set the royalty info')
        })

        it("Should NOT update the creator royalties for a collection if creator's royalty percentage + marketplaceRoyalties fee is greater than 100%", async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('99'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplaceRoyalties
              .connect(creator)
              .setRoyaltyInfo(
                creator.address,
                mockERC1155.address,
                royaltyInfo.royaltyPercentageInWei,
                royaltyInfo.treasury,
              ),
          ).to.be.revertedWith(
            'OriumMarketplaceRoyalties: Royalty percentage + marketplace fee cannot be greater than 100%',
          )
        })
        it("Should NOT update the creator royalties if caller and creator's address are different", async () => {
          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('0'),
            treasury: creatorTreasury.address,
          }

          await expect(
            marketplaceRoyalties
              .connect(creator)
              .setRoyaltyInfo(
                notOperator.address,
                mockERC1155.address,
                royaltyInfo.royaltyPercentageInWei,
                royaltyInfo.treasury,
              ),
          ).to.be.revertedWith('OriumMarketplaceRoyalties: sender and creator mismatch')
        })
      })
    })

    describe('Max Deadline', async () => {
      it('Should set the max deadline by operator', async () => {
        await marketplaceRoyalties.connect(operator).setMaxDuration(maxDuration)
        expect(await marketplaceRoyalties.maxDuration()).to.be.equal(maxDuration)
      })

      it('Should NOT set the max deadline if caller is not the operator', async () => {
        await expect(marketplaceRoyalties.connect(notOperator).setMaxDuration(maxDuration)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        )
      })

      it('Should NOT set the max deadline 0', async () => {
        await expect(marketplaceRoyalties.connect(operator).setMaxDuration(0)).to.be.revertedWith(
          'OriumMarketplaceRoyalties: Max duration should be greater than 0',
        )
      })
    })

    describe('Roles Registry', async () => {
      it('Should set the roles registry for a collection', async () => {
        await expect(
          marketplaceRoyalties.connect(operator).setRolesRegistry(mockERC1155.address, rolesRegistry.address),
        )
          .to.emit(marketplaceRoyalties, 'RolesRegistrySet')
          .withArgs(mockERC1155.address, rolesRegistry.address)
        expect(await marketplaceRoyalties.nftRolesRegistryOf(mockERC1155.address)).to.be.equal(rolesRegistry.address)
      })

      it('Should NOT set the roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setRolesRegistry(mockERC1155.address, rolesRegistry.address),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Default SFT Roles Registry', async () => {
      it('Should set the default roles registry for a collection', async () => {
        await expect(marketplaceRoyalties.connect(operator).setDefaultSftRolesRegistry(rolesRegistry.address)).to.not.be
          .reverted
      })

      it('Should NOT set the default roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setDefaultSftRolesRegistry(rolesRegistry.address),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Default NFT Roles Registry', async () => {
      it('Should set the default roles registry for a collection', async () => {
        await expect(marketplaceRoyalties.connect(operator).setDefaultNftRolesRegistry(rolesRegistry.address)).to.not.be
          .reverted
        expect(await marketplaceRoyalties.nftRolesRegistryOf(AddressZero)).to.be.equal(rolesRegistry.address)
      })

      it('Should NOT set the default roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setDefaultNftRolesRegistry(rolesRegistry.address),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Trusted Nft Tokens', async () => {
      it('Should set the trusted tokens', async () => {
        await marketplaceRoyalties.connect(operator).setTrustedNftTokens([mockERC1155.address], [true])
        expect(await marketplaceRoyalties.isTrustedTokenAddress(mockERC1155.address)).to.be.true
      })

      it('Should NOT set the trusted tokens if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setTrustedNftTokens([mockERC1155.address], [true]),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
      it('Should NOT set the trusted tokens if token address and isTrusted have different lengths', async () => {
        await expect(
          marketplaceRoyalties.connect(operator).setTrustedNftTokens([mockERC1155.address, mockERC20.address], [true]),
        ).to.be.revertedWith('OriumMarketplaceRoyalties: Arrays should have the same length')
      })
    })

    describe('Trusted Fee Tokens', async () => {
      it('Should set the trusted tokens', async () => {
        await marketplaceRoyalties.connect(operator).setTrustedFeeTokens([mockERC20.address], [true])
        expect(await marketplaceRoyalties.isTrustedFeeTokenAddress(mockERC20.address)).to.be.true
      })

      it('Should NOT set the trusted tokens if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setTrustedFeeTokens([mockERC20.address], [true]),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
      it('Should NOT set the trusted tokens if token address and isTrusted have different lengths', async () => {
        await expect(
          marketplaceRoyalties.connect(operator).setTrustedFeeTokens([mockERC1155.address, mockERC20.address], [true]),
        ).to.be.revertedWith('OriumMarketplaceRoyalties: Arrays should have the same length')
      })
    })
  })
})
