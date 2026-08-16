# Civilization DApp

Civilization is a Next.js World Mini App. Its active production target is proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0`, which lets the connected World wallet create its own village once through `registerWallet()`. Access uses the proven native WalletAuth/SIWE flow, reads `playerState`, and renders the game on the same page after registration. The active client uses no IDKit, Auth.js session, or `/game` redirect.

GitHub Pages publishes a separate walletless Next static export from `apps/demo`. It uses the shared Civilization UI and game domain in explicit `demo` mode; it never calls production game APIs.

## Release channels

`develop` verifies and publishes the `:dev` container for the server-backed Dev Mini App; `master` alone publishes `:latest` for https://civilization.nyphon.de. GitHub Pages at https://nyphon.de/civilization.dapp/ is a walletless UI preview only: it has no WalletAuth, RP signature, database, or native World App validation path. See [the Dev deployment runbook](docs/DEV_DEPLOYMENT.md).

Use Node 22 and pnpm 11.21.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
pnpm build:demo
```

Server-only production configuration includes `AUTH_SECRET`, `HMAC_SECRET_KEY`, `DATABASE_URL` or the documented `PG*` values, and `RP_SIGNING_KEY`. PostgreSQL stores only short-lived, one-time Wallet Auth challenges and login tickets. Public Mini App/World ID identifiers and game contract address are read by Next at runtime and serialized into client props, so container image contains no deployment-specific App ID. Never commit secrets.

## Database migrations and probes

Run `pnpm db:migrate` after PostgreSQL is reachable and before starting the app. It serializes concurrent runners with a PostgreSQL advisory lock, records each version and SHA-256 checksum in `schema_migrations`, and can safely be repeated. A changed checksum or any migration error fails closed; restore a verified database backup before changing migration history or attempting a manual rollback. Migrations are forward-only.

The Compose and TrueNAS templates run the same migration command as a one-shot service before the app starts. `/api/healthz` is a cheap liveness probe and never touches configuration or PostgreSQL. `/api/readyz` is the read-only readiness probe: it requires runtime configuration, a DB connection, and schema version `003`; an empty or old database returns HTTP 503 without creating tables.

Production has no backend game-mutation API. UI reads `previewPlayerState`/`balanceOf` from deployed `CivilizationGame` and sends wallet registration, claim, construction, boost, training, prestige, and raid transactions through MiniKit. Backend provides WalletAuth/SIWE verification with one-time challenge storage. Dormant Auth.js and World-ID compatibility routes are not part of the active client flow. Health and readiness endpoints remain at `/api/healthz` and `/api/readyz`.

## World ID v3/v4 deployment

For a future reviewed redeployment, copy `contracts/world-id-deployment.example.json` into the protected World ID deployment file used by `WORLDCHAIN_MAINNET_WORLD_ID_FILE` and provide:

- `worldActionId`, `worldRpId`, `worldIssuerSchemaId`, and the optional v4 credential genesis minimum;
- a currently verified official World Chain v3 `WorldIDRouter` address as `worldIdLegacyRouterAddress`—the script deliberately has no fallback or guessed address;
- `worldIdLegacyAppId` exactly equal to runtime `WORLD_ID_APP_ID`;
- `worldIdLegacyActionId` exactly equal to both `worldActionId` and runtime `WORLD_ID_ACTION`.

The deployment preflight derives and prints both protocol field hashes and verifies all immutable verifier/router values after deployment. The current wallet-registration contract retains these legacy entrypoints only as dormant compatibility surface; the active client never calls them.
