// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MatcherCodec.sol";

contract MatcherCodecHarness {
    function encodeMatchOrders(
        MatcherCodec.Order[] memory bids,
        MatcherCodec.Order[] memory asks
    ) external pure returns (bytes memory) {
        return MatcherCodec.encodeMatchOrders(bids, asks);
    }

    function decodeTrades(bytes memory data) external pure returns (MatcherCodec.Trade[] memory) {
        return MatcherCodec.decodeTrades(data);
    }

    function decodeMatchResult(
        bytes memory data
    ) external pure returns (MatcherCodec.MatchResult memory) {
        return MatcherCodec.decodeMatchResult(data);
    }

    function matchOrdersSelector() external pure returns (bytes4) {
        return MatcherCodec.matchOrdersSelector();
    }

    function statusOk() external pure returns (uint8) {
        return MatcherCodec.statusOk();
    }

    function statusUnsortedInput() external pure returns (uint8) {
        return MatcherCodec.statusUnsortedInput();
    }
}
