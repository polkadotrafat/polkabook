// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./OrderBookBuckets.sol";
import "./Vault.sol";

contract PairRegistry is Ownable {
    error InvalidTokenPair(address baseToken, address quoteToken);
    error PairAlreadyExists(address baseToken, address quoteToken);
    error PairNotFound(address baseToken, address quoteToken);
    error InvalidPairConfig(uint128 minOrderQuantity, uint128 minOrderNotional);

    struct PairConfig {
        address orderBook;
        address baseToken;
        address quoteToken;
        uint128 minOrderQuantity;
        uint128 minOrderNotional;
        bool enabled;
    }

    address public immutable matcherKernel;
    Vault public immutable vault;

    mapping(bytes32 pairKey => address orderBook) public pairOrderBooks;
    mapping(address orderBook => PairConfig pairConfig) public pairConfigs;
    address[] public allOrderBooks;

    event PairCreated(address indexed baseToken, address indexed quoteToken, address indexed orderBook);
    event PairStatusUpdated(address indexed orderBook, bool enabled);
    event PairTradingConfigUpdated(
        address indexed orderBook,
        uint128 minOrderQuantity,
        uint128 minOrderNotional
    );

    constructor(address initialOwner, address matcherKernel_, address vault_) Ownable(initialOwner) {
        matcherKernel = matcherKernel_;
        vault = Vault(vault_);
    }

    function createPair(
        address baseToken,
        address quoteToken,
        uint128 minOrderQuantity,
        uint128 minOrderNotional
    ) external onlyOwner returns (address orderBook) {
        if (baseToken == address(0) || quoteToken == address(0) || baseToken == quoteToken) {
            revert InvalidTokenPair(baseToken, quoteToken);
        }
        if (minOrderQuantity == 0 || minOrderNotional == 0) {
            revert InvalidPairConfig(minOrderQuantity, minOrderNotional);
        }

        bytes32 pairKey = _pairKey(baseToken, quoteToken);
        if (pairOrderBooks[pairKey] != address(0)) {
            revert PairAlreadyExists(baseToken, quoteToken);
        }

        OrderBookBuckets deployed = new OrderBookBuckets(
            address(this),
            matcherKernel,
            address(vault),
            baseToken,
            quoteToken,
            minOrderQuantity,
            minOrderNotional
        );
        orderBook = address(deployed);

        pairOrderBooks[pairKey] = orderBook;
        pairConfigs[orderBook] = PairConfig({
            orderBook: orderBook,
            baseToken: baseToken,
            quoteToken: quoteToken,
            minOrderQuantity: minOrderQuantity,
            minOrderNotional: minOrderNotional,
            enabled: true
        });
        allOrderBooks.push(orderBook);

        vault.setOrderBookAuthorization(orderBook, true);

        emit PairCreated(baseToken, quoteToken, orderBook);
    }

    function setPairEnabled(address baseToken, address quoteToken, bool enabled) external onlyOwner {
        address orderBook = getPair(baseToken, quoteToken);
        pairConfigs[orderBook].enabled = enabled;
        OrderBookBuckets(orderBook).setTradingEnabled(enabled);
        emit PairStatusUpdated(orderBook, enabled);
    }

    function setPairTradingConfig(
        address baseToken,
        address quoteToken,
        uint128 minOrderQuantity,
        uint128 minOrderNotional
    ) external onlyOwner {
        if (minOrderQuantity == 0 || minOrderNotional == 0) {
            revert InvalidPairConfig(minOrderQuantity, minOrderNotional);
        }

        address orderBook = getPair(baseToken, quoteToken);
        PairConfig storage config = pairConfigs[orderBook];
        config.minOrderQuantity = minOrderQuantity;
        config.minOrderNotional = minOrderNotional;
        OrderBookBuckets(orderBook).setTradingConfig(minOrderQuantity, minOrderNotional);
        emit PairTradingConfigUpdated(orderBook, minOrderQuantity, minOrderNotional);
    }

    function getPair(address baseToken, address quoteToken) public view returns (address orderBook) {
        orderBook = pairOrderBooks[_pairKey(baseToken, quoteToken)];
        if (orderBook == address(0)) {
            revert PairNotFound(baseToken, quoteToken);
        }
    }

    function getAllPairs() external view returns (PairConfig[] memory pairs) {
        pairs = new PairConfig[](allOrderBooks.length);
        for (uint256 i = 0; i < allOrderBooks.length; i++) {
            pairs[i] = pairConfigs[allOrderBooks[i]];
        }
    }

    function pairCount() external view returns (uint256) {
        return allOrderBooks.length;
    }

    function _pairKey(address baseToken, address quoteToken) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(baseToken, quoteToken));
    }
}
