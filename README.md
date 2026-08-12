# Civilization DApp

Civilization is a Next.js World Mini App. The current deployed production contract uses World ID v4. The source tree now supports IDKit v4 Proof of Human with the official v3 Orb fallback, direct on-chain verification for either proof version, explicit Wallet Auth through NextAuth, and a confirmed `playerState` read before game access.

GitHub Pages publishes a separate walletless Next static export from `apps/demo`. It uses the shared Civilization UI and game domain in explicit `demo` mode; it never calls production game APIs.

Use Node 22 and pnpm 11.21.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
pnpm build:demo
```

Server-only production configuration includes `AUTH_SECRET`, `HMAC_SECRET_KEY`, `DATABASE_URL` or the documented `PG*` values, and `RP_SIGNING_KEY`. PostgreSQL stores only short-lived, one-time Wallet Auth challenges. Public Mini App/World ID identifiers and game contract address are read by Next at runtime and serialized into client props, so container image contains no deployment-specific App ID. Never commit secrets.

Production has no backend game-mutation API. UI reads `previewPlayerState`/`balanceOf` from deployed `CivilizationGame` and sends claim, construction, boost, training, prestige, and raid transactions through MiniKit. Backend only provides Wallet Auth, one-time challenge storage, and signed World ID RP context. Health and readiness endpoints remain at `/api/healthz` and `/api/readyz`.

## World ID v3/v4 deployment

The checked-in `CivilizationGame` source is not bytecode-compatible with the currently deployed v4-only contract. Dual v3/v4 registration therefore requires a reviewed redeployment; this change does not deploy anything or alter Developer Portal configuration. Before deployment, copy `contracts/world-id-deployment.example.json` into the protected World ID deployment file used by `WORLDCHAIN_MAINNET_WORLD_ID_FILE` and provide:

- `worldActionId`, `worldRpId`, `worldIssuerSchemaId`, and the optional v4 credential genesis minimum;
- a currently verified official World Chain v3 `WorldIDRouter` address as `worldIdLegacyRouterAddress`—the script deliberately has no fallback or guessed address;
- `worldIdLegacyAppId` exactly equal to runtime `WORLD_ID_APP_ID`;
- `worldIdLegacyActionId` exactly equal to both `worldActionId` and runtime `WORLD_ID_ACTION`.

The deployment preflight derives and prints both protocol field hashes and verifies all immutable verifier/router values after deployment. After review and deployment, update the separately managed runtime contract address (including `LIVE_CONTRACT`, `CIVILIZATION_CONTRACT_ADDRESS`, and deployment templates) in one release. Until then, the published address remains v4-only. Do not enable a production rollout against mismatched app/action values: v3 proofs are bound to the constructor-derived external nullifier and will revert.
