# V2 proxy migration runbook

This is a release-review procedure, not a deployment command. No value in this
repository establishes a production V2 implementation address or code hash.

## Baseline and compatibility gate

1. Record a fresh, read-only EIP-1967 proxy report and preserve the proxy,
   implementation, admin, timelock owner, code hashes and chain ID.
2. Run `pnpm verify:proxy:v2-compatibility`, `pnpm test`, and `pnpm check` on
   the exact review commit. The compatibility report must say
   `deployedV2: false`; its historical V1 fixture is pinned to commit
   `6c169e694a17f89ff05622988e2ab0f91363936e`. The checkout must retain that
   Git object: the gate reads `contracts/src/CivilizationGame.sol` and the V1
   storage snapshot from it and fails if either object or its fixed SHA-256
   binding is unavailable. This remains source/storage evidence only, never
   production proxy or code-hash evidence.
3. Independently compare the candidate runtime bytecode/hash after deployment
   to the reviewed artifact. Do not substitute a source hash for chain evidence.
4. Confirm no V1 selector, event, error, storage field, or ERC-7201 V1 slot
   changed. V2 state must be in a distinct namespace; no layout-gap shortcut.
   A pre-existing namespace is not moved or recomputed by this plan: changing
   one requires a current on-chain state baseline and a dedicated rehearsal.
   The local gate also freezes the current V2 construction-queue namespace
   schema and canonical accessor, because it projects legacy
   `Player.construction` into slot zero. This is source evidence only; retain
   a trusted-RPC player-state baseline for the actual proxy separately.

## Rehearsal

On a local EVM and then an approved non-production environment, execute and
retain results for V1 → V2 → V1 → V2. Start with registered wallets, balances,
allowances, pending construction and governance configuration. Prove:

- only the timelock-owned `ProxyAdmin` can upgrade;
- all V1 reads and mutations remain equivalent after each transition;
- additive V2 state remains readable after rollback and re-upgrade; and
- initializer locking prevents implementation initialization.

The repository's OZ proxy/timelock test is the minimum local rehearsal; it is
not evidence about production state or governance membership. It deploys the
pinned historical V1 source, upgrades to the actual current `CivilizationGame`
candidate (not a marker fixture), rolls back, and re-upgrades. Its fixed-time
read snapshot covers registered, pending-construction, and unregistered
players, including `playerState`, `previewPlayerState`, legacy slot-zero
construction, balances, allowances, total supply, timelock, and splitter
configuration. Retain the trusted-RPC baseline, independent audit,
governance/Safe review, and approved non-production rehearsal as separate
external gates.

## Budgets and audit gates

The deterministic size gate enforces EIP-170 (24,576 runtime bytes) for the
production facade candidate. Any proposed gas budget must be measured
on the exact bytecode and representative state transitions, recorded with its
client/compiler/EVM settings, and approved before scheduling. A size pass is
not a gas approval.

Before a schedule operation: obtain independent review of final source,
bytecode, storage/ABI report, external contracts, economic parameters,
timelock roles/delay, Safe policy, monitoring and incident ownership. Require
a staged pause/containment rehearsal. The current source does not expose a
general `pause()` control, so the approved incident plan must identify the
actually deployed containment capability; do not assume one.

## Execute, observe, rollback

Schedule through the timelock, wait the on-chain delay, execute only the
reviewed calldata, then re-run read-only proxy and capability checks. Monitor
reverts, events, balances and authority changes. If an approved containment
action exists, use it first; otherwise do not improvise privileged calls. A
rollback is a separately timelocked `upgradeAndCall` to the verified V1
implementation, followed by the same V1 read/mutation checks and a later V2
re-upgrade rehearsal.

## Production blockers

Production remains blocked until all of the following are supplied outside
this source-only patch: verified deployed candidate address/runtime hash,
current trusted-RPC baseline, independent audit sign-off, confirmed timelock
roles and delay, Safe authorization, approved pause/incident plan, completed
non-production rehearsal, monitoring/alerting, and product/legal approval.
