import re

with open("contracts/contracts/OrderBookBuckets.sol", "r") as f:
    code = f.read()

# 1. Update PriceLevel struct
code = re.sub(
    r"struct PriceLevel \{[^}]+\}",
    """struct PriceLevel {
        uint64[] orderIds;
        uint64 headIndex;
        uint128 totalOpenQuantity;
        uint128 nextPrice;
        uint128 prevPrice;
    }""",
    code,
    flags=re.MULTILINE
)

# 2. Update state variables
code = code.replace(
    "uint128[] internal bidPrices;\n    uint128[] internal askPrices;",
    "uint128 public bestBid;\n    uint128 public bestAsk;"
)

# 3. Update getPriceLevels
code = re.sub(
    r"function getPriceLevels\(uint8 side\) external view returns \(uint128\[\] memory levels\) \{[\s\S]*?\}",
    """function getPriceLevels(uint8 side) external view returns (uint128[] memory levels) {
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
    }""",
    code
)

# 4. Update _bestActiveLevel
code = re.sub(
    r"function _bestActiveLevel\(uint8 side\) internal view returns \(uint128 price, uint128 quantity\) \{[\s\S]*?\}",
    """function _bestActiveLevel(uint8 side) internal view returns (uint128 price, uint128 quantity) {
        price = side == SIDE_BID ? bestBid : bestAsk;
        if (price != 0) {
            quantity = priceLevels[side][price].totalOpenQuantity;
        }
    }""",
    code
)

# 5. Update _collectTopOrders
code = re.sub(
    r"function _collectTopOrders\([\s\S]*?\) internal view returns \(MatcherCodec\.Order\[\] memory topOrders\) \{[\s\S]*?    \}",
    """function _collectTopOrders(
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
            for (uint256 j = level.headIndex; j < orderCount && count < depth; ) {
                OrderRecord storage order = orders[level.orderIds[j]];
                if (!order.isActive || order.filled >= order.quantity) {
                    unchecked {
                        ++j;
                    }
                    continue;
                }

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

            currentPrice = level.nextPrice;
        }

        topOrders = new MatcherCodec.Order[](count);
        for (uint256 i = 0; i < count; ) {
            topOrders[i] = scratch[i];
            unchecked {
                ++i;
            }
        }
    }""",
    code,
    count=1
)

# 6. Update _collectTopOrdersWithHypothetical
code = re.sub(
    r"function _collectTopOrdersWithHypothetical\([\s\S]*?\) internal view returns \(MatcherCodec\.Order\[\] memory topOrders\) \{[\s\S]*?    \}",
    """function _collectTopOrdersWithHypothetical(
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
            for (uint256 j = level.headIndex; j < orderCount && count < depth; ) {
                OrderRecord storage order = orders[level.orderIds[j]];
                if (!order.isActive || order.filled >= order.quantity) {
                    unchecked {
                        ++j;
                    }
                    continue;
                }

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
    }""",
    code,
    count=1
)

# 7. Update _appendToPriceLevel and _insertPriceLevel, and add _removePriceLevel
new_append_and_insert = """function _appendToPriceLevel(uint64 orderId, uint8 side, uint128 price, uint128 quantity) internal {
        PriceLevel storage level = priceLevels[side][price];
        if (level.totalOpenQuantity == 0) {
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
    }"""

code = re.sub(
    r"function _appendToPriceLevel[\s\S]*?function _advanceHeadIfNeeded",
    new_append_and_insert + "\n\n    function _advanceHeadIfNeeded",
    code
)

# 8. Update cancelOrder
cancel_order_orig = """        uint128 openQuantity = order.quantity - order.filled;
        if (openQuantity > 0) {
            PriceLevel storage level = priceLevels[order.side][order.price];
            level.totalOpenQuantity -= openQuantity;
            if (level.headIndex < level.orderIds.length && level.orderIds[level.headIndex] == orderId) {
                _advanceHeadIfNeeded(order.side, order.price);
            }
        }"""
cancel_order_new = """        uint128 openQuantity = order.quantity - order.filled;
        if (openQuantity > 0) {
            PriceLevel storage level = priceLevels[order.side][order.price];
            level.totalOpenQuantity -= openQuantity;
            if (level.totalOpenQuantity == 0) {
                _removePriceLevel(order.side, order.price);
            } else if (level.headIndex < level.orderIds.length && level.orderIds[level.headIndex] == orderId) {
                _advanceHeadIfNeeded(order.side, order.price);
            }
        }"""
code = code.replace(cancel_order_orig, cancel_order_new)

# 9. Update _applyTrade
apply_trade_orig = """        priceLevels[SIDE_BID][bidOrder.price].totalOpenQuantity -= trade.quantity;
        priceLevels[SIDE_ASK][askOrder.price].totalOpenQuantity -= trade.quantity;"""
apply_trade_new = """        priceLevels[SIDE_BID][bidOrder.price].totalOpenQuantity -= trade.quantity;
        if (priceLevels[SIDE_BID][bidOrder.price].totalOpenQuantity == 0) {
            _removePriceLevel(SIDE_BID, bidOrder.price);
        }

        priceLevels[SIDE_ASK][askOrder.price].totalOpenQuantity -= trade.quantity;
        if (priceLevels[SIDE_ASK][askOrder.price].totalOpenQuantity == 0) {
            _removePriceLevel(SIDE_ASK, askOrder.price);
        }"""
code = code.replace(apply_trade_orig, apply_trade_new)

with open("contracts/contracts/OrderBookBuckets.sol", "w") as f:
    f.write(code)

print("Done")
