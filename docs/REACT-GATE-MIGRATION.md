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

The imperative shell still owns the map, collection status, Market/Raid panels,
dialogs, ticks, and game actions. Tick updates re-render the React HUD, Build,
and Army islands from existing runtime state; they do not write into
React-owned nodes.

```
CivilizationClient
├─ imperative game root (map, panels, dialogs, ticks, bindings)
│  ├─ GameShellHud (typed React HUD island)
│  ├─ BuildPanel (typed React build island)
│  └─ ArmyPanel (typed React army island)
└─ CivilizationRuntimeGate (access and runtime feedback)
```

Subsequent slices should proceed one panel at a time (market, raid), then
settings and review dialogs.
Each slice must retain the current runtime adapter boundary and keyboard
behavior before moving to the next one.
