import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { EMPTY_BYTES, MAX_UINT64, ONE_DAY, SUBTENANT_ROLE, TOKEN_OWNER_ROLE, USER_ROLE } from '../utils/constants'
import { randomBytes } from 'crypto'
import { SignatureType } from '../utils/types'

describe('Orium Rental Protocol', async () => {
  let rolesRegistry: Contract
  let mockERC721: Contract
  let oriumRentalProtocol: Contract

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let deployer: SignerWithAddress
  let userOne: SignerWithAddress
  let userTwo: SignerWithAddress
  let userThree: SignerWithAddress
  let userFour: SignerWithAddress

  const tokenId = '1'
  const supportMultipleUsers = false

  before(async function () {
    // prettier-ignore
    [deployer, userOne, userTwo, userThree, userFour] = await ethers.getSigners()
  })

  beforeEach(async () => {
    const RoleRegistryFactory = await ethers.getContractFactory('NftRoles')
    rolesRegistry = await RoleRegistryFactory.deploy()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockERC721 = await MockERC721Factory.deploy('Mock ERC721', 'mERC721')

    const OriumRentalProtocolFactory = await ethers.getContractFactory('OriumRentalProtocol')
    oriumRentalProtocol = await OriumRentalProtocolFactory.deploy(rolesRegistry.address)

    await mockERC721.mint(userOne.address, tokenId)
    await mockERC721.connect(userOne).setApprovalForAll(oriumRentalProtocol.address, true)
  })

  describe('', async function () {
    describe('deposit', async () => {
      it('Should deposit a token and receive TOKEN_OWNER_ROLE', async function () {
        await expect(oriumRentalProtocol.connect(userOne).deposit(mockERC721.address, tokenId))
          .to.emit(oriumRentalProtocol, 'Deposit')
          .withArgs(mockERC721.address, tokenId, userOne.address)
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(TOKEN_OWNER_ROLE, mockERC721.address, tokenId, userOne.address, MAX_UINT64, EMPTY_BYTES) //TODO: Shouldn't we also emit the grantor?

        expect(
          await rolesRegistry.hasRole(
            TOKEN_OWNER_ROLE,
            oriumRentalProtocol.address,
            userOne.address,
            mockERC721.address,
            tokenId,
            supportMultipleUsers,
          ),
        ).to.be.true
      })
      it('Should NOT deposit a token if not the owner of the token', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).deposit(mockERC721.address, tokenId)).to.be.revertedWith(
          'ERC721: transfer from incorrect owner',
        )
      })
    })

    describe('withdraw', async () => {
      it('Should withdraw a token and TOKEN_OWNER_ROLE be revoked', async function () {
        await oriumRentalProtocol.connect(userOne).deposit(mockERC721.address, tokenId)

        await expect(oriumRentalProtocol.connect(userOne).withdraw(mockERC721.address, tokenId))
          .to.emit(oriumRentalProtocol, 'Withdraw')
          .withArgs(mockERC721.address, tokenId, userOne.address)
          .to.emit(rolesRegistry, 'RoleRevoked')
          .withArgs(TOKEN_OWNER_ROLE, mockERC721.address, tokenId, userOne.address)

        expect(
          await rolesRegistry.hasRole(
            TOKEN_OWNER_ROLE,
            oriumRentalProtocol.address,
            userOne.address,
            mockERC721.address,
            tokenId,
            supportMultipleUsers,
          ),
        ).to.be.false
      })
    })

    describe('create rental offer', async () => {
      let offer: any

      beforeEach(async () => {
        await oriumRentalProtocol.connect(userOne).deposit(mockERC721.address, tokenId)
        const latestBlock = await ethers.provider.getBlock('latest')
        const blockTimestamp = latestBlock.timestamp
        offer = {
          maker: userOne.address,
          taker: userTwo.address,
          tokenAddress: mockERC721.address,
          tokenId: tokenId,
          feeToken: ethers.constants.AddressZero,
          feeAmount: '0',
          nonce: `0x${randomBytes(32).toString('hex')}`,
          expirationDate: blockTimestamp + ONE_DAY,
        }
      })
      it('Should create a rental offer', async function () {
        await expect(oriumRentalProtocol.connect(userOne).preSignRentalOffer(offer))
          .to.emit(oriumRentalProtocol, 'RentalOfferCreated')
          .withArgs(
            offer.nonce,
            offer.maker,
            offer.taker,
            offer.tokenAddress,
            offer.tokenId,
            offer.feeToken,
            offer.feeAmount,
            offer.expirationDate,
          )
      })
      it("Should NOT create a rental offer if the token isn't deposited", async function () {
        await oriumRentalProtocol.connect(userOne).withdraw(mockERC721.address, tokenId)
        await expect(oriumRentalProtocol.connect(userOne).preSignRentalOffer(offer)).to.be.revertedWith(
          'OriumRentalProtocol: Caller does not have the required permission',
        )
      })
      it('Should NOT create a rental offer if not owner', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).preSignRentalOffer(offer)).to.be.revertedWith(
          'OriumRentalProtocol: Caller does not have the required permission',
        )
      })
    })
  })

  describe('', async () => {
    let offer: any

    beforeEach(async () => {
      await oriumRentalProtocol.connect(userOne).deposit(mockERC721.address, tokenId)
      const latestBlock = await ethers.provider.getBlock('latest')
      const blockTimestamp = latestBlock.timestamp
      offer = {
        maker: userOne.address,
        taker: userTwo.address,
        tokenAddress: mockERC721.address,
        tokenId: tokenId,
        feeToken: ethers.constants.AddressZero,
        feeAmount: '0',
        nonce: `0x${randomBytes(32).toString('hex')}`,
        expirationDate: blockTimestamp + ONE_DAY,
      }

      await oriumRentalProtocol.connect(userOne).preSignRentalOffer(offer)
    })

    describe('cancel rental offer', async function () {
      it('Should cancel a rental offer', async function () {
        await expect(oriumRentalProtocol.connect(userOne).cancelRentalOffer(offer.nonce))
          .to.emit(oriumRentalProtocol, 'RentalOfferCancelled')
          .withArgs(offer.nonce, offer.maker)
      })
      it('Should NOT cancel a rental offer twice', async function () {
        await oriumRentalProtocol.connect(userTwo).cancelRentalOffer(offer.nonce)
        await expect(oriumRentalProtocol.connect(userTwo).cancelRentalOffer(offer.nonce)).to.be.revertedWith(
          'OriumRentalProtocol: Nonce already used',
        )
      })
    })

    describe('rent', async function () {
      it('Should rent a token', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES))
          .to.emit(oriumRentalProtocol, 'RentalStarted')
          .withArgs(offer.nonce, offer.maker, offer.taker, offer.tokenAddress, offer.tokenId, offer.expirationDate)
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(USER_ROLE, mockERC721.address, tokenId, userTwo.address, offer.expirationDate, EMPTY_BYTES)
      })
      it('Should NOT rent a token if not the taker', async function () {
        await expect(
          oriumRentalProtocol.connect(userThree).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES),
        ).to.be.revertedWith('OriumRentalProtocol: Caller is not allowed to rent this NFT')
      })
      it('Should NOT rent twice', async function () {
        await oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES)
        await expect(
          oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES),
        ).to.be.revertedWith('OriumRentalProtocol: Nonce already used')
      })
    })

    describe('endRental', async function () {
      beforeEach(async () => {
        await oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES)
      })
      it('Should end a rental if taker is the caller', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).endRental(offer.tokenAddress, offer.tokenId))
          .to.emit(oriumRentalProtocol, 'RentalEnded')
          .withArgs(offer.maker, offer.taker, offer.tokenAddress, offer.tokenId)
          .to.emit(rolesRegistry, 'RoleRevoked')
          .withArgs(USER_ROLE, mockERC721.address, tokenId, userTwo.address)
      })
      it('Should  NOT end a rental if not expired and owner is the caller', async function () {
        await expect(
          oriumRentalProtocol.connect(userOne).endRental(offer.tokenAddress, offer.tokenId),
        ).to.be.revertedWith("OriumRentalProtocol: Rental hasn't ended yet")
      })
      it('Should NOT end a rental twice', async function () {
        await oriumRentalProtocol.connect(userTwo).endRental(offer.tokenAddress, offer.tokenId)
        await expect(
          oriumRentalProtocol.connect(userOne).endRental(offer.tokenAddress, offer.tokenId),
        ).to.be.revertedWith('OriumRentalProtocol: NFT is not rented')
      })
    })

    describe('sublet', async function () {
      beforeEach(async () => {
        await oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES)
      })
      it('Should sublet a token', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).sublet(offer.tokenAddress, offer.tokenId, userThree.address))
          .to.emit(oriumRentalProtocol, 'SubletStarted')
          .withArgs(offer.taker, userThree.address, offer.tokenAddress, offer.tokenId)
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(SUBTENANT_ROLE, mockERC721.address, tokenId, userThree.address, offer.expirationDate, EMPTY_BYTES)
      })
      it('Should sublet if subtenant is the caller', async function () {
        await oriumRentalProtocol.connect(userTwo).sublet(offer.tokenAddress, offer.tokenId, userThree.address)
        await expect(oriumRentalProtocol.connect(userThree).sublet(offer.tokenAddress, offer.tokenId, userFour.address))
          .to.emit(oriumRentalProtocol, 'SubletStarted')
          .withArgs(userThree.address, userFour.address, offer.tokenAddress, offer.tokenId)
          .to.emit(rolesRegistry, 'RoleGranted')
          .withArgs(SUBTENANT_ROLE, mockERC721.address, tokenId, userFour.address, offer.expirationDate, EMPTY_BYTES)
      })
      it("Should NOT sublet a token if the caller isn't the taker", async function () {
        await expect(
          oriumRentalProtocol.connect(userThree).sublet(offer.tokenAddress, offer.tokenId, userFour.address),
        ).to.be.revertedWith('OriumRentalProtocol: Only taker or subtenant can sublet')
      })
      it('Should NOT sublet twice if subtenant is the caller', async function () {
        await oriumRentalProtocol.connect(userTwo).sublet(offer.tokenAddress, offer.tokenId, userThree.address)
        await oriumRentalProtocol.connect(userThree).sublet(offer.tokenAddress, offer.tokenId, userFour.address)
        await expect(
          oriumRentalProtocol.connect(userThree).sublet(offer.tokenAddress, offer.tokenId, userFour.address),
        ).to.be.revertedWith('OriumRentalProtocol: Only taker or subtenant can sublet')
      })
    })

    describe('endSublet', async function () {
      beforeEach(async () => {
        await oriumRentalProtocol.connect(userTwo).rent(offer, SignatureType.PRE_SIGNED, EMPTY_BYTES)
        await oriumRentalProtocol.connect(userTwo).sublet(offer.tokenAddress, offer.tokenId, userThree.address)
      })
      it('Should end a sublet if the caller is the taker or the subtenant', async function () {
        await expect(oriumRentalProtocol.connect(userTwo).endSublet(offer.tokenAddress, offer.tokenId))
          .to.emit(oriumRentalProtocol, 'SubletEnded')
          .withArgs(userTwo.address, userThree.address, offer.tokenAddress, offer.tokenId)
          .to.emit(rolesRegistry, 'RoleRevoked')
          .withArgs(SUBTENANT_ROLE, mockERC721.address, tokenId, userThree.address)
      })
      it("Should NOT end a sublet if the caller isn't the taker or the subtenant", async function () {
        await expect(
          oriumRentalProtocol.connect(userOne).endSublet(offer.tokenAddress, offer.tokenId),
        ).to.be.revertedWith('OriumRentalProtocol: Only subtenant or taker can end sublet')
      })
    })
  })
})
