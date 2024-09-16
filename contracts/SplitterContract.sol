// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

contract ERC20Splitter is ReentrancyGuard {
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => address[]) private _userTokens;
    mapping(address => mapping(address => bool)) private _hasToken;

    /** Events **/

    event Deposit(
        address indexed depositor,
        address[] tokenAddresses,
        uint256[] amounts,
        uint256[][] shares,
        address[][] recipients
    );
    event Withdraw(address indexed user, address[] tokenAddresses, uint256[] amounts);

    uint256 public constant MAX_SHARES = 10000;

    /** External Functions **/

    /// @notice Deposits ERC20 or native tokens and splits between recipients based on shares.
    /// @param tokenAddresses Array of token addresses (use address(0) for native tokens).
    /// @param amounts Array of amounts for each token.
    /// @param shares Array of share percentages (out of 10000) for each recipient.
    /// @param recipients Array of recipients for each token.
    function deposit(
        address[] calldata tokenAddresses,
        uint256[] calldata amounts,
        uint256[][] calldata shares,
        address[][] calldata recipients
    ) external payable nonReentrant {
        require(tokenAddresses.length == amounts.length, 'ERC20Splitter: Invalid input lengths');
        require(
            tokenAddresses.length == shares.length && tokenAddresses.length == recipients.length,
            'ERC20Splitter: Mismatched input sizes'
        );

        uint256 totalEthAmount = 0;

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            if (tokenAddresses[i] == address(0)) {
                totalEthAmount += amounts[i];
            }
            _splitTokens(tokenAddresses[i], amounts[i], shares[i], recipients[i]);
        }

        require(msg.value == totalEthAmount, 'ERC20Splitter: Incorrect native token amount sent');

        emit Deposit(msg.sender, tokenAddresses, amounts, shares, recipients);
    }

    /// @notice Withdraw all tokens that the caller is entitled to.
    /// Tokens are automatically determined based on previous deposits.
    function withdraw() external nonReentrant {
        address[] storage userTokens = _userTokens[msg.sender];
        require(userTokens.length > 0, 'ERC20Splitter: No tokens to withdraw');

        address[] memory withdrawnTokens = new address[](userTokens.length);
        uint256[] memory withdrawnAmounts = new uint256[](userTokens.length);

        for (uint256 i = 0; i < userTokens.length; i++) {
            address tokenAddress = userTokens[i];
            uint256 amount = balances[tokenAddress][msg.sender];

            if (amount > 0) {
                balances[tokenAddress][msg.sender] = 0;

                if (tokenAddress == address(0)) {
                    (bool success, ) = msg.sender.call{ value: amount }('');
                    require(success, 'ERC20Splitter: Failed to send Ether');
                } else {
                    require(tokenAddress != address(0), 'ERC20Splitter: Invalid token address');

                    require(
                        IERC20(tokenAddress).transferFrom(address(this), msg.sender, amount),
                        'ERC20Splitter: TransferFrom failed'
                    );
                }

                withdrawnTokens[i] = tokenAddress;
                withdrawnAmounts[i] = amount;
            }

            delete _hasToken[msg.sender][tokenAddress];
        }

        delete _userTokens[msg.sender];

        emit Withdraw(msg.sender, withdrawnTokens, withdrawnAmounts);
    }

    /** Internal Functions **/

    /// @notice Internal function to split the tokens among recipients.
    /// @param tokenAddress The address of the token being split (use address(0) for native tokens).
    /// @param amount The amount of tokens to be split.
    /// @param shares Array of share percentages (out of 10000) for each recipient.
    /// @param recipients Array of recipients for the token.
    function _splitTokens(
        address tokenAddress,
        uint256 amount,
        uint256[] calldata shares,
        address[] calldata recipients
    ) internal {
        require(shares.length == recipients.length, 'ERC20Splitter: Shares and recipients length mismatch');
        require(amount > 0, 'ERC20Splitter: Amount must be greater than zero');

        uint256 totalSharePercentage = 0;

        for (uint256 i = 0; i < shares.length; i++) {
            totalSharePercentage += shares[i];
        }

        require(totalSharePercentage == MAX_SHARES, 'ERC20Splitter: Shares must sum to 100%');

        if (tokenAddress != address(0)) {
            require(
                IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount),
                'ERC20Splitter: Transfer failed'
            );
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 recipientAmount = (amount * shares[i]) / MAX_SHARES;
            balances[tokenAddress][recipients[i]] += recipientAmount;

            _addTokenForUser(recipients[i], tokenAddress);
        }
    }

    /// @notice Adds a token to the list of tokens a user has received (for automatic withdrawals).
    /// @param recipient The recipient of the token.
    /// @param tokenAddress The address of the token.
    function _addTokenForUser(address recipient, address tokenAddress) internal {
        if (!_hasToken[recipient][tokenAddress]) {
            _userTokens[recipient].push(tokenAddress);
            _hasToken[recipient][tokenAddress] = true;
        }
    }
}
