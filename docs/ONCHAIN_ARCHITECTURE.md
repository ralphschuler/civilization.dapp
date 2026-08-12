# On-chain Civilization game-state draft

`contracts/src/CivilizationGame.sol` is deployed on World Chain mainnet at `0x1A64F89881FD2E38255E62c6D62b68076052DF4b` by transaction [`0x2c99cf41434022231537e9d3077307ff24c07bfa797c68575c4774961b0d5123`](https://worldscan.org/tx/0x2c99cf41434022231537e9d3077307ff24c07bfa797c68575c4774961b0d5123) in block `33579795`. The deployment has not been independently audited and has no settlement capability. It is deliberately independent of the running beta API and PostgreSQL state.

## Authority boundary

```text
Mini App client -> World ID 4 Proof of Human -> CivilizationGame.registerWorldId
       -> WorldIDVerifier verifies ZK proof on World Chain -> village created
Mini App client --------------------------------------> claim / upgrade / completeUpgrade / prestige / train / startRaid / resolveRaid
```

The backend only signs short-lived RP proof context with its protected RP signing key. It does not verify proofs, issue attestations, decide access, or receive game-state mutation authority. `CivilizationGame.registerWorldId` calls World Chain's official `WorldIDVerifier` directly with the configured action hash, RP ID, credential schema, freshness policy, and proof. It stores the World nullifier and binds the proof signal to `msg.sender`, so the same proof cannot register a different wallet.

The backend has no contract entrypoint for claim, resource production, upgrade, construction completion, prestige, training, raid start, raid resolution, player resources, troops, buildings, or CGOLD. It must never accept a client-provided state snapshot or report a game result as authoritative. World nullifiers are stored in the contract only to enforce one-person-one-village for the configured action.

## Contract rules

Every player transition settles elapsed production from `block.timestamp`; production is capped to 24 offline hours and fractional production is retained per resource, so repeated interactions cannot gain or lose rounding dust. Resources first accrue into raidable field stock. Wood, clay and stone are moved to protected storage by `claim`, subject to warehouse capacity and a two-hour cooldown. Gold field stock is minted as the contract's 18-decimal `CGOLD` ERC-20 at claim. Upgrades and training spend protected wood/clay/stone and burn the required CGOLD. No backend or privileged address can mint CGOLD.

`upgrade` pays only its on-chain cost and queues one construction. `completeUpgrade` must be called after its timer: Townhall I takes one day, Townhall II two days, and so on. Other buildings take at least one hour and scale by level. `boostConstruction(hoursToBoost)` charges exactly one WLD per requested full hour, reduces a pending timer by that many hours, and rejects a boost beyond completion. The WLD token and treasury are immutable deployment parameters; WLD moves directly from the player to treasury via `transferFrom`, so the game contract never holds WLD. `prestige` requires Townhall 30 with no construction pending; it resets village state and adds a permanent 10% production multiplier per prestige. It preserves the World-ID registration and player-held CGOLD.

`startRaid` requires a registered non-self defender, reserves an available army, and records a one-minute march. `resolveRaid` is callable only by its attacker after arrival, accrues both players, calculates deterministic attack/defense and casualties, and—on victory—takes only defender field stock within troop transport capacity and the attacker's free total storage capacity. It never touches a defender's protected stored resources. Events make registration and every state transition indexable.

## MiniKit transaction path

After World App returns a World ID 4 Proof of Human, the Mini App encodes `registerWorldId(nullifierHash, nonce, signalHash, expiresAtMin, issuerSchemaId, proof)` and asks the user to submit it with MiniKit on World Chain (chain ID 480). Subsequent UI actions encode the corresponding `claim`, `upgrade`, `completeUpgrade`, `prestige`, `train`, `startRaid`, or `resolveRaid` call and are signed/submitted by that player's wallet. The client reads `playerState`, `balanceOf`, and contract events for display; it does not derive authoritative balances locally.

The mainnet address and public World ID build configuration are included for the deployed game. No settlement adapter, Permit2 flow, withdrawal, redemption, fee routing, liquidity, custody, or World Portal change is included in this release. A direct WLD construction-time payment exists in the deployed contract, but no WLD/CGOLD settlement is enabled. CGOLD's ordinary ERC-20 movement remains governed by the deployed game rules.

## Required before settlement or wider release

1. Independent Solidity/security audit, including economic modelling, replay/signature handling, timestamp/miner-influence review, gas/DoS analysis, and invariant/property tests on a real EVM test framework.
2. Product approval of World ID privacy handling, RP signing-key custody/rotation, configured issuer schema/freshness policy, incident response, rate limits, and player safety/matchmaking policy.
3. A reviewed World App/MiniKit integration, Portal allowlisting where required, an audited deployment/upgrade governance plan, monitoring/indexing, and a tested migration from the existing beta state.
4. Separate explicit review for any WLD settlement, payment, withdrawal, redemption, fee, liquidity, or custody feature. None is included in this game-state draft.
