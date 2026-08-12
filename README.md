# Civilization DApp

Civilization is a Next.js World Mini App. Production contract `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199` supports IDKit v4 Proof of Human with official v3 Orb fallback and direct on-chain verification for either proof version. Wallet Auth uses NextAuth and game access requires a confirmed `playerState` read.

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

For a future reviewed redeployment, copy `contracts/world-id-deployment.example.json` into the protected World ID deployment file used by `WORLDCHAIN_MAINNET_WORLD_ID_FILE` and provide:

- `worldActionId`, `worldRpId`, `worldIssuerSchemaId`, and the optional v4 credential genesis minimum;
- a currently verified official World Chain v3 `WorldIDRouter` address as `worldIdLegacyRouterAddress`—the script deliberately has no fallback or guessed address;
- `worldIdLegacyAppId` exactly equal to runtime `WORLD_ID_APP_ID`;
- `worldIdLegacyActionId` exactly equal to both `worldActionId` and runtime `WORLD_ID_ACTION`.

The deployment preflight derives and prints both protocol field hashes and verifies all immutable verifier/router values after deployment. Runtime configuration currently points at the deployed dual-protocol address. Do not enable a production rollout against mismatched app/action values: v3 proofs are bound to the constructor-derived external nullifier and will revert.
