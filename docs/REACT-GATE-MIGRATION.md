# React UI migration

`GameShellFrame` is now the one typed React owner of the game document. It
contains the HUD, desktop and mobile command navigation, village map, Build,
Army, Market, and Raid panels, settings and wallet-review dialogs, and the
footer. There is no imperative game root, shell markup, panel renderer, or
event-binding layer.

```
CivilizationClient (owning React client)
├─ owns the host element and React frame state
└─ renders GameShellFrame as its normal child
   ├─ GameShellHud
   ├─ CommandNavigation (desktop and mobile)
   ├─ VillageMap
   │  └─ CollectionStatus
   ├─ BuildPanel
   ├─ ArmyPanel
   ├─ MarketPanel
   ├─ RaidPanel
   ├─ SettingsDialog
   ├─ WalletReviewDialog
   └─ GameFooter
```

The imperative runtime/controller remains the sole source of game state: selected panel,
map state, resources, construction and collection state, market and raid
drafts, dialogs, locale, accessibility focus handoffs, and action feedback.
It emits a typed `GameShellFrame` element (or `null` while gated) through its
frame callback. The owning React client stores that element in React state and
renders it inside its existing host element; it never creates a nested root.
`GameShellFrame` receives that state and the callbacks as typed props and
renders all dynamic content through React. React owns controls, semantics,
controlled inputs, dynamic feedback, asset fallback UI, and dialog keyboard
lifecycles.

World polling updates the runtime state and re-renders the same
`GameShellFrame`. The normal tick refreshes projected values; after 30 World
ticks it performs exactly one quiet World-state refresh. Visibility restoration
also uses a quiet refresh. These refreshes do not create a second shell or
write into React-owned DOM nodes.

The access and runtime gate remains outside the game document: it decides
whether the controller emits the typed game frame. A gate transition emits
`null`, so normal React unmount/remount runs component cleanups naturally. It
does not own game markup or imperative bindings.
