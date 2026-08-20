// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICivilizationGameBurn {
    function burn(uint256 value) external;
}

/// @dev Deliberately small Uniswap V3 compatible surface.  A configured route
/// is one WLD/CGOLD pool only; there is no path bytes parameter or arbitrary call.
interface IBuybackV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function observe(
        uint32[] calldata secondsAgos
    ) external view returns (int56[] memory tickCumulatives, uint160[] memory);
}

interface IBuybackV3Router {
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
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut);
}

/// @title CivilizationBuybackVault
/// @notice Timelock-configured WLD-to-CGOLD buyback vault. All CGOLD received
/// from its sole route is burned through the configured CivilizationGame proxy.
contract CivilizationBuybackVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint32 public constant MAX_TWAP_WINDOW = 7 days;
    IERC20 public immutable token;
    address public immutable game;
    address public immutable timelock;

    address public router;
    address public pool;
    uint24 public fee;
    uint256 public minimumThreshold;
    uint256 public maxBatch;
    uint32 public twapWindow;
    uint16 public maxSlippageBps;
    bool public paused;
    uint256 public pendingWld;
    uint256 public cumulativeFunded;
    uint256 public cumulativeSpent;
    uint256 public cumulativeCgoldBurned;

    enum DeferredReason {
        Paused,
        BelowThreshold,
        DeadlineExpired,
        ObservationUnavailable,
        ZeroQuote,
        RouterFailed
    }

    event RouteConfigured(
        address indexed router,
        address indexed pool,
        uint24 fee,
        uint256 minimumThreshold,
        uint256 maxBatch,
        uint32 twapWindow,
        uint16 maxSlippageBps
    );
    event PauseSet(bool paused);
    event FundingRecorded(
        address indexed funder,
        uint256 amount,
        uint256 pendingWld
    );
    event BuybackExecuted(
        uint256 wldSpent,
        uint256 cgoldBurned,
        uint256 minCgoldOut
    );
    event BuybackDeferred(
        DeferredReason indexed reason,
        bytes32 indexed detail,
        uint256 pendingWld
    );

    error Unauthorized();
    error InvalidAddress();
    error InvalidConfiguration();
    error InvalidFunding();
    error InvalidRoute();
    error BurnAmountMismatch();

    constructor(address token_, address game_, address timelock_) {
        if (
            token_.code.length == 0 ||
            game_.code.length == 0 ||
            timelock_.code.length == 0
        ) revert InvalidAddress();
        token = IERC20(token_);
        game = game_;
        timelock = timelock_;
    }

    /// @notice Called only by the game after it checked the exact WLD receipt.
    /// @dev Direct token transfers are never credited and therefore cannot be spent.
    function recordFunding(uint256 amount) external nonReentrant {
        if (msg.sender != game) revert Unauthorized();
        if (amount == 0 || token.balanceOf(address(this)) < pendingWld + amount)
            revert InvalidFunding();
        pendingWld += amount;
        cumulativeFunded += amount;
        emit FundingRecorded(msg.sender, amount, pendingWld);
    }

    function configureRoute(
        address router_,
        address pool_,
        uint24 fee_,
        uint256 minimumThreshold_,
        uint256 maxBatch_,
        uint32 twapWindow_,
        uint16 maxSlippageBps_
    ) external {
        if (msg.sender != timelock) revert Unauthorized();
        if (
            router_.code.length == 0 ||
            pool_.code.length == 0 ||
            fee_ == 0 ||
            minimumThreshold_ == 0 ||
            maxBatch_ == 0 ||
            twapWindow_ == 0 ||
            twapWindow_ > MAX_TWAP_WINDOW ||
            maxSlippageBps_ > BPS
        ) revert InvalidConfiguration();
        address token0 = IBuybackV3Pool(pool_).token0();
        address token1 = IBuybackV3Pool(pool_).token1();
        if (
            !((token0 == address(token) && token1 == game) ||
                (token1 == address(token) && token0 == game))
        ) revert InvalidRoute();
        router = router_;
        pool = pool_;
        fee = fee_;
        minimumThreshold = minimumThreshold_;
        maxBatch = maxBatch_;
        twapWindow = twapWindow_;
        maxSlippageBps = maxSlippageBps_;
        emit RouteConfigured(
            router_,
            pool_,
            fee_,
            minimumThreshold_,
            maxBatch_,
            twapWindow_,
            maxSlippageBps_
        );
    }

    function setPaused(bool value) external {
        if (msg.sender != timelock) revert Unauthorized();
        paused = value;
        emit PauseSet(value);
    }

    /// @notice Permissionless batch execution. Expected operational conditions
    /// defer with an event; missing observations and router errors never fall
    /// back to a spot price or a looser route.
    // The OpenZeppelin nonReentrant modifier guards execute and its external router call.
    // slither-disable-start reentrancy-no-eth,reentrancy-benign
    function execute(
        uint256 requestedAmount,
        uint256 deadline
    ) external nonReentrant returns (bool executed, uint256 cgoldBurned) {
        if (paused) return _defer(DeferredReason.Paused, bytes32(0));
        if (block.timestamp > deadline)
            return _defer(DeferredReason.DeadlineExpired, bytes32(deadline));
        uint256 amount = requestedAmount == 0 ? pendingWld : requestedAmount;
        if (amount > pendingWld) amount = pendingWld;
        if (amount > maxBatch) amount = maxBatch;
        if (amount < minimumThreshold)
            return _defer(DeferredReason.BelowThreshold, bytes32(amount));
        (bool observed, uint256 twapOut, bytes32 detail) = _twapQuote(amount);
        if (!observed)
            return _defer(DeferredReason.ObservationUnavailable, detail);
        if (twapOut == 0)
            return _defer(DeferredReason.ZeroQuote, bytes32("ZERO_TWAP"));
        uint256 minOut = Math.mulDiv(twapOut, BPS - maxSlippageBps, BPS);
        if (minOut == 0)
            return _defer(DeferredReason.ZeroQuote, bytes32("ZERO_MIN_OUT"));
        uint256 beforeWld = token.balanceOf(address(this));
        IERC20 cgold = IERC20(game);
        uint256 beforeCgold = cgold.balanceOf(address(this));
        token.forceApprove(router, amount);
        try
            IBuybackV3Router(router).exactInputSingle(
                IBuybackV3Router.ExactInputSingleParams(
                    address(token),
                    game,
                    fee,
                    address(this),
                    deadline,
                    amount,
                    minOut,
                    0
                )
            )
        returns (uint256 reportedCgoldOut) {
            uint256 spent = beforeWld - token.balanceOf(address(this));
            cgoldBurned = cgold.balanceOf(address(this)) - beforeCgold;
            // The router's return is untrusted; bind it to the balance delta
            // before burning so accounting cannot follow a reported-only fill.
            if (
                spent != amount ||
                cgoldBurned < minOut ||
                reportedCgoldOut != cgoldBurned
            ) revert BurnAmountMismatch();
            ICivilizationGameBurn(game).burn(cgoldBurned);
            pendingWld -= amount;
            cumulativeSpent += amount;
            cumulativeCgoldBurned += cgoldBurned;
            emit BuybackExecuted(amount, cgoldBurned, minOut);
            return (true, cgoldBurned);
        } catch (bytes memory reason) {
            token.forceApprove(router, 0);
            return _defer(DeferredReason.RouterFailed, keccak256(reason));
        }
    }
    // slither-disable-end reentrancy-no-eth,reentrancy-benign

    function _defer(
        DeferredReason reason,
        bytes32 detail
    ) private returns (bool, uint256) {
        emit BuybackDeferred(reason, detail, pendingWld);
        return (false, 0);
    }

    function _twapQuote(
        uint256 amount
    ) private view returns (bool, uint256, bytes32) {
        if (pool == address(0) || router == address(0))
            return (false, 0, bytes32("UNCONFIGURED"));
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        try IBuybackV3Pool(pool).observe(secondsAgos) returns (
            int56[] memory ticks,
            uint160[] memory secondsPerLiquidityCumulativeX128s
        ) {
            if (
                ticks.length != 2 ||
                secondsPerLiquidityCumulativeX128s.length != 2
            ) return (false, 0, bytes32("OBS_LENGTH"));
            int56 delta = ticks[1] - ticks[0];
            int24 meanTick = int24(delta / int56(uint56(twapWindow)));
            if (delta < 0 && delta % int56(uint56(twapWindow)) != 0) --meanTick;
            return (
                true,
                _quoteAtTick(meanTick, amount, address(token) < game),
                bytes32(0)
            );
        } catch (bytes memory reason) {
            return (false, 0, keccak256(reason));
        }
    }

    function _quoteAtTick(
        int24 tick,
        uint256 baseAmount,
        bool tokenInIsToken0
    ) private pure returns (uint256 quoteAmount) {
        uint160 sqrtRatioX96 = _sqrtRatioAtTick(tick);
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount =
                tokenInIsToken0
                    ? Math.mulDiv(ratioX192, baseAmount, 1 << 192)
                    : Math.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = Math.mulDiv(
                sqrtRatioX96,
                sqrtRatioX96,
                1 << 64
            );
            quoteAmount =
                tokenInIsToken0
                    ? Math.mulDiv(ratioX128, baseAmount, 1 << 128)
                    : Math.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }

    // Adapted from Uniswap V3 TickMath; this avoids a router spot-quote call.
    // Canonical TickMath uses fixed-point 128-bit steps across the full tick range.
    // slither-disable-start divide-before-multiply,cyclomatic-complexity,too-many-digits
    function _sqrtRatioAtTick(int24 tick) private pure returns (uint160) {
        uint256 absTick = uint256(uint24(tick < 0 ? -tick : tick));
        if (absTick > 887272) revert InvalidConfiguration();
        uint256 ratio =
            absTick & 0x1 != 0
                ? 0xfffcb933bd6fad37aa2d162d1a594001
                : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0)
            ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0)
            ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0)
            ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0)
            ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0)
            ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0)
            ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0)
            ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0)
            ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0)
            ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0)
            ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0)
            ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0)
            ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0)
            ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0)
            ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0)
            ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0)
            ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0)
            ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0)
            ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0)
            ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
        if (tick > 0) ratio = type(uint256).max / ratio;
        return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
    // slither-disable-end divide-before-multiply,cyclomatic-complexity,too-many-digits
}
