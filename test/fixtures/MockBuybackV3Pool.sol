// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Deterministic local-only V3 observation surface for vault tests.
contract MockBuybackV3Pool {
    address public immutable token0;
    address public immutable token1;
    int56 public olderTickCumulative;
    int56 public newerTickCumulative;
    uint256 public tickObservationLength = 2;
    uint256 public liquidityObservationLength = 2;
    bool public observationFails;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setObservation(int56 older, int56 newer) external {
        olderTickCumulative = older;
        newerTickCumulative = newer;
    }

    function setObservationFails(bool value) external {
        observationFails = value;
    }

    function setObservationLengths(
        uint256 ticksLength,
        uint256 liquidityLength
    ) external {
        tickObservationLength = ticksLength;
        liquidityObservationLength = liquidityLength;
    }

    function observe(
        uint32[] calldata
    ) external view returns (int56[] memory ticks, uint160[] memory liquidity) {
        if (observationFails) revert("observation unavailable");
        ticks = new int56[](tickObservationLength);
        liquidity = new uint160[](liquidityObservationLength);
        if (tickObservationLength > 0) ticks[0] = olderTickCumulative;
        if (tickObservationLength > 1) ticks[1] = newerTickCumulative;
    }
}
