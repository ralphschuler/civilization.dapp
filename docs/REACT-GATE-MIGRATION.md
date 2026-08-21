# React UI migration slices

The first slice moves only the access and World-runtime gates into React. The
second slice moves the shell header HUD (resource values, production, World
status, and settings trigger) into a typed React component. The third slice
moves Build-panel content into the typed `BuildPanel` island. Its imperative
shell markup is only a stable mount point; details, requirements, costs,
construction progress, boosts, upgrade planning, disabled states, and actions
are rendered by React. The runtime/controller remains the single source of
truth and passes action callbacks into the island.

The fourth slice moves Army-panel content into the typed `ArmyPanel` island.
Its imperative shell markup is only a stable mount point; troop counts,
requirements, costs, disabled/busy states, and training callbacks are rendered
by React. The runtime/controller remains the single source of truth.

The fifth slice moves Market-panel content into the typed `MarketPanel` island.
Its imperative shell markup is only a stable mount point; the runtime owns the
market draft, quote, and revision. Any resource, direction, or amount change
invalidates the quote, and an async quote is accepted only when it still matches
the current draft.

The imperative shell still owns the map and game actions. The sixth slice moves Raid-panel content into the typed
`RaidPanel` island. The runtime owns the address/target and troop draft, while
React owns its controlled controls, report, busy states, and march countdown.
Tick updates re-render every React island from existing runtime state; they do
not write into React-owned nodes.

```
CivilizationClient
├─ imperative game root (map, panels, ticks, bindings)
│  ├─ GameShellHud (typed React HUD island)
│  ├─ CommandNavigation (typed React desktop and mobile navigation islands)
│  ├─ BuildPanel (typed React build island)
│  ├─ ArmyPanel (typed React army island)
│  ├─ MarketPanel (typed React market island)
│  ├─ RaidPanel (typed React raid island)
│  ├─ SettingsDialog (typed React dialog island)
│  └─ WalletReviewDialog (typed React dialog island)
└─ CivilizationRuntimeGate (access and runtime feedback)
```

The seventh slice moves the Settings dialog into the typed `SettingsDialog`
island. Its mount point remains in the imperative shell, while the runtime is
still the source of truth for dialog visibility, locale, reduced-motion state,
and logout action. React owns clipboard feedback, pending logout UI, initial
focus, Escape/backdrop close, and the dialog focus trap. The HUD trigger is an
icon-only, labelled 44px control rendered by `GameShellHud`.

The eighth slice moves the wallet-review dialog into the typed
`WalletReviewDialog` island. The runtime-owned, frozen review intent remains
the only action source; React renders its details and confirm/cancel controls.
It preserves the non-dismissable backdrop, focuses the modal action on open,
traps Tab navigation, restores focus to the active panel navigation after
cancel, and cancels a review on Escape when it is not waiting for wallet or
chain finality.

The ninth slice moves the collection control and field-stock status into the
typed `CollectionStatus` island. Runtime state remains the source for the
collection lock/countdown, busy state, field stock, and gather callback. Each
live tick re-renders the island; the former imperative collection tick writer
is removed.

The tenth slice moves command tabs and mobile quick access into the typed
`CommandNavigation` island. The imperative shell provides one stable mount for
each responsive layout, while the runtime remains the only source for the
active panel and action feedback. Both mounts call the same runtime
`selectPanel` action; React owns the semantic labelled controls and the
post-selection focus restoration, so the former navigation string rendering and
imperative navigation listener are removed. Map market selection remains an
imperative map action.

The eleventh slice moves the dynamic village map into the typed `VillageMap`
island. The imperative shell now provides only its stable map mount. The
runtime remains the sole source of map state (levels, selected building, active
panel, assets, feedback, collection, and callbacks), while React renders the
map heading, terrain fallback states, markers, live feedback, and the existing
`CollectionStatus` as a child of the same root. Map marker actions call the
runtime callbacks directly; the render cycle records and restores the matching
map-button focus. Consequently, `bindGameActions` neither binds map controls
nor attaches map asset listeners.
