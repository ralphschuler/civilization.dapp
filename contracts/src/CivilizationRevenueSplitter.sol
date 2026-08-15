// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Timelock-administered WLD splitter with a permissionless monthly settlement.
/// @dev Entitlements are checkpointed before a distribution rotation, so an old
/// recipient can always use release(recipient) after being removed.
contract CivilizationRevenueSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant BPS = 10_000;
    uint256 public constant PAYOUT_PERIOD = 30 days;
    IERC20 public immutable token;
    address public immutable timelock;
    address[] private _recipients;
    mapping(address => uint16) public sharesBps;
    mapping(address => uint256) public claimable;
    uint256 public totalClaimable;
    uint64 public nextPayoutAt;
    uint64 public splitVersion;

    event DistributionSet(
        address[] recipients,
        uint16[] sharesBps,
        uint64 indexed splitVersion
    );
    event RevenueAllocated(uint256 amount, uint64 indexed splitVersion);
    event MonthlyPayoutProcessed(
        uint256 amount,
        uint64 indexed splitVersion,
        uint64 nextPayoutAt
    );
    event RevenueReleased(address indexed recipient, uint256 amount);
    error Unauthorized();
    error InvalidDistribution();

    constructor(
        address token_,
        address timelock_,
        address[] memory recipients_,
        uint16[] memory shares_
    ) {
        if (token_.code.length == 0 || timelock_.code.length == 0)
            revert InvalidDistribution();
        token = IERC20(token_);
        timelock = timelock_;
        nextPayoutAt = uint64(block.timestamp + PAYOUT_PERIOD);
        _setDistribution(recipients_, shares_);
    }

    function recipients() external view returns (address[] memory) {
        return _recipients;
    }

    error PayoutNotDue(uint64 dueAt);

    /// @notice Checkpoints presently unallocated WLD only after its monthly due time.
    /// @dev This intentionally cannot be used as an early withdrawal route.
    function allocate() external nonReentrant {
        if (block.timestamp < nextPayoutAt) revert PayoutNotDue(nextPayoutAt);
        _allocate();
    }

    /// @notice Permissionless cadence endpoint. It is intentionally a cheap no-op before its deadline.
    function processMonthlyPayout()
        external
        nonReentrant
        returns (uint256 amount, uint64 version, uint64 deadline)
    {
        if (block.timestamp < nextPayoutAt)
            return (0, splitVersion, nextPayoutAt);
        amount = _allocate();
        // Current recipients are paid in the cadence transaction.  Removed
        // recipients retain their pre-rotation checkpoint for release().
        for (uint256 i; i < _recipients.length; ++i) _release(_recipients[i]);
        // Advance directly beyond the current timestamp. This stays O(1) even
        // after years of inactivity, unlike advancing one missed period at a time.
        uint256 missedPeriods =
            (block.timestamp - nextPayoutAt) / PAYOUT_PERIOD + 1;
        nextPayoutAt += uint64(missedPeriods * PAYOUT_PERIOD);
        version = splitVersion;
        deadline = nextPayoutAt;
        emit MonthlyPayoutProcessed(amount, version, deadline);
    }

    function _allocate() private returns (uint256 amount) {
        amount = token.balanceOf(address(this)) - totalClaimable;
        if (amount == 0) return 0;
        uint256 allocated;
        uint256 last = _recipients.length - 1;
        for (uint256 i; i < last; ++i) {
            uint256 part = Math.mulDiv(amount, sharesBps[_recipients[i]], BPS);
            claimable[_recipients[i]] += part;
            allocated += part;
        }
        claimable[_recipients[last]] += amount - allocated;
        totalClaimable += amount;
        emit RevenueAllocated(amount, splitVersion);
    }

    /// @notice Permissionless fallback for a recipient's checkpointed entitlement.
    function release(address recipient) external nonReentrant {
        // A previously checkpointed entitlement is never stranded by a split
        // rotation.  Crucially, this does not checkpoint the current balance:
        // new WLD remains unavailable until processMonthlyPayout is due.
        _release(recipient);
    }

    function _release(address recipient) private {
        uint256 amount = claimable[recipient];
        if (amount == 0) return;
        claimable[recipient] = 0;
        totalClaimable -= amount;
        token.safeTransfer(recipient, amount);
        emit RevenueReleased(recipient, amount);
    }

    function setDistribution(
        address[] calldata recipients_,
        uint16[] calldata shares_
    ) external nonReentrant {
        if (msg.sender != timelock) revert Unauthorized();
        // Preserve the old schedule only when it is already payable.  Before
        // the cadence boundary, leaving the balance unallocated both prevents
        // an early pull and makes the newly approved split effective at the
        // next monthly settlement.
        if (block.timestamp >= nextPayoutAt) _allocate();
        _setDistribution(recipients_, shares_);
    }

    function _setDistribution(
        address[] memory recipients_,
        uint16[] memory shares_
    ) private {
        if (
            recipients_.length < 2 ||
            recipients_.length > 10 ||
            recipients_.length != shares_.length
        ) revert InvalidDistribution();
        for (uint256 i; i < _recipients.length; ++i)
            delete sharesBps[_recipients[i]];
        delete _recipients;
        uint256 sum;
        for (uint256 i; i < recipients_.length; ++i) {
            if (
                recipients_[i] == address(0) ||
                recipients_[i] == address(this) ||
                shares_[i] == 0
            ) revert InvalidDistribution();
            for (uint256 j; j < i; ++j)
                if (recipients_[i] == recipients_[j])
                    revert InvalidDistribution();
            _recipients.push(recipients_[i]);
            sharesBps[recipients_[i]] = shares_[i];
            sum += shares_[i];
        }
        if (sum != BPS) revert InvalidDistribution();
        ++splitVersion;
        emit DistributionSet(recipients_, shares_, splitVersion);
    }
}
