import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { toWei } from '../utils/bignumber'
import { RentalOffer } from '../utils/types'
import { AddressZero, EMPTY_BYTES, ONE_DAY, THREE_MONTHS } from '../utils/constants'
import { randomBytes } from 'crypto'
import { USER_ROLE } from '../utils/roles'
import { IERC7432, MockERC20, MockERC721, OriumMarketplaceRoyalties, NftRentalMarketplace } from '../typechain-types'
import { deployNftMarketplaceContracts } from './fixtures/NftRentalMarketplaceFixture'

describe('NftRentalMarketplace', () => {
  let marketplace: NftRentalMarketplace
  let marketplaceRoyalties: OriumMarketplaceRoyalties
  let rolesRegistry: IERC7432
  let mockERC721: MockERC721
  let mockERC20: MockERC20

  // We are disabling this rule because hardhat uses first account as deployer by default, and we are separating deployer and operator
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: Awaited<ReturnType<typeof ethers.getSigner>>
  let operator: Awaited<ReturnType<typeof ethers.getSigner>>
  let notOperator: Awaited<ReturnType<typeof ethers.getSigner>>
  let creator: Awaited<ReturnType<typeof ethers.getSigner>>
  let lender: Awaited<ReturnType<typeof ethers.getSigner>>

  // Values to be used across tests
  const maxDeadline = THREE_MONTHS
  const tokenId = 1

  before(async function () {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [deployer, operator, notOperator, creator, lender] = await ethers.getSigners()
  })

  beforeEach(async () => {
    // we are disabling this rule so ; may not be added automatically by prettier at the beginning of the line
    // prettier-ignore
    [marketplace, marketplaceRoyalties, rolesRegistry, mockERC721, mockERC20] = await loadFixture(deployNftMarketplaceContracts)
  })

  describe('Main Functions', async () => {
    describe('Rental Functions', async () => {
      beforeEach(async () => {
        await mockERC721.mint(lender.address, tokenId)
        await rolesRegistry
          .connect(lender)
          .setRoleApprovalForAll(await mockERC721.getAddress(), await marketplace.getAddress(), true)
        await marketplaceRoyalties
          .connect(operator)
          .setTrustedFeeTokenForToken([await mockERC721.getAddress()], [await mockERC20.getAddress()], [true])
        await marketplaceRoyalties
          .connect(operator)
          .setRolesRegistry(await mockERC721.getAddress(), await rolesRegistry.getAddress())
      })

      describe('Rental Offers', async () => {
        let rentalOffer: RentalOffer

        beforeEach(async () => {
          const blockTimestamp = Number((await ethers.provider.getBlock('latest'))?.timestamp)

          rentalOffer = {
            nonce: `0x${randomBytes(32).toString('hex')}`,
            lender: lender.address,
            borrower: AddressZero,
            tokenAddress: await mockERC721.getAddress(),
            tokenId,
            feeTokenAddress: await mockERC20.getAddress(),
            feeAmountPerSecond: toWei('0.01'),
            deadline: blockTimestamp + ONE_DAY,
            minDuration: 0,
            roles: [USER_ROLE],
            rolesData: [EMPTY_BYTES],
          }
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
                  rentalOffer.lender,
                  rentalOffer.borrower,
                  rentalOffer.feeTokenAddress,
                  rentalOffer.feeAmountPerSecond,
                  rentalOffer.deadline,
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should create a rental offer with feeAmountPersSecond equal to 0. but with a specific borrower', async () => {
              rentalOffer.feeAmountPerSecond = BigInt(0)
              rentalOffer.borrower = creator.address
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCreated')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  rentalOffer.borrower,
                  rentalOffer.feeTokenAddress,
                  rentalOffer.feeAmountPerSecond,
                  rentalOffer.deadline,
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should create more than one rental offer for the same role, if the previous deadline is already expired', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await time.increase(ONE_DAY)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              rentalOffer.deadline = Number((await ethers.provider.getBlock('latest'))?.timestamp) + ONE_DAY
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer))
                .to.emit(marketplace, 'RentalOfferCreated')
                .withArgs(
                  rentalOffer.nonce,
                  rentalOffer.tokenAddress,
                  rentalOffer.tokenId,
                  rentalOffer.lender,
                  rentalOffer.borrower,
                  rentalOffer.feeTokenAddress,
                  rentalOffer.feeAmountPerSecond,
                  rentalOffer.deadline,
                  rentalOffer.minDuration,
                  rentalOffer.roles,
                  rentalOffer.rolesData,
                )
            })
            it('Should NOT create a rental offer if caller is not the lender', async () => {
              await expect(marketplace.connect(notOperator).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: only token owner can call this function',
              )
            })
            it("Should NOT create a rental offer if lender is not the caller's address", async () => {
              rentalOffer.lender = creator.address
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: Sender and Lender mismatch',
              )
            })
            it("Should NOT create a rental offer if roles and rolesData don't have the same length", async () => {
              rentalOffer.roles = [`0x${randomBytes(32).toString('hex')}`]
              rentalOffer.rolesData = [`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`]
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: roles and rolesData should have the same length',
              )
            })
            it('Should NOT create a rental offer if deadline is greater than maxDeadline', async () => {
              rentalOffer.deadline = maxDeadline + 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: Invalid deadline',
              )
            })
            it("Should NOT create a rental offer if deadline is less than block's timestamp", async () => {
              rentalOffer.deadline = Number((await ethers.provider.getBlock('latest'))?.timestamp) - 1
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: Invalid deadline',
              )
            })
            it('Should NOT create the same rental offer twice', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: nonce already used',
              )
            })
            it('Should NOT create a rental offer if roles or rolesData are empty', async () => {
              rentalOffer.roles = []
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: roles should not be empty',
              )
            })
            it('Should NOT create a rental offer if nonce is zero', async () => {
              rentalOffer.nonce = '0'
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: Nonce cannot be 0',
              )
            })
            it('Should NOT create a rental offer if feeAmountPerSecond is zero', async () => {
              rentalOffer.feeAmountPerSecond = BigInt(0)
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: feeAmountPerSecond should be greater than 0',
              )
            })
            it('Should NOT create a rental offer if tokenAddress is not trusted', async () => {
              await marketplaceRoyalties
                .connect(operator)
                .setTrustedFeeTokenForToken([await mockERC721.getAddress()], [await mockERC20.getAddress()], [false])
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: tokenAddress or feeTokenAddress is not trusted',
              )
            })
            it('Should NOT create a rental offer if deadline is less than minDuration', async () => {
              rentalOffer.minDuration = ONE_DAY * 2
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: minDuration is invalid',
              )
            })
            it('Should NOT create more than one rental offer for the same role', async () => {
              await marketplace.connect(lender).createRentalOffer(rentalOffer)
              rentalOffer.nonce = `0x${randomBytes(32).toString('hex')}`
              await expect(marketplace.connect(lender).createRentalOffer(rentalOffer)).to.be.revertedWith(
                'NftRentalMarketplace: role still has an active offer',
              )
            })
          })
        })
      })
    })
    describe('Core Functions', async () => {
      describe('Initialize', async () => {
        it("Should NOT initialize the contract if it's already initialized", async () => {
          await expect(marketplace.initialize(operator.address, ethers.ZeroAddress)).to.be.revertedWith(
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
    })
  })
})
