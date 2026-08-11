# On-chain Civilization game-state draft

`contracts/src/CivilizationGame.sol` is an undeployed, source-only World Chain draft. It is deliberately independent of the running beta API and PostgreSQL state: the beta remains available unchanged until an audited migration is approved.

## Authority boundary

```text
Mini App client -> World ID proof -> backend verifies World response
       -> short-lived EIP-712 registration attestation -> CivilizationGame.registerWorldId
Mini App client --------------------------------------------------> claim / upgrade / train / startRaid / resolveRaid
```

The backend verifies the World ID proof using its protected credentials. Once—and only once—it signs an EIP-712 `WorldIdAttestation` for the player's wallet, a one-way `nullifierHash`, a cryptographically random attestation nonce, and a deadline no more than 15 minutes away. The contract records both nullifier hash and nonce before creating the initial village. Reused nullifiers/nonces, expired attestations, malleable signatures, another wallet, and an unexpected signer revert.

The backend has no contract entrypoint for claim, resource production, upgrade, training, raid start, raid resolution, player resources, troops, or buildings. It must never accept a client-provided state snapshot or report a game result as authoritative. Raw World ID nullifiers should remain off-chain; only a canonical one-way hash is included in the attestation and contract storage.

## Contract rules

Every player transition settles elapsed production from `block.timestamp`; production is capped to eight offline hours and fractional production is retained per resource, so repeated interactions cannot gain or lose rounding dust. Resources first accrue into raidable field stock. `claim` moves stock into protected storage subject to the existing per-resource warehouse capacity and a one-minute cooldown. Upgrades and training can spend only protected storage and enforce the current building and troop prerequisites.

`startRaid` requires a registered non-self defender, reserves an available army, and records a one-minute march. `resolveRaid` is callable only by its attacker after arrival, accrues both players, calculates deterministic attack/defense and casualties, and—on victory—takes only defender field stock within troop transport capacity and the attacker's free total storage capacity. It never touches a defender's protected stored resources. Events make registration and every state transition indexable.

## MiniKit transaction path

After the backend returns a valid registration attestation, the Mini App encodes `registerWorldId(nullifierHash, nonce, expiresAt, signature)` and asks the user to submit it with MiniKit. Subsequent UI actions encode the corresponding `claim`, `upgrade`, `train`, `startRaid`, or `resolveRaid` call and are signed/submitted by that player's wallet. The client reads `playerState` and contract events for display; it does not derive authoritative balances locally.

No address, deployment configuration, wallet configuration, Permit2 flow, WLD payment, ERC-20 movement, withdrawal, custody, or World Portal change is included in this repository change.

## Required before deployment

1. Independent Solidity/security audit, including economic modelling, replay/signature handling, timestamp/miner-influence review, gas/DoS analysis, and invariant/property tests on a real EVM test framework.
2. Product approval of World ID privacy handling, backend signer key custody/rotation, nullifier-hash canonicalization, incident response, rate limits, and player safety/matchmaking policy.
3. A reviewed World App/MiniKit integration, Portal allowlisting where required, an audited deployment/upgrade governance plan, monitoring/indexing, and a tested migration from the existing beta state.
4. Separate explicit review for any future token, settlement, payment, withdrawal, or custody feature. None is authorized by this game-state draft.
