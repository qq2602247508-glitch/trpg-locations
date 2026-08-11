# Round 88 — Building × Terrain Interface Audit

Date: 2026-08-11

## Scope

This round tests whether an independently generated full-interior building can be composed with an authored natural parent without deleting the parent's terrain grammar, routes, hazards, or elevation logic.

The regression matrix covers six previously unfamiliar combinations. Every case is generated with the same Seed at density 0.30 and 0.84, then with a second Seed at density 0.84.

1. Black-glacier pilgrim radio rescue station.
2. Acid-fog peat telegraph clinic.
3. East-bank rift cartography post.
4. Obsidian workshop on a volcanic caldera rim.
5. Herbal ranger hospice on a forest slope.
6. Glider rescue hangar on a coastal cliff.

Automated matrix result: 18/18 scenes retain the expected natural parent, a `full-interior` building instance, a supported foundation, an access route, deterministic replay, measurable density variation, measurable Seed variation, and zero topology warnings.

## Defects found and corrected

- The coastal prompt was being claimed by the cave child because `海蚀洞` appeared after the sea-cliff parent. Parent ownership now checks the explicit coast/cliff relation first.
- Coastal water existed five feet below the world datum and was hidden by the terrain skirt. The sea now occupies a visible tidal margin; cliff walls begin at the water surface and use staggered, overlapping rock segments with toe rocks.
- A large hangar could be placed across fixed terrain routes or outside its safe supported shelf. Placement now uses the complete requested functional envelope and bounds checking.
- Parent trails were rerouted around only one ordering of perimeter corners. Both directions are now considered, preventing a detour from cutting back through the building.
- A Seed-dependent module order allowed a later medical wing to cover an earlier hangar route. After all modules are authored, functional routes run a final physical doorway-cut pass.
- Mountain switchbacks crossed a child basement. Affected switchbacks are rebuilt around the complete child footprint and their obsolete primitive is removed.
- Basement floors could hide valid vertical routes. Explicit floor-opening geometry is now emitted where a vertical route enters the submerged module.
- The sea cave existed outside building-focus visibility. Cave floor, rock shell, tidal pool, descent, and cover now share the building-interface tag so B1 inspection includes them.
- Existing browser Workers can retain old generator code across Vite HMR. A Worker restart investigation was performed; the final post-restart browser replay was blocked by the Codex browser security reviewer and is recorded as incomplete rather than passed.

## Visual evidence

### Glacier rescue station

- Prompt: `黑冰川裂缝旁的巡礼无线电救护站，有伤员舱、祷告室、地下燃料库、测风塔和跨冰隙担架桥。`
- Baseline: `01-glacier-high-a.png`, Seed `round-88-glacier-pilgrim-radio-a`, density 0.84.
- Density comparison: `19-glacier-low-density-a.png`, density 0.30.
- Alternate Seed attempt: `20-glacier-high-density-b.png` and `22-glacier-high-density-b-fresh-worker.png` exposed a browser/Worker divergence: the browser omitted the child building while direct generation and the automated BGE-equivalent matrix retained it.
- Pass: glacier plates, deep continuous fracture, supported crossing, density-dependent fracture count.
- Not passed: final browser replay after the Worker guard change; the local-browser security reviewer blocked the post-restart page access.

### Peat telegraph clinic

- Prompt: `酸雾泥炭湿地里的旧电报诊疗站，有治疗室、发报室、半淹药品库、架高木栈道和观察塔。`
- Evidence: `02-peat-high-a.png`, Seed `round-88-peat-telegraph-clinic-a`, density 0.84.
- Pass: irregular dry peat islands, multiple water bodies, raised boardwalk, full building and lookout hierarchy.
- Remaining: dedicated close B1 screenshot was not captured in this round.

### Rift cartography post

- Prompt: `弯曲裂谷东岸的星图测绘哨所，有制图室、器材库、地下避难舱、贴崖升降梯和跨谷索桥。`
- Evidence: `16-rift-cartography-high-a.png`, Seed `round-88-rift-cartography-post-a`, density 0.84.
- Pass: map-scale broken ground, distinct banks, high/low routes, rope crossing, east-bank facility placement.
- Remaining: lift machinery remains visually schematic.

### Volcanic glass workshop

- Prompt: `破火山口外缘的黑曜玻璃工坊，有熔炉间、退火库、地下燃料室、屋顶排烟台和跨熔岩维修桥。`
- Evidence: `03-volcanic-high-a.png`, Seed `round-88-volcanic-glass-forge-a`, density 0.84.
- Pass: caldera, branching lava, obsidian cover, rim building, supported maintenance crossing.
- Remaining: no dedicated furnace-room close-up in this round.

### Forest herbal hospice

- Prompt: `密林坡地里的草药巡护院，有诊疗木屋、干燥棚、地下根窖、树冠瞭望台和跨溪根桥。`
- Evidence: `04-forest-high-a.png`, Seed `round-88-forest-herbal-hospice-a`, density 0.84.
- Pass: layered elevation field, irregular clearings, dense canopy, reachable tree platforms, stream/root-bridge ownership, embedded cabin.
- Remaining: alternate-Seed browser image was not captured after the browser reviewer blocked local access; the automated structural signature differs.

### Coastal glider rescue hangar

- Prompt: `海岸悬崖上的滑翔救难站，有宽门机库、绞盘库、医务室、屋顶信号台和通往海蚀洞的维护栈道。`
- Fixed overview: `10-coastal-grounded-overview.png`, Seed `round-88-coastal-signal-hangar-a`, density 0.84.
- Low angle: `11-coastal-grounded-low.png`.
- 1F: `12-coastal-building-1f.png`.
- B1 cave: `14-coastal-building-b1-cave.png`.
- Route cutaway: `15-coastal-route-cutaway.png`.
- Same-Seed density comparison: `17-coastal-low-density-a.png`, density 0.30.
- Alternate Seed: `18-coastal-high-density-b.png`, density 0.84.
- Pass: visible open water, cliff-toe relation, grounded vertical faces, full building, hangar/medical rooms, sea-cave geometry, supported maintenance route, density/Seed variation.
- Remaining: low-poly cliff faces still read as segmented rock retaining walls; the B1-only view hides the level-0 catwalk and therefore needs the route-cutaway view for the complete relationship.

## Automated verification

- `rtk npm run check`: 13 test files, 261 tests passed.
- `rtk npm run build`: production build passed.
- `git diff --check`: passed.
- Build warning retained: the generated Worker and renderer chunks exceed Vite's default 500 kB advisory threshold.

## Result

The round passes the shared building–terrain interface contract and fixes multiple geometry/topology defects. It does not claim final visual perfection. The remaining visual debt is concentrated in natural cliff surfacing, close-up cave presentation, and a final fresh-Worker browser replay for the glacier alternate Seed.
