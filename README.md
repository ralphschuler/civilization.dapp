# Civilization DApp

Civilization is a Next.js World Mini App. Its active production target is proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0`, which lets the connected World wallet create its own village once through `registerWallet()`. Access uses the proven native WalletAuth/SIWE flow, reads `playerState`, and renders the game on the same page after registration. The active client uses no IDKit, Auth.js session, or `/game` redirect.

## Wallet-registration trust boundary

`registerWallet()` is intentionally public and permissionless. Any wallet may call it directly and can initialize only `msg.sender` once; no WalletAuth/SIWE result, backend session, server attestation, World ID proof, allowlist, or relayer is consulted by the contract. WalletAuth binds this Mini App UI to a checksum address so it can display and submit for that address. It does **not** authorize an on-chain action. Every registration and later game mutation must instead be signed by the acting World wallet and is authorized by the deployed contract's own checks.

This is a per-wallet starter-village policy, not proof of personhood or Sybil resistance. Automated creation of many wallets can farm any value available to a newly registered village. Economics, rewards, rate limits outside the contract, and monitoring must assume that risk; do not represent WalletAuth as a mitigation. See the threat model in [on-chain architecture](docs/ONCHAIN_ARCHITECTURE.md#permissionless-wallet-registration-threat-model).

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

## WalletAccess browser E2E

`pnpm test:e2e:wallet` runs the focused Chromium-only WalletAccess suite at
desktop and 390px mobile widths. Its harness is enabled only for a Next
development server with the private server environment flag
`CIVILIZATION_WALLET_E2E_TEST_MODE=enabled`; it cannot be enabled through a
browser parameter and is disabled for production builds/starts. The harness
injects a deterministic result and never calls MiniKit, wallet providers, or
authentication endpoints.

CI runs the suite after the normal test/check/build steps and installs only
Chromium. It retries each test once in CI to absorb infrastructure flakes; a
second failure fails the job. Screenshots, video, and traces are retained only
for failures, and CI retains those artifacts for seven days only when the job
fails.

Server-only production configuration includes `WALLET_AUTH_URL`, `DATABASE_URL` or the documented `PG*` values. PostgreSQL stores only short-lived, one-time WalletAuth/SIWE challenges. `WORLD_APP_ID`, `CIVILIZATION_CHAIN_ID`, game contract, and WLD token addresses are read by Next at runtime and serialized into client props, so the container image contains no deployment-specific App ID. Production accepts only World Chain `480` and the configured canonical WLD address; malformed or mismatched values disable the transaction UI. Never commit secrets.

## Database migrations and probes

Run `pnpm db:migrate` after PostgreSQL is reachable and before starting the app. It serializes concurrent runners with a PostgreSQL advisory lock, records each version and SHA-256 checksum in `schema_migrations`, and can safely be repeated. A changed checksum or any migration error fails closed; restore a verified database backup before changing migration history or attempting a manual rollback. Migrations are forward-only.

The Compose and TrueNAS templates run the same migration command as a one-shot service before the app starts. `/api/healthz` is a cheap liveness probe and never touches configuration or PostgreSQL. `/api/readyz` is the read-only readiness probe: it requires runtime configuration, a DB connection, and schema version `004`; an empty or old database returns HTTP 503 without creating tables.

Production has no backend game-mutation API. UI reads `previewPlayerState`/`balanceOf` from deployed `CivilizationGame` and sends wallet registration, claim, construction, boost, training, prestige, and raid transactions through MiniKit. Backend provides WalletAuth/SIWE verification with one-time challenge storage. Health and readiness endpoints remain at `/api/healthz` and `/api/readyz`. See `docs/ADR-0046-auth-legacy-cleanup.md` for the retired paths and the isolated contract compatibility surface.

## World ID v3/v4 deployment

For a future reviewed redeployment, copy `contracts/world-id-deployment.example.json` into the protected World ID deployment file used by `WORLDCHAIN_MAINNET_WORLD_ID_FILE` and provide:

- `worldActionId`, `worldRpId`, `worldIssuerSchemaId`, and the optional v4 credential genesis minimum;
- a currently verified official World Chain v3 `WorldIDRouter` address as `worldIdLegacyRouterAddress`—the script deliberately has no fallback or guessed address;
- `worldIdLegacyAppId` and `worldIdLegacyActionId` matching the reviewed deployment plan.

The deployment preflight derives and prints both protocol field hashes and verifies all immutable verifier/router values after deployment. The current wallet-registration contract retains these legacy entrypoints only as dormant compatibility surface; the active client never calls them.
