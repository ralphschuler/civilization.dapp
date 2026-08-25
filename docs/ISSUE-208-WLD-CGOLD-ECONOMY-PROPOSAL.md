# Issue #208: cap-free WLD/CGOLD economy

## Decision

This is a source-only design. It selects no WLD/CGOLD rate and authorizes no deployment, upgrade, contract/UI/configuration change, Portal change, pool seed, or WLD movement.

Phase 1 permits uncapped direct purchase of CGOLD and has no CGOLD sell-back. Phase 2 may add AMM-style WLD/CGOLD trading only after transparent liquidity seeding and independent review. Cap-free means this proposal adds no monthly, wallet, purchase, boost, issuance, or arbitrary buyer ceiling. Normal user-selected deadline/slippage protection, wallet funds, gas, and arithmetic limits still apply.

Recommended discovery: run a public, non-binding uniform-price demand-discovery window, then separately publish one phase-1 fixed unit price and fee formula. No WLD is collected and no CGOLD is issued during discovery. The subsequent sale is uncapped; an indication creates neither allocation priority nor a redemption right.

## Evidence and reusable boundaries

| Area                   | Source fact / reusable mechanism                                                                                                                                                       | Evidence                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGOLD sources          | CGOLD is the game ERC-20 with no lifetime cap. Gameplay sources are gold-field claim and victorious raid loot; a timelock-configured reward distributor is a separate optional source. | `contracts/src/CivilizationGame.sol` (contract notice, `claim`, `_takeRaidLoot`, `_mintGold`); `contracts/src/CivilizationRewardDistributor.sol`   |
| CGOLD sinks/states     | Upgrade and training costs, public `burn`, and buyback output burn CGOLD. The resource market holds CGOLD in the proxy reserve; that is not a burn.                                    | `contracts/src/CivilizationGame.sol` (`_spend`, `burn`, `buyResource`, `sellResource`); `contracts/src/CivilizationBuybackVault.sol`               |
| Existing WLD flow      | WLD currently pays construction boosts only. The game exact-receipt checks, sends floor-half to the buyback vault and the remainder to the WLD splitter, and never holds WLD.          | `contracts/src/CivilizationGame.sol` (`_boostConstruction`); `docs/ONCHAIN_ARCHITECTURE.md`                                                        |
| Splitter               | Existing WLD splitter is timelock-administered and has permissionless monthly processing/release. A two-recipient 50:50 configuration is valid; addresses are not selected here.       | `contracts/src/CivilizationRevenueSplitter.sol`; `contracts/STATUS.md`                                                                             |
| Existing market safety | Resource/CGOLD quotes expose price, fee, inventory and reserve; orders enforce `maxGoldIn`/`minGoldOut` and deadline. It is wood/clay/stone versus CGOLD, not WLD/CGOLD.               | `contracts/src/CivilizationGame.sol` (`quoteMarket`, `buyResource`, `sellResource`); `src/components/MarketPanel.tsx`; `src/world-game/actions.js` |
| UI/simulator boundary  | World UI has no WLD/CGOLD purchase or AMM path. The simulator models construction duration, not token pricing, balances or liquidity.                                                  | `src/components/MarketPanel.tsx`; `src/simulation/policy-130-simulator.js`; `src/world-game/market-intent.js`                                      |
| Release boundary       | V2 market/buyback sources are source-only; no WLD pair, settlement activation or deployment is asserted.                                                                               | `contracts/STATUS.md`; `docs/ADR-0133-PRODUCT-CATALOG-POLICY.md`                                                                                   |

## Terminology and ledger rules

| Item                                             | Classification                                               | Rule                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Gameplay claim, raid loot, optional reward claim | CGOLD source/mint                                            | Retain distinct events and index `Transfer(0x0, ...)`.                                                                |
| Proposed phase-1 delivery                        | New explicit CGOLD source/mint                               | A future dedicated adapter mints exactly the signed quote amount; it is neither a gameplay claim nor capped issuance. |
| Upgrade/training/public burn/buyback output      | CGOLD sink/burn                                              | Index `Transfer(..., 0x0, ...)`.                                                                                      |
| Existing proxy CGOLD reserve                     | Reserve state, not a sink                                    | It settles the internal resource market.                                                                              |
| Phase-1 WLD consideration and reserve fee share  | WLD liquidity/reserve asset, not developer revenue or a burn | Segregate and make balance/event history observable.                                                                  |
| Developer fee share                              | Revenue                                                      | Send to the existing WLD splitter, configured before activation to the two approved recipients at 50:50.              |
| Existing boost WLD sent to buyback vault         | Buyback funding                                              | Keep wholly separate from primary-sale accounting.                                                                    |
| AMM LP deposits/withdrawals                      | LP capital movement                                          | Never label as revenue, reserve fee, or a burn.                                                                       |

## Phase-1 price discovery alternatives

All alternatives publish method, timestamps, inputs, calculation, result and the exact game effect before signing. None sets a rate in this document.

1. **Recommended: non-binding uniform-price demand discovery.** During a published observation window, collect a demand schedule (requested CGOLD quantity at offered WLD/CGOLD prices), publish the methodology, aggregate/raw anonymized record, tie rule and clearing candidate, then publish the separately approved fixed sale price after review. Risk: strategic or Sybil indications. Disclose that risk, preserve the audit record, and never present the outcome as an AMM price or guaranteed value.

2. **Public reference-price formula.** Publish a deterministic formula using independently specified timestamped WLD references and published CGOLD game-effect inputs; recompute only at announced times. Risk: reference/oracle selection and game-effect assumptions embed judgment. Publish sources, fallbacks and calculation. It is transparent but weaker demand discovery.

3. **Open descending-price indication window.** Publish a price path; users submit only non-binding indications. At close publish aggregate demand and a single later sale price. Risk: urgency framing and late indications. State clearly that no funds, priority or preferential access follows. This is less suitable than option 1 because it can look like live trading.

## Recommended phase-1 accounting

For a purchase of `Q` CGOLD at displayed unit price `P`, let `N = Q × P` be WLD consideration before fee and `F` the separately displayed deterministic trade fee. The wallet must see `Q`, `P`, `N`, `F`, total `N + F`, exact game effect, destinations and expiry before signing. No fee rate is selected here.

| Entry                         |             Amount | Destination                                                                |
| ----------------------------- | -----------------: | -------------------------------------------------------------------------- |
| Consideration                 |                `N` | Segregated WLD liquidity/reserve; not developer revenue.                   |
| Fee waterfall, first half     |     `floor(F / 2)` | Same liquidity/reserve.                                                    |
| Fee waterfall, remaining half | `F - floor(F / 2)` | Existing WLD `CivilizationRevenueSplitter`, then its two recipients 50:50. |
| CGOLD delivery                |                `Q` | Purchaser wallet, as separately classified purchase mint.                  |

The odd smallest WLD unit goes to the remainder, matching the current boost split convention. Per trade, event data and dashboards must reconcile `WLD received = reserve credited + splitter credited`, `CGOLD minted = CGOLD delivered`, and splitter deposits against allocations/releases. The price, fee, rounding, reserve credit, developer credit and delivery must never be netted into one opaque "price".

Phase 1 has no CGOLD sell-back, redemption, withdrawal, price-support, yield or return claim. ERC-20 transferability must not be marketed as an exit facility.

## Phase 2 AMM gate and protections

Do not enable a WLD/CGOLD AMM route until the pool address/code, token order, AMM fee tier, initial WLD and CGOLD amounts, depositors, initial price/range, lock/withdrawal terms, reserve balance, price impact, route/approval path and fee waterfall are published and independently reviewed. Read pool balances/liquidity from chain immediately before UI enablement and publish block number and transaction hashes.

The protocol trade fee follows the same waterfall: half to disclosed liquidity/reserve, then the remaining half to the existing WLD splitter. This is distinct from AMM LP fees, which belong to LP positions unless separately disclosed. LP capital is not revenue; CGOLD in an LP position is not burned.

Each swap must show a fresh executable quote, expected/minimum output, price impact, protocol fee, LP fee, reserves/liquidity, route and user-selected deadline. The signed call must enforce minimum output and deadline; stale quote, low liquidity, failed balance-delta check or unmet minimum reverts atomically. Existing resource-market quote/readback and limit/deadline patterns are reusable precedents, not an AMM implementation.

## Fairness, risks and mandatory gates

Fairness is transparent effective price and game effect, not a spending limit. Before signing, disclose effective WLD per CGOLD including rounding/fees; exact game actions CGOLD can fund and ordinary-play acquisition; phase-1 no-sell-back; all destinations and splitter shares; reserve/pool liquidity; source/version and governance/timelock path; quote expiry; and user slippage/deadline protection. Do not claim real-world value, appreciation, liquidity or a return.

Assumptions not proved here: canonical WLD behavior, a future exact-receipt sale adapter, approved two-recipient splitter configuration, and audited/timelocked observable deployment. Risks include uncapped issuance changing game economics, indication manipulation, WLD behavior, approval/contract failure, thin liquidity, MEV, AMM/oracle manipulation, reserve misuse, deceptive UX and legal/consumer obligations. Mitigate with independent economic/security review, timelocked observable changes, exact balance-delta checks, public reserve/pool monitoring, transparent event reconciliation and the stated user protections—never with a spending, purchase, wallet, boost, monthly or issuance cap.

`docs/ADR-0133-PRODUCT-CATALOG-POLICY.md` remains disabled/source-only and requires a new approval plus Legal, World, Store, Product, Security, Privacy/Telemetry and rollback approvals. `docs/ONCHAIN_ARCHITECTURE.md` also requires independent audit/economic review before settlement or wider release. This proposal does not relax those gates.

## Out of scope

No WLD/CGOLD rate, fee rate, recipient address, pool, router, token transfer, Portal change, production configuration, deployment, contract/UI change or WLD movement is selected or performed. Existing `MARKET_FEE_BPS`, inventory limit, reward-distributor caps and boost mechanics are source facts, not Issue #208 policy decisions.
