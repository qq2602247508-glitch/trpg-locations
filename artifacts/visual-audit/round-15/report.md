# Round 15 — composable scene system visual audit

## Baseline

Starting commit: `7302da2 feat: fuse semantic terrain with settlements`.

The preserved baseline screenshots demonstrate three distinct failures:

- `baseline/forest-90-overview.jpg`: 90% density still produced a flat rectangle, one rectangular clearing and 28 sparse trees. Diagnostics incorrectly reported 100/100.
- `baseline/river-90-overview.jpg`: the river-valley topology existed, but density mainly changed vegetation; there was no explicit upstream/downstream level break.
- `baseline/volcano-90-overview.jpg`: the caldera was recognizable, but it was one ring with one outlet and very little tactical identity.

## Architecture delivered

The executable composition path is now:

`GeometryPrimitive → SpatialAtom → FunctionalModule → DesignerMotif → CompositionGrammar → SceneCompositionProgram → generated semantic grid → Three.js geometry`.

The `SpatialAtomDefinition` contract records parameter ranges, footprint and elevation ranges, input/output ports, support/walkable/blocked/clearance surfaces, traversal, adjacency and placement constraints, tactical effects, grid rule, geometry builder, LOD/instancing strategy, performance budget, automatic validation, visual fixtures and explicit failure conditions.

Capability maturity is intentionally honest. Implemented atoms are marked `validated` or `production-ready`; broader future coverage is registered as `planned` or `prototype`. Planned atoms are never counted as realized geometry.

## Semantic policy

1. deterministic parser;
2. local `bge-m3` retrieval over capability cards;
3. deterministic composition and geometry;
4. Qwen only when no bounded capability retrieval resolves ambiguity;
5. schema and geometry validation;
6. semantic coverage audit.

BGE retrieves only registered capability cards. It cannot return coordinates or Three.js code. The local Ollama failure path falls back to lexical retrieval and deterministic planning.

## Visual iterations

### Forest

Same seed, 90% before: `baseline/forest-90-overview.jpg`.

Same seed, 90% accepted: `forest/same-seed-90-overview.jpg`.

- 1,874 walkable terrain cells and 279 explicit vertical faces;
- three irregular clearings;
- 233 clustered trees;
- 140 undergrowth placement attempts;
- 13 fallen logs;
- four reachable canopy platforms;
- a shallow stream and seven routes;
- 18 draw calls at 60 FPS in the audit viewport.

Density regression using the same seed:

- 25%: 99 trees, 52 undergrowth attempts, 7 fallen logs, 3 canopy platforms;
- 90%: 233 trees, 140 undergrowth attempts, 13 fallen logs, 4 canopy platforms.

The different-seed 90% screenshot changes the terrain cell count (1,987 vs 1,874), cliff count (304 vs 279), stream/clearing skeleton and route relationship; it does not only move props.

### River valley

Same seed before: `baseline/river-90-overview.jpg`.

Same seed accepted: `river/same-seed-90-overview.jpg`.

- three tributaries at 90% density;
- channel width and sinuosity are density-dependent;
- explicit seven-foot upper/lower water-level break;
- vertical waterfall face and deep pool;
- old bridge, ford and downstream waterflow;
- 528 bank cliff segments;
- 61 draw calls at 60 FPS in the audit viewport.

### Volcano

Before: `baseline/volcano-90-overview.jpg`.

Iteration 1: `volcanic/same-seed-90-overview.png` exposed unsupported obsidian blocks and lava strips hidden under terrain.

Iteration 2: `volcanic/same-seed-90-overview-v2.png` cuts lava branches into the heightfield first, then places obsidian ridges and basalt shelves at local support elevations.

- five lava branches at 90% density;
- six obsidian ridges;
- four standable basalt shelves;
- 899 exposed vertical faces;
- broken rim and two routes;
- 14 draw calls at 60 FPS.

### Impact crater

`crater/seed-a-82-overview.png` has a broken high rim, sunken multiband basin, central impact core, seven radial fracture systems, ejecta and explicit descent/rim routes. Its low-saturation silhouette remains a crater rather than a small circular prop or campfire.

### Rift

Iteration 1: `rift/seed-a-85-overview.png` revealed an old generic complexity overlay competing with the authored rift.

Iteration 2: `rift/seed-a-85-overview-v2.png` removes the generic overlay from specialized vertical slices.

- a winding 12-cell-wide fracture;
- both banks physically separated;
- explicit cliff faces and deep playable floor;
- natural bridge and rope bridge;
- supported cliff descent;
- three routes;
- 36 draw calls at 60 FPS.

### Atom test bench

Browser route: `/?atom=<capability-id>`.

Implemented fixtures currently cover waterfall, vertical route, ancient tree and bridge. `atom-bench/waterfall-low-angle.png` visibly verifies an upper source, vertical water face, lower basin, two support surfaces and a supported bridge.

### Mixed-site composition regressions

`mixed-sites/river-cabin-a-overview-v3.png` and
`mixed-sites/river-cabin-a-low-angle-v2.png` are the same-seed regression for
“森林河湾中的猎人小屋”. The first attempt was forest-only and hid the cabin
inside the canopy. The repaired composition classifies the river bay as the
parent terrain, clears only local woodland clutter, places the full-interior
cabin on a supported bank surface, and adds a waterfront porch, bank descent,
short dock, dock route and river-side tactical choke.

`mixed-sites/crater-village-a-overview-v2.png` is the repaired same-seed
regression for the crater-edge village. The earlier image was incorrectly
promoted to the bridge-pier/slum grammar because the prompt contained “吊桥”.
The parent-priority fix now produces a warped crater with a broken rim, three
radial descent ramps, a crater-ring road, a cross-crater suspension bridge,
collapse void, basin shrine and mine portal. Browser audit: 99/100 and 100%
semantic coverage.

`mixed-sites/ice-crevasse-a-overview-v3.png`,
`mixed-sites/ice-crevasse-a-low-angle-v3.png` and
`mixed-sites/ice-crevasse-a-top-v3.png` cover the ice-crevasse settlement
prompt. The new parent terrain has two separate ice shelves, a deep rock
floor, three supported bridges, a cargo-lift descent, rock tunnel, hot spring,
bottom mine portal and forge-hall/furnace landmarks. The top view confirms the
fracture is a real map boundary rather than a surface decal. The same prompt
with seed `round15-ice-crevasse-b` and density 55 is captured in
`mixed-sites/ice-crevasse-b-top-density55.png`; its bank geometry and building
placement differ while retaining the same parent grammar.

## Automated gates

- TypeScript + Vitest: 171/171 passing across the complete test suite.
- Production build: passing.
- Atom quality gate checks footprint/elevation ranges, geometry builder, at least two automatic validations, at least three visual fixtures, at least two explicit failure conditions, and rejects `production-ready` entries backed by a planned builder.
- Density regression measures ecology counts, tributary structures, lava branches and obsidian ridges.
- Semantic audit records capability mappings, realized tags, partial/low-confidence coverage and missing requirements.
- Scene diagnostics now expose `geometryIntegrity`, `semanticCoverage`, `spatialCoherence`, `tacticalQuality`, `visualIdentity`, `variationQuality` and `performanceQuality` instead of treating connectivity as sufficient for 100.

## Not yet at the production quality gate

- Planned primitive operations such as arbitrary polygon surfaces, robust boolean openings, true lofts and cave cuts remain planned.
- The generic grammar can retrieve BGE capabilities, but not every retrieved planned capability has a geometry solver. The tidal-cave monastery audit correctly proves BGE selection, not full tidal-cave realization.
- Hollow-tree cities, mangrove smuggler ports and floating salt-crystal
  monasteries still need dedicated combinations of the new atoms; they are not
  claimed complete in this round.
- StyleProgram is auditable and influences the specialized natural slices through material/silhouette rules, but the full roof/opening/lighting/fog style compiler remains incomplete.
- Debug rendering currently exposes route/tactical/grid views; dedicated rendered blocked-volume and port glyph layers remain planned.
- The renderer batches repeated shapes effectively, but it does not yet use a true per-species `InstancedMesh` ecology pipeline.
