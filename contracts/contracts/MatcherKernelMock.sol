// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MatcherKernelMock {
    bytes private response;

    function setResponse(bytes calldata newResponse) external {
        response = newResponse;
    }

    function execute(bytes calldata payload) external view returns (bytes memory) {
        payload;
        return response;
    }
}
