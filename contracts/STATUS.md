# Contract release status

**Current status: `mainnet_deployed_no_settlement` / `worldchain_mainnet_deployed`.** `CivilizationGame` is deployed on World Chain mainnet (chain ID `480`) at `0x1A64F89881FD2E38255E62c6D62b68076052DF4b` by transaction [`0x2c99cf41434022231537e9d3077307ff24c07bfa797c68575c4774961b0d5123`](https://worldscan.org/tx/0x2c99cf41434022231537e9d3077307ff24c07bfa797c68575c4774961b0d5123) in block `33579795`. This deployment has not been independently audited. No WLD/CGOLD settlement, liquidity, redemption, withdrawal, fee routing, or custody is enabled by this release.

`GET /api/contracts/status` exposes the same machine-readable release metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `src/CivilizationGame.sol` | Deployed on World Chain mainnet; not independently audited | `CivilizationGame` at `0x1A64F89881FD2E38255E62c6D62b68076052DF4b`: direct World ID 4 on-chain registration through World Chain's official verifier plus player-signed on-chain game state, construction timers, prestige, CGOLD mint/burn through game rules, and a direct 1 WLD/hour construction boost to immutable treasury; no backend game-mutation entrypoint or WLD custody. |
| `src/GameResourceToken.sol` | Draft, not deployed, superseded | Older standalone token draft; not used by CivilizationGame. |
| `src/GoldSettlementRegistry.sol` | Draft, not deployed, allowlist only | Cannot custody assets or execute a swap. |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before settlement or wider release

1. Independent security review of final sources and deployment configuration.
2. Full MiniKit/World-ID integration testing against the deployed mainnet configuration.
3. Review World MiniKit approval/payment UX, WLD token address and immutable boost treasury before any wider WLD-boost release.
4. Separate audited settlement adapter with independent pricing/slippage controls before any WLD purchase, redemption, fee, liquidity, or custody function.
5. Monitoring, incident handling, and product/legal approval.

## Local Solidity verification

`pnpm test` compiles every `contracts/src/*.sol` source deterministically with the pinned official `solc` package (`0.8.30`) and executes CivilizationGame registration, production, claim, CGOLD transfer, WLD-to-treasury boost, construction-timer, prestige, and replay checks on a local EVM. This is not a deployment or substitute for an independent audit.
