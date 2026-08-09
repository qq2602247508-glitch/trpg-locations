# Round 48 Visual Audit — Compound Sites and Continuous Ice Morphology

## Scope

This round audited the remaining visible failures from Round 47:

- snow ridges reading as isolated bars rather than continuous terrain;
- field-station wings disappearing in focused interior mode;
- parent-terrain routes surviving underneath a child building;
- fixed central doors colliding with seeded station wings;
- post-generated mangrove canopy obscuring a station;
- a single small wilderness building being framed from the full-map bounds.

## Implemented contracts

### Continuous ridge systems

One authored ridge is now a seeded chain of overlapping curved segments with a shared system tag, a supported crest route, and density-controlled segment count. Density 20% produced 3 systems / 18 linked segments; density 90% produced 7 systems / 56 linked segments.

### Building–terrain composition interface

- site clearing uses the complete prop/canopy footprint rather than its centre;
- optional ice-ridge routes are removed when a building invalidates their support;
- external station paths approach from outside the compound envelope;
- the main entrance tries central, right and left door positions, rejects positions occupied by wings, and cuts the wall at the selected position;
- station extension rooms receive real floors, walls, door thresholds, room records, routes and functional fixtures;
- full-interior envelope parts remain visible in focused mode;
- post-site mangrove trees respect the station protection radius.

### Camera framing

When a wilderness composition owns exactly one building, the overview camera frames the building-owned site geometry instead of the complete terrain bounds. The wider natural context remains present but the station is readable without manual zoom.

## Evidence

### Ice density — same prompt and seed

Prompt: `被暴风侵蚀的永久冻土冰原，有连续弯曲雪脊、融水池、破碎冰架和次级裂缝`

Seed: `round48-ice-contours`

- `ice-density-20-overview.jpg`: 20%, 3 ridge systems, 18 segments, 2 thaw pools, 6 shelves, 1 secondary crevasse.
- `ice-density-90-overview.jpg`: 90%, 7 ridge systems, 56 segments, 6 thaw pools, 12 shelves, 4 secondary crevasses.

Result: structural density differentiation passes. The intact rectangular base ice sheet and geometric ridge cross-sections remain open visual issues.

### Unfamiliar field station — same prompt, two seeds

Prompt: `高山永久冻土湿地无线电研究站，有野外实验室、样本处理翼、通信塔、发电机棚、架高栈道、地下标本库和冰水裂沟`

- Seed A: `round48-field-station`
- Seed B: `round48-field-station-b`

Evidence:

- `field-station-overview.jpg`
- `field-station-focus-final.jpg`
- `field-station-seed-b-door-fixed.jpg`

Result: parent terrain, approach, ridge/fissure layout and station envelope change across seeds. Seed B originally exposed a terrain route through the equipment wing and a blocked central door; both were corrected and the same seed now reports topology/reachability passed with semantic coverage 100%.

### Mangrove quarantine station

Prompt: `海岸红树林里的检疫站，有高脚建筑、独立隔离棚、潮汐码头、巡逻塔、消毒区和秘密药品库`

Seed: `round48-mangrove-quarantine`

Evidence:

- rejected overlap baseline: `quarantine-overview.jpg`
- corrected overview: `quarantine-overview-clear.jpg`
- focused interior: `quarantine-focus.jpg`

Result: the building, isolation shed, tidal dock, water channel and surrounding ecology remain readable. The focused interior exposes separate wings, decontamination division and wash fixtures. Material hierarchy and ward furnishing rhythm remain incomplete.

## Automated verification

- `npm run check`: 192 / 192 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Added regression coverage for continuous ridge routes, Seed B station conflict resolution, physical room connectors, and post-site mangrove canopy clearance.

## Remaining failures / next priorities

1. Ice sheets remain too complete at their map boundary; erosion must modify the parent surface, not only place objects above it.
2. Snow-ridge cross-sections are still visibly geometric and need asymmetric windward/leeward morphology.
3. Field-laboratory partitions are visually heavy; benches, clean/dirty buffers and instrument circulation need a clearer hierarchy.
4. Quarantine materials are too uniform; screening gates, cot rhythm and controlled thresholds need stronger visual semantics.
5. The single-building camera heuristic should be generalized into an auditable camera-interest program rather than remain renderer-only behavior.

Round 48 is a stable improvement, not completion of the full long-running goal.
