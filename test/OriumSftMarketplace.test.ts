import { ethers } from 'hardhat'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deploySftMarketplaceContracts } from './fixtures/OriumSftMarketplaceFixture'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { FeeInfo, RoyaltyInfo, SftRentalOffer } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { USER_ROLE } from '../utils/roles'

describe('OriumSftMarketplace', () => {
  let marketplace: Contract
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
  let lender: SignerWithAddress

  // Values to be used across tests
  const maxDeadline = THREE_MONTHS
  const feeInfo: FeeInfo = {
    feePercentageInWei: toWei('5'),
    isCustomFee: true,
  }

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, creatorTreasury, lender] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, rolesRegistry, mockERC1155, mockERC20] = await loadFixture(deploySftMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      const tokenId = 1
      const tokenAmount = BigNumber.from(2)

      beforeEach(async () => {
        await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
      })

      describe('Rental Offers', async () => {
        let rentalOffer: SftRentalOffer

        beforeEach(async () => {
          await marketplace.connect(operator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplace
            .connect(creator)
            .setRoyaltyInfo(
              creator.address,
              mockERC1155.address,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            )

          const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: mockERC1155.address,
            tokenId,
            tokenAmount,
            feeTokenAddress: mockERC20.address,
            feeAmountPerSecond: toWei('0'),
            deadline: blockTimestamp + ONE_DAY,
            roles: [USER_ROLE],
            rolesData: [EMPTY_BYTES],
          }

          await mockERC1155.mint(lender.address, tokenId, tokenAmount, '0x')
          await rolesRegistry.connect(lender).setRoleApprovalForAll(mockERC1155.address, marketplace.address, true)
          await mockERC1155.connect(lender).setApprovalForAll(rolesRegistry.address, true)
        })
        describe('When Rental Offer is not created', async () => {
          describe('Create Rental Offer', async () => {
            it('Should create a rental offer', async () => {
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCreated')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.tokenAmount,
                  rentalOffer.lender,
                  rentalOffer.borrower,
                  rentalOffer.feeTokenAddress,
                  rentalOffer.feeAmountPerSecond,
                  rentalOffer.deadline,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
                .to.emit(mockERC1155, 'TransferSingle')
                .withArgs(rolesRegistry.address, lender.address, rolesRegistry.address, tokenId, tokenAmount)
                .to.emit(rolesRegistry, 'TokensCommitted')
                .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
            })
            it('Should create a rental offer if collection has a custom roles registry', async function () {
              await marketplace.connect(operator).setRolesRegistry(mockERC1155.address, rolesRegistry.address)
              await mockERC1155.setApprovalForAll(rolesRegistry.address, true)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCreated')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.tokenAmount,
                  rentalOffer.lender,
                  rentalOffer.borrower,
                  rentalOffer.feeTokenAddress,
                  rentalOffer.feeAmountPerSecond,
                  rentalOffer.deadline,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
                .to.emit(mockERC1155, 'TransferSingle')
                .withArgs(rolesRegistry.address, lender.address, rolesRegistry.address, tokenId, tokenAmount)
                .to.emit(rolesRegistry, 'TokensCommitted')
                .withArgs(lender.address, 1, mockERC1155.address, tokenId, tokenAmount)
            })
            it('Should NOT create a rental offer if caller is not the lender', async () => {
              await expect(marketplace.connect(notOperator).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: caller does not have enough balance for the token',
              )
            })
            it("Should NOT create a rental offer if lender is not the caller's address", async () => {
              rentalOffer.lender = creator.address
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Sender and Lender mismatch',
              )
            })
            it("Should NOT create a rental offer if roles and rolesData don't have the same length", async () => {
              rentalOffer.roles = [`0x${randomBytes(32).toString('hex')}`]
              rentalOffer.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: roles and rolesData should have the same length',
              )
            })
            it('Should NOT create a rental offer if deadline is greater than maxDeadline', async () => {
              rentalOffer.deadline = maxDeadline + 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Invalid deadline',
              )
            })
            it("Should NOT create a rental offer if deadline is less than block's timestamp", async () => {
              rentalOffer.deadline = (await ethers.provider.getBlock('latest')).timestamp - 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Invalid deadline',
              )
            })
            it('Should NOT create the same rental offer twice', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: nonce already used',
              )
            })
            it('Should NOT create a rental offer if roles or rolesData are empty', async () => {
              rentalOffer.roles = []
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: roles should not be empty',
              )
            })
            it('Should NOT create a rental offer if nonce is 0', async () => {
              rentalOffer.nonce = '0'
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: Nonce cannot be 0',
              )
            })
            it('Should NOT create a rental offer if tokenAmount is 0', async () => {
              rentalOffer.tokenAmount = BigNumber.from(0)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'OriumSftMarketplace: tokenAmount should be greater than 0',
              )
            })
          })
        })
      })
    })
    describe('Core Functions', async () => {
      describe('Initialize', async () => {
        it("Should NOT initialize the contract if it's already initialized", async () => {
          await expect(marketplace.initialize(operator.address, ethers.constants.AddressZero, 0)).to.be.revertedWith(
            'Initializable: contract is already initialized',
          )
        })
      })
      describe('Pausable', async () => {
        describe('Pause', async () => {
          it('Should pause the contract', async () => {
            await marketplace.connect(operator).pause()
            expect(await marketplace.paused()).to.be.true
          })

          it('Should NOT pause the contract if caller is not the operator', async () => {
            await expect(marketplace.connect(notOperator).pause()).to.be.revertedWith(
              'Ownable: caller is not the owner',
            )
          })
        })
        describe('Unpause', async () => {
          it('Should unpause the contract', async () => {
            await marketplace.connect(operator).pause()
            await marketplace.connect(operator).unpause()
            expect(await marketplace.paused()).to.be.false
          })

          it('Should NOT unpause the contract if caller is not the operator', async () => {
            await marketplace.connect(operator).pause()
            await expect(marketplace.connect(notOperator).unpause()).to.be.revertedWith(
              'Ownable: caller is not the owner',
            )
          })
        })
      })
      describe('Marketplace Fee', async () => {
        it('Should set the marketplace for a collection', async () => {
          await expect(
            marketplace
              .connect(operator)
              .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          )
            .to.emit(marketplace, 'MarketplaceFeeSet')
            .withArgs(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee)
          expect(await marketplace.feeInfo(mockERC1155.address)).to.have.deep.members([
            feeInfo.feePercentageInWei,
            feeInfo.isCustomFee,
          ])
          expect(await marketplace.marketplaceFeeOf(mockERC1155.address)).to.be.equal(feeInfo.feePercentageInWei)
        })

        it('Should NOT set the marketplace fee if caller is not the operator', async () => {
          await expect(
            marketplace
              .connect(notOperator)
              .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })

        it("Should NOT set the marketplace fee if marketplace fee + creator royalty it's greater than 100%", async () => {
          await marketplace.connect(operator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)

          const royaltyInfo: RoyaltyInfo = {
            creator: creator.address,
            royaltyPercentageInWei: toWei('10'),
            treasury: creatorTreasury.address,
          }

          await marketplace
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
            marketplace
              .connect(operator)
              .setMarketplaceFeeForCollection(mockERC1155.address, feeInfo.feePercentageInWei, feeInfo.isCustomFee),
          ).to.be.revertedWith('OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%')
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
              marketplace.connect(operator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero),
            )
              .to.emit(marketplace, 'CreatorRoyaltySet')
              .withArgs(mockERC1155.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)

            expect(await marketplace.tokenAddressToRoyaltyInfo(mockERC1155.address)).to.have.deep.members([
              royaltyInfo.creator,
              royaltyInfo.royaltyPercentageInWei,
              royaltyInfo.treasury,
            ])
          })

          it('Should NOT set the creator royalties if caller is not the operator', async () => {
            await expect(
              marketplace.connect(notOperator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero),
            ).to.be.revertedWith('OriumSftMarketplace: Only creator or owner can set the royalty info')
          })
        })

        describe('Creator', async () => {
          beforeEach(async () => {
            await marketplace.connect(operator).setRoyaltyInfo(creator.address, mockERC1155.address, 0, AddressZero)
          })

          it("Should update the creator royalties for a collection if it's already set", async () => {
            const royaltyInfo: RoyaltyInfo = {
              creator: creator.address,
              royaltyPercentageInWei: toWei('0'),
              treasury: creatorTreasury.address,
            }

            await expect(
              marketplace
                .connect(creator)
                .setRoyaltyInfo(
                  creator.address,
                  mockERC1155.address,
                  royaltyInfo.royaltyPercentageInWei,
                  royaltyInfo.treasury,
                ),
            )
              .to.emit(marketplace, 'CreatorRoyaltySet')
              .withArgs(mockERC1155.address, creator.address, royaltyInfo.royaltyPercentageInWei, royaltyInfo.treasury)
          })

          it('Should NOT update the creator royalties for a collection if caller is not the creator', async () => {
            const royaltyInfo: RoyaltyInfo = {
              creator: creator.address,
              royaltyPercentageInWei: toWei('0'),
              treasury: creatorTreasury.address,
            }

            await expect(
              marketplace
                .connect(notOperator)
                .setRoyaltyInfo(
                  creator.address,
                  mockERC1155.address,
                  royaltyInfo.royaltyPercentageInWei,
                  royaltyInfo.treasury,
                ),
            ).to.be.revertedWith('OriumSftMarketplace: Only creator or owner can set the royalty info')
          })

          it("Should NOT update the creator royalties for a collection if creator's royalty percentage + marketplace fee is greater than 100%", async () => {
            const royaltyInfo: RoyaltyInfo = {
              creator: creator.address,
              royaltyPercentageInWei: toWei('99'),
              treasury: creatorTreasury.address,
            }

            await expect(
              marketplace
                .connect(creator)
                .setRoyaltyInfo(
                  creator.address,
                  mockERC1155.address,
                  royaltyInfo.royaltyPercentageInWei,
                  royaltyInfo.treasury,
                ),
            ).to.be.revertedWith(
              'OriumSftMarketplace: Royalty percentage + marketplace fee cannot be greater than 100%',
            )
          })
          it("Should NOT update the creator royalties if caller and creator's address are different", async () => {
            const royaltyInfo: RoyaltyInfo = {
              creator: creator.address,
              royaltyPercentageInWei: toWei('0'),
              treasury: creatorTreasury.address,
            }

            await expect(
              marketplace
                .connect(creator)
                .setRoyaltyInfo(
                  notOperator.address,
                  mockERC1155.address,
                  royaltyInfo.royaltyPercentageInWei,
                  royaltyInfo.treasury,
                ),
            ).to.be.revertedWith('OriumSftMarketplace: sender and creator mismatch')
          })
        })
      })
      describe('Max Deadline', async () => {
        it('Should set the max deadline by operator', async () => {
          await marketplace.connect(operator).setMaxDeadline(maxDeadline)
          expect(await marketplace.maxDeadline()).to.be.equal(maxDeadline)
        })

        it('Should NOT set the max deadline if caller is not the operator', async () => {
          await expect(marketplace.connect(notOperator).setMaxDeadline(maxDeadline)).to.be.revertedWith(
            'Ownable: caller is not the owner',
          )
        })

        it('Should NOT set the max deadline 0', async () => {
          await expect(marketplace.connect(operator).setMaxDeadline(0)).to.be.revertedWith(
            'OriumSftMarketplace: Max deadline should be greater than 0',
          )
        })
      })

      describe('Roles Registry', async () => {
        it('Should set the roles registry for a collection', async () => {
          await expect(marketplace.connect(operator).setRolesRegistry(mockERC1155.address, rolesRegistry.address))
            .to.emit(marketplace, 'RolesRegistrySet')
            .withArgs(mockERC1155.address, rolesRegistry.address)
        })

        it('Should NOT set the roles registry if caller is not the operator', async () => {
          await expect(
            marketplace.connect(notOperator).setRolesRegistry(mockERC1155.address, rolesRegistry.address),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })

      describe('Default Roles Registry', async () => {
        it('Should set the default roles registry for a collection', async () => {
          await expect(marketplace.connect(operator).setDefaultRolesRegistry(rolesRegistry.address)).to.not.be.reverted
        })

        it('Should NOT set the default roles registry if caller is not the operator', async () => {
          await expect(
            marketplace.connect(notOperator).setDefaultRolesRegistry(rolesRegistry.address),
          ).to.be.revertedWith('Ownable: caller is not the owner')
        })
      })
    })
  })
})
