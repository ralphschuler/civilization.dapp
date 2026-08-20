# React UI migration slices

The first slice moves only the access and World-runtime gates into React. The
second slice moves the shell header HUD (resource values, production, World
status, and settings trigger) into a typed React component. The imperative
shell still owns the map, collection status, panels, dialogs, ticks, and game
actions. Tick updates re-render the React HUD from the existing runtime state;
they do not write into React-owned HUD nodes.

```
CivilizationClient
├─ imperative game root (map, panels, dialogs, ticks, bindings)
│  └─ GameShellHud (typed React HUD island)
└─ CivilizationRuntimeGate (access and runtime feedback)
```

Subsequent slices should proceed one panel at a time (build, army, market,
raid), then settings and review dialogs.
Each slice must retain the current runtime adapter boundary and keyboard
behavior before moving to the next one.
