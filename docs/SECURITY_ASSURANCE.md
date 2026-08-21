# Internal security-assurance basis

This is internal engineering evidence for Issue #43. It is not an audit,
certification, or authorization to deploy. No source or deployment in this
repository may be labelled "audited" on the basis of these checks. An
independent external Solidity/security audit of the final source, configured
proxy, governance and economics is still outstanding.

The exact deployed-but-not-activated V2 candidate and its required external
review are frozen in [the external audit handoff](./EXTERNAL_AUDIT_HANDOFF.md).
That handoff also remains non-audit evidence until an independent report and
re-test exist.

## Scope and reproducible evidence

`contracts/solidity-scope.json` is the single machine-readable Solidity scope
source. It explicitly classifies every project Solidity file under
`contracts/src` and `test/fixtures` as either `production` or `fixtures`.
`pnpm security:scope` rejects duplicate, missing, or unclassified sources; CI
runs it before the assurance manifest and Slither. The offline manifest hashes
the scope file and every `production` entry, so `CivilizationBuybackVault.sol`
and `CivilizationRewardDistributor.sol` are production evidence while
`CivilizationGameV2Fixture.sol` and the `Mock*.sol` files are explicit
non-deployment inputs. The V1 storage-layout snapshot and proxy release-plan
JSON examples remain in the manifest. The deployed World Chain target is
observed only through the read-only proxy verifier; it is not inferred from
source.

Every CI run invokes the command with GitHub's immutable checkout SHA
(`github.sha`) and emits SHA-256 for every scoped file plus a manifest hash.
To reproduce a result locally, check out the recorded SHA and run:

```sh
SECURITY_ASSURANCE_REF="$(git rev-parse HEAD)" pnpm security:offline
```

The command refuses an absent or non-commit-shaped reference. Its output is
therefore a binding between the CI checkout and exact bytes, rather than a SHA
that was copied into this document and immediately went stale.

## Internal coverage and severity

| Area                                         | Evidence                                                             | Finding severity / regression mapping                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet ownership and one-time registration   | local EVM state-machine sequence plus existing direct-call tests     | Critical/High regression: cross-wallet mutation or duplicate registration must fail tests. Residual: permissionless multi-wallet farming is intentional.            |
| CGOLD/resources, market rounding and reserve | deterministic adversarial market sequences; existing local EVM tests | Critical/High regression: asset creation, loss, or reserve/inventory mismatch must fail. Residual: pricing, liquidity and economics are not independently modelled. |
| Claim and construction time boundaries       | state-machine cooldown boundary checks; construction tests           | High regression: early claim or temporal boundary bypass must fail. Residual: block timestamps are validator-controlled within normal chain limits.                 |
| Proxy initialization, storage and upgrades   | real OZ proxy/timelock V1↔V2 tests and frozen storage snapshot       | Critical regression: implementation initialization, storage, or timelock bypass must fail. Residual: live roles and future upgrade bytecode require a new review.   |
| WLD splitter                                 | splitter allocation/rotation/backing and boost delta tests           | High regression: unauthorized distribution or under-backed claims must fail. Residual: token behavior and recipient operations need independent review.             |
| Static patterns                              | pinned Slither in GitHub CI                                          | Informational/Medium triage input; analyzer output is not a proof of absence of vulnerabilities.                                                                    |
| Live World Chain proxy                       | mandatory mocked/offline verifier tests; opt-in read-only RPC check  | High operational mismatch must fail the explicit RPC command. Residual: CI does not trust an unauthenticated public RPC endpoint as proof of live state.            |

No unresolved internal finding is represented as fixed merely because a test
passes. The residual risks above, external dependencies, World ID/Portal
configuration, economic abuse, governance key/role custody, monitoring, and
availability/DoS remain open for independent review.

## Static analysis

CI downloads Solidity `0.8.30+commit.73712a01` from the official Solidity
binary list and verifies SHA-256
`f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7` before
running `slither-analyzer==0.11.3`. No analyzer is silently installed by local
test commands. For a local run, install that exact analyzer, download and
verify the same compiler, then run:

```sh
SOLC_BINARY=/absolute/path/to/solc-linux-amd64-v0.8.30+commit.73712a01 pnpm security:slither
```

The command passes `contracts/src` to Slither and derives its fixture filter
from `contracts/solidity-scope.json`, so it analyzes every production source,
including `CivilizationBuybackVault` and `CivilizationRewardDistributor`.
It uses the same compiler flags as the reviewed release profile: optimizer
enabled with 10 runs and `viaIR`; this is asserted by the Solidity tests and
not a separate analysis-only bytecode profile. Imported `node_modules` sources
are filtered by path after compilation; they are pinned verification inputs,
not project production source. The command fails when Slither or the exact
compiler is absent or mismatched. The CI baseline excludes only the following reviewed detector
classes across that complete production suite; every other enabled Slither
detector fails CI: `weak-prng` (a deterministic modulus remainder, not entropy),
`incorrect-equality`/`uninitialized-local` (deliberate zero-value guards),
`timestamp` (the specified cooldown and game timers), `assembly` (the
compiler-checked ERC-7201 slots), `reentrancy-events` and `low-level-calls`
(the intentionally bounded, state-independent best-effort splitter call),
`missing-inheritance` (the contract deliberately exposes the ERC-20 ABI without
inheriting its interface), and dependency-only `pragma`, `dead-code`, and
`solc-version` reports. These are informational residual risks, not findings
silently treated as fixed; changing the relevant code requires re-triage and
independent review.

The full-suite run additionally triages Slither's `costly-loop`
(`costly-operations-in-loop`) and `cache-array-length` for
`CivilizationRevenueSplitter.processMonthlyPayout`. The loop is bounded by the
enforced distribution size of 2 through 10 recipients, and it intentionally
releases each current recipient's allocated balance in that cadence call;
reading the array length from storage is a bounded gas optimization concern,
not an authorization or accounting bypass. Any change to that maximum, loop,
or payout call semantics requires re-triage.

## Stateful and World Chain checks

`pnpm test` runs a deterministic local-EVM adversarial sequence suite of 16
fixed 32-bit seeds (`0x43c0ffee`, `0x00000001`, `0x12345678`, `0xdeadbeef`,
`0x0badc0de`, `0xcafebabe`, `0xfeedface`, `0x31415926`, `0x27182818`,
`0x9e3779b9`, `0xa5a5a5a5`, `0x5a5a5a5a`, `0x01020304`, `0x89abcdef`,
`0xfedcba98`, and `0xffffffff`). Each seed executes exactly 32 market
transitions, for exactly 16 runs and 512 transitions per test invocation. The
suite deliberately mixes failed duplicate registration, cooldown boundary
attempts, seed-driven market buy/sell sequences for each wallet, and
cross-wallet isolation checks, then checks independently maintained
supply/resource invariants after every transition. The seeds and step count are
test constants, so CI and local runs reproduce every trace.

`pnpm test:worldchain:proxy-verifier` is mandatory and offline: its RPC fixture
asserts that the verifier uses only `eth_chainId`, `eth_getStorageAt`,
`eth_getCode`, and value-free `eth_call`, while malformed authority/code data
fails closed. A real provider cannot be guaranteed stable or public in CI, so
the separately executable, read-only command is intentionally not treated as
passing when unavailable:

```sh
WORLDCHAIN_RPC_URL=https://your-trusted-worldchain-rpc.example pnpm security:worldchain:fork
```

It requires HTTPS, sends no keys or transactions, and exits with an explicit
failure if `WORLDCHAIN_RPC_URL` is absent. Record its JSON report with the
corresponding offline manifest when performing a live release review.
