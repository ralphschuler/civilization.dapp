# Civilization DApp transition compatibility

Civilization DApp is the new product and repository name. The following live integration identifiers deliberately remain unchanged during this transition:

- Public domain: `idlemint.nyphon.de`.
- API paths and `X-IdleMint-Anonymous-Id` / `x-idlemint-anonymous-id` header.
- Browser storage keys beginning with `idlemint-` and the World action ID `idlemint-game-access-v1`.
- TrueNAS App/service name `idlemint`, PostgreSQL service/database/user names `postgres`/`idlemint`, and volume `idlemint_postgres`.
- The legacy `IdleCoin` Solidity draft and its `Idle Coin`/`IDC` token metadata; it is undeployed and changing it is outside this rebrand.
- Existing wallet, payment, contract, WLD, IMG, and quote-only behaviour. No on-chain action is introduced by this change.

Future container publication and deployment templates use `ghcr.io/ralphschuler/civilization.dapp`. The currently running image will be migrated by the release rollout.
