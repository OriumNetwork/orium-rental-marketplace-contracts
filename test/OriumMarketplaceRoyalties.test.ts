import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { FeeInfo, RoyaltyInfo } from '../utils/types'
import { AddressZero, THREE_MONTHS } from '../utils/constants'
import { deployMarketplaceRoyaltiesContracts } from './fixtures/OriumMarketplaceRoyaltiesFixture'
import { MockERC1155, MockERC20, OriumMarketplaceRoyalties, SftRolesRegistrySingleRole } from '../typechain-types'

describe('OriumMarketplaceRoyalties', () => {
  let marketplaceRoyalties: OriumMarketplaceRoyalties
  let rolesRegistry: SftRolesRegistrySingleRole
  let mockERC1155: MockERC1155
  let mockERC20: MockERC20

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: Awaited<ReturnType<typeof ethers.getSigner>>
  let operator: Awaited<ReturnType<typeof ethers.getSigner>>
  let notOperator: Awaited<ReturnType<typeof ethers.getSigner>>
  let creator: Awaited<ReturnType<typeof ethers.getSigner>>
  let creatorTreasury: Awaited<ReturnType<typeof ethers.getSigner>>

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
    [marketplaceRoyalties, ,rolesRegistry, mockERC1155, mockERC20] = await loadFixture(deployMarketplaceRoyaltiesContracts)
  })

  describe('Main Functions', async () => {
    describe('Initialize', async () => {
      it("Should NOT initialize the contract if it's already initialized", async () => {
        await expect(
          marketplaceRoyalties.initialize(operator.address, ethers.ZeroAddress, ethers.ZeroAddress, 0),
        ).to.be.revertedWith('Initializable: contract is already initialized')
      })
    })

    describe('Marketplace Fee', async () => {
      it('Should set the marketplaceRoyalties for a collection', async () => {
        await expect(
          marketplaceRoyalties
            .connect(operator)
            .setMarketplaceFeeForCollection(
              await mockERC1155.getAddress(),
              feeInfo.feePercentageInWei,
              feeInfo.isCustomFee,
            ),
        )
          .to.emit(marketplaceRoyalties, 'MarketplaceFeeSet')
          .withArgs(await mockERC1155.getAddress(), feeInfo.feePercentageInWei, feeInfo.isCustomFee)
        expect(await marketplaceRoyalties.feeInfo(await mockERC1155.getAddress())).to.have.deep.members([
          feeInfo.feePercentageInWei,
          feeInfo.isCustomFee,
        ])
        expect(await marketplaceRoyalties.marketplaceFeeOf(await mockERC1155.getAddress())).to.be.equal(
          feeInfo.feePercentageInWei,
        )
      })

      it('Should NOT set the marketplaceRoyalties fee if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties
            .connect(notOperator)
            .setMarketplaceFeeForCollection(
              await mockERC1155.getAddress(),
              feeInfo.feePercentageInWei,
              feeInfo.isCustomFee,
            ),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it("Should NOT set the marketplaceRoyalties fee if marketplaceRoyalties fee + creator royalty it's greater than 100%", async () => {
        await marketplaceRoyalties
          .connect(operator)
          .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), 0, AddressZero)

        const royaltyInfo: RoyaltyInfo = {
          creator: creator.address,
          royaltyPercentageInWei: toWei('10'),
          treasury: creatorTreasury.address,
        }

        await marketplaceRoyalties
          .connect(creator)
          .setRoyaltyInfo(
            creator.address,
            await mockERC1155.getAddress(),
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
            .setMarketplaceFeeForCollection(
              await mockERC1155.getAddress(),
              feeInfo.feePercentageInWei,
              feeInfo.isCustomFee,
            ),
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
            treasury: ethers.ZeroAddress,
          }

          await expect(
            marketplaceRoyalties
              .connect(operator)
              .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), 0, AddressZero),
          )
            .to.emit(marketplaceRoyalties, 'CreatorRoyaltySet')
            .withArgs(
              await mockERC1155.getAddress(),
              creator.address,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )

          expect(
            await marketplaceRoyalties.tokenAddressToRoyaltyInfo(await mockERC1155.getAddress()),
          ).to.have.deep.members([royaltyInfo.creator, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury])
        })

        it('Should NOT set the creator royalties if caller is not the operator', async () => {
          await expect(
            marketplaceRoyalties
              .connect(notOperator)
              .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), 0, AddressZero),
          ).to.be.revertedWith('OriumMarketplaceRoyalties: Only creator or owner can set the royalty info')
        })
      })

      describe('Creator', async () => {
        beforeEach(async () => {
          await marketplaceRoyalties
            .connect(operator)
            .setRoyaltyInfo(creator.address, await mockERC1155.getAddress(), 0, AddressZero)
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
                await mockERC1155.getAddress(),
                royaltyInfo.royaltyPercentageInWei,
                royaltyInfo.treasury,
              ),
          )
            .to.emit(marketplaceRoyalties, 'CreatorRoyaltySet')
            .withArgs(
              await mockERC1155.getAddress(),
              creator.address,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )
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
                await mockERC1155.getAddress(),
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
                await mockERC1155.getAddress(),
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
                await mockERC1155.getAddress(),
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
          marketplaceRoyalties
            .connect(operator)
            .setRolesRegistry(await mockERC1155.getAddress(), await rolesRegistry.getAddress()),
        )
          .to.emit(marketplaceRoyalties, 'RolesRegistrySet')
          .withArgs(await mockERC1155.getAddress(), await rolesRegistry.getAddress())
        expect(await marketplaceRoyalties.nftRolesRegistryOf(await mockERC1155.getAddress())).to.be.equal(
          await rolesRegistry.getAddress(),
        )
      })

      it('Should NOT set the roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties
            .connect(notOperator)
            .setRolesRegistry(await mockERC1155.getAddress(), await rolesRegistry.getAddress()),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Default SFT Roles Registry', async () => {
      it('Should set the default roles registry for a collection', async () => {
        await expect(
          marketplaceRoyalties.connect(operator).setDefaultSftRolesRegistry(await rolesRegistry.getAddress()),
        ).to.not.be.reverted
      })

      it('Should NOT set the default roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setDefaultSftRolesRegistry(await rolesRegistry.getAddress()),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Default NFT Roles Registry', async () => {
      it('Should set the default roles registry for a collection', async () => {
        await expect(
          marketplaceRoyalties.connect(operator).setDefaultNftRolesRegistry(await rolesRegistry.getAddress()),
        ).to.not.be.reverted
        expect(await marketplaceRoyalties.nftRolesRegistryOf(AddressZero)).to.be.equal(await rolesRegistry.getAddress())
      })

      it('Should NOT set the default roles registry if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties.connect(notOperator).setDefaultNftRolesRegistry(await rolesRegistry.getAddress()),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
    })

    describe('Trusted Nft Tokens', async () => {
      it('Should set the trusted tokens', async () => {
        await marketplaceRoyalties
          .connect(operator)
          .setTrustedFeeTokenForToken([await mockERC1155.getAddress()], [await mockERC20.getAddress()], [true])
        expect(
          await marketplaceRoyalties.isTrustedFeeTokenAddressForToken(
            await mockERC1155.getAddress(),
            await mockERC20.getAddress(),
          ),
        ).to.be.true
      })

      it('Should NOT set the trusted tokens if caller is not the operator', async () => {
        await expect(
          marketplaceRoyalties
            .connect(notOperator)
            .setTrustedFeeTokenForToken([await mockERC1155.getAddress()], [await mockERC20.getAddress()], [true]),
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })
      it('Should NOT set the trusted tokens if token address and isTrusted have different lengths', async () => {
        await expect(
          marketplaceRoyalties
            .connect(operator)
            .setTrustedFeeTokenForToken(
              [await mockERC1155.getAddress(), await mockERC1155.getAddress()],
              [await mockERC20.getAddress()],
              [true],
            ),
        ).to.be.revertedWith('OriumMarketplaceRoyalties: Arrays should have the same length')
      })
    })
  })
})
