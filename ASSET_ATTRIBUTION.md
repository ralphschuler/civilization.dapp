# Civilization DApp asset provenance

This repository retains the following files from the Civilization project asset collection, copied on 2026-08-09 from its `assets/` directory before this repository was renamed:

- Buildings: `town-hall`, `barracks`, `storage`, `wood-cutter`, `clay-pit`, `iron-mine`, `market`, `house`.
- Resources: `wood`, `clay`, `iron`, `gold`.
- Units: `spearman`, `archer`, `knight`.

They are project-owned visual assets used by Civilization DApp. `iron.png` and `iron-mine.png` are temporary visual stand-ins for the current Stone resource because Civilization does not contain a dedicated stone asset. Replace them when a proper stone asset is supplied.

## City map backgrounds

`public/assets/maps/mintia-village-map-v1.png` and `public/assets/maps/mintia-village-map-mobile-v1.png` were generated on 2026-08-09 with OpenAI image generation for this project. They contain terrain, paths and empty building pads only. Civilization building assets remain the interactive map objects layered over those pads.

## Village atlas v2

`public/assets/village-v2/` contains a new set of transparent building and resource sprites, generated on 2026-08-09 with OpenAI image generation for this project. The sprites were art-directed against the Mintia village-map terrain and replace the copied Civilization assets in the visible map, HUD, inspector and market UI. The original copied Civilization files remain retained as provenance/source material; units still use the existing project-owned art.
