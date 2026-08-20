// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockBuybackToken {
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @dev Deterministic local-only router which can transfer a fixed CGOLD output or revert.
contract MockBuybackV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    address public immutable wld;
    address public immutable cgold;
    uint256 public amountOut;
    uint256 public reportedAmountOut;
    bool public routerFails;
    bool public reportsCustomAmountOut;
    uint256 public exactInputSingleCalls;

    constructor(address wld_, address cgold_) {
        wld = wld_;
        cgold = cgold_;
    }

    function setAmountOut(uint256 value) external {
        amountOut = value;
    }

    function setRouterFails(bool value) external {
        routerFails = value;
    }

    function setReportedAmountOut(uint256 value) external {
        reportedAmountOut = value;
        reportsCustomAmountOut = true;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256) {
        ++exactInputSingleCalls;
        if (routerFails) revert("router unavailable");
        require(
            params.tokenIn == wld && params.tokenOut == cgold,
            "unexpected route"
        );
        require(amountOut >= params.amountOutMinimum, "slippage");
        require(
            IMockBuybackToken(wld).transferFrom(
                msg.sender,
                address(this),
                params.amountIn
            ),
            "wld transfer"
        );
        require(
            IMockBuybackToken(cgold).transfer(params.recipient, amountOut),
            "cgold transfer"
        );
        return reportsCustomAmountOut ? reportedAmountOut : amountOut;
    }
}
