# Round 57 · Terrain reservations and compound access audit

## Prompt and controls

- Prompt: `巨大冰川裂缝研究站，主实验楼建在西岸安全冰台，有样本实验室、通信塔、发电机棚、地下样本库，两座自然冰桥连接东岸观测点`
- Primary Seed: `round57-glacier-compound-a`
- Alternate Seed: `round57-glacier-compound-b`
- Scale: large
- Density: 82%

## Implemented contracts

- Glacier fissures now publish formal `TerrainReservationZone` records.
- Later semantic landmarks, loose props and wilderness building sites consume the same reservation contract.
- Main station, generator shed and communications tower search for supported safe placements instead of assuming a clear center.
- Building entrances face away from nearby reserved voids.
- Full-interior functional basements reuse the authored basement datum.
- A dedicated archive access replaces the redundant generic cellar stair.
- The archive access is a two-flight dogleg stair with a real landing, doorway evidence and top shaft frame.
- Stair rendering uses discrete open treads instead of one opaque saw-tooth mass.
- Refocusing a building preserves an explicitly selected numeric floor.

## Visual iterations

1. `glacier-compound-b1-focused-fixed.jpg`: confirmed the selected B1 floor but exposed the opaque stair-side wall.
2. `glacier-compound-b1-open-treads.jpg`: open treads removed the wall-like stair mass; duplicate basement access remained.
3. `glacier-compound-b1-single-access.jpg`: one access remained, but the straight flight exceeded the room depth.
4. `glacier-compound-b1-dogleg.jpg`: dogleg flights and landing released the room center; the first top-portal plate read as floating.
5. `glacier-compound-b1-final-top.jpg`: top view confirmed the two parallel flights and archive shelf aisles.
6. `glacier-compound-b1-shaft-frame.jpg`: four-sided shaft frame replaced the floating plate.
7. `glacier-compound-1f-hatch.jpg`: ground floor contains real partitions, laboratory benches, instruments and the internal access zone.
8. `glacier-compound-seed-b-overview.jpg`: alternate seed changes fissure shape, broken plates, building placement and bridge orientation while respecting reservations.

## Self-audit

- [x] A title-free silhouette still reads as an ice-fissure field station.
- [x] The main building, generator and communications tower avoid reserved crevasse voids.
- [x] Two supported crossings remain the only authored crevasse crossings.
- [x] B1 has a single logical access composed from two connected flights and one landing.
- [x] Basement floors share one datum; shelves and fixtures do not float between two underground levels.
- [x] Same input and Seed reproduce the same layout.
- [x] Alternate Seed changes macro topology and placement, not only decoration.
- [x] No route warning remains after the archive threshold was authored.
- [ ] The surface hatch needs stronger material contrast in the 1F view.
- [ ] The full-site camera could frame the station slightly larger without hiding the crevasse.

## Representative evidence

- Same-seed B1 perspective: `round-57/glacier-compound-b1-shaft-frame.jpg`
- Same-seed B1 top: `round-57/glacier-compound-b1-final-top.jpg`
- Same-seed 1F: `round-57/glacier-compound-1f-hatch.jpg`
- Alternate-seed overview: `round-57/glacier-compound-seed-b-overview.jpg`
