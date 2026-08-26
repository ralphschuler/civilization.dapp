# ADR-0055: Stable transparent-proxy facade for V2 evolution

## Status

Accepted for source planning. This decision does not authorize a deployment,
an upgrade, or a claim that a V2 implementation exists in production.

## Decision

Keep the published contract address behind the stock OpenZeppelin 5.x
`TransparentUpgradeableProxy` / generated `ProxyAdmin` ABI facade. The
`ProxyAdmin` owner is a timelock; implementation code has no UUPS upgrade
entrypoint. Preserve every V1 ABI entry and the
`erc7201:civilization.game.storage.v1` namespace exactly.

New state is additive only: use a separately computed ERC-7201 namespace per
feature, and put narrowly scoped, externally reviewed dependencies in distinct
contracts. The currently imported proxy, admin and timelock are upstream
OpenZeppelin contracts; their pinned package version and source must be part of
each release review. Project contracts are not described as audited merely
because their dependencies have been audited.

`pnpm verify:proxy:v2-compatibility` is the local evidence gate. It compiles
the pinned local source, verifies the V1 ABI subset and frozen V1 namespace,
checks additive namespaces, and enforces the checked-in EIP-170 size budgets.
Before accepting the checked-in historical V1 fixture or storage snapshot, the
gate reads their objects from Git commit
`6c169e694a17f89ff05622988e2ab0f91363936e` and compares their exact bytes and
fixed SHA-256 values. It fails closed when that checkout/object is unavailable;
CI and reviewers therefore need Git metadata containing the pinned commit.
This proves source and storage-snapshot provenance only, not a production
proxy, implementation, deployment, or on-chain code hash.
The V2 ABI snapshot is explicitly a source candidate, not a deployment record.

## Alternatives rejected

Diamonds are rejected: selector routing and facet cuts create a second mutable
dispatch and storage-governance surface, make a stable externally consumed ABI
harder to prove, and complicate rollback. A new proxy address is also rejected
for this migration because it breaks the existing address/allowance/state
facade. UUPS is rejected because the intended authority boundary is the
timelock-owned external `ProxyAdmin`, not implementation-resident upgrade code.

## Consequences

Every future capability needs its own namespace, compatibility evidence, size
budget update, migration rehearsal and security review. A rollback restores an
old implementation but cannot erase newly written namespaced state; later V2
code must continue to read it safely.
