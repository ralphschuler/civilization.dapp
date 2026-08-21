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

The imperative shell still owns the map, collection status, the wallet-review
dialog, ticks, and game actions. The sixth slice moves Raid-panel content into the typed
`RaidPanel` island. The runtime owns the address/target and troop draft, while
React owns its controlled controls, report, busy states, and march countdown.
Tick updates re-render every React island from existing runtime state; they do
not write into React-owned nodes.

```
CivilizationClient
├─ imperative game root (map, panels, review dialog, ticks, bindings)
│  ├─ GameShellHud (typed React HUD island)
│  ├─ BuildPanel (typed React build island)
│  ├─ ArmyPanel (typed React army island)
│  ├─ MarketPanel (typed React market island)
│  ├─ RaidPanel (typed React raid island)
│  └─ SettingsDialog (typed React dialog island)
└─ CivilizationRuntimeGate (access and runtime feedback)
```

The seventh slice moves the Settings dialog into the typed `SettingsDialog`
island. Its mount point remains in the imperative shell, while the runtime is
still the source of truth for dialog visibility, locale, reduced-motion state,
and logout action. React owns clipboard feedback, pending logout UI, initial
focus, Escape/backdrop close, and the dialog focus trap. The HUD trigger is an
icon-only, labelled 44px control rendered by `GameShellHud`.

The review dialog remains imperative. Each slice retains the runtime adapter
boundary and keyboard behavior before moving to the next one.
