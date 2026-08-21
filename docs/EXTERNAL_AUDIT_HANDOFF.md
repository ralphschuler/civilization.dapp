# External V2 audit handoff

This document freezes a review target for an **independent external**
Solidity/security review. It is not an audit report, certification, approval,
or authorization to execute an upgrade. No source, address, or deployment
listed here may be described as audited until a qualified independent reviewer
has delivered a report and re-tested resolved findings.

## Candidate identity

| Item | Value |
| --- | --- |
| Review commit | `777b3a9c45a17cb37bc510f1f8a60fc2f130e9d9` |
| Source | `contracts/src/CivilizationGame.sol` |
| Source SHA-256 | `3a101c77cd06060e476f03e5952dd1d633f4b215f6ae27499373d042ba2618c1` |
| Compiler/profile | `solc 0.8.30`, optimizer runs `10`, `viaIR: true` |
| Creation-code hash | `0x3c05ae7efa50a1d7bb0e90dddf32e3f113390753016bfd9e2cbdf0436991c144` |
| Runtime-code hash | `0x9851c4cd00c4238ca1b021b7551da81a03d9ef02306e9815a2a4db0868510b75` |
| Runtime size | `21,398` bytes of the `24,576` EIP-170 limit |
| World Chain candidate | `0x698ad6b70b6ba8439f1345dbaf26bf1adb129162` |
| Candidate deploy transaction | `0x22cac99c370d2bff2778e4e543caf4d9e99ec02a6e9c83c2315a06da2a7a7c6e` |
| Candidate deploy block | `33980912` |

The candidate's runtime bytecode was read back after deployment and matched
the listed runtime-code hash. It is deployed code only; it has not been made
active through the production proxy.

## Live baseline and proposed operation

All addresses below are World Chain (`chainId` `480`). They were read from the
EIP-1967 slots and read-only contract calls before preparing the operation.

| Role | Address / value |
| --- | --- |
| Production proxy | `0x0E6689d0649Ad9037465d178231b10F18518D2b0` |
| Current V1 implementation | `0x7330C22d7b61CCcDB7794435535aaB349D9aFF79` |
| Current V1 runtime hash | `0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a` |
| ProxyAdmin | `0x8351d16672bD54eAe8cd51Fc00E08aD8Adc4469D` |
| ProxyAdmin / proxy timelock owner | `0x47CaD4ed6765e2aec7c569b2b1E7142D29d1530B` |
| Timelock delay | `259200` seconds (72 hours) |
| Timelock proposer Safe | `0x4338aa98a8C969CA0675A8B0DCC7Ed51F24aB886` |
| Proposed operation ID | `0xd3e0191a1bec2b45694f02ca987cd7f0b5b2a2bff59f935f8867bbc3fa56cd3e` |

The proposed operation is exactly one `ProxyAdmin.upgradeAndCall(proxy,
candidate, "0x")`. It has no initializer payload, no market configuration,
no CGOLD reserve transfer, and no other batched call. At readback block
`33981603`, the operation was not scheduled and the proxy still referenced
the listed V1 implementation. A Safe owner must independently review and
sign the schedule; only after the on-chain delay may the permissionless
timelock execution be considered.

## Review scope

The primary executable scope is the exact `CivilizationGame` candidate above,
its inherited and imported OpenZeppelin dependencies resolved by the pinned
lockfile, plus the live proxy, ProxyAdmin, Timelock, Safe-proposer policy, and
the client/runtime assumptions that require V2 construction selectors.

The candidate includes the first-Workshop CGOLD waiver: Workshop level `0` to
`1` keeps wood, clay, stone, and prerequisites but sets only its CGOLD cost to
zero. Later Workshop levels follow the normal CGOLD curve. It also contains
the V2 construction queue and CGOLD-market interfaces. These interfaces are
in scope even though the proposed operation does not configure or fund a
market.

`contracts/solidity-scope.json` is the complete repository classification.
Its other `production` entries are source-only at this candidate activation;
they must not be represented as deployed or covered by this candidate audit
unless the engagement explicitly includes them. Fixtures are non-production
test inputs.

## Evidence supplied to auditor

Run these against the exact review commit, then attach complete command output
and the trusted-RPC report to the engagement record:

```sh
SECURITY_ASSURANCE_REF=777b3a9c45a17cb37bc510f1f8a60fc2f130e9d9 \
  pnpm security:offline
pnpm verify:proxy:v2-compatibility
pnpm test
pnpm check
WORLDCHAIN_RPC_URL=https://trusted-rpc.example \
  pnpm security:worldchain:fork
```

CI also runs pinned Slither and the deterministic adversarial state machine;
the internal coverage and known residual risks are documented in
[`SECURITY_ASSURANCE.md`](./SECURITY_ASSURANCE.md). This evidence is input to
an audit, not a substitute for one.

The V1-to-production-V2 EVM regression in
`test/civilization-contract.test.js` proves a timelock-only upgrade preserves
registered player state and legacy slot-zero construction, exposes V2 queue
reads, and permits the first Workshop upgrade without CGOLD. It does not
prove production state, Safe custody, economics, or an external review.

## Required independent review

The auditor must assess at least:

- proxy/storage compatibility, implementation initializer lock, and rollback
  behavior;
- Timelock roles, Safe threshold/owner custody, 72-hour schedule/execute
  process, and exact one-call upgrade calldata;
- authorization, World ID legacy surface, token accounting, CGOLD supply,
  construction queue, rewards, cooldowns, timestamp influence, gas/DoS, and
  reentrancy;
- economic effects of the free first Workshop and dormant/configurable market
  interfaces, including unconfigured defaults;
- incident and rollback controls. The source does not expose a general
  `pause()` capability, so reviewers must not assume one exists; and
- post-execution bytecode readback, proxy capabilities, and release-gate
  configuration before any production application rollout.

Any source, compiler/profile, deployed runtime hash, governance policy,
calldata, or economic configuration change after this freeze requires a
documented delta review before scheduling or execution.

## Completion evidence for Issue #43

Issue #43 may close only when the repository links an independent report for
the final deployed bytecode and governance configuration, records all
Critical/High findings as fixed with regression evidence or explicitly
accepted by the accountable owner, and records a re-test. Auditor identity,
engagement date, report version, scope exclusions, residual risks, and exact
reviewed runtime hashes must be preserved outside secrets. Until then this
document is a handoff, not a completion claim.
