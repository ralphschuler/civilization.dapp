# On-chain Civilization game-state draft

`contracts/src/CivilizationGame.sol` is an undeployed, source-only World Chain draft. It is deliberately independent of the running beta API and PostgreSQL state: the beta remains available unchanged until an audited migration is approved.

## Authority boundary

```text
Mini App client -> World ID proof -> backend verifies World response
       -> short-lived EIP-712 registration attestation -> CivilizationGame.registerWorldId
Mini App client --------------------------------------> claim / upgrade / completeUpgrade / prestige / train / startRaid / resolveRaid
```

The backend verifies the World ID proof using its protected credentials. Once—and only once—it signs an EIP-712 `WorldIdAttestation` for the player's wallet, a one-way `nullifierHash`, a cryptographically random attestation nonce, and a deadline no more than 15 minutes away. The contract records both nullifier hash and nonce before creating the initial village. Reused nullifiers/nonces, expired attestations, malleable signatures, another wallet, and an unexpected signer revert.

The backend has no contract entrypoint for claim, resource production, upgrade, construction completion, prestige, training, raid start, raid resolution, player resources, troops, buildings, or CGOLD. It must never accept a client-provided state snapshot or report a game result as authoritative. Raw World ID nullifiers should remain off-chain; only a canonical one-way hash is included in the attestation and contract storage.

## Contract rules

Every player transition settles elapsed production from `block.timestamp`; production is capped to 24 offline hours and fractional production is retained per resource, so repeated interactions cannot gain or lose rounding dust. Resources first accrue into raidable field stock. Wood, clay and stone are moved to protected storage by `claim`, subject to warehouse capacity and a two-hour cooldown. Gold field stock is minted as the contract's 18-decimal `CGOLD` ERC-20 at claim. Upgrades and training spend protected wood/clay/stone and burn the required CGOLD. No backend or privileged address can mint CGOLD.

`upgrade` pays only its on-chain cost and queues one construction. `completeUpgrade` must be called after its timer: Townhall I takes one day, Townhall II two days, and so on. Other buildings take at least one hour and scale by level. `boostConstruction(hoursToBoost)` charges exactly one WLD per requested full hour, reduces a pending timer by that many hours, and rejects a boost beyond completion. The WLD token and treasury are immutable deployment parameters; WLD moves directly from the player to treasury via `transferFrom`, so the game contract never holds WLD. `prestige` requires Townhall 30 with no construction pending; it resets village state and adds a permanent 10% production multiplier per prestige. It preserves the World-ID registration and player-held CGOLD.

`startRaid` requires a registered non-self defender, reserves an available army, and records a one-minute march. `resolveRaid` is callable only by its attacker after arrival, accrues both players, calculates deterministic attack/defense and casualties, and—on victory—takes only defender field stock within troop transport capacity and the attacker's free total storage capacity. It never touches a defender's protected stored resources. Events make registration and every state transition indexable.

## MiniKit transaction path

After the backend returns a valid registration attestation, the Mini App encodes `registerWorldId(nullifierHash, nonce, expiresAt, signature)` and asks the user to submit it with MiniKit. Subsequent UI actions encode the corresponding `claim`, `upgrade`, `completeUpgrade`, `prestige`, `train`, `startRaid`, or `resolveRaid` call and are signed/submitted by that player's wallet. The client reads `playerState`, `balanceOf`, and contract events for display; it does not derive authoritative balances locally.

No address, deployment configuration, wallet configuration, Permit2 flow, withdrawal, redemption, fee routing, liquidity, custody, or World Portal change is included in this repository change. The source includes a direct WLD construction-time payment, but it is not live until a separately authorized deployment. CGOLD's ordinary ERC-20 movement also remains source-only.

## Required before deployment

1. Independent Solidity/security audit, including economic modelling, replay/signature handling, timestamp/miner-influence review, gas/DoS analysis, and invariant/property tests on a real EVM test framework.
2. Product approval of World ID privacy handling, backend signer key custody/rotation, nullifier-hash canonicalization, incident response, rate limits, and player safety/matchmaking policy.
3. A reviewed World App/MiniKit integration, Portal allowlisting where required, an audited deployment/upgrade governance plan, monitoring/indexing, and a tested migration from the existing beta state.
4. Separate explicit review for any WLD settlement, payment, withdrawal, redemption, fee, liquidity, or custody feature. None is included in this game-state draft.
