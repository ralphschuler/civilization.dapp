# Contract release status

**Current status: `beta_quote_only` / `not_deployed`.** This repository contains Solidity source drafts only. There are no deployment addresses, artifacts, private keys, wallet requests, contract calls, payment flows, withdrawals, custody, ERC-20 transfers, or trading actions in the running application.

`GET /api/contracts/status` exposes the same machine-readable release metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `src/GameResourceToken.sol` | Draft, not deployed | A controller/venue-restricted ERC-20 implementation; no game controller or venue is deployed. |
| `src/GoldSettlementRegistry.sol` | Draft, not deployed, allowlist only | Cannot custody assets or execute a swap. |
| `src/IdleCoin.sol` | Legacy draft, not deployed | Not part of the current resource path. |

The `worldchain.tokens.example.json` addresses are reference data only, not an allowlist or deployment configuration. Re-verify them against the official World Chain registry before any future review.

## Required before any deployment

1. Independent security review of final sources and deployment configuration.
2. An audited settlement adapter with independent pricing and slippage controls.
3. Liquidity, monitoring, incident handling, and product/legal approval.

## Local Solidity verification

This workspace intentionally declares no Solidity compiler or contract-test framework in `package.json`; `forge`, `solc`, and `solcjs` were not available during this release check. No compiler dependency or deployment tooling was added. The Node test suite verifies the source inventory and release boundary deterministically, but it is not a replacement for compiler/unit-test coverage once an approved Solidity toolchain is introduced.
