# Manual finalized-chain replay

`scripts/run-chain-indexer.mjs` is an opt-in operator tool packaged in the
runtime image. It is not started by the application, `docker compose up`, or
either TrueNAS application definition. It has no scheduler, poll loop, route,
readiness dependency, or restart policy.

The runner reads canonical finalized logs only through a read-only HTTP(S) RPC
endpoint and writes its verified replay result to the existing PostgreSQL
tables. It runs one bounded replay and exits. It is not a poller, feed, target
discovery mechanism, leaderboard, season system, or product telemetry.

## Required reviewed configuration

Use a protected, deployment-specific environment file. It must provide all
seven explicit values below; `.env.example` intentionally contains placeholders
only. Do not infer them from application settings.

- `CHAIN_INDEXER_RPC_URL` — reviewed read-only HTTP(S) RPC endpoint.
- `CHAIN_INDEXER_CHAIN_ID` — reviewed target chain ID.
- `CHAIN_INDEXER_PROXY_ADDRESS` — reviewed deployment-specific proxy address.
- `CHAIN_INDEXER_START_BLOCK` — reviewed deployment-specific start block.
- `CHAIN_INDEXER_CONFIRMATIONS` — reviewed finality depth.
- `CHAIN_INDEXER_ROLLBACK_DEPTH` — reviewed reorganization rollback depth.
- `CHAIN_INDEXER_MAX_BLOCK_RANGE` — reviewed bounded replay range.

The normal PostgreSQL connection variables (`DATABASE_URL` or the documented
`PG*` variables) are also required so the one-shot container can reach the
already-migrated database. Keep RPC credentials and database credentials out of
the image, source tree, command line, and logs.

## Explicit one-shot invocation

Use the published runtime image and override its entrypoint. Replace the image,
network, and protected environment-file paths with reviewed deployment values:

```sh
docker run --rm \
  --network REPLACE_EXISTING_DATABASE_NETWORK \
  --env-file /REPLACE/protected-chain-indexer.env \
  --entrypoint node \
  REPLACE_RUNTIME_IMAGE \
  scripts/run-chain-indexer.mjs
```

`--entrypoint node` and the explicit script path make this a separate,
one-shot command; it cannot start as part of the normal app command. Do not add
it to the live Compose or TrueNAS definitions, and do not add a restart loop.
The process validates every `CHAIN_INDEXER_*` input before opening a database
connection, then exits with a non-zero status on invalid configuration or a
replay failure.

The store commits each verified batch atomically. On a failed batch it rolls
back, so the checkpoint remains unchanged; malformed, incomplete, noncanonical,
or over-depth-reorganization input fails closed according to the existing store
behavior.

## Production activation gates

Before any manual production invocation, obtain all of the following approvals
and evidence:

- A reviewed deployment scope: proxy, start block, chain, finality depth,
  rollback depth, and bounded range are approved for that deployment.
- A reviewed read-only HTTPS RPC provider, protected credential handling, and
  network egress path; no signer or write-capable RPC is supplied.
- The target database has the existing indexer migrations applied, a verified
  backup/restore path, restricted operator access, and an approved failure and
  recovery owner.
- A privacy review covering the raw on-chain log data, access controls,
  retention, and deletion/incident procedures. Confirm that this capability
  does not combine wallet/session data or add telemetry.
- An approved manual execution record and post-run verification procedure. A
  future cadence or automation requires a separate review; this package does
  not authorize either.
