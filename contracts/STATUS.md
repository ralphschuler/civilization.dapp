# Contract release status

**Current status: `beta_quote_only` / `not_deployed`.** This repository contains Solidity source drafts only. There are no deployment addresses, artifacts, private keys, wallet requests, contract calls, payment flows, withdrawals, custody, ERC-20 transfers, or trading actions in the running application. `CivilizationGame.sol` includes the CGOLD ERC-20 source, but it is not deployed.

`GET /api/contracts/status` exposes the same machine-readable release metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `src/CivilizationGame.sol` | Draft, not deployed, source-only | World-ID-attested registration plus player-signed on-chain game state, construction timers, prestige, and CGOLD ERC-20 mint/burn through game rules; no backend game-mutation entrypoint. |
| `src/GameResourceToken.sol` | Draft, not deployed, superseded | Older standalone token draft; not used by CivilizationGame. |
| `src/GoldSettlementRegistry.sol` | Draft, not deployed, allowlist only | Cannot custody assets or execute a swap. |
| `src/IdleCoin.sol` | Legacy draft, not deployed | Not part of the current resource path. |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before any deployment

1. Independent security review of final sources and deployment configuration.
2. World Chain testnet deployment plus full MiniKit/World-ID integration testing before mainnet.
3. Separate audited settlement adapter with independent pricing/slippage controls before any WLD purchase, redemption, fee, liquidity, or custody function.
4. Monitoring, incident handling, and product/legal approval.

## Local Solidity verification

`npm test` compiles every `contracts/src/*.sol` source deterministically with the pinned official `solc` npm package (`0.8.30`) and executes CivilizationGame registration, production, claim, CGOLD transfer, construction-timer, prestige, and replay checks on a local EVM. This is not a deployment or substitute for an independent audit.
