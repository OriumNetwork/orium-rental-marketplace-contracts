/* eslint-disable no-unexpected-multiline */
import { ethers, network } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { MockERC20, ERC20Splitter, MaliciousRecipient } from '../typechain-types'
import { AddressZero } from '../utils/constants'

describe('ERC20Splitter', () => {
  let splitter: ERC20Splitter
  let mockERC20: MockERC20
  let mockERC20_2: MockERC20
  let mockERC20_3: MockERC20
  let mockERC20_4: MockERC20
  let owner: Awaited<ReturnType<typeof ethers.getSigner>>
  let recipient1: Awaited<ReturnType<typeof ethers.getSigner>>
  let recipient2: Awaited<ReturnType<typeof ethers.getSigner>>
  let recipient3: Awaited<ReturnType<typeof ethers.getSigner>>
  let recipient4: Awaited<ReturnType<typeof ethers.getSigner>>
  let anotherUser: Awaited<ReturnType<typeof ethers.getSigner>>
  let maliciousRecipient: MaliciousRecipient

  const tokenAmount = ethers.parseEther('100')
  const ethAmount = ethers.parseEther('1')

  before(async function () {
    // prettier-ignore
    [owner, recipient1, recipient2, recipient3,recipient4, anotherUser] = await ethers.getSigners()
  })

  async function deploySplitterContracts() {
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    const MockERC20_2 = await ethers.getContractFactory('MockERC20')
    const MockERC20_3 = await ethers.getContractFactory('MockERC20')
    const MockERC20_4 = await ethers.getContractFactory('MockERC20')

    const ERC20Splitter = await ethers.getContractFactory('ERC20Splitter')

    const MaliciousRecipientFactory = await ethers.getContractFactory('MaliciousRecipient')
    maliciousRecipient = await MaliciousRecipientFactory.deploy()
    await maliciousRecipient.waitForDeployment()

    const mockERC20 = await MockERC20.deploy()
    await mockERC20.waitForDeployment()

    const mockERC20_2 = await MockERC20_2.deploy()
    await mockERC20_2.waitForDeployment()

    const mockERC20_3 = await MockERC20_3.deploy()
    await mockERC20_3.waitForDeployment()

    const mockERC20_4 = await MockERC20_4.deploy()
    await mockERC20_4.waitForDeployment()

    const splitter = await ERC20Splitter.deploy()
    await splitter.waitForDeployment()

    return { mockERC20, mockERC20_2, mockERC20_3, mockERC20_4, splitter }
  }

  beforeEach(async () => {
    const contracts = await loadFixture(deploySplitterContracts)
    mockERC20 = contracts.mockERC20
    mockERC20_2 = contracts.mockERC20_2
    mockERC20_3 = contracts.mockERC20_3
    mockERC20_4 = contracts.mockERC20_4
    splitter = contracts.splitter

    // Mint tokens to the owner
    await mockERC20.connect(owner).mint(owner, ethers.parseEther('1000'))
    await mockERC20_2.connect(owner).mint(owner, ethers.parseEther('1000'))
    await mockERC20_3.connect(owner).mint(owner, ethers.parseEther('1000'))
    await mockERC20_4.connect(owner).mint(owner, ethers.parseEther('1000'))

    const splitterAddress = await splitter.getAddress()

    await network.provider.send('hardhat_setBalance', [
      splitterAddress,
      ethers.toQuantity(ethers.parseEther('2')), // Setting 2 Ether
    ])

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [splitterAddress],
    })
    const splitterSigner = await ethers.getSigner(splitterAddress)

    await mockERC20.connect(splitterSigner).approve(splitterAddress, ethers.MaxUint256)
    await mockERC20_2.connect(splitterSigner).approve(splitterAddress, ethers.MaxUint256)
    await mockERC20_3.connect(splitterSigner).approve(splitterAddress, ethers.MaxUint256)
    await mockERC20_4.connect(splitterSigner).approve(splitterAddress, ethers.MaxUint256)

    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [splitterAddress],
    })

    const tokenAmount = ethers.parseEther('100')
    await mockERC20.mint(splitter, tokenAmount)
    await mockERC20_2.mint(splitter, tokenAmount)
    await mockERC20_3.mint(splitter, tokenAmount)
    await mockERC20_4.mint(splitter, tokenAmount)
  })

  describe('Main Functions', async () => {
    describe('Deposit', async () => {
      beforeEach(async () => {
        await mockERC20.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await mockERC20_2.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await mockERC20_3.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await mockERC20_4.connect(owner).approve(splitter.getAddress(), tokenAmount)
      })

      it('Should deposit ERC20 tokens for one recipient', async () => {
        const shares = [[10000]] // 50%, 30%, 20%
        const recipients = [[recipient1.address]]

        await expect(
          splitter.connect(owner).deposit([mockERC20.getAddress()], [tokenAmount], shares, recipients),
        ).to.emit(splitter, 'Deposit')

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(ethers.parseEther('100'))
      })

      it('Should deposit four ERC20 tokens and split them between recipients', async () => {
        const tokenAmounts = [
          ethers.parseEther('100'),
          ethers.parseEther('100'),
          ethers.parseEther('100'),
          ethers.parseEther('100'),
        ]
        const shares = [[10000], [10000], [10000], [10000]]
        const recipients = [[recipient1.address], [recipient2.address], [recipient3.address], [recipient4.address]]

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [mockERC20.getAddress(), mockERC20_2.getAddress(), mockERC20_3.getAddress(), mockERC20_4.getAddress()],
              tokenAmounts,
              shares,
              recipients,
            ),
        ).to.emit(splitter, 'Deposit')

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(ethers.parseEther('100'))
        expect(await splitter.balances(mockERC20_2.getAddress(), recipient2.address)).to.equal(ethers.parseEther('100'))
        expect(await splitter.balances(mockERC20_3.getAddress(), recipient3.address)).to.equal(ethers.parseEther('100'))
        expect(await splitter.balances(mockERC20_4.getAddress(), recipient4.address)).to.equal(ethers.parseEther('100'))
      })

      it.only('Should deposit four ERC20 tokens and split them between recipients', async () => {
        const tokenAmounts = [
          ethers.parseEther('100'), // Amount for token 1
          ethers.parseEther('60'), // Amount for token 2
          ethers.parseEther('40'), // Amount for token 3
          ethers.parseEther('80'), // Amount for token 4
        ]

        const shares = [
          [5000, 3000, 2000], // Shares for token 1 (50%, 30%, 20%)
          [5000, 3000, 2000], // Shares for token 2 (50%, 30%, 20%)
          [5000, 3000, 2000], // Shares for token 3 (50%, 30%, 20%)
          [5000, 3000, 2000], // Shares for token 4 (50%, 30%, 20%)
        ]

        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address], // Recipients for token 1
          [recipient1.address, recipient2.address, recipient3.address], // Recipients for token 2
          [recipient1.address, recipient2.address, recipient3.address], // Recipients for token 3
          [recipient1.address, recipient2.address, recipient3.address], // Recipients for token 4
        ]

        // Call the deposit function with matching array lengths
        await expect(
          splitter.connect(owner).deposit(
            [mockERC20.getAddress(), mockERC20_2.getAddress(), mockERC20_3.getAddress(), mockERC20_4.getAddress()],
            tokenAmounts, // The array of amounts for the 4 tokens
            shares, // Provide separate shares for each token
            recipients, // Recipients array matches in length with token addresses
          ),
        ).to.emit(splitter, 'Deposit')

        // Expected balances based on deposit amounts and shares
        const expectedRecipient1BalanceToken1 = ethers.parseEther('50') // 50% of 100 tokens (token 1)
        const expectedRecipient2BalanceToken1 = ethers.parseEther('30') // 30% of 100 tokens (token 1)
        const expectedRecipient3BalanceToken1 = ethers.parseEther('20') // 20% of 100 tokens (token 1)

        const expectedRecipient1BalanceToken2 = ethers.parseEther('30') // 50% of 60 tokens (token 2)
        const expectedRecipient2BalanceToken2 = ethers.parseEther('18') // 30% of 60 tokens (token 2)
        const expectedRecipient3BalanceToken2 = ethers.parseEther('12') // 20% of 60 tokens (token 2)

        const expectedRecipient1BalanceToken3 = ethers.parseEther('20') // 50% of 40 tokens (token 3)
        const expectedRecipient2BalanceToken3 = ethers.parseEther('12') // 30% of 40 tokens (token 3)
        const expectedRecipient3BalanceToken3 = ethers.parseEther('8') // 20% of 40 tokens (token 3)

        const expectedRecipient1BalanceToken4 = ethers.parseEther('40') // 50% of 80 tokens (token 4)
        const expectedRecipient2BalanceToken4 = ethers.parseEther('24') // 30% of 80 tokens (token 4)
        const expectedRecipient3BalanceToken4 = ethers.parseEther('16') // 20% of 80 tokens (token 4)

        // Checking balances after splitting for all tokens
        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(
          expectedRecipient1BalanceToken1,
        )
        expect(await splitter.balances(mockERC20.getAddress(), recipient2.address)).to.equal(
          expectedRecipient2BalanceToken1,
        )
        expect(await splitter.balances(mockERC20.getAddress(), recipient3.address)).to.equal(
          expectedRecipient3BalanceToken1,
        )

        expect(await splitter.balances(mockERC20_2.getAddress(), recipient1.address)).to.equal(
          expectedRecipient1BalanceToken2,
        )
        expect(await splitter.balances(mockERC20_2.getAddress(), recipient2.address)).to.equal(
          expectedRecipient2BalanceToken2,
        )
        expect(await splitter.balances(mockERC20_2.getAddress(), recipient3.address)).to.equal(
          expectedRecipient3BalanceToken2,
        )

        expect(await splitter.balances(mockERC20_3.getAddress(), recipient1.address)).to.equal(
          expectedRecipient1BalanceToken3,
        )
        expect(await splitter.balances(mockERC20_3.getAddress(), recipient2.address)).to.equal(
          expectedRecipient2BalanceToken3,
        )
        expect(await splitter.balances(mockERC20_3.getAddress(), recipient3.address)).to.equal(
          expectedRecipient3BalanceToken3,
        )

        expect(await splitter.balances(mockERC20_4.getAddress(), recipient1.address)).to.equal(
          expectedRecipient1BalanceToken4,
        )
        expect(await splitter.balances(mockERC20_4.getAddress(), recipient2.address)).to.equal(
          expectedRecipient2BalanceToken4,
        )
        expect(await splitter.balances(mockERC20_4.getAddress(), recipient3.address)).to.equal(
          expectedRecipient3BalanceToken4,
        )
      })

      it('Should deposit three ERC20 tokens and split them between recipients', async () => {
        const tokenAmounts = [ethers.parseEther('100'), ethers.parseEther('100'), ethers.parseEther('100')]
        const shares = [
          [5000, 3000, 2000],
          [5000, 3000, 2000],
          [5000, 3000, 2000],
        ]
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
          [recipient1.address, recipient2.address, recipient3.address],
          [recipient1.address, recipient2.address, recipient3.address],
        ]

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [mockERC20.getAddress(), mockERC20_2.getAddress(), mockERC20_3.getAddress()],
              tokenAmounts,
              shares,
              recipients,
            ),
        ).to.emit(splitter, 'Deposit')

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(ethers.parseEther('50'))
        expect(await splitter.balances(mockERC20_2.getAddress(), recipient2.address)).to.equal(ethers.parseEther('30'))
        expect(await splitter.balances(mockERC20_3.getAddress(), recipient3.address)).to.equal(ethers.parseEther('20'))
      })

      it('Should deposit ERC20 tokens and split them between recipients', async () => {
        const shares = [[5000, 3000, 2000]] // 50%, 30%, 20%
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit([mockERC20.getAddress()], [tokenAmount], shares, recipients),
        ).to.emit(splitter, 'Deposit')

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(ethers.parseEther('50'))
        expect(await splitter.balances(mockERC20.getAddress(), recipient2.address)).to.equal(ethers.parseEther('30'))
        expect(await splitter.balances(mockERC20.getAddress(), recipient3.address)).to.equal(ethers.parseEther('20'))
      })

      it('Should deposit native tokens (ETH) and split them between recipients', async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit([AddressZero], [ethAmount], shares, recipients, {
            value: ethAmount,
          }),
        ).to.emit(splitter, 'Deposit')

        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(ethers.parseEther('0.5'))
        expect(await splitter.balances(AddressZero, recipient2.address)).to.equal(ethers.parseEther('0.3'))
        expect(await splitter.balances(AddressZero, recipient3.address)).to.equal(ethers.parseEther('0.2'))
      })

      it('Should revert if shares do not sum to 100%', async () => {
        const invalidShares = [[4000, 4000, 1000]] // Sums to 90%
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit([mockERC20.getAddress()], [tokenAmount], invalidShares, recipients),
        ).to.be.revertedWith('ERC20Splitter: Shares must sum to 100%')
      })

      it('Should revert if the number of shares and recipients do not match', async () => {
        const invalidShares = [[5000, 3000]] // Only 2 shares
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]] // 3 recipients

        await expect(
          splitter.connect(owner).deposit([mockERC20.getAddress()], [tokenAmount], invalidShares, recipients),
        ).to.be.revertedWith('ERC20Splitter: Shares and recipients length mismatch')
      })

      it('Should revert when msg.value does not match the expected Ether amount', async () => {
        const incorrectMsgValue = ethers.parseEther('1') // Incorrect Ether amount
        const correctEtherAmount = ethers.parseEther('2') // Correct Ether amount to be split
        const tokenAddresses = [ethers.ZeroAddress] // Using address(0) for Ether
        const amounts = [correctEtherAmount] // Amount to split among recipients
        const shares = [[5000, 3000, 2000]] // Shares summing up to 100%
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit(tokenAddresses, amounts, shares, recipients, {
            value: incorrectMsgValue, // Sending incorrect msg.value
          }),
        ).to.be.revertedWith('ERC20Splitter: Incorrect native token amount sent')
      })
      it('Should revert when amount is 0', async () => {
        const incorrectMsgValue = ethers.parseEther('1') // Incorrect Ether amount
        const correctEtherAmount = ethers.parseEther('2') // Correct Ether amount to be split
        const tokenAddresses = [ethers.ZeroAddress] // Using address(0) for Ether
        const amounts = [correctEtherAmount] // Amount to split among recipients
        const shares = [[5000, 3000, 2000]] // Shares summing up to 100%
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit(tokenAddresses, [0], shares, recipients, {
            value: incorrectMsgValue, // Sending incorrect msg.value
          }),
        ).to.be.revertedWith('ERC20Splitter: Amount must be greater than zero')
      })

      it('Should revert when tokenAddresses and amounts lengths mismatch', async () => {
        const tokenAddresses = [mockERC20.getAddress(), ethers.ZeroAddress]
        const amounts = [ethers.parseEther('100')] // Length 1, intentional mismatch
        const shares = [[5000, 3000, 2000]] // Correct length
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await expect(
          splitter.connect(owner).deposit(tokenAddresses, amounts, shares, recipients, {
            value: ethers.parseEther('0'), // No Ether sent
          }),
        ).to.be.revertedWith('ERC20Splitter: Invalid input lengths')
      })

      it('Should revert when tokenAddresses, shares, and recipients lengths mismatch', async () => {
        const tokenAddresses = [mockERC20.getAddress(), ethers.ZeroAddress]
        const amounts = [ethers.parseEther('100'), ethers.parseEther('2')]
        const shares = [
          [5000, 3000, 2000], // Length 1
        ] // Length 1 (intentional mismatch)
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
          [recipient1.address, recipient2.address, recipient3.address],
        ] // Length 2

        await expect(
          splitter.connect(owner).deposit(tokenAddresses, amounts, shares, recipients, {
            value: ethers.parseEther('2'),
          }),
        ).to.be.revertedWith('ERC20Splitter: Mismatched input sizes')
      })

      it('Should revert when shares and recipients lengths mismatch within sub-arrays', async () => {
        const tokenAddresses = [mockERC20.getAddress()] // Length 1
        const amounts = [ethers.parseEther('100')] // Length 1
        const shares = [[5000, 3000, 2000]] // Length 1, sub-array length 3
        const recipients = [
          [recipient1.address, recipient2.address], // Length mismatch in sub-array
        ] // Length 1, sub-array length 2

        await expect(splitter.connect(owner).deposit(tokenAddresses, amounts, shares, recipients)).to.be.revertedWith(
          'ERC20Splitter: Shares and recipients length mismatch',
        )
      })

      it('Should handle multiple native token (ETH) deposits in a single transaction', async () => {
        const ethShares = [
          [5000, 5000],
          [6000, 4000],
        ]
        const ethRecipients1 = [recipient1.address, recipient2.address] // Recipients for first ETH deposit
        const ethRecipients2 = [recipient2.address, recipient3.address] // Recipients for second ETH deposit

        const ethAmount1 = ethers.parseEther('1') // First ETH deposit (1 ETH)
        const ethAmount2 = ethers.parseEther('2') // Second ETH deposit (2 ETH)

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [AddressZero, AddressZero],
              [ethAmount1, ethAmount2],
              [ethShares[0], ethShares[1]],
              [ethRecipients1, ethRecipients2],
              { value: ethAmount1 + ethAmount2 },
            ),
        ).to.emit(splitter, 'Deposit')

        // Check balances for recipient1 (50% of 1 ETH)
        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(ethers.parseEther('0.5'))

        // Check balances for recipient2 (50% of 1 ETH + 60% of 2 ETH = 0.5 + 1.2 = 1.7 ETH)
        expect(await splitter.balances(AddressZero, recipient2.address)).to.equal(ethers.parseEther('1.7'))

        // Check balances for recipient3 (40% of 2 ETH = 0.8 ETH)
        expect(await splitter.balances(AddressZero, recipient3.address)).to.equal(ethers.parseEther('0.8'))
      })

      it('Should handle both native token (ETH) and ERC-20 deposits in a single transaction', async () => {
        const ethShares = [[5000, 5000]]
        const erc20Shares = [[6000, 4000]]

        const ethRecipients = [recipient1.address, recipient2.address]
        const erc20Recipients = [recipient2.address, recipient3.address]

        const ethAmount = ethers.parseEther('1') // ETH deposit (1 ETH)
        const erc20Amount = ethers.parseEther('100') // ERC-20 deposit (100 tokens)

        await mockERC20.connect(owner).approve(splitter.getAddress(), erc20Amount)

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [AddressZero, mockERC20.getAddress()],
              [ethAmount, erc20Amount],
              [ethShares[0], erc20Shares[0]],
              [ethRecipients, erc20Recipients],
              { value: ethAmount },
            ),
        ).to.emit(splitter, 'Deposit')

        // Check balances for recipient1 (50% of 1 ETH)
        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(ethers.parseEther('0.5'))

        // Check balances for recipient2 (50% of 1 ETH + 60% of 100 ERC-20 tokens = 0.5 ETH + 60 tokens)
        expect(await splitter.balances(AddressZero, recipient2.address)).to.equal(ethers.parseEther('0.5'))
        expect(await splitter.balances(mockERC20.getAddress(), recipient2.address)).to.equal(ethers.parseEther('60'))

        // Check balances for recipient3 (40% of 100 ERC-20 tokens = 40 tokens)
        expect(await splitter.balances(mockERC20.getAddress(), recipient3.address)).to.equal(ethers.parseEther('40'))
      })
    })

    describe('Withdraw', async () => {
      beforeEach(async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await mockERC20.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await splitter.connect(owner).deposit([mockERC20.getAddress()], [tokenAmount], shares, recipients)
      })

      it('Should allow a recipient to withdraw their split ERC20 tokens without specifying token addresses', async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(recipient1.address, [await mockERC20.getAddress()], [ethers.parseEther('50')])

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(0)
      })

      it('Should allow a recipient to withdraw their split native tokens (ETH) and ERC20 tokens', async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await splitter.connect(owner).deposit([AddressZero], [ethAmount], shares, recipients, {
          value: ethAmount,
        })

        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient1.address,
            [await mockERC20.getAddress(), AddressZero],
            [ethers.parseEther('50'), ethers.parseEther('0.5')], // 50 ERC20 tokens and 0.5 ETH
          )

        expect(await splitter.balances(await mockERC20.getAddress(), recipient1.address)).to.equal(0)
        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(0)
      })

      it('Should handle withdraw() when user has no tokens', async () => {
        await splitter.connect(anotherUser).withdraw()
      })

      it('Should revert when ERC20 transferFrom fails during withdraw', async () => {
        const mockERC20false = await mockERC20.getAddress()

        await network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [mockERC20false],
        })

        const ethAmount = ethers.parseEther('1')
        const tokenAddresses = [ethers.ZeroAddress] // Ether represented by address zero
        const amounts = [ethAmount]
        const shares = [[10000]] // 100% share
        const recipients = [[recipient1.getAddress()]]

        await splitter.connect(owner).deposit(tokenAddresses, amounts, shares, recipients, {
          value: ethAmount,
        })

        await network.provider.send('hardhat_setBalance', [
          mockERC20false,
          ethers.toQuantity(ethers.parseEther('1')), // Setting 2 Ether
        ])

        await mockERC20.transferReverts(true, 0)

        await expect(splitter.connect(recipient1).withdraw()).to.be.revertedWith('ERC20Splitter: TransferFrom failed')
      })
    })

    describe('Withdraw ERC-20 and Native Tokens', async () => {
      beforeEach(async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await mockERC20.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await splitter.connect(owner).deposit([await mockERC20.getAddress()], [tokenAmount], shares, recipients)
      })

      it('Should allow a recipient to withdraw their split ERC20 tokens without specifying token addresses', async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(recipient1.address, [await mockERC20.getAddress()], [ethers.parseEther('50')])

        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(0)
      })

      it('Should allow a recipient to withdraw their split native tokens (ETH) and ERC20 tokens', async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await splitter.connect(owner).deposit([AddressZero], [ethAmount], shares, recipients, {
          value: ethAmount,
        })

        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient1.address, // Expect both ERC-20 and native token
            [await mockERC20.getAddress(), AddressZero],
            [ethers.parseEther('50'), ethers.parseEther('0.5')], // 50 ERC20 tokens and 0.5 ETH
          )

        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(0)
        expect(await splitter.balances(mockERC20.getAddress(), recipient1.address)).to.equal(0)
      })
    })

    describe('Withdraw Only Native Tokens (ETH)', async () => {
      beforeEach(async () => {
        const shares = [[5000, 3000, 2000]]
        const recipients = [[recipient1.address, recipient2.address, recipient3.address]]

        await splitter.connect(owner).deposit([AddressZero], [ethAmount], shares, recipients, {
          value: ethAmount,
        })
      })

      it('Should allow a recipient to withdraw only their split native tokens (ETH)', async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient1.address,
            [AddressZero],
            [ethers.parseEther('0.5')], // Expect 0.5 ETH (50% of 1 ETH)
          )

        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(0)
      })
    })

    describe('Deposit ETH for recipient1 and ERC-20 for other recipients', async () => {
      beforeEach(async () => {
        const ethShares = [[10000]] // 100% for recipient1 (ETH)
        const erc20Shares = [[5000, 5000]] // 50% for recipient2, 50% for recipient3 (ERC-20)
        const ethRecipients = [[recipient1.address]] // Only recipient1 gets ETH
        const erc20Recipients = [
          [recipient2.address, recipient3.address], // recipient2 and recipient3 get ERC-20 tokens
        ]
        await splitter.connect(owner).deposit([AddressZero], [ethAmount], ethShares, ethRecipients, {
          value: ethAmount,
        })

        // Then, deposit ERC-20 tokens for recipient2 and recipient3
        await mockERC20.connect(owner).approve(splitter.getAddress(), tokenAmount)
        await splitter
          .connect(owner)
          .deposit([await mockERC20.getAddress()], [tokenAmount], erc20Shares, erc20Recipients)
      })

      it('Should allow recipient1 to withdraw only their ETH and other recipients to withdraw their ERC-20 tokens', async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient1.address,
            [AddressZero],
            [ethers.parseEther('1')], // Full 1 ETH
          )

        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(0)

        await expect(splitter.connect(recipient2).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient2.address,
            [await mockERC20.getAddress()],
            [ethers.parseEther('50')], // 50% of ERC-20 tokens
          )

        expect(await splitter.balances(mockERC20.getAddress(), recipient2.address)).to.equal(0)

        await expect(splitter.connect(recipient3).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient3.address,
            [await mockERC20.getAddress()],
            [ethers.parseEther('50')], // 50% of ERC-20 tokens
          )

        expect(await splitter.balances(mockERC20.getAddress(), recipient3.address)).to.equal(0)
      })
    })
    describe('Withdraw for both native tokens (ETH) and ERC-20 tokens multiples addresses 0', () => {
      let ethShares, erc20Shares
      let ethRecipients, erc20Recipients
      let ethAmount, erc20Amount

      beforeEach(async () => {
        // Define shares and recipients for both ETH and ERC-20
        ethShares = [[5000, 5000]] // 50%-50% for ETH
        erc20Shares = [[6000, 4000]] // 60%-40% for ERC-20

        ethRecipients = [recipient1.address, recipient2.address]
        erc20Recipients = [recipient2.address, recipient3.address]

        ethAmount = ethers.parseEther('1') // 1 ETH
        erc20Amount = ethers.parseEther('100') // 100 ERC-20 tokens

        await mockERC20.connect(owner).approve(splitter.getAddress(), erc20Amount)

        await splitter
          .connect(owner)
          .deposit(
            [AddressZero, mockERC20.getAddress()],
            [ethAmount, erc20Amount],
            [ethShares[0], erc20Shares[0]],
            [ethRecipients, erc20Recipients],
            { value: ethAmount },
          )
      })

      it('Should allow recipient1 to withdraw only ETH', async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient1.address,
            [AddressZero],
            [ethers.parseEther('0.5')], // 50% of 1 ETH
          )

        expect(await splitter.balances(AddressZero, recipient1.address)).to.equal(0)
      })

      it('Should allow recipient2 to withdraw both ETH and ERC-20 tokens', async () => {
        await expect(splitter.connect(recipient2).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(
            recipient2.address,
            [AddressZero, await mockERC20.getAddress()],
            [ethers.parseEther('0.5'), ethers.parseEther('60')], // 50% of 1 ETH and 60 ERC-20 tokens
          )

        expect(await splitter.balances(AddressZero, recipient2.address)).to.equal(0)
        expect(await splitter.balances(mockERC20.getAddress(), recipient2.address)).to.equal(0)
      })

      it('Should allow recipient3 to withdraw only ERC-20 tokens', async () => {
        await expect(splitter.connect(recipient3).withdraw())
          .to.emit(splitter, 'Withdraw')
          .withArgs(recipient3.address, [await mockERC20.getAddress()], [ethers.parseEther('40')])

        expect(await splitter.balances(mockERC20.getAddress(), recipient3.address)).to.equal(0)
      })
    })
  })
})
