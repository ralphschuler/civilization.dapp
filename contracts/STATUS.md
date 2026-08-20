# Contract release status

**Current status: source hardening only; no deployment was performed by this workspace.** The V2 source adds a timelock-governed, contract-inventory market for wood/clay/stone against actual CGOLD held by the proxy. It has no WLD pair, P2P/orderbook, off-chain balance, redemption, withdrawal, or custody of another player's assets. The active proxy is not asserted to run this implementation.

## Included future proxy-release tooling

This refactor deployed nothing and did not change any runtime address. The active application runtime is configured for the existing proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0`; this repository does not claim an on-chain implementation readback or verification. The next fresh release source uses stock OpenZeppelin 5.x `TransparentUpgradeableProxy`, `ProxyAdmin`, and `TimelockController`; the ProxyAdmin owner must be the timelock with an explicit Safe proposer/admin and a minimum 72-hour delay. `CivilizationGame` has initializer-only ERC-7201 state and no implementation upgrade entrypoint. Its source-only appendage validates an immutable-token/game/timelock `CivilizationBuybackVault`, which itself needs a future timelock-reviewed router/pool/TWAP configuration before any batch can execute. `CivilizationRevenueSplitter` is a separate validated, timelock-configured splitter with permissionless 30-day payout processing and permissionless entitlement release. `CivilizationReleaseRegistry` is append-only release evidence only and never stores player data. `pnpm plan:worldchain:proxy` is dry-run only and refuses missing addresses, a short delay, or an explicit valid 2..10-recipient/10,000-BPS revenue schedule.

## Read-only runtime verification

`pnpm verify:worldchain:proxy -- --rpc-url <https-url> --proxy <address> --expected-chain-id <decimal>` runs a versioned EIP-1967 readback and writes structured JSON to stdout. It accepts all three settings explicitly, uses only `eth_chainId`, `eth_getStorageAt`, `eth_getCode`, and `eth_call`, and makes no transaction, deployment, or administrative call. Every HTTP RPC request has a 10-second `AbortController` deadline and fails closed on timeout.

On success, the report proves the current proxy address, implementation and EIP-1967 admin slots, and non-empty runtime-code hashes. It also decodes and requires non-zero ABI addresses from `proxy.timelock()` and `ProxyAdmin.owner()` at the EIP-1967 admin address; these values are emitted as the observable upgrade-authority evidence. Malformed, short, non-canonical, or zero authority results fail closed. The verifier probes `proxy.paused()` only as an optional capability: an exact ABI boolean is reported as `supported` with `true` or `false`; a JSON-RPC error is reported without provider detail as `unsupported_or_reverted`. This does not require a Pausable interface, which the current source does not expose. All other transport failures and malformed successful pause results fail closed.

This establishes only the directly observable ProxyAdmin owner and proxy timelock evidence. It cannot infer any role membership beyond the ProxyAdmin owner without the relevant ABI and role identifiers (for example, TimelockController role constants). Capture a new snapshot only after the verifier succeeds; never infer implementation, admin, authority, or code hashes from source configuration.

## V2 market upgrade operator workflow

`pnpm plan:worldchain:market-v2 -- --rpc-url <https-url> --implementation <already-deployed-v2-address> --safe <proposer-safe>` is a **dry-run-only**, sanitized JSON planner. It refuses `--send` and `--execute`; it never reads keys or prints environment values. Before emitting a bundle it requires chain `480`, the exact production proxy, the recorded proxy/admin/V1 implementation code hashes, the exact old implementation address, equality of the proxy's configured timelock and ProxyAdmin owner, a non-zero Timelock delay, a compiled-source/runtime hash match at the supplied V2 implementation address, and exact ABI-shaped role reads. CGOLD is the ERC-20 implemented at the CivilizationGame proxy itself, so reserve funding targets that proxy directly; the planner does not read or use `worldToken` (WLD) for the CGOLD reserve. It compiles `contracts/src/CivilizationGame.sol` during every run and records source SHA-256 plus creation/runtime hashes.

The plan exposes a creation-bytecode deployment action (which must be completed and codehash-verified before planning), then produces five individually salted Timelock `schedule`/`execute` calls: `upgradeAndCall` with empty initializer data, Wood/Clay/Stone configuration at 0.05/0.075/0.10 CGOLD per whole resource, 5,000 inventory each, and a real `transfer(proxy, 1000e18)` CGOLD reserve seed. It never claims an EOA can execute governance. The embedded Safe-compatible bundle is unsigned: use it only from an address that has the reported `PROPOSER_ROLE`; execution needs `EXECUTOR_ROLE` or an open executor. Schedule first, wait for the returned on-chain delay, then execute. A false role result is deliberately reported rather than worked around.

### Live verification snapshot — 2026-08-16 UTC

Observation from a read-only check against a public RPC endpoint (no secrets used): chain ID `480`; proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0` codehash `0x6ef08fd1df9261908a3870c0e7c652b38d4394eb5d5eff6cf86b82fb1b0209f9` (1114 bytes); implementation `0x7330C22d7b61CCcDB7794435535aaB349D9aFF79` codehash `0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a` (20474 bytes); EIP-1967 admin/ProxyAdmin `0x8351d16672bD54eAe8cd51Fc00E08aD8Adc4469D` codehash `0x596a47f00033112fa6862ce8f8af0ab95443ea529e74be94637d5bab676420d2` (1018 bytes). The proxy timelock and ProxyAdmin owner both read as `0x47CaD4ed6765e2aec7c569b2b1E7142D29d1530B`; `paused()` was unsupported/reverted. This is an observation at that time, not a continuing guarantee.

## Wallet-only source behavior

The source adds permissionless `registerWallet()` for one-time, `msg.sender`-only village initialization and emits `WalletRegistered`. Direct calls from any wallet are expected: WalletAuth/SIWE binds the UI to an address but is not checked on-chain and grants no contract authority. Each registration and game mutation is authorized by the acting World wallet's signature plus contract logic. This remains one-village-per-wallet rather than proof-of-personhood, so registration-linked value is exposed to multi-wallet farming; see the threat model in `docs/ONCHAIN_ARCHITECTURE.md`. The two World ID functions remain compiled only as dormant compatibility surface; the active frontend has no IDKit/RP proof flow and uses the WalletAuth/SIWE-bound wallet with MiniKit to call `registerWallet()`.

`GET /api/contracts/status` exposes machine-readable source metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source                                       | Status                                 | Release boundary                                                                                              |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `contracts/src/CivilizationGame.sol`         | Source-only; not independently audited | Wallet-only registration, direct player-signed game state, plus V2 timelock-configured CGOLD resource market. |
| `contracts/src/GoldSettlementRegistry.sol`   | Draft, not deployed, allowlist only    | Cannot custody assets or execute a swap.                                                                      |
| `contracts/src/CivilizationBuybackVault.sol` | Source-only, not deployed              | Timelock-configured single WLD/CGOLD route and immediate CGOLD burn; no venue is configured.                  |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before settlement or wider release

1. Independent security review of final sources and deployment configuration.
2. Full MiniKit/World-ID integration testing must cover real v3 and v4 proofs against the deployed address.
3. Review World MiniKit approval/payment UX, WLD token address and validated revenue-splitter configuration before any wider WLD-boost release.
4. Independent review of market pricing, reserve seeding, inventory policy, slippage/deadline controls and timelock configuration before scheduling the V2 upgrade.
5. Monitoring, incident handling, and product/legal approval.

## Local Solidity verification

`pnpm test` and the release planners compile every `contracts/src/*.sol` source deterministically with the pinned official `solc` package (`0.8.30`), optimizer enabled with `runs=10`, and `viaIR=true`. This is the single reviewed implementation-artifact profile: it keeps the exact `CivilizationGame` runtime below EIP-170's 24,576-byte limit and is asserted by the local-EVM ABI, claim, and proxy-storage compatibility checks. The suite executes both registration paths, exact verifier arguments, cross-path replay rejection, production, claim, CGOLD transfer, WLD-to-splitter boost, construction-timer, and prestige checks. This is not a deployment or substitute for an independent audit.
