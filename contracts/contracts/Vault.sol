// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is Ownable {
    error UnauthorizedOrderBook(address caller);
    error InsufficientAvailableBalance(address user, address token, uint256 requested, uint256 available);

    mapping(address user => mapping(address token => uint256 amount)) public balances;
    mapping(address user => mapping(address token => uint256 amount)) public locked;
    mapping(address orderBook => bool allowed) public authorizedOrderBooks;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event OrderBookAuthorizationUpdated(address indexed orderBook, bool allowed);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function deposit(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        uint256 available = balances[msg.sender][token] - locked[msg.sender][token];
        if (available < amount) {
            revert InsufficientAvailableBalance(msg.sender, token, amount, available);
        }

        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
        emit Withdrawal(msg.sender, token, amount);
    }

    function setOrderBookAuthorization(address orderBook, bool allowed) external onlyOwner {
        authorizedOrderBooks[orderBook] = allowed;
        emit OrderBookAuthorizationUpdated(orderBook, allowed);
    }

    function lockForOrder(address user, address token, uint256 amount) external onlyOrderBook {
        uint256 available = balances[user][token] - locked[user][token];
        if (available < amount) {
            revert InsufficientAvailableBalance(user, token, amount, available);
        }

        locked[user][token] += amount;
    }

    function unlockForOrder(address user, address token, uint256 amount) external onlyOrderBook {
        locked[user][token] -= amount;
    }

    function settleTrade(
        address buyer,
        address seller,
        address baseToken,
        address quoteToken,
        uint256 baseQty,
        uint256 quoteQty,
        uint256 quoteReserveReduction
    ) external onlyOrderBook {
        locked[seller][baseToken] -= baseQty;
        balances[seller][baseToken] -= baseQty;
        balances[buyer][baseToken] += baseQty;

        locked[buyer][quoteToken] -= quoteReserveReduction;
        balances[buyer][quoteToken] -= quoteQty;
        balances[seller][quoteToken] += quoteQty;
    }

    modifier onlyOrderBook() {
        if (!authorizedOrderBooks[msg.sender]) {
            revert UnauthorizedOrderBook(msg.sender);
        }
        _;
    }
}
