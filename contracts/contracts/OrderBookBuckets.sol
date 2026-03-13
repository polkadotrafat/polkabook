// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./MatcherCodec.sol";
import "./Vault.sol";

contract OrderBookBuckets is Ownable {
    uint8 public constant SIDE_BID = 0;
    uint8 public constant SIDE_ASK = 1;
    uint256 public constant MATCH_DEPTH = 20;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant MAX_SKIPS = 200;

    error InvalidSide(uint8 side);
    error InvalidOrderParameters(uint128 price, uint128 quantity);
    error TradingDisabled();
    error OrderBelowMinimumQuantity(uint128 quantity, uint128 minimumQuantity);
    error OrderBelowMinimumNotional(uint128 notional, uint128 minimumNotional);
    error NotOrderOwner(uint64 orderId, address caller);
    error InactiveOrder(uint64 orderId);
    error MatcherCallFailed();
    error UnknownTradeOrder(uint64 bidOrderId, uint64 askOrderId);
    error ConsumedCountMismatch(uint8 side, uint32 expected, uint32 actual);
    error TombstoneLimitExceeded(uint8 side, uint128 price, uint256 skipped, uint256 limit);

    struct OrderRecord {
        uint64 orderId;
        address trader;
        uint128 price;
        uint128 quantity;
        uint128 filled;
        uint64 timestamp;
        uint8 side;
        uint128 reservedAmount;
        bool isActive;
    }

    struct PriceLevel {
        uint64[] orderIds;
        uint64 headIndex;
        uint128 totalOpenQuantity;
        uint128 nextPrice;
        uint128 prevPrice;
    }

    struct QuoteResult {
        uint8 status;
        uint32 tradeCount;
        uint32 consumedBidCount;
        uint32 consumedAskCount;
        uint128 executedBaseQuantity;
        uint128 executedQuoteQuantity;
        MatcherCodec.Trade[] trades;
    }

    struct TopOfBook {
        uint128 bestBidPrice;
        uint128 bestBidQuantity;
        uint128 bestAskPrice;
        uint128 bestAskQuantity;
        bool crossed;
    }

    address public immutable matcherKernel;
    address public immutable baseToken;
    address public immutable quoteToken;
    Vault public immutable vault;
    uint128 public minOrderQuantity;
    uint128 public minOrderNotional;
    bool public tradingEnabled;

    uint64 public nextOrderId;

    mapping(uint64 orderId => OrderRecord order) public orders;
    mapping(uint8 side => mapping(uint128 price => PriceLevel level)) internal priceLevels;
    uint128 public bestBid;
    uint128 public bestAsk;

    event OrderPlaced(
        uint64 indexed orderId,
        address indexed trader,
        uint8 indexed side,
        uint128 price,
        uint128 quantity
    );
    event OrderCancelled(uint64 indexed orderId);
    event OrderFilled(
        uint64 indexed bidOrderId,
        uint64 indexed askOrderId,
        uint128 price,
        uint128 quantity
    );
    event TradingConfigUpdated(uint128 minOrderQuantity, uint128 minOrderNotional, bool tradingEnabled);

    constructor(
        address initialOwner,
        address matcherKernel_,
        address vault_,
        address baseToken_,
        address quoteToken_,
        uint128 minOrderQuantity_,
        uint128 minOrderNotional_
    ) Ownable(initialOwner) {
        matcherKernel = matcherKernel_;
        vault = Vault(vault_);
        baseToken = baseToken_;
        quoteToken = quoteToken_;
        minOrderQuantity = minOrderQuantity_;
        minOrderNotional = minOrderNotional_;
        tradingEnabled = true;
    }

    function placeOrder(uint128 price, uint128 quantity, uint8 side) external returns (uint64 orderId) {
        _validateOrderRequest(price, quantity, side);

        orderId = ++nextOrderId;
        uint128 reservedAmount = _requiredReserve(price, quantity, side);
        address reserveToken = side == SIDE_BID ? quoteToken : baseToken;
        vault.lockForOrder(msg.sender, reserveToken, reservedAmount);

        OrderRecord memory order = OrderRecord({
            orderId: orderId,
            trader: msg.sender,
            price: price,
            quantity: quantity,
            filled: 0,
            timestamp: uint64(block.timestamp),
            side: side,
            reservedAmount: reservedAmount,
            isActive: true
        });
        orders[orderId] = order;
        _appendToPriceLevel(orderId, side, price, quantity);

        emit OrderPlaced(orderId, msg.sender, side, price, quantity);
        _triggerMatch();
    }

    function cancelOrder(uint64 orderId) external {
        OrderRecord storage order = orders[orderId];
        if (order.trader != msg.sender) {
            revert NotOrderOwner(orderId, msg.sender);
        }
        if (!order.isActive) {
            revert InactiveOrder(orderId);
        }

        order.isActive = false;
        uint128 openQuantity = order.quantity - order.filled;
        if (openQuantity > 0) {
            PriceLevel storage level = priceLevels[order.side][order.price];
            level.totalOpenQuantity -= openQuantity;
            if (level.totalOpenQuantity == 0) {
                _removePriceLevel(order.side, order.price);
            }
            if (level.headIndex < level.orderIds.length && level.orderIds[level.headIndex] == orderId) {
                _advanceHeadIfNeeded(order.side, order.price, MAX_SKIPS);
            }
        }

        uint128 reservedAmount = order.reservedAmount;
        order.reservedAmount = 0;

        address reserveToken = order.side == SIDE_BID ? quoteToken : baseToken;
        if (reservedAmount > 0) {
            vault.unlockForOrder(order.trader, reserveToken, reservedAmount);
        }

        emit OrderCancelled(orderId);
    }

    function triggerMatch() external {
        _triggerMatch();
    }

    function quoteOrder(
        uint128 price,
        uint128 quantity,
        uint8 side
    ) external view returns (QuoteResult memory quote) {
        _validateOrderRequest(price, quantity, side);

        MatcherCodec.Order memory hypotheticalOrder = MatcherCodec.Order({
            orderId: nextOrderId + 1,
            price: price,
            quantity: quantity,
            filled: 0,
            timestamp: uint64(block.timestamp),
            side: side
        });

        MatcherCodec.Order[] memory bids;
        MatcherCodec.Order[] memory asks;
        if (side == SIDE_BID) {
            bids = _collectTopOrdersWithHypothetical(SIDE_BID, MATCH_DEPTH, hypotheticalOrder, true);
            asks = _collectTopOrders(SIDE_ASK, MATCH_DEPTH);
        } else {
            bids = _collectTopOrders(SIDE_BID, MATCH_DEPTH);
            asks = _collectTopOrdersWithHypothetical(SIDE_ASK, MATCH_DEPTH, hypotheticalOrder, false);
        }

        if (bids.length == 0 || asks.length == 0) {
            return quote;
        }

        bytes memory payload = MatcherCodec.encodeMatchOrders(bids, asks);
        (bool ok, bytes memory result) = matcherKernel.staticcall(payload);
        if (!ok) {
            revert MatcherCallFailed();
        }

        MatcherCodec.MatchResult memory matchResult = MatcherCodec.decodeMatchResult(result);
        quote.status = matchResult.status;
        quote.tradeCount = uint32(matchResult.trades.length);
        quote.consumedBidCount = matchResult.consumedBidCount;
        quote.consumedAskCount = matchResult.consumedAskCount;
        quote.trades = matchResult.trades;

        for (uint256 i = 0; i < matchResult.trades.length; ) {
            quote.executedBaseQuantity += matchResult.trades[i].quantity;
            quote.executedQuoteQuantity += _calculateNotional(
                matchResult.trades[i].price,
                matchResult.trades[i].quantity
            );
            unchecked {
                ++i;
            }
        }
    }

    function setTradingEnabled(bool enabled) external onlyOwner {
        tradingEnabled = enabled;
        emit TradingConfigUpdated(minOrderQuantity, minOrderNotional, tradingEnabled);
    }

    function setTradingConfig(uint128 minOrderQuantity_, uint128 minOrderNotional_) external onlyOwner {
        minOrderQuantity = minOrderQuantity_;
        minOrderNotional = minOrderNotional_;
        emit TradingConfigUpdated(minOrderQuantity, minOrderNotional, tradingEnabled);
    }

    function getTopOrders(
        uint8 side,
        uint256 depth
    ) external view returns (MatcherCodec.Order[] memory topOrders) {
        return _collectTopOrders(side, depth);
    }

    function getPriceLevels(uint8 side) external view returns (uint128[] memory levels) {
        uint256 count = 0;
        uint128 current = side == SIDE_BID ? bestBid : bestAsk;
        while (current != 0) {
            count++;
            current = priceLevels[side][current].nextPrice;
        }

        levels = new uint128[](count);
        current = side == SIDE_BID ? bestBid : bestAsk;
        for (uint256 i = 0; i < count; i++) {
            levels[i] = current;
            current = priceLevels[side][current].nextPrice;
        }
    }

    function getLevelState(
        uint8 side,
        uint128 price
    ) external view returns (uint256 headIndex, uint128 totalOpenQuantity, uint256 orderCount) {
        PriceLevel storage level = priceLevels[side][price];
        return (level.headIndex, level.totalOpenQuantity, level.orderIds.length);
    }

    function getTopOfBook() external view returns (TopOfBook memory top) {
        (top.bestBidPrice, top.bestBidQuantity) = _bestActiveLevel(SIDE_BID);
        (top.bestAskPrice, top.bestAskQuantity) = _bestActiveLevel(SIDE_ASK);
        top.crossed = top.bestBidPrice != 0 && top.bestAskPrice != 0 && top.bestBidPrice >= top.bestAskPrice;
    }

    function prunePriceLevel(uint8 side, uint128 price, uint256 limit) external {
        _advanceHeadIfNeeded(side, price, limit);
    }

    function _triggerMatch() internal {
        MatcherCodec.Order[] memory bids = _collectTopOrders(SIDE_BID, MATCH_DEPTH);
        MatcherCodec.Order[] memory asks = _collectTopOrders(SIDE_ASK, MATCH_DEPTH);
        if (bids.length == 0 || asks.length == 0) {
            return;
        }

        bytes memory payload = MatcherCodec.encodeMatchOrders(bids, asks);
        (bool ok, bytes memory result) = matcherKernel.call(payload);
        if (!ok) {
            revert MatcherCallFailed();
        }

        MatcherCodec.MatchResult memory matchResult = MatcherCodec.decodeMatchResult(result);
        if (matchResult.status != MatcherCodec.statusOk()) {
            revert MatcherCodec.MatcherKernelError(matchResult.status);
        }

        if (matchResult.consumedBidCount > bids.length) {
            revert ConsumedCountMismatch(SIDE_BID, matchResult.consumedBidCount, uint32(bids.length));
        }
        if (matchResult.consumedAskCount > asks.length) {
            revert ConsumedCountMismatch(SIDE_ASK, matchResult.consumedAskCount, uint32(asks.length));
        }

        for (uint256 i = 0; i < matchResult.trades.length; i++) {
            _applyTrade(matchResult.trades[i]);
        }

        _advanceConsumedFrontOrders(SIDE_BID, bids, matchResult.consumedBidCount);
        _advanceConsumedFrontOrders(SIDE_ASK, asks, matchResult.consumedAskCount);

        uint32 consumedBids = _countConsumedFrontOrders(bids);
        uint32 consumedAsks = _countConsumedFrontOrders(asks);
        if (consumedBids != matchResult.consumedBidCount) {
            revert ConsumedCountMismatch(SIDE_BID, matchResult.consumedBidCount, consumedBids);
        }
        if (consumedAsks != matchResult.consumedAskCount) {
            revert ConsumedCountMismatch(SIDE_ASK, matchResult.consumedAskCount, consumedAsks);
        }
    }

    function _applyTrade(MatcherCodec.Trade memory trade) internal {
        OrderRecord storage bidOrder = orders[trade.bidOrderId];
        OrderRecord storage askOrder = orders[trade.askOrderId];
        if (!bidOrder.isActive || !askOrder.isActive) {
            revert UnknownTradeOrder(trade.bidOrderId, trade.askOrderId);
        }

        uint128 quoteQty = uint128((uint256(trade.price) * uint256(trade.quantity)) / PRICE_SCALE);
        uint128 quoteReserveReduction =
            uint128((uint256(bidOrder.price) * uint256(trade.quantity)) / PRICE_SCALE);

        bidOrder.filled += trade.quantity;
        askOrder.filled += trade.quantity;
        bidOrder.reservedAmount -= quoteReserveReduction;
        askOrder.reservedAmount -= trade.quantity;

        priceLevels[SIDE_BID][bidOrder.price].totalOpenQuantity -= trade.quantity;
        if (priceLevels[SIDE_BID][bidOrder.price].totalOpenQuantity == 0) {
            _removePriceLevel(SIDE_BID, bidOrder.price);
        }

        priceLevels[SIDE_ASK][askOrder.price].totalOpenQuantity -= trade.quantity;
        if (priceLevels[SIDE_ASK][askOrder.price].totalOpenQuantity == 0) {
            _removePriceLevel(SIDE_ASK, askOrder.price);
        }

        vault.settleTrade(
            bidOrder.trader,
            askOrder.trader,
            baseToken,
            quoteToken,
            trade.quantity,
            quoteQty,
            quoteReserveReduction
        );

        if (bidOrder.filled == bidOrder.quantity) {
            bidOrder.isActive = false;
        }
        if (askOrder.filled == askOrder.quantity) {
            askOrder.isActive = false;
        }

        emit OrderFilled(trade.bidOrderId, trade.askOrderId, trade.price, trade.quantity);
    }

    function _collectTopOrders(
        uint8 side,
        uint256 depth
    ) internal view returns (MatcherCodec.Order[] memory topOrders) {
        MatcherCodec.Order[] memory scratch = new MatcherCodec.Order[](depth);
        uint256 count;
        uint128 currentPrice = side == SIDE_BID ? bestBid : bestAsk;

        while (currentPrice != 0 && count < depth) {
            PriceLevel storage level = priceLevels[side][currentPrice];
            if (level.totalOpenQuantity == 0) {
                currentPrice = level.nextPrice;
                continue;
            }

            uint256 orderCount = level.orderIds.length;
            uint256 skipped = 0;
            bool foundActiveOrder;
            for (uint256 j = level.headIndex; j < orderCount && count < depth; ) {
                OrderRecord storage order = orders[level.orderIds[j]];
                if (!order.isActive || order.filled >= order.quantity) {
                    if (skipped == MAX_SKIPS) {
                        revert TombstoneLimitExceeded(side, currentPrice, skipped, MAX_SKIPS);
                    }
                    unchecked {
                        ++j;
                        ++skipped;
                    }
                    continue;
                }

                foundActiveOrder = true;

                scratch[count] = MatcherCodec.Order({
                    orderId: order.orderId,
                    price: order.price,
                    quantity: order.quantity,
                    filled: order.filled,
                    timestamp: order.timestamp,
                    side: order.side
                });
                unchecked {
                    ++count;
                    ++j;
                }
            }

            if (!foundActiveOrder && count < depth && level.totalOpenQuantity > 0) {
                revert TombstoneLimitExceeded(side, currentPrice, skipped, MAX_SKIPS);
            }

            currentPrice = level.nextPrice;
        }

        topOrders = new MatcherCodec.Order[](count);
        for (uint256 i = 0; i < count; ) {
            topOrders[i] = scratch[i];
            unchecked {
                ++i;
            }
        }
    }

    function _appendToPriceLevel(uint64 orderId, uint8 side, uint128 price, uint128 quantity) internal {
        PriceLevel storage level = priceLevels[side][price];
        if (level.totalOpenQuantity == 0) {
            level.headIndex = uint64(level.orderIds.length);
            _insertPriceLevel(side, price);
        }

        level.orderIds.push(orderId);
        level.totalOpenQuantity += quantity;
    }

    function _insertPriceLevel(uint8 side, uint128 price) internal {
        uint128 current = side == SIDE_BID ? bestBid : bestAsk;
        
        if (current == 0) {
            if (side == SIDE_BID) bestBid = price;
            else bestAsk = price;
            return;
        }

        uint128 prev = 0;
        while (current != 0) {
            bool inOrder = side == SIDE_BID ? current > price : current < price;
            if (!inOrder) {
                break;
            }
            prev = current;
            current = priceLevels[side][current].nextPrice;
        }

        PriceLevel storage newLevel = priceLevels[side][price];
        newLevel.prevPrice = prev;
        newLevel.nextPrice = current;

        if (prev == 0) {
            if (side == SIDE_BID) bestBid = price;
            else bestAsk = price;
        } else {
            priceLevels[side][prev].nextPrice = price;
        }

        if (current != 0) {
            priceLevels[side][current].prevPrice = price;
        }
    }

    function _removePriceLevel(uint8 side, uint128 price) internal {
        PriceLevel storage level = priceLevels[side][price];
        uint128 prev = level.prevPrice;
        uint128 next = level.nextPrice;

        if (prev == 0) {
            if (side == SIDE_BID) {
                if (bestBid == price) bestBid = next;
            } else {
                if (bestAsk == price) bestAsk = next;
            }
        } else {
            priceLevels[side][prev].nextPrice = next;
        }

        if (next != 0) {
            priceLevels[side][next].prevPrice = prev;
        }

        level.prevPrice = 0;
        level.nextPrice = 0;
    }

    function _advanceHeadIfNeeded(uint8 side, uint128 price, uint256 limit) internal {
        PriceLevel storage level = priceLevels[side][price];
        uint256 orderCount = level.orderIds.length;
        uint256 i = 0;
        while (level.headIndex < orderCount && i < limit) {
            OrderRecord storage order = orders[level.orderIds[level.headIndex]];
            if (order.isActive && order.filled < order.quantity) {
                break;
            }
            unchecked {
                ++level.headIndex;
                ++i;
            }
        }
    }

    function _advanceConsumedFrontOrders(
        uint8 side,
        MatcherCodec.Order[] memory topOrders,
        uint32 consumedCount
    ) internal {
        for (uint256 i = 0; i < consumedCount; ) {
            MatcherCodec.Order memory consumedOrder = topOrders[i];
            PriceLevel storage level = priceLevels[side][consumedOrder.price];
            uint256 orderCount = level.orderIds.length;

            while (level.headIndex < orderCount) {
                uint64 currentOrderId = level.orderIds[level.headIndex];
                unchecked {
                    ++level.headIndex;
                }
                if (currentOrderId == consumedOrder.orderId) {
                    break;
                }
            }

            _advanceHeadIfNeeded(side, consumedOrder.price, MAX_SKIPS);
            unchecked {
                ++i;
            }
        }
    }

    function _countConsumedFrontOrders(
        MatcherCodec.Order[] memory topOrders
    ) internal view returns (uint32 consumed) {
        while (consumed < topOrders.length) {
            OrderRecord storage order = orders[topOrders[consumed].orderId];
            if (order.isActive && order.filled < order.quantity) {
                break;
            }
            consumed++;
        }
    }

    function _requiredReserve(uint128 price, uint128 quantity, uint8 side) internal pure returns (uint128) {
        if (side == SIDE_BID) {
            return _calculateNotional(price, quantity);
        }

        return quantity;
    }

    function _validateOrderRequest(uint128 price, uint128 quantity, uint8 side) internal view {
        if (!tradingEnabled) {
            revert TradingDisabled();
        }
        if (side > SIDE_ASK) {
            revert InvalidSide(side);
        }
        if (price == 0 || quantity == 0) {
            revert InvalidOrderParameters(price, quantity);
        }
        if (quantity < minOrderQuantity) {
            revert OrderBelowMinimumQuantity(quantity, minOrderQuantity);
        }

        uint128 orderNotional = _calculateNotional(price, quantity);
        if (orderNotional < minOrderNotional) {
            revert OrderBelowMinimumNotional(orderNotional, minOrderNotional);
        }
    }

    function _collectTopOrdersWithHypothetical(
        uint8 side,
        uint256 depth,
        MatcherCodec.Order memory hypotheticalOrder,
        bool isBidSide
    ) internal view returns (MatcherCodec.Order[] memory topOrders) {
        MatcherCodec.Order[] memory scratch = new MatcherCodec.Order[](depth);
        uint256 count;
        uint128 currentPrice = side == SIDE_BID ? bestBid : bestAsk;
        bool inserted;

        while (currentPrice != 0 && count < depth) {
            PriceLevel storage level = priceLevels[side][currentPrice];
            if (level.totalOpenQuantity == 0) {
                currentPrice = level.nextPrice;
                continue;
            }

            uint256 orderCount = level.orderIds.length;
            uint256 skipped = 0;
            bool foundActiveOrder;
            for (uint256 j = level.headIndex; j < orderCount && count < depth; ) {
                OrderRecord storage order = orders[level.orderIds[j]];
                if (!order.isActive || order.filled >= order.quantity) {
                    if (skipped == MAX_SKIPS) {
                        revert TombstoneLimitExceeded(side, currentPrice, skipped, MAX_SKIPS);
                    }
                    unchecked {
                        ++j;
                        ++skipped;
                    }
                    continue;
                }

                foundActiveOrder = true;

                MatcherCodec.Order memory currentOrder = MatcherCodec.Order({
                    orderId: order.orderId,
                    price: order.price,
                    quantity: order.quantity,
                    filled: order.filled,
                    timestamp: order.timestamp,
                    side: order.side
                });

                if (!inserted && _shouldPrecede(hypotheticalOrder, currentOrder, isBidSide)) {
                    scratch[count] = hypotheticalOrder;
                    inserted = true;
                    unchecked {
                        ++count;
                    }
                    if (count == depth) {
                        break;
                    }
                }

                scratch[count] = currentOrder;
                unchecked {
                    ++count;
                    ++j;
                }
            }

            if (!foundActiveOrder && count < depth && level.totalOpenQuantity > 0) {
                revert TombstoneLimitExceeded(side, currentPrice, skipped, MAX_SKIPS);
            }

            currentPrice = level.nextPrice;
        }

        if (!inserted && count < depth) {
            scratch[count] = hypotheticalOrder;
            unchecked {
                ++count;
            }
        }

        topOrders = new MatcherCodec.Order[](count);
        for (uint256 i = 0; i < count; ) {
            topOrders[i] = scratch[i];
            unchecked {
                ++i;
            }
        }
    }

    function _shouldPrecede(
        MatcherCodec.Order memory left,
        MatcherCodec.Order memory right,
        bool isBidSide
    ) internal pure returns (bool) {
        if (isBidSide) {
            if (left.price != right.price) {
                return left.price > right.price;
            }
        } else if (left.price != right.price) {
            return left.price < right.price;
        }

        if (left.timestamp != right.timestamp) {
            return left.timestamp < right.timestamp;
        }

        return left.orderId < right.orderId;
    }

    function _calculateNotional(uint128 price, uint128 quantity) internal pure returns (uint128) {
        return uint128((uint256(price) * uint256(quantity)) / PRICE_SCALE);
    }

    function _bestActiveLevel(uint8 side) internal view returns (uint128 price, uint128 quantity) {
        price = side == SIDE_BID ? bestBid : bestAsk;
        if (price != 0) {
            quantity = priceLevels[side][price].totalOpenQuantity;
        }
    }
}
