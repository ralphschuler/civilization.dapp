# Contract release status

**Current status: `mainnet_dual_world_id_deployed_no_settlement` / `worldchain_mainnet_dual_world_id_deployed`.** `CivilizationGame` is deployed on World Chain mainnet (chain ID `480`) at `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199` by transaction [`0xbb4692b10f9255b84143405b03e63d2e14723e39eee920a177553d279e2b8e9a`](https://worldscan.org/tx/0xbb4692b10f9255b84143405b03e63d2e14723e39eee920a177553d279e2b8e9a) in block `33617329`. It supports direct World ID v4 and legacy v3 Orb registration. This deployment has not been independently audited. No WLD/CGOLD settlement, liquidity, redemption, withdrawal, fee routing, or custody is enabled by this release.

`GET /api/contracts/status` exposes the same machine-readable release metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `src/CivilizationGame.sol` | Deployed on World Chain mainnet; not independently audited | Contract at `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199`: constructor-bound World ID v3 router/app/action verification plus World ID v4 verifier, shared wallet/nullifier/player protection, and direct player-signed game state. No backend game-mutation entrypoint or WLD custody. |
| `src/GameResourceToken.sol` | Draft, not deployed, superseded | Older standalone token draft; not used by CivilizationGame. |
| `src/GoldSettlementRegistry.sol` | Draft, not deployed, allowlist only | Cannot custody assets or execute a swap. |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before settlement or wider release

1. Independent security review of final sources and deployment configuration.
2. Full MiniKit/World-ID integration testing must cover real v3 and v4 proofs against the deployed address.
3. Review World MiniKit approval/payment UX, WLD token address and immutable boost treasury before any wider WLD-boost release.
4. Separate audited settlement adapter with independent pricing/slippage controls before any WLD purchase, redemption, fee, liquidity, or custody function.
5. Monitoring, incident handling, and product/legal approval.

## Local Solidity verification

`pnpm test` compiles every `contracts/src/*.sol` source deterministically with the pinned official `solc` package (`0.8.30`) and executes both registration paths, exact verifier arguments, cross-path replay rejection, production, claim, CGOLD transfer, WLD-to-treasury boost, construction-timer, and prestige checks on a local EVM. This is not a deployment or substitute for an independent audit.
