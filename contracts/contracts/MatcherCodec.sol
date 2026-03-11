// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library MatcherCodec {
    bytes4 internal constant MATCH_ORDERS_SELECTOR = 0xd52a118e;
    uint256 internal constant HEADER_SIZE = 12;
    uint256 internal constant ORDER_SIZE = 85;
    uint256 internal constant TRADE_SIZE = 48;
    uint256 internal constant RESPONSE_HEADER_SIZE = 5;

    uint8 internal constant STATUS_OK = 0;
    uint8 internal constant STATUS_INVALID_SELECTOR = 1;
    uint8 internal constant STATUS_INVALID_LENGTH = 2;
    uint8 internal constant STATUS_TOO_MANY_ORDERS = 3;
    uint8 internal constant STATUS_INVALID_ORDER = 4;
    uint8 internal constant STATUS_UNSORTED_INPUT = 5;
    uint8 internal constant STATUS_INPUT_TOO_LARGE = 6;

    error InvalidOrderCount();
    error InvalidTradePayloadLength(uint256 length);
    error MatcherKernelError(uint8 status);

    struct Order {
        uint64 orderId;
        address trader;
        uint128 price;
        uint128 quantity;
        uint128 filled;
        uint64 timestamp;
        uint8 side;
    }

    struct Trade {
        uint64 bidOrderId;
        uint64 askOrderId;
        uint128 price;
        uint128 quantity;
    }

    struct MatchResult {
        uint8 status;
        Trade[] trades;
    }

    function encodeMatchOrders(
        Order[] memory bids,
        Order[] memory asks
    ) internal pure returns (bytes memory out) {
        if (bids.length > type(uint32).max || asks.length > type(uint32).max) {
            revert InvalidOrderCount();
        }

        out = new bytes(HEADER_SIZE + ((bids.length + asks.length) * ORDER_SIZE));
        _writeU32(out, 4, uint32(bids.length));
        _writeU32(out, 8, uint32(asks.length));

        out[0] = MATCH_ORDERS_SELECTOR[0];
        out[1] = MATCH_ORDERS_SELECTOR[1];
        out[2] = MATCH_ORDERS_SELECTOR[2];
        out[3] = MATCH_ORDERS_SELECTOR[3];

        uint256 cursor = HEADER_SIZE;

        for (uint256 i = 0; i < bids.length; i++) {
            _writeOrder(out, cursor, bids[i]);
            cursor += ORDER_SIZE;
        }

        for (uint256 i = 0; i < asks.length; i++) {
            _writeOrder(out, cursor, asks[i]);
            cursor += ORDER_SIZE;
        }
    }

    function decodeMatchResult(bytes memory data) internal pure returns (MatchResult memory result) {
        if (data.length < RESPONSE_HEADER_SIZE) {
            revert InvalidTradePayloadLength(data.length);
        }

        result.status = uint8(data[0]);
        uint256 tradeCount = _readU32(data, 1);
        uint256 expectedLength = RESPONSE_HEADER_SIZE + (tradeCount * TRADE_SIZE);
        if (data.length != expectedLength) {
            revert InvalidTradePayloadLength(data.length);
        }

        result.trades = new Trade[](tradeCount);

        uint256 cursor = RESPONSE_HEADER_SIZE;
        for (uint256 i = 0; i < tradeCount; i++) {
            result.trades[i] = Trade({
                bidOrderId: uint64(_readUint(data, cursor, 8)),
                askOrderId: uint64(_readUint(data, cursor + 8, 8)),
                price: uint128(_readUint(data, cursor + 16, 16)),
                quantity: uint128(_readUint(data, cursor + 32, 16))
            });
            cursor += TRADE_SIZE;
        }
    }

    function decodeTrades(bytes memory data) internal pure returns (Trade[] memory trades) {
        MatchResult memory result = decodeMatchResult(data);
        if (result.status != STATUS_OK) {
            revert MatcherKernelError(result.status);
        }

        return result.trades;
    }

    function matchOrdersSelector() internal pure returns (bytes4) {
        return MATCH_ORDERS_SELECTOR;
    }

    function statusOk() internal pure returns (uint8) {
        return STATUS_OK;
    }

    function statusUnsortedInput() internal pure returns (uint8) {
        return STATUS_UNSORTED_INPUT;
    }

    function _writeOrder(bytes memory out, uint256 offset, Order memory order) private pure {
        _writeUint(out, offset, order.orderId, 8);
        _writeUint(out, offset + 8, uint160(order.trader), 20);
        _writeUint(out, offset + 28, order.price, 16);
        _writeUint(out, offset + 44, order.quantity, 16);
        _writeUint(out, offset + 60, order.filled, 16);
        _writeUint(out, offset + 76, order.timestamp, 8);
        out[offset + 84] = bytes1(order.side);
    }

    function _writeU32(bytes memory out, uint256 offset, uint32 value) private pure {
        _writeUint(out, offset, value, 4);
    }

    function _writeUint(bytes memory out, uint256 offset, uint256 value, uint256 size) private pure {
        for (uint256 i = 0; i < size; i++) {
            out[offset + size - 1 - i] = bytes1(uint8(value));
            value >>= 8;
        }
    }

    function _readU32(bytes memory data, uint256 offset) private pure returns (uint32) {
        return uint32(_readUint(data, offset, 4));
    }

    function _readUint(bytes memory data, uint256 offset, uint256 size) private pure returns (uint256 value) {
        for (uint256 i = 0; i < size; i++) {
            value = (value << 8) | uint8(data[offset + i]);
        }
    }
}
