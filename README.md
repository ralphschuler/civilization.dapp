# Civilization DApp

Browser-first civilization-building clicker. The first TrueNAS release serves this game and a private API from one container. When the same-origin game API and PostgreSQL are available, game progress is stored and calculated server-side. The browser supplies only an opaque anonymous browser ID for this nonfinancial milestone; it is not World ID, wallet authentication, or a financial account. If the API is unavailable, the regular browser demo explicitly remains local-only in `localStorage`.

## Demo

Use the existing Vite binary from the Civilization workspace or install the declared dev dependency, then run `npm run dev`. Production first fills a raidable field stock. Press **Sammeln** to move available wood, clay, stone and gold into protected storage; only stored resources pay for upgrades, training and the market. The demo persists one local village: meet building requirements before upgrading the town hall; train troops in the barracks; and choose the exact march group for a raid.

`npm test` verifies the two critical progression locks and resource transfer after a successful raid.

## GitHub Pages

Every push to `master` runs tests, builds the Vite app, and deploys `dist/` to GitHub Pages through `.github/workflows/deploy-pages.yml`. The Vite base path adapts automatically inside GitHub Actions, while local development continues at `/`.

## Private TrueNAS service

`Dockerfile`, `compose.yaml`, and `deploy/truenas.yaml` package Civilization DApp as a standalone service on port `31057`, with its own private PostgreSQL database. The current public route remains `idlemint.nyphon.de` through NPMplus on the TrueNAS host; the proxy target is `10.42.54.153:31057`.

`GET /api/healthz` reports process health and database status; `GET /api/readyz` returns success only when PostgreSQL accepts queries and is appropriate for deployment readiness checks. `GET /api/contracts/status` makes the current `beta_quote_only` / `not_deployed` contract boundary machine-verifiable and has no transaction capability. `GET /api/market/quote?side=buy|sell&amount=<base-unit-integer>` exposes only settlement quotes: it cannot accept WLD, transfer IMG, mint, burn, or pay out assets. The container workflow publishes `ghcr.io/ralphschuler/civilization.dapp` after tests pass on `master`.

### Authoritative game-state API

The SPA probes its same-origin `GET /api/game/state` endpoint at startup. It sends a generated opaque browser ID (32–128 URL-safe characters) only in `X-IdleMint-Anonymous-Id`; this ID is deliberately anonymous and can be lost when browser storage is cleared. A successful probe activates online mode and no browser game-state values are posted or trusted. If the endpoint is unavailable, the UI labels and uses its local demo fallback instead. This header is retained temporarily for compatibility; see [transition exceptions](./TRANSITION_COMPATIBILITY.md).

`POST /api/game/state` accepts `{ "id": "<unique action id>", "action": { "type": "...", "payload": { ... } } }` with the same header. The server accepts only gather, upgrade, train, in-game non-gold swap, raid start/resolution, and reset actions. It locks the player row, recalculates elapsed production from server time, validates the action, and stores the resulting state in the same PostgreSQL transaction. `(anonymous_id, action_id)` is unique, so a retry is idempotent and returns the original action result. Client resources, buildings, troops, timestamps, and raid outcomes are never accepted.

`GET /api/game/targets` exposes up to 50 eligible online villages through generated public village IDs only; it never exposes the private browser identifier or protected storage. PvP raids lock attacker and defender in a canonical database order, settle their state on the server, and write an auditable battle record. The server commits to a random battle seed when a march starts and reveals it in the final report, so the outcome seed was fixed before the battle. Loot is restricted to the defender's unclaimed field stock and the attacker's *total* free capacity; stored resources are never taken. This is a nonfinancial beta identity model: a random browser ID prevents accidental cross-player access but does not provide Sybil resistance. World ID plus a server session are required before making PvP rewards or IMG financially meaningful.

Required runtime environment variables:

- `DATABASE_URL` *or* the discrete `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` values (required for online play and readiness). The TrueNAS Compose template uses the discrete values so a strong password needs no URL encoding.
- `PORT` (optional, default `31057`): HTTP listening port.
- `HOST` (optional, default `0.0.0.0`): HTTP bind address.
- `NODE_ENV` (recommended `production` in deployment).

There are no World Portal, World ID, wallet, WLD, IMG, contract, payment, custody, or blockchain environment variables for this milestone. Those integrations remain disabled and the API has no endpoint for them.

## Token model

The game resources `IMW` (Mint Wood), `IMC` (Mint Clay), and `IMS` (Mint Stone) stay internal. `IMG` (Mint Gold) is the only resource intended to become an external ERC-20, with 18 decimals. The current release deploys no contract, requests no wallet, and cannot move assets.

- `IMW`, `IMC`, and `IMS` are internal game resources. They can be exchanged only through the in-game market and cannot be settled externally.
- `IMG` is the sole settlement-capable token. It is the only token intended to pair with approved external assets such as WLD and WBTC on World Chain.
- Initial settlement direction is **WLD / IMG**. Every buy receives 98.5% of the quoted IMG and routes 1.5% to the IMG sink; every sell pays 98.5% of quoted WLD and routes 1.5% to the WLD sink. These quote calculations are tested in the private service, but execution remains disabled until an audited liquidity/settlement adapter exists.
- `contracts/src/GoldSettlementRegistry.sol` is intentionally only an allowlist registry. It cannot hold funds or execute a swap. An audited settlement adapter, independent pricing/slippage limits, liquidity, transaction monitoring, and product/legal review are required before any deployment.

`contracts/worldchain.tokens.example.json` is an example reference for WLD and WBTC on World Chain Mainnet. Re-verify every address against the current [World Chain useful-contract registry](https://docs.world.org/world-chain/reference/useful-contracts) before allowlisting.

The machine-readable in-app release boundary is defined in `server/contract-status.js`; see [the contract status](./contracts/STATUS.md) for the source inventory, no-deployment assertion, and prerequisites. `npm test` includes a deterministic source compile with the pinned official `solc` package; it does not deploy or connect a wallet.

## On-chain game-state draft

`contracts/src/CivilizationGame.sol` is a source-only, undeployed migration target that makes the contract—not the beta backend—authoritative for resource accrual/claiming, upgrades, training, and PvP. The backend's future role is restricted to verifying a World ID proof and signing a short-lived registration attestation. See [the on-chain architecture](./docs/ONCHAIN_ARCHITECTURE.md) for the authority boundary, MiniKit call flow, and deployment/audit prerequisites. The existing beta API/database remains unchanged and is not an authority in this draft.

## Visual assets

The game board uses project-owned Civilization DApp building, resource and unit art. See [asset provenance](./ASSET_ATTRIBUTION.md) for the copied files and the temporary Stone visual stand-in.

## Raid boundary

Without the API, raid targets are deterministic local demo villages. With the PostgreSQL API available, the game instead lists online public village IDs and resolves PvP server-side. The current anonymous browser identity is suitable only for a nonfinancial beta. Before connecting PvP rewards to IMG or WLD, add World-ID/SIWE-backed sessions, anti-bot/rate-limit controls, matchmaking and player-safety policy.

## World App / Worldchain handoff

Civilization DApp includes `@worldcoin/minikit-js` and only initializes MiniKit when it is actually opened inside World App. Regular browsers remain a walletless local demo. The public portal app ID belongs in the GitHub Actions repository variable `WORLD_APP_ID` (see `.env.example`); it is intentionally not a secret.

### World ID game access

Inside World App only, Civilization DApp uses IDKit v4 for the production action `idlemint-game-access-v1`. The UI has explicit states for not verified, checking, verified, and error/configuration failure. The browser demo remains fully local and does not request World ID. This action ID remains unchanged during the transition; see [transition exceptions](./TRANSITION_COMPATIBILITY.md).

Set these public build-time variables to the HTTPS endpoints of the trusted backend (the example values are placeholders):

- `VITE_WORLD_APP_ID`: the Portal app ID.
- `VITE_WORLD_ID_PROOF_CONTEXT_URL`: `POST` endpoint that accepts the fixed action and returns only `{ rp_id, nonce, created_at, expires_at, signature }`. It must generate the RP signature server-side with the protected signing key.
- `VITE_WORLD_ID_VERIFY_URL`: `POST` endpoint that receives `{ action, rp_id, idkitResponse }` and returns `{ verified: true }` only after successful server verification.
- `VITE_WORLD_ID_ENVIRONMENT=production`: this must match the Portal app and relying-party registration.

The verify endpoint must ignore client-selected app/action/RP values in favor of its own expected production configuration; forward the untouched IDKit response to `POST https://developer.world.org/api/v4/verify/{rp_id}`; validate its successful response; and atomically store every verified nullifier as a canonical numeric value with `UNIQUE (nullifier, action)`. A uniqueness conflict is a replay/already-used proof and must not grant access. It must issue and enforce its own authenticated server-side game session for any non-local game state. Neither MiniKit/IDKit client output nor the static UI is an authorization boundary.

The Developer Portal team API key must remain local to the trusted Developer Portal MCP client. Do not add it to GitHub Actions: the current static demo has no server-side payment or proof verification path that needs it. When a backend is added, store any verification or transaction credentials server-side only.

Before using MiniKit `sendTransaction`, World App requires contract and Permit2-token allowlisting in the portal; verify every submitted user operation on a backend before crediting a game balance. `contracts/src/IdleCoin.sol` is a legacy undeployed ERC-20 draft; new resource work uses `GameResourceToken.sol` instead.
