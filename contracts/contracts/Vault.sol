// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IOwnableLike {
    function owner() external view returns (address);
}

contract Vault is Ownable {
    using SafeERC20 for IERC20;

    error UnauthorizedOrderBook(address caller);
    error InsufficientAvailableBalance(address user, address token, uint256 requested, uint256 available);
    error RegistryCannotAuthorizeOrderBook(address registry, address orderBook);

    mapping(address user => mapping(address token => uint256 amount)) public balances;
    mapping(address user => mapping(address token => uint256 amount)) public locked;
    mapping(address orderBook => bool allowed) public authorizedOrderBooks;
    mapping(address registry => bool allowed) public authorizedRegistries;
    mapping(address orderBook => address registry) public orderBookRegistries;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event OrderBookAuthorizationUpdated(address indexed orderBook, bool allowed);
    event RegistryAuthorizationUpdated(address indexed registry, bool allowed);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setRegistryAuthorization(address registry, bool allowed) external onlyOwner {
        authorizedRegistries[registry] = allowed;
        emit RegistryAuthorizationUpdated(registry, allowed);
    }

    modifier onlyOwnerOrRegistry() {
        if (msg.sender != owner() && !authorizedRegistries[msg.sender]) {
            revert UnauthorizedOrderBook(msg.sender);
        }
        _;
    }

    function deposit(address token, uint256 amount) external {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualAmount = balanceAfter - balanceBefore;

        balances[msg.sender][token] += actualAmount;
        emit Deposit(msg.sender, token, actualAmount);
    }

    function withdraw(address token, uint256 amount) external {
        uint256 available = balances[msg.sender][token] - locked[msg.sender][token];
        if (available < amount) {
            revert InsufficientAvailableBalance(msg.sender, token, amount, available);
        }

        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, token, amount);
    }

    function setOrderBookAuthorization(address orderBook, bool allowed) external onlyOwnerOrRegistry {
        if (msg.sender != owner()) {
            address assignedRegistry = orderBookRegistries[orderBook];
            if (allowed) {
                if (assignedRegistry == address(0)) {
                    if (IOwnableLike(orderBook).owner() != msg.sender) {
                        revert RegistryCannotAuthorizeOrderBook(msg.sender, orderBook);
                    }
                    orderBookRegistries[orderBook] = msg.sender;
                } else if (assignedRegistry != msg.sender) {
                    revert RegistryCannotAuthorizeOrderBook(msg.sender, orderBook);
                }
            } else if (assignedRegistry != msg.sender) {
                revert RegistryCannotAuthorizeOrderBook(msg.sender, orderBook);
            } else {
                delete orderBookRegistries[orderBook];
            }
        }

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
