# Contract release status

**Current status: source hardening only; no deployment was performed by this workspace.** The source supports wallet-only `registerWallet()` and retains the older World ID entrypoints only as dormant compatibility surface. No WLD/CGOLD settlement, liquidity, redemption, withdrawal, fee routing, or game custody is enabled by this source patch.

## Included future proxy-release tooling

This refactor deployed nothing and did not change any runtime address. The active application runtime is configured for the existing proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0`; this repository does not claim an on-chain implementation readback or verification. The next fresh release source uses stock OpenZeppelin 5.x `TransparentUpgradeableProxy`, `ProxyAdmin`, and `TimelockController`; the ProxyAdmin owner must be the timelock with an explicit Safe proposer/admin and a minimum 72-hour delay. `CivilizationGame` has initializer-only ERC-7201 state and no implementation upgrade entrypoint. `CivilizationRevenueSplitter` is a separate validated, timelock-configured splitter with permissionless 30-day payout processing and permissionless entitlement release. `CivilizationReleaseRegistry` is append-only release evidence only and never stores player data. `pnpm plan:worldchain:proxy` is dry-run only and refuses missing addresses, a short delay, or an explicit valid 2..10-recipient/10,000-BPS revenue schedule.

## Wallet-only source behavior

The source adds `registerWallet()` for one-time, `msg.sender`-only village initialization and emits `WalletRegistered`. The two World ID functions remain compiled only as dormant compatibility surface; the active frontend has no IDKit/RP proof flow and uses the WalletAuth/SIWE-verified wallet with MiniKit to call `registerWallet()`.

`GET /api/contracts/status` exposes machine-readable source metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `contracts/src/CivilizationGame.sol` | Source-only; not independently audited | Wallet-only `registerWallet()`, dormant legacy World ID ABI compatibility, and direct player-signed game state. |
| `contracts/src/GoldSettlementRegistry.sol` | Draft, not deployed, allowlist only | Cannot custody assets or execute a swap. |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before settlement or wider release

1. Independent security review of final sources and deployment configuration.
2. Full MiniKit/World-ID integration testing must cover real v3 and v4 proofs against the deployed address.
3. Review World MiniKit approval/payment UX, WLD token address and validated revenue-splitter configuration before any wider WLD-boost release.
4. Separate audited settlement adapter with independent pricing/slippage controls before any WLD purchase, redemption, fee, liquidity, or custody function.
5. Monitoring, incident handling, and product/legal approval.

## Local Solidity verification

`pnpm test` compiles every `contracts/src/*.sol` source deterministically with the pinned official `solc` package (`0.8.30`) and executes both registration paths, exact verifier arguments, cross-path replay rejection, production, claim, CGOLD transfer, WLD-to-splitter boost, construction-timer, and prestige checks on a local EVM. This is not a deployment or substitute for an independent audit.
