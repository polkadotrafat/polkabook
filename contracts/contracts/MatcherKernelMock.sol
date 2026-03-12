// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MatcherKernelMock {
    bytes private response;
    bytes public lastPayload;

    function setResponse(bytes calldata newResponse) external {
        response = newResponse;
    }

    receive() external payable {}

    fallback() external payable {
        lastPayload = msg.data;
        bytes memory currentResponse = response;
        assembly {
            return(add(currentResponse, 0x20), mload(currentResponse))
        }
    }
}
