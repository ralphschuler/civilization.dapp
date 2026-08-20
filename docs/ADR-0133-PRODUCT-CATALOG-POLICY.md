# ADR-0133: immutable product catalogue boundary

Status: accepted as a **disabled/source-only policy**. This ADR does not
activate a payment method, set a price, select a currency, create checkout,
collect credentials, deploy a contract, or expose purchase UI.

## Decision

`server/product-catalog-policy.js` is the versioned `133.1` source of truth.
Its inventory records the existing payment-adjacent Solidity and offline-plan
sources as disabled/source-only. The public contract-status payload derives
its payments, settlement, buyback, custody, and withdrawal flags from that
policy. All are false. There are no product records, purchase routes, or
client imports.

The policy rejects every proposed catalogue mutation. It specifically detects
payment activation and price, currency, checkout, and credential fields,
including nested fields, without retaining their values. Future work must add
a new policy version; it must not mutate `133.1`.

## Future catalogue guardrails

Only these categories may be considered in a separately approved future
version: cosmetic appearance, comfort/convenience that does not change a
competitive outcome, and progression that is obtainable through ordinary
play and does not bypass a competitive gate. The following are excluded:
randomized or loot-box-like consideration, cash-out or redemption, transfer or
resale rights, yield/return language, real-world value promises, pay-to-win
combat/stat advantages, and any custodial balance.

Before even a limited experiment, the candidate must have plain-language
disclosures, a tested refund and support process, a documented region
eligibility decision, age/consumer-protection review where applicable, and a
published no-purchase alternative for any gameplay-relevant progression.
These are prerequisites, not claims that any obligation has been met.

## 90-day non-arbitrage experiment (not authorised)

If all gates below are approved, the experiment is limited to 90 calendar
days, has a fixed catalogue version, and permits no transfer, redemption,
cash-out, buyback, exchange, secondary-market support, or advantage generated
by buying and reselling. It starts with a documented control baseline; weekly
reviews cover the no-arbitrage invariant, entitlement delivery, refund/support
outcomes, regional exclusion, and telemetry completeness. Day 30 and Day 60
are continuation reviews; Day 90 ends the experiment unless a new explicit
approval is recorded.

### Kill switch

The immutable policy defines a hard, strictly-greater-than pre-activation kill
switch. These are non-active launch guardrails; they neither collect data nor
authorize a launch. A candidate must be killed before activation if any of the
following measured values is above its threshold:

| Guardrail | Threshold | Unit and denominator |
| --- | ---: | --- |
| Refund rate | >3% | Refunded completed purchases / completed purchases. |
| Buyer-complaint rate | >0.5% | Unique buyers with one or more buyer complaints / unique buyers with a completed purchase. |
| Matched D30 progression delta | >15 percentage points | Absolute difference between the matched purchaser and matched non-purchaser D30 progression-endpoint completion percentages; each percentage uses its matched cohort as denominator. |
| PvP power delta | >10% | Absolute difference between matched purchaser and matched non-purchaser mean PvP power / matched non-purchaser mean PvP power. |

The D30 endpoint, matching method, measurement window, owner, and rollback
action must be pre-registered in the activation record. Equality with a stated
threshold does not trigger this particular strict `>` switch; any missing
approval, telemetry gap, prohibited-field attempt, prohibited
transfer/redemption path, or unresolved disclosure/refund/region prerequisite
still immediately keeps the catalogue disabled and blocks new enrolment.

## Telemetry and external gates

The required telemetry is currently absent and blocked: it must not be
collected or activated until issue #48 is complete and the privacy review plus
control-baseline approval are recorded. Once those gates are met, the minimum
privacy-reviewed, aggregated, versioned design must include catalogue version,
region eligibility decision, entitlement class, purchase attempt outcome,
delivery outcome, refund/support outcome, prohibited-path attempt count,
kill-switch state, and the four guardrail measurements. It must exclude wallet
signatures, session tokens, payment credentials, raw IP addresses, and precise
location. Collection, retention, access, aggregation, alert routing, and
deletion must be approved and testable before any experiment.

Activation requires recorded, explicit approvals outside this repository from
Legal, World, and Store, plus Product, Security, Privacy/Telemetry, and the
rollback owner. Each approval must name the exact policy version, regions,
disclosures, refund path, telemetry specification, thresholds, start/end
dates, and kill-switch operator. A test pass cannot substitute for any of
these external approvals.

