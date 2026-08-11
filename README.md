# Civilization DApp

Browser-first civilization-building clicker. The first TrueNAS release serves this game and a private API from one container. When the same-origin game API and PostgreSQL are available, game progress is stored and calculated server-side. The browser supplies only an opaque anonymous browser ID for this nonfinancial milestone; it is not World ID, wallet authentication, or a financial account. If the API is unavailable, the regular browser demo explicitly remains local-only in `localStorage`.

## Demo

Use the existing Vite binary from the Civilization workspace or install the declared dev dependency, then run `npm run dev`. Production first fills a raidable field stock. Press **Sammeln** to move available wood, clay, stone and gold into protected storage; only stored resources pay for upgrades, training and the market. The demo persists one local village: meet building requirements before upgrading the town hall; train troops in the barracks; and choose the exact march group for a raid.

`npm test` verifies the two critical progression locks and resource transfer after a successful raid.

## GitHub Pages

Every push to `master` runs tests, builds the Vite app, and deploys `dist/` to GitHub Pages through `.github/workflows/deploy-pages.yml`. The Vite base path adapts automatically inside GitHub Actions, while local development continues at `/`.

## Private TrueNAS service

`Dockerfile`, `compose.yaml`, and `deploy/truenas.yaml` package the legacy compatibility service on port `31057`, with its own private PostgreSQL database. The on-chain game does not use that database for game state. The public route is `civilization.nyphon.de` through NPMplus on the TrueNAS host; the proxy target is `10.42.54.153:31057`.

`GET /api/healthz` reports process health and database status; `GET /api/readyz` returns success only when PostgreSQL accepts queries and is appropriate for deployment readiness checks. `GET /api/contracts/status` makes the current `mainnet_deployed_no_settlement` boundary machine-verifiable: `CivilizationGame` is deployed on World Chain mainnet at `0x29147c7bead901e8019d7911a7dc404447877c62`, but has not been independently audited and no settlement is enabled. `GET /api/market/quote?side=buy|sell&amount=<base-unit-integer>` exposes only settlement quotes: it cannot accept WLD, transfer IMG, mint, burn, or pay out assets. The container workflow publishes `ghcr.io/ralphschuler/civilization.dapp` after tests pass on `master`.

### Authoritative game-state API

The SPA probes its same-origin `GET /api/game/state` endpoint at startup. It sends a generated opaque browser ID (32–128 URL-safe characters) only in `X-IdleMint-Anonymous-Id`; this ID is deliberately anonymous and can be lost when browser storage is cleared. A successful probe activates online mode and no browser game-state values are posted or trusted. If the endpoint is unavailable, the UI labels and uses its local demo fallback instead. This header is retained temporarily for compatibility; see [transition exceptions](./TRANSITION_COMPATIBILITY.md).

`POST /api/game/state` accepts `{ "id": "<unique action id>", "action": { "type": "...", "payload": { ... } } }` with the same header. The server accepts only gather, upgrade, train, in-game non-gold swap, raid start/resolution, and reset actions. It locks the player row, recalculates elapsed production from server time, validates the action, and stores the resulting state in the same PostgreSQL transaction. `(anonymous_id, action_id)` is unique, so a retry is idempotent and returns the original action result. Client resources, buildings, troops, timestamps, and raid outcomes are never accepted.

`GET /api/game/targets` exposes up to 50 eligible online villages through generated public village IDs only; it never exposes the private browser identifier or protected storage. PvP raids lock attacker and defender in a canonical database order, settle their state on the server, and write an auditable battle record. The server commits to a random battle seed when a march starts and reveals it in the final report, so the outcome seed was fixed before the battle. Loot is restricted to the defender's unclaimed field stock and the attacker's *total* free capacity; stored resources are never taken. This is a nonfinancial beta identity model: a random browser ID prevents accidental cross-player access but does not provide Sybil resistance. World ID plus a server session are required before making PvP rewards or IMG financially meaningful.

Required runtime environment variables for the legacy private beta API:

- `DATABASE_URL` *or* the discrete `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` values (required for online play and readiness). The TrueNAS Compose template uses the discrete values so a strong password needs no URL encoding.
- `PORT` (optional, default `31057`): HTTP listening port.
- `HOST` (optional, default `0.0.0.0`): HTTP bind address.
- `NODE_ENV` (recommended `production` in deployment).

For the World ID v4 proof-context endpoint, configure these server-only values in the TrueNAS App secret editor after its RP signing key has been placed in protected server configuration:

- `WORLD_ID_RP_ID`: Portal RP identifier, for example `rp_a84548cb908798cf`.
- `WORLD_ID_ACTION=play`: fixed production action. The endpoint ignores any client-selected action.
- `WORLD_ID_RP_SIGNING_KEY`: RP private key. Never use a `VITE_` prefix, GitHub Actions variable, or repository file.
- `WORLD_ID_RP_CONTEXT_TTL_SECONDS=300` (optional): bounded to 60–600 seconds.

`POST /api/world-id/proof-context` consumes JSON but returns only `{ rp_id, nonce, created_at, expires_at, signature }`. It makes no game decision, keeps no wallet credentials, and the World Chain contract remains the proof verifier and nullifier replay guard. It permits browser CORS only for `https://nyphon.de`, solely for this endpoint's `POST`/preflight flow.

World Wallet Auth uses `GET /api/wallet-auth/nonce` and `POST /api/wallet-auth/verify`. The server issues a cryptographically random, five-minute, single-use nonce and consumes it before verification. It verifies the native SIWE payload with `@worldcoin/minikit-js/siwe`, requiring the fixed wallet-auth statement and matching signed/payload address, then returns only the verified address. This in-memory replay guard creates no game session and does not authorize or store game state; the World ID signal remains that verified address and `playerState` registration on-chain remains the access gate. Both endpoints permit CORS only for `https://nyphon.de`.

## Token model

Wood, clay and stone are internal game resources. `CGOLD` (Civilization Gold) is the sole ERC-20, with 18 decimals, implemented directly by `CivilizationGame.sol`. It is minted only when the on-chain game rules settle a claim or a successful raid, and burned only when on-chain game rules spend gold. Prestige resets the village but does not burn the player's CGOLD.

- `boostConstruction(hoursToBoost)` accepts exactly 1 WLD per full construction hour and transfers it directly from the player to the immutable deployment treasury. The game contract never holds WLD; a boost cannot pass the completion time.
- No WLD redemption, withdrawal, liquidity, fee routing, or custody code is present in `CivilizationGame`.
- The proposed later settlement model is **WLD / CGOLD**: 1.5% per buy/sell, split as 1.0% retained by game liquidity and 0.5% operator revenue. It needs a separately audited settlement adapter, independent pricing/slippage limits, liquidity, monitoring, product/legal review, and explicit deployment approval. It is not implemented or deployable from this release.
- `contracts/src/GoldSettlementRegistry.sol` is intentionally only an allowlist registry. It cannot hold funds or execute a swap. An audited settlement adapter, independent pricing/slippage limits, liquidity, transaction monitoring, and product/legal review are required before any deployment.

`contracts/worldchain.tokens.example.json` is an example reference for WLD and WBTC on World Chain Mainnet. Re-verify every address against the current [World Chain useful-contract registry](https://docs.world.org/world-chain/reference/useful-contracts) before allowlisting.

The machine-readable in-app release boundary is defined in `server/contract-status.js`; see [the contract status](./contracts/STATUS.md) for the deployed-contract inventory and remaining review/settlement boundaries. `npm test` includes a deterministic source compile with the pinned official `solc` package; it does not deploy or connect a wallet.

## On-chain game-state draft

`contracts/src/CivilizationGame.sol` is deployed on World Chain mainnet at `0x29147c7bead901e8019d7911a7dc404447877c62`; it is not independently audited. It makes the contract—not the beta backend or database—authoritative for resource accrual/claiming, upgrades, construction timers, prestige, training, PvP, and CGOLD. It verifies World ID 4 proofs directly through World Chain's official verifier. The backend only signs short-lived RP proof context and has no game or access-decision authority. See [the on-chain architecture](./docs/ONCHAIN_ARCHITECTURE.md) for the authority boundary, MiniKit call flow, and remaining audit/settlement prerequisites. Existing beta API/database code remains a non-authoritative compatibility path only.

### World Chain mainnet deployment

`CivilizationGame` is deployed on World Chain mainnet at `0x29147c7bead901e8019d7911a7dc404447877c62`. Production GHCR and GitHub Pages builds receive the public action `play`, this address, `https://civilization.nyphon.de/api/world-id/proof-context`, `production`, and the existing public `WORLD_APP_ID` repository variable. The deployment is not independently audited. No WLD/CGOLD settlement, liquidity, redemption, withdrawal, fee routing, or custody is enabled by this release.

### World Chain Sepolia integration run

The test-only deployment is live on World Chain Sepolia: `CivilizationGame` `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199`, `MockWorldToken` `0x29147C7BEAd901E8019d7911A7DC404447877C62`, and `MockWorldIdVerifier` `0x1A64F89881FD2E38255E62c6D62b68076052DF4b`. `npm run test:worldchain:testnet` verifies chain, deployed code, immutable constructor values, and current player state without sending a transaction. `npm run run:worldchain:testnet` performs the explicit test-only registration/build/Mock-WLD-boost smoke run. The browser test profile is documented in `.env.example`; it requires an external EVM wallet on chain `4801`. World App/MiniKit does not support testnet transactions, so it must not be used for this profile.

## Visual assets

The game board uses project-owned Civilization DApp building, resource and unit art. See [asset provenance](./ASSET_ATTRIBUTION.md) for the copied files and the temporary Stone visual stand-in.

## Raid boundary

Without the API, raid targets are deterministic local demo villages. With the PostgreSQL API available, the game instead lists online public village IDs and resolves PvP server-side. The current anonymous browser identity is suitable only for a nonfinancial beta. Before connecting PvP rewards to IMG or WLD, add World-ID/SIWE-backed sessions, anti-bot/rate-limit controls, matchmaking and player-safety policy.

## World App / Worldchain handoff

Civilization DApp includes `@worldcoin/minikit-js` and only initializes MiniKit when it is actually opened inside World App. Regular browsers remain a walletless local demo. The public portal app ID belongs in the GitHub Actions repository variable `WORLD_APP_ID` (see `.env.example`); it is intentionally not a secret.

### World ID game access

Inside World App only, Civilization DApp uses IDKit v4 Proof of Human for a short, Portal-configured production action (for example `play`). The UI has explicit states for not verified, checking, registered, and error/configuration failure. The browser demo remains fully local and does not request World ID.

Production builds set these public build-time variables (only `VITE_WORLD_APP_ID` comes from the public GitHub repository variable):

- `VITE_WORLD_APP_ID`: the Portal app ID.
- `VITE_WORLD_ID_ACTION`: exact Portal action ID.
- `VITE_CIVILIZATION_CONTRACT_ADDRESS=0x29147c7bead901e8019d7911a7dc404447877c62`: the World Chain mainnet deployment address.
- `VITE_WORLD_ID_PROOF_CONTEXT_URL=https://civilization.nyphon.de/api/world-id/proof-context`: `POST` endpoint that accepts the configured action and returns only `{ rp_id, nonce, created_at, expires_at, signature }`. It must generate the RP signature server-side with the protected signing key.
- Wallet Auth endpoints are derived from that trusted API origin as `/api/wallet-auth/nonce` and `/api/wallet-auth/verify`; they are not configurable to an unrelated origin.
- `VITE_WORLD_ID_ENVIRONMENT=production`: this must match the Portal app and relying-party registration.

The RP endpoint must ignore a client-selected action and sign only its configured production action. The app then encodes the v4 proof and submits it to `CivilizationGame.registerWorldId`; World Chain verifies the proof and the contract stores the nullifier. A reused nullifier reverts on-chain. Neither a client result nor the static UI grants access without that transaction.

The Developer Portal team API key and RP signing key must remain outside the repository and GitHub Actions. The backend needs only the RP signing key; no verification or transaction credential belongs in the static app.

Before using MiniKit `sendTransaction`, World App requires contract and Permit2-token allowlisting in the portal; verify every submitted user operation on a backend before crediting a game balance. `contracts/src/IdleCoin.sol` is a legacy undeployed ERC-20 draft; new resource work uses `GameResourceToken.sol` instead.
