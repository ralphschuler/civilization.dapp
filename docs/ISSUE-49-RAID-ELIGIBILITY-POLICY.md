# Issue #49: raid eligibility and anti-farming policy seam

Status: source-only policy seam. It is not live matchmaking, a target-selection service, a raid endpoint, or an activation of any game rule.

`server/raid-eligibility-policy.js` exports the pure `evaluateRaidEligibility` function, versioned as `49.2`. Its caller supplies every fact in one request: captured `nowMs`, opaque participant identifiers, availability, creation timestamps, strength facts, finalized raid-history events, eligible-target count, and every policy parameter. It performs no I/O and requires neither wallet addresses nor wallet/private data. It returns a frozen, minimal machine-readable decision: policy version, boolean eligibility, the generic denial code `ineligible` only when ineligible, and `authority: "preactivation_non_authorizing"`. It exposes no per-check results, history details, or small-population-fallback status. It does not reveal availability, target age/protection, strength, cooldown, pair-history, fallback/population, or any detailed denial reason. A safe explanatory UI mapping needs separate review and is not delivered in this preactivation slice. This is not current authoritative enforcement and cannot authorize a raid.

Even an `eligible: true` result remains non-authorizing until both a trusted server-owned raid-intent path and binding contract/transaction enforcement are implemented.

The configuration deliberately contains no production values. The activating server must provide reviewed values for new-player protection, directed-repeat cooldown, history window, reciprocal-pair limit, strength floor/ratio, and an explicitly approved small-playerbase fallback. When the supplied eligible-target count is at or below that fallback's configured threshold, only strength eligibility may be relaxed. New-player protection, availability, repeat cooldown, and reciprocal-pattern checks remain enforced. A reciprocal-pattern restriction requires both the configured pair-event count and at least one finalized prior event in each direction between the same pair.

## Threat model and limits

This policy addresses obvious repeated-target farming and reciprocal-pair signals only when the supplied facts are complete and trustworthy. It does not establish personhood, prevent Sybil accounts, prove activity, detect off-platform coordination, select a fair target, or enforce an on-chain raid. Opaque IDs are correlation keys, not identity verification. The generic denial code intentionally omits timestamps, counts, ratios, counterparties, thresholds, and the failed condition so a UI does not become an abuse-tuning oracle. Any explanatory UI mapping requires separate review and is outside this preactivation slice.

Malformed or future-dated facts throw an `invalid_raid_eligibility:*` error; an integrating server must deny the request and record a privacy-reviewed operational event rather than fail open. Each history event must have a non-empty opaque `eventId` that is unique within the supplied history and `finalized: true`; malformed, non-finalized, or duplicate event IDs fail closed. The evaluator cannot detect absent or provenance-incomplete fact sets, nor can it prove that caller-supplied history is complete, final, deduplicated, or from a trustworthy source. A trusted future server must reject absent or provenance-incomplete fact sets before invoking the evaluator and derive finalized, deduplicated facts itself rather than trust client-supplied history.

Time boundaries are deterministic. A target is protected while its age is strictly less than `newPlayerProtectionMs`, so protection ends exactly at that elapsed duration. A directed repeat raid blocks only when its event time is strictly after `nowMs - repeatRaidCooldownMs`, so cooldown expires exactly at that elapsed duration. The history window deliberately includes an event exactly at `nowMs - historyWindowMs`.

## Activation gates

Do not activate this module until all of the following are separately approved and implemented:

- A server-owned, authenticated raid-intent path that captures one consistent timestamp and derives authoritative availability, strength, account-age, population, and finalized, deduplicated raid-history facts.
- A reviewed target projection/selection design. This repository has none today; this evaluator never discovers or ranks targets.
- Product/economy and security approval of each supplied configuration value, version rollout/migration, retention, privacy, false-positive handling, monitoring, rollback, and small-playerbase behavior.
- Contract and transaction enforcement that makes the trusted server decision binding. The active client sends wallet-signed on-chain raid transactions directly, and production has no backend game-mutation API, so a server-only result cannot currently enforce anything.
- Server integration tests, observability with privacy-minimised aggregates, and an abuse review validating inputs cannot be forged or selectively omitted.

Until those gates are met, #49 remains incomplete. This slice is only the deterministic policy/data-contract foundation.
