# On-chain Civilization game-state draft

## Wallet-only revision and deployment boundary

The current source introduces `registerWallet()`: a public, zero-argument function that initializes only `msg.sender` once with the standard starter village. It emits `WalletRegistered`. Registration is deliberately permissionless; later gameplay mutations are authorized by the contract's per-function checks (normally `onlyRegistered`) and the transaction signature of the acting wallet. `registerWorldId` and `registerWorldIdLegacy` remain available solely for ABI/state compatibility; the active production Civilization client does not import, request, or gate on IDKit/RP proof handling.

After server-side WalletAuth/SIWE has produced the checksum wallet, the client reads `previewPlayerState`. This binds the UI to an address only; it is not an authorization input to `registerWallet()`, nor does the contract know that it happened. Registered wallets render the game immediately. Unregistered wallets submit exactly one MiniKit transaction for `registerWallet()`, require `executedWith === 'minikit'`, a successful status, `userOpHash`, and a checksum-equal `from`, then wait for a successful receipt and a registered readback before rendering the map. Any rejection, timeout, failed receipt, or false readback stays on the fixed retry UI; retries read state before another submission.

The active client and production target use proxy `0x0E6689d0649Ad9037465d178231b10F18518D2b0`. The transaction [`0xf9f5164392011c80cf5a510e055f255fbcfe2166e39f537d2e18cf8a48f0e750`](https://worldscan.org/tx/0xf9f5164392011c80cf5a510e055f255fbcfe2166e39f537d2e18cf8a48f0e750), block `33697221`, belongs to the earlier directly deployed contract at `0x71564689Fa320bA010561A880CfE2896b6Dc8f8b`; it is not a proxy-deployment transaction. The earlier runtime was 16,276 bytes and `registerWallet()` was simulated successfully against World Chain mainnet after that deployment. This repository does not establish that the earlier direct deployment is the active proxy's implementation.

The replaced dual World ID v3/v4 deployment at `0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199` remains historical. It had zero events, zero registered wallets, and zero CGOLD supply before replacement; no player-state migration was needed. Neither deployment has been independently audited or enables settlement.

## Permissionless wallet-registration threat model

The protected asset is a player's existing on-chain village and its state, not admission to the starter village. An arbitrary caller can bypass this UI and call `registerWallet()` directly. The contract will initialize that caller's address once; it cannot initialize a different address, and a second call from the same address reverts. This is expected behavior, not a missing WalletAuth integration.

WalletAuth/SIWE protects the UI's address binding and avoids presenting one wallet's state as another's. It has no authority in the EVM and must not be described as authentication or authorization for the contract. MiniKit's transaction result, its `from` field, the wallet signature/user operation, and the contract's `msg.sender` checks are distinct layers: only the signed transaction and contract logic mutate state.

The deliberate trade-off is Sybil/farming exposure. A user or automation can create many wallets and obtain the same registration path for each. Any starter allocation, airdrop-like reward, referral credit, matchmaking advantage, or other value granted at or shortly after registration can therefore be farmed. Current safeguards are only one village per address and the contract's normal mutation checks. Before adding material registration-linked value, product and security review must model multi-wallet farming, define an explicit mitigation outside this trust boundary or revise the contract policy, and add monitoring/incident handling. World ID is not a current requirement or fallback gate for this path.

## Authority boundary

```text
Mini App client -> server-side WalletAuth/SIWE verification -> checksum UI address binding
                -> MiniKit-signed registerWallet() -> active Civilization proxy
                -> successful receipt and registered readback -> village rendered

Any wallet ------> direct signed registerWallet() -------> active Civilization proxy

Dormant contract ABI compatibility only:
registerWorldId (v4) / registerWorldIdLegacy (v3) -> verifier/router -> legacy nullifier checks
Mini App client --------------------------------------> claim / upgrade / completeUpgrade / prestige / train / startRaid / resolveRaid
```

The backend only signs short-lived RP proof context with its protected RP signing key. It does not verify proofs, issue attestations, decide access, or receive game-state mutation authority. In particular, WalletAuth/SIWE never reaches `registerWallet()` and cannot authorize it. `registerWorldId` calls the configured World ID v4 verifier with the action hash, RP ID, credential schema, freshness policy, and proof. `registerWorldIdLegacy` calls the constructor-configured v3 router with Orb group `1` and the official legacy external nullifier `hashToField(hashToField(app_id) || action)`. Both paths require `hashToField(msg.sender)` as the proof signal, use one player-registration flag and one nullifier-owner map, and persist state only after the external verifier succeeds.

The backend has no contract entrypoint for claim, resource production, upgrade, construction completion, prestige, training, raid start, raid resolution, player resources, troops, buildings, or CGOLD. It must never accept a client-provided state snapshot or report a game result as authoritative. World nullifiers are stored in the contract only to enforce one-person-one-village for the configured action.

## Contract rules

Every player transition settles elapsed production from `block.timestamp`; production is capped to one total 24-hour offline interval, including when a completed construction splits the settlement, and fractional production is retained per resource. Wood, clay and stone are moved to protected storage by `claim`, subject to warehouse capacity and a 60-second cooldown. Gold field stock is minted as the contract's 18-decimal `CGOLD` ERC-20 at claim. Upgrades and training spend protected wood/clay/stone and burn the required CGOLD. No backend or privileged address can mint CGOLD.

`upgrade` pays only its on-chain cost and queues one construction. `completeUpgrade` must be called after the exact minute curve `1.1 * 1.569772144168414^(level - 1) + 0.9`: the contract stores the factor as 1e18 WAD, rounds the final seconds upward, and caps any duration at 365 days (level 1 is 120 seconds). `boostConstruction(hoursToBoost)` charges exactly one WLD per requested full hour, reduces a pending timer by that many hours, and rejects a boost beyond completion. WLD moves directly from the player to the validated revenue splitter; the game contract never holds WLD. The splitter supports two to ten recipients, checkpoints each schedule, and once per 30 days permissionlessly transfers the current recipients' WLD shares in the payout transaction. Removed recipients retain checkpointed claims for the permissionless `release(recipient)` fallback. Any player action attempts that processing with a bounded gas budget sized for the ten-recipient maximum, without allowing a payout failure to block gameplay; missed periods advance in constant time. `prestige` requires Townhall 30 with no construction pending; it resets village state and adds a permanent 10% production multiplier per prestige. It preserves the World-ID registration and player-held CGOLD.

`startRaid` requires a registered non-self defender, reserves an available army, and records a one-minute march. `resolveRaid` is callable only by its attacker after arrival, accrues both players, calculates deterministic attack/defense and casualties, and—on victory—takes only defender field stock within troop transport capacity and the attacker's free total storage capacity. It never touches a defender's protected stored resources. Events make registration and every state transition indexable.

## Contract resource market (proxy release V2)

The V2 implementation adds `buyResource` and `sellResource` for **wood, clay and stone only**. A resource amount is a whole in-game unit; `marketPrice` is CGOLD wei per unit (CGOLD has 18 decimals). `quoteMarket` reports the live price before a wallet confirmation. The fixed `MARKET_FEE_BPS` is 150 (1.5%). A buy computes `ceil(amount × price × 10,150 / 10,000)` and a sell computes `floor(amount × price × 9,850 / 10,000)`. The difference stays in the market's CGOLD reserve, making both the price and rounding rule transparent and chain-enforced.

There is no orderbook, P2P transfer, off-chain balance, WLD exchange, or custody of a player's assets. `MarketStorage.inventory` is an explicit contract-owned pool of village resources. A buy atomically decreases it, checks the buyer's warehouse room, and transfers actual CGOLD to the proxy; a sell atomically removes protected stored resources, increases that pool, and transfers actual CGOLD from the proxy. `marketGoldReserve()` is therefore the proxy's real `CGOLD.balanceOf(proxy)`, not a separately editable accounting number. An empty resource pool, warehouse, or CGOLD reserve makes the relevant order revert without partial changes.

Only the configured timelock can call `configureMarket(resource, priceWeiPerUnit, inventory)`. The timelock must seed CGOLD reserve with a normal `transfer(proxy, amount)` before enabling sells; it must configure each supported resource and must not advertise a nonzero sell flow until the on-chain reserve is read back. Each trade has a caller-supplied `maxGoldIn`/`minGoldOut` and a nonzero deadline; stale quote, price, arithmetic, invalid resource, zero/oversized amount, inventory, reserve and capacity conditions are checked by the implementation itself.

## Active MiniKit transaction path

After WalletAuth/SIWE verification, the active client reads `previewPlayerState`. If the checksum wallet is not registered, it sends `registerWallet()` through MiniKit and accepts the result only when it is a MiniKit submission for that same checksum wallet. A successful receipt and registered readback are required before rendering the game. Subsequent player actions are signed/submitted by that wallet. The client reads `playerState`, `balanceOf`, and contract events for display; it does not derive authoritative balances locally.

## Required dual-protocol proxy-release configuration

`scripts/deploy-worldchain-mainnet.mjs` requires the v4 action/RP/schema/freshness inputs plus `worldIdLegacyRouterAddress`, `worldIdLegacyAppId`, and `worldIdLegacyActionId` from the protected World ID JSON. The legacy app ID must exactly match `WORLD_ID_APP_ID`; the legacy and v4 action must exactly match `WORLD_ID_ACTION`. The router address must be re-verified from the official [World on-chain verification documentation](https://docs.world.org/world-id/idkit/onchain-verification) immediately before deployment. It is intentionally not hard-coded. See `contracts/world-id-deployment.example.json` for the non-secret shape.

For the supplied proxy-release path, `CivilizationGame` receives the dual-protocol verifier settings through `initialize(InitConfig)` and stores them in ERC-7201 proxy storage. A reviewed release must initialize the proxy with those values and then perform an on-chain readback of the active proxy configuration. The source and runner inputs alone do not prove the proxy's active implementation, its initialized capabilities, or an unchanged World Developer Portal configuration.

The repository configures an active proxy target and includes source support plus build inputs for World ID and direct WLD construction boosts. It does not establish the active proxy implementation, the initialized World ID configuration, or capability readback for that target. The V2 market requires a separately reviewed timelock upgrade, an implementation/address/code-hash readback, timelock configuration transactions for each price/inventory, and an actual CGOLD reserve transfer before it can settle a sell. WLD construction boosts remain separate from this CGOLD-only resource market.

## Required before settlement or wider release

1. Independent Solidity/security audit, including economic modelling, replay/signature handling, timestamp/miner-influence review, gas/DoS analysis, and invariant/property tests on a real EVM test framework.
2. Product approval of World ID privacy handling, RP signing-key custody/rotation, configured issuer schema/freshness policy, incident response, rate limits, and player safety/matchmaking policy.
3. A reviewed World App/MiniKit integration, Portal allowlisting where required, an audited deployment/upgrade governance plan, monitoring/indexing, and a tested migration from the existing beta state.
4. Independent review of the V2 market's price policy, inventory supply, reserve seed/reconciliation, quote expiry, liquidity exhaustion monitoring and timelock runbook before scheduling its upgrade. WLD payment, withdrawal, redemption and custody remain outside this market.
