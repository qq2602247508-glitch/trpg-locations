# Round 13 visual audit — organic settlements and focusable buildings

Date: 2026-08-08

Baseline commit: `230c06a test: record round twelve settlement visual audit`

## Scope

This round replaces the settlement generator's regular modern-looking block grammar with a `SettlementMorphologyProgram`, composes terrain constraints with settlement planning, gives every placed building a deterministic `BuildingProgram`, and adds a focus mode that can reveal a building's dormant detailed interior without rendering every interior in the overview.

The generated Waterdeep-style scenes use original procedural rules derived from public descriptions of harbor-first growth, ward differences and historical accretion. They do not reproduce a published map or named street geometry. See `docs/waterdeep-morphology-notes.md`.

## Baseline failures

The eight baseline images record the defects reported before this round:

- straight, evenly spaced roads and rectangular blocks;
- settlement buildings represented by uninhabitable mass boxes;
- Waterdeep scenes with modern zoning and little harbor logic;
- water-city prompts falling through to unrelated terrain;
- crater-village prompts omitting the crater;
- mixed building LOD without a shared interior contract;
- elevated platforms and stairs without structural support;
- no way to enter a selected settlement building.

## Visual checks

### A. Waterdeep old harbor overview

- Prompt: `深水城旧港区，前现代弯曲街巷、码头、鱼市、酒馆、神殿与仓库`
- Seed: `r13-organic-waterdeep`
- Size: large
- Density: 76%
- Evidence: `final/01-waterdeep-overview.jpg`

Passed in the image:

- the road network is no longer a regular modern grid;
- street widths and headings vary;
- pitched roofs, stepped masses and varied heights replace the baseline field of simple boxes;
- the overview reads as a dense premodern district rather than a collection of isolated props;
- harbor-oriented streets and mixed-use frontage are visible.

Still imperfect in the image:

- several road bends are angular rather than smoothly curved;
- a few large dark masses remain visually under-described;
- some parcels meet roads awkwardly at acute angles;
- the scene needs more small-scale frontage detail and clearer landmark hierarchy.

### B. Waterdeep top view

- Prompt, Seed, Size and Density: same as A
- View: orthographic planning/top view
- Evidence: `final/02-waterdeep-top.jpg`

Passed in the image:

- block shapes are irregular and respond to multiple anchors;
- the primary route, secondary loops and local lanes are distinguishable;
- the pattern is visibly different from the baseline rectilinear parcel grid.

Still imperfect in the image:

- some block boundaries and access spurs overlap visually;
- road-to-frontage alignment needs another geometry cleanup pass;
- the planning overlay is denser than the final tactical presentation should be.

### C. Building focus attempt

- Prompt, Seed, Size and Density: same as A
- View: selected mass-LOD building interior
- Evidence: `final/03-waterdeep-focus-mass-building.jpg`

The screenshot exposed real failures and therefore was not accepted as a final pass:

- the camera inherited an unsuitable overview/top-view state;
- unrelated roof routes remained visible;
- authored building base height and exterior height were lost during validation;
- surrounding context obscured the selected interior.

Fixes made after this screenshot:

- focusing resets incompatible top/low view toggles;
- context is cropped around the selected building;
- unrelated roof routes are hidden;
- validation preserves `baseYMeters` and `exteriorHeightMeters`;
- overview envelopes are hidden only for the selected building while its `focus-interior` geometry is shown.

These fixes were initially covered only by deterministic tests because local capture was temporarily denied. Browser capture later became available again; the additional camera, cutaway and floor-switch defects it exposed were fixed and are recorded in section F.

### D. Water city

- Prompt: `河道水城，弯曲主运河、三条支流、石桥、木桥、水上市集、船坞与前现代不规则街巷`
- Seed: `r13-water-city`
- Size: medium
- Density: 72%
- Evidence: `final/04-water-city-overview-before-fix.jpg`

Passed in the image:

- the prompt no longer falls through to generic wilderness;
- canal water, branches, bridges and a market dock exist as geometry.

Failed in the image:

- the settlement is too sparse;
- the banks do not yet read as continuous canal frontage;
- the first semantic pass parsed `前现代` incorrectly because it contained the substring `现代`;
- the overview lacks quay walls, dense bridge approaches and waterside door/frontage logic.

Fixes made after this screenshot:

- premodern tokens are resolved before modern tokens;
- water-city blocks are placed on both canal banks instead of over the central channel;
- the scene receives a distinct water-city title and morphology program.

Those fixes passed automated regression checks. A later browser session restored local capture and the result is recorded in section F.

### E. Crater village

- Prompt: `陨石坑边缘村庄，房屋沿破碎环形坑缘生长，有三条下坑坡道、坠星碎片、木屋与神殿`
- Seed: `r13-crater-village`
- Size: medium
- Density: 68%
- Evidence: `final/05-crater-village.jpg`

Passed in the image:

- the crater is now physical geometry instead of a missing metadata label;
- the basin, rim, three descending approaches and meteor material are visible;
- the settlement plan is different from the harbor and water-city plans.

Failed in the image:

- the first rim was too regular and symmetrical;
- a central civic plate weakened the crater silhouette;
- buildings were not yet sufficiently aligned to the broken rim.

Fixes made after this screenshot:

- rim radii, angles and heights now vary;
- deliberate rim gaps and impact fragments break the ring;
- the market/open space moves to the rim instead of covering the basin.

These fixes passed automated regression checks. A later browser session restored local capture and the result is recorded in section F.

### F. Post-fix browser closure

Local browser access became available again and the three previously unclosed paths were regenerated with the same prompts and seeds.

#### Focusable settlement building

- Evidence: `final/11-waterdeep-focus-1f-final.png`, `final/14-waterdeep-focus-2f-final.png`, `final/21-crater-home-b1-focus.png`
- Selected instance: a mass-LOD guild in the Waterdeep scene, plus a mass-LOD home for the basement check.

The first two new attempts (`07` and `08`) correctly exposed two additional camera bugs: an incorrect coordinate assumption and a fixed world-space cutaway direction. They remain in the audit folder as failure evidence. The accepted implementation now:

- converts tactical-cell building positions to rendered metres exactly once;
- approaches from the building's rotated local south-east diagonal;
- removes the two camera-facing focus walls;
- enters on 1F instead of stacking all storeys;
- keeps the camera locked to the selected building when switching to 2F or B1;
- renders basement floor, enclosing walls and cellar stair as authored geometry.

The accepted screenshots show a real floor slab, retained back walls, partition, furniture/cover, stair and separate floor heights. The focus blueprint remains deliberately compact at overview LOD; it is not yet equivalent to a dedicated landmark building's full furnishing pass.

#### Water city

- Evidence: `final/19-water-city-dense-banks.png`
- Prompt: `河道水城，弯曲主运河、三条支流、石桥、木桥、水上市集、船坞与前现代不规则街巷`
- Seed: `r13-water-city`
- Size: medium
- Density: 72%

The final pass replaces three rectangular water plates with a six-point main canal, three two-segment tributaries, two following quay paths, two bridges and a market dock. The semantic program now reports `channel-cut + urban-blocks`; parcels are filtered against the actual canal polylines instead of obsolete rectangular exclusion bands. Canal-bank block count is increased and buildings sit closer to both banks.

Passed: distinct canal morphology, three tributaries, bank routes, bridges, waterside buildings, premodern era and non-grid circulation.

Remaining quality limitation: road and access meshes visually compete with water at several junctions. A later round should trim roads at canal intersections and replace permitted crossings with explicit bridge programs.

#### Crater village

- Evidence: `final/20-crater-village-postfix.png`
- Prompt: `陨石坑边缘村庄，房屋沿破碎环形坑缘生长，有三条下坑坡道、坠星碎片、木屋与神殿`
- Seed: `r13-crater-village`
- Size: medium
- Density: 68%

Passed: the basin remains open, the broken rim varies in heading/radius/height, three ramps reach the basin, impact fragments form cover, and buildings occupy the external rim rather than a default rectangular ward.

Remaining quality limitation: several rim rocks are intentionally large tactical blocks and still read more constructed than eroded from a low camera angle.

### G. Vertical settlement closure

- Evidence: `final/22-vertical-slum-supported.png`, `final/23-vertical-slum-low.png`
- Prompt: `建在巨型桥墩之间的垂直贫民街区，有三层市场平台、吊桥、楼梯和桥下维修区`
- Seed: `r13-supported-vertical`
- Size: medium
- Density: 70%

The overview and low-angle views show that elevated market decks are no longer unsupported floating slabs. Posts reach the platform undersides, three vertical routes exist, stairs and bridges meet standable surfaces, and the bridge-pier context remains visible.

## Structural and semantic validation

The automated suite now checks:

- premodern Waterdeep-style prompts select organic harbor morphology;
- a water city and crater village produce different terrain and road contracts;
- every settlement building retains a deterministic `BuildingProgram` at mass, facade and full-interior LOD;
- facade and mass buildings compile dormant focus-interior geometry;
- vertical-slum platforms have supports reaching their undersides;
- authored diagnostic metrics survive canonical validation;
- fixed seeds remain deterministic;
- all existing scene, grid, navigation, semantic and rendering contracts continue to pass.

Latest verification:

- `npm run check`: 9 test files, 153/153 tests passed;
- `npm run build`: passed;
- `git diff --check`: passed.

The Vite build still reports the existing chunk-size warning for bundles over 500 kB. It is a performance follow-up, not a build failure.

## Round verdict

Accepted for the Round 13 objective after post-fix browser closure.

Passed:

- settlement morphology is now an explicit intermediate program;
- premodern settlements no longer default to a regular modern grid;
- water-city and crater-village prompts have distinct physical composition;
- every building has one spatial program independent of render LOD;
- selected buildings can switch from overview envelope to detailed interior geometry;
- vertical platforms have explicit support validation;
- scale and density affect block and parcel counts;
- deterministic tests, type checks and production build pass.
- post-fix 1F, 2F, B1, water-city, crater-village and low-angle vertical-settlement screenshots were captured and inspected.

Non-blocking follow-up quality work:

- improve curved-road meshing and road/frontage joins;
- trim ordinary roads at canal intersections and promote legal crossings to bridge programs;
- add stronger facade identity and micro-frontage detail to lower-LOD buildings;
- improve landmark hierarchy in large districts;
- measure and reduce bundle size and focus-mode activation latency;
- extend terrain composition beyond crater, canal and vertical-slum cases.

All artifacts required to prove the Round 13 architecture are now present. The remaining items are visual-quality extensions rather than missing Round 13 contracts.
