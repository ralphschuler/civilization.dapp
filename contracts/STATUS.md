# Contract release status

**Current status: `mainnet_wallet_registration_deployed_no_settlement` / `worldchain_mainnet_wallet_registration_deployed`.** `CivilizationGame` is deployed on World Chain mainnet (chain ID `480`) at `0x71564689Fa320bA010561A880CfE2896b6Dc8f8b` by transaction [`0xf9f5164392011c80cf5a510e055f255fbcfe2166e39f537d2e18cf8a48f0e750`](https://worldscan.org/tx/0xf9f5164392011c80cf5a510e055f255fbcfe2166e39f537d2e18cf8a48f0e750) in block `33697221`. It supports wallet-only `registerWallet()` and retains the older World ID entrypoints only as dormant compatibility surface. This deployment has not been independently audited. No WLD/CGOLD settlement, liquidity, redemption, withdrawal, fee routing, or custody is enabled by this release.

## Wallet-only deployment

The deployed source adds `registerWallet()` for one-time, `msg.sender`-only village initialization and emits `WalletRegistered`. The two World ID functions remain compiled only as dormant compatibility surface; the active frontend has no IDKit/RP proof flow and uses the WalletAuth/SIWE-verified wallet with MiniKit to call `registerWallet()`.

The replaced non-upgradeable contract at `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199` had zero events, zero registered wallets, and zero CGOLD supply before replacement, so no player state required migration. It remains permanently deployed as historical code.

`GET /api/contracts/status` exposes the same machine-readable release metadata from `server/contract-status.js`. It is intentionally descriptive only and cannot initiate an on-chain action.

| Source | Status | Release boundary |
| --- | --- | --- |
| `src/CivilizationGame.sol` | Deployed on World Chain mainnet; not independently audited | Contract at `0x71564689Fa320bA010561A880CfE2896b6Dc8f8b`: wallet-only `registerWallet()`, dormant legacy World ID ABI compatibility, and direct player-signed game state. |
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
