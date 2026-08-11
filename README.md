# Civilization DApp

Civilization is a Next.js 15 World Mini App. Production uses `MiniKitProvider`, explicit Wallet Auth through NextAuth, IDKit v4 Proof of Human, an on-chain World Chain registration, and a confirmed `playerState` read before game access.

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
