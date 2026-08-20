# Security-header rollout and rollback

The CSP is compiled into the Next standalone build. Set these **build-time**
deployment variables explicitly for every image; runtime-only changes do not
alter headers in an already built image.

- `CIVILIZATION_CSP_MODE=report-only` (or absent/any other value) emits
  `Content-Security-Policy-Report-Only`.
- `CIVILIZATION_CSP_MODE=enforce` emits `Content-Security-Policy`.
- `CIVILIZATION_HSTS_ENABLED=true` emits HSTS only when
  `CIVILIZATION_ENV=production`. Every other combination omits HSTS.

## Report-only telemetry and rollout

Start every rollout with `CIVILIZATION_CSP_MODE=report-only` and
`CIVILIZATION_HSTS_ENABLED=false`. Browser violations are posted to
`/api/security/csp-report`; the route deliberately returns `204` without
persisting or reflecting browser-supplied content. Configure the ingress or
observability layer to count that endpoint's requests and response status, and
inspect its protected request telemetry for blocked-directive and blocked-uri
trends without retaining wallet identifiers, tokens, or report bodies.

Before enforcement, validate the exact production build on supported browsers:

1. Open the Mini App in the World App and complete WalletAuth/SIWE.
2. Confirm MiniKit opens the World wallet and submit/read a World Chain action.
3. Exercise username/wallet lookup if enabled and inspect CSP telemetry for all
   World App, MiniKit, wallet, username, and World Chain RPC requests.
4. Confirm no unexpected CSP reports before setting
   `CIVILIZATION_CSP_MODE=enforce` in a new image build and repeating the
   validation.

The allowlist is intentional: `usernames.worldcoin.org`,
`developer.world.org`, `world.org`, and `worldchain-mainnet.g.alchemy.com`
cover the World App/MiniKit/wallet and reviewed RPC paths. Adding an origin is
a security review change, not an operational workaround.

## Rollback

For a CSP breakage, rebuild with `CIVILIZATION_CSP_MODE=report-only`; do not add
`unsafe-eval` or a broad source expression. Roll back the image if report-only
cannot be restored quickly, then preserve reports and the failing browser flow
for review.

For HSTS, enable it only after the public HTTPS hostname, subdomains, and
certificate renewal path are verified: build with
`CIVILIZATION_ENV=production` and `CIVILIZATION_HSTS_ENABLED=true`. To stop
emitting it, rebuild with `CIVILIZATION_HSTS_ENABLED=false` (or a non-production
environment). Previously received HSTS remains cached by browsers until its
`max-age` expires, so a full rollback also requires serving
`Strict-Transport-Security: max-age=0` from the HTTPS ingress for the affected
hostname before removing the header. `preload` is intentionally never used.
