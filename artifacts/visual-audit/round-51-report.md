# Round 51 visual audit — forest atoms, density, seeds and building composition

Date: 2026-08-09

## Scope

This round replaces the former flat forest scatter with a layered forest composition made from reusable terrain, route and ecology atoms. The audit used the actual browser renderer at `127.0.0.1:5241`; every listed image was opened and inspected after capture.

## Implemented

- Density-controlled terrain relief with four, five or six elevation bands.
- Two warped ridge systems, a central basin and three irregular clearings.
- Elevation-aware A* trails that prefer contour-following movement and realize unavoidable climbs as supported stairs.
- Four tree families with distinct geometry: broadleaf, conifer, snag/deadwood and understory.
- Ancient-tree root buttresses, reachable canopy platforms and supported canopy bridges.
- Density now changes tree population, undergrowth, logs, elevation bands, vertical faces, canopy platforms and route topology.
- Cold-forest state atoms: cooler forest floor and high-ground snow patches.
- Forest and full-interior building composition remains functional; the forest parent is not flattened by the cabin site.

## Browser matrix

### A. Density comparison

Prompt: `层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断`

Seed: `round50-bge-canopy`

- 25% density: 99 trees, 4 elevation bands, 342 vertical faces, 52 undergrowth attempts, 7 logs, 3 canopy platforms and 7 routes.
- 82% density: 216 trees, 6 elevation bands, 545 vertical faces, 129 undergrowth attempts, 12 logs, 4 canopy platforms and 9 routes.

Evidence:

- `forest-density-25-overview.jpg`
- `forest-density-25-low.jpg`
- `forest-species-overview-final.jpg`
- `forest-species-low-final.jpg`

Result: pass. Density changes macro relief, ecology and tactical topology rather than only prop count.

### B. Alternate seed

Prompt: same as A

Seed: `round51-forest-seed-b`

Density: 82%

Result: pass. The alternate seed changes ridge/basin structure, clearing placement, route geometry and tree clusters. It produces 611 vertical faces while retaining six elevation bands.

Evidence:

- `forest-seed-b-overview.jpg`
- `forest-seed-b-low.jpg`

### C. Prompt-driven forest species and climate state

Prompt: `寒冷山麓针叶林，密集冷杉、倒木、林下蕨类、三片不规则空地和树冠哨台`

Seed: `round51-conifer-slope`

Density: 82%

Result: partial pass. The prompt changes the ecology to 135 conifers out of 216 trees and creates 16 high-ground snow patches with a cooler floor palette. The scene reads as conifer forest, but the snow state remains intentionally local and the blocky terrace language is still visible.

Evidence:

- `conifer-slope-overview.jpg` / `conifer-slope-low.jpg` — before climate-state iteration.
- `conifer-cold-state-overview.jpg` / `conifer-cold-state-low.jpg` — same-seed regression after climate-state atoms.

### D. Forest plus full-interior building

Prompt: `起伏阔叶森林中的猎人木屋，有门廊、柴棚、浅溪木桥、陷阱线、地下储藏室和树冠观察台`

Seed: `round51-forest-cabin`

Density: 68%

Result: structural pass, detail partial. The forest retains five elevation bands, 560 vertical faces, a shallow stream and canopy routes. The cabin is a selectable full-interior building with real walls, openings, stairs and B1. The ground floor and basement are still too sparse to pass a furnishing/detail audit.

Evidence:

- `forest-cabin-overview.jpg`
- `forest-cabin-low.jpg`
- `forest-cabin-interior.jpg`
- `forest-cabin-b1.jpg`

## Failures found during the loop

1. Early dead snags used oversized dark branches that looked like floating zigzag stairs. Branch geometry was shortened and assigned explicit deadwood tinting.
2. Directly connected forest anchors created visually aggressive elevation jumps. Terrain-aware pathfinding and supported rises replaced the straight-link realization.
3. Conifer wording changed species counts but did not initially express the cold climate. A composable cold-forest state now changes terrain material roles and adds snow only on high ground.
4. The cabin basement is reachable but visually under-authored. This remains open and must be solved by building fixture/storage atoms, not by forest decoration.

## Automated validation

- `npm run check`: 199/199 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- New contracts cover mixed species, density-driven relief, deterministic/seed-sensitive routes and cold-forest terrain state.

## Remaining limitations

- Morphology is still expressed as 5-foot terraced cells; it lacks a separate continuous-slope facade for distant visual reading.
- Canopy density is much stronger, but crown height bands remain more uniform than a mature natural forest.
- Cold state needs wind exposure, snow loading and tree-line rules before it can represent a true alpine forest.
- The forest cabin's 1F and B1 need denser function-specific fixtures and investigation affordances.

