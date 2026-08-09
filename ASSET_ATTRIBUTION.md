# Civilisation asset provenance

This repository reuses the following files from the sibling project `ralphschuler/civilisation.dapp`, copied on 2026-08-09 from its `assets/` directory:

- Buildings: `town-hall`, `barracks`, `storage`, `wood-cutter`, `clay-pit`, `iron-mine`, `market`, `house`.
- Resources: `wood`, `clay`, `iron`, `gold`.
- Units: `spearman`, `archer`, `knight`.

They are project-owned visual assets, used here only for the IdleMint demo. `iron.png` and `iron-mine.png` are temporary visual stand-ins for the current Stone resource because Civilisation does not contain a dedicated stone asset. Replace them when a proper stone asset is supplied.

## City map backgrounds

`public/assets/maps/mintia-village-map-v1.png` and `public/assets/maps/mintia-village-map-mobile-v1.png` were generated on 2026-08-09 with OpenAI image generation for this project. They contain terrain, paths and empty building pads only. Civilisation building assets remain the interactive map objects layered over those pads.
