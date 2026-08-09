# IdleMint

Browser-first idle clicker for **Idle Coin (IDC)**. The local demo keeps its balance in browser storage and deliberately mounts neither MiniKit nor wagmi, asks for no wallet and broadcasts no transaction.

## Demo

Use the existing Vite binary from the Civilisation workspace or install the declared dev dependency, then run `npm run dev`. Production first fills a raidable field stock. Press **Sammeln** to move available wood, clay, stone and gold into protected storage; only stored resources pay for upgrades, training and the market. The demo persists one local village: meet building requirements before upgrading the town hall; train troops in the barracks; and choose the exact march group for a raid.

`npm test` verifies the two critical progression locks and resource transfer after a successful raid.

## GitHub Pages

Every push to `master` runs tests, builds the Vite app, and deploys `dist/` to GitHub Pages through `.github/workflows/deploy-pages.yml`. The Vite base path adapts automatically inside GitHub Actions, while local development continues at `/`.

## Token model

Every resource has a planned ERC-20 identity, with 18 decimals: `IMW` (Mint Wood), `IMC` (Mint Clay), `IMS` (Mint Stone), and `IMG` (Mint Gold). Browser mode simulates these balances in local storage only; it deploys no contract, requests no wallet, and cannot move assets.

- `IMW`, `IMC`, and `IMS` are game-only tokens. Their Solidity transfer rules permit movement through registered game venues only, so they can be exchanged in the in-game market but cannot be settled against external assets.
- `IMG` is the sole settlement-capable token. It is the only token intended to pair with approved external assets such as WLD and WBTC on World Chain.
- `contracts/src/GoldSettlementRegistry.sol` is intentionally only an allowlist registry. It cannot hold funds or execute a swap. An audited settlement adapter, independent pricing/slippage limits, liquidity, transaction monitoring, and product/legal review are required before any deployment.

`contracts/worldchain.tokens.example.json` is an example reference for WLD and WBTC on World Chain Mainnet. Re-verify every address against the current [World Chain useful-contract registry](https://docs.world.org/world-chain/reference/useful-contracts) before allowlisting.

## Visual assets

The game board uses project-owned Civilisation DApp building, resource and unit art. See [asset provenance](./ASSET_ATTRIBUTION.md) for the copied files and the temporary Stone visual stand-in.

## Raid demo boundary

Raid targets are deterministic local demo villages. Raids take only their unclaimed field stock; stored resources are not part of raid loot. No real player identity, request, matchmaking, server, wallet, or Worldchain state exists yet. Real player-vs-player raids need an authoritative multiplayer backend with authentication, durable village state, server-side battle resolution, anti-cheat/rate limiting and an explicit consent/product policy before they can be connected to this interface.

## World App / Worldchain handoff

IdleMint includes `@worldcoin/minikit-js` and only initializes MiniKit when it is actually opened inside World App. Regular browsers remain a walletless local demo. The public portal app ID belongs in the GitHub Actions repository variable `WORLD_APP_ID` (see `.env.example`); it is intentionally not a secret.

### World ID game access

Inside World App only, IdleMint uses IDKit v4 for the production action `idlemint-game-access-v1`. The UI has explicit states for not verified, checking, verified, and error/configuration failure. The browser demo remains fully local and does not request World ID.

Set these public build-time variables to the HTTPS endpoints of the trusted backend (the example values are placeholders):

- `VITE_WORLD_APP_ID`: the Portal app ID.
- `VITE_WORLD_ID_PROOF_CONTEXT_URL`: `POST` endpoint that accepts the fixed action and returns only `{ rp_id, nonce, created_at, expires_at, signature }`. It must generate the RP signature server-side with the protected signing key.
- `VITE_WORLD_ID_VERIFY_URL`: `POST` endpoint that receives `{ action, rp_id, idkitResponse }` and returns `{ verified: true }` only after successful server verification.
- `VITE_WORLD_ID_ENVIRONMENT=production`: this must match the Portal app and relying-party registration.

The verify endpoint must ignore client-selected app/action/RP values in favor of its own expected production configuration; forward the untouched IDKit response to `POST https://developer.world.org/api/v4/verify/{rp_id}`; validate its successful response; and atomically store every verified nullifier as a canonical numeric value with `UNIQUE (nullifier, action)`. A uniqueness conflict is a replay/already-used proof and must not grant access. It must issue and enforce its own authenticated server-side game session for any non-local game state. Neither MiniKit/IDKit client output nor the static UI is an authorization boundary.

The Developer Portal team API key must remain local to the trusted Developer Portal MCP client. Do not add it to GitHub Actions: the current static demo has no server-side payment or proof verification path that needs it. When a backend is added, store any verification or transaction credentials server-side only.

Before using MiniKit `sendTransaction`, World App requires contract and Permit2-token allowlisting in the portal; verify every submitted user operation on a backend before crediting a game balance. `contracts/src/IdleCoin.sol` is a legacy undeployed ERC-20 draft; new resource work uses `GameResourceToken.sol` instead.
