// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MatcherCodec.sol";
import "./Vault.sol";

contract OrderBook {
    uint8 public constant SIDE_BID = 0;
    uint8 public constant SIDE_ASK = 1;
    uint256 public constant MATCH_DEPTH = 20;
    uint256 public constant PRICE_SCALE = 1e18;

    error InvalidSide(uint8 side);
    error InvalidOrderParameters(uint128 price, uint128 quantity);
    error NotOrderOwner(uint64 orderId, address caller);
    error InactiveOrder(uint64 orderId);
    error MatcherCallFailed();
    error UnknownTradeOrder(uint64 bidOrderId, uint64 askOrderId);
    error ConsumedCountMismatch(uint8 side, uint32 expected, uint32 actual);

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

    address public immutable matcherKernel;
    address public immutable baseToken;
    address public immutable quoteToken;
    Vault public immutable vault;

    uint64 public nextOrderId;

    mapping(uint64 orderId => OrderRecord order) public orders;
    uint64[] public bidOrderIds;
    uint64[] public askOrderIds;

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

    constructor(address matcherKernel_, address vault_, address baseToken_, address quoteToken_) {
        matcherKernel = matcherKernel_;
        vault = Vault(vault_);
        baseToken = baseToken_;
        quoteToken = quoteToken_;
    }

    function placeOrder(uint128 price, uint128 quantity, uint8 side) external returns (uint64 orderId) {
        if (side > SIDE_ASK) {
            revert InvalidSide(side);
        }
        if (price == 0 || quantity == 0) {
            revert InvalidOrderParameters(price, quantity);
        }

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
        _insertSorted(orderId, side);

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

    function getTopOrders(
        uint8 side,
        uint256 depth
    ) external view returns (MatcherCodec.Order[] memory topOrders) {
        return _collectTopOrders(side, depth);
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
        uint64[] storage orderIds = side == SIDE_BID ? bidOrderIds : askOrderIds;
        MatcherCodec.Order[] memory scratch = new MatcherCodec.Order[](depth);
        uint256 count;

        for (uint256 i = 0; i < orderIds.length && count < depth; i++) {
            OrderRecord storage order = orders[orderIds[i]];
            if (!order.isActive || order.filled >= order.quantity) {
                continue;
            }

            scratch[count] = MatcherCodec.Order({
                orderId: order.orderId,
                trader: order.trader,
                price: order.price,
                quantity: order.quantity,
                filled: order.filled,
                timestamp: order.timestamp,
                side: order.side
            });
            count++;
        }

        topOrders = new MatcherCodec.Order[](count);
        for (uint256 i = 0; i < count; i++) {
            topOrders[i] = scratch[i];
        }
    }

    function _insertSorted(uint64 orderId, uint8 side) internal {
        uint64[] storage orderIds = side == SIDE_BID ? bidOrderIds : askOrderIds;
        OrderRecord storage newOrder = orders[orderId];
        orderIds.push(orderId);

        uint256 index = orderIds.length - 1;
        while (index > 0) {
            OrderRecord storage previousOrder = orders[orderIds[index - 1]];
            if (_isInPriorityOrder(previousOrder, newOrder, side)) {
                break;
            }

            orderIds[index] = orderIds[index - 1];
            index--;
        }

        orderIds[index] = orderId;
    }

    function _isInPriorityOrder(
        OrderRecord storage left,
        OrderRecord storage right,
        uint8 side
    ) internal view returns (bool) {
        if (side == SIDE_BID) {
            if (left.price != right.price) {
                return left.price > right.price;
            }
        } else {
            if (left.price != right.price) {
                return left.price < right.price;
            }
        }

        if (left.timestamp != right.timestamp) {
            return left.timestamp <= right.timestamp;
        }

        return left.orderId <= right.orderId;
    }

    function _requiredReserve(uint128 price, uint128 quantity, uint8 side) internal pure returns (uint128) {
        if (side == SIDE_BID) {
            return uint128((uint256(price) * uint256(quantity)) / PRICE_SCALE);
        }

        return quantity;
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
}
