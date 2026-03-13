// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MatcherKernelMock {
    bytes private response;
    bytes public lastPayload;
    bool public recordPayload = true;

    function setResponse(bytes calldata newResponse) external {
        response = newResponse;
    }

    function setRecordPayload(bool enabled) external {
        recordPayload = enabled;
    }

    receive() external payable {}

    fallback() external payable {
        if (recordPayload) {
            lastPayload = msg.data;
        }
        bytes memory currentResponse = response;
        assembly {
            return(add(currentResponse, 0x20), mload(currentResponse))
        }
    }
}
