# React UI migration slices

The first slice moves only the access and World-runtime gates into React. The
imperative game shell remains the owner of the game HUD and panels.

```
CivilizationClient
├─ imperative game root (gameShell, panels, ticks, bindings)
└─ CivilizationRuntimeGate (access and runtime feedback)
```

Subsequent slices should proceed in this order: the shell status/HUD, then one
panel at a time (build, army, market, raid), then settings and review dialogs.
Each slice must retain the current runtime adapter boundary and keyboard
behavior before moving to the next one.
