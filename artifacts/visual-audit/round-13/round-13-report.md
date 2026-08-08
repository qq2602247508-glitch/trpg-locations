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

These fixes are covered by deterministic scene tests, but a new browser screenshot could not be captured after the local-browser request was denied by the environment's security reviewer. This item remains visually unclosed.

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

Those fixes passed automated regression checks but remain visually unclosed because post-fix browser capture was denied.

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

These fixes passed automated regression checks but remain visually unclosed because post-fix browser capture was denied.

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

Substantially improved and architecturally usable, but not a fully closed visual round.

Passed:

- settlement morphology is now an explicit intermediate program;
- premodern settlements no longer default to a regular modern grid;
- water-city and crater-village prompts have distinct physical composition;
- every building has one spatial program independent of render LOD;
- selected buildings can switch from overview envelope to detailed interior geometry;
- vertical platforms have explicit support validation;
- scale and density affect block and parcel counts;
- deterministic tests, type checks and production build pass.

Remaining:

- recapture the post-fix building-focus, water-city and crater-village views when browser access is available;
- improve curved-road meshing and road/frontage joins;
- add stronger facade identity and micro-frontage detail to lower-LOD buildings;
- improve landmark hierarchy in large districts;
- measure and reduce bundle size and focus-mode activation latency;
- extend terrain composition beyond crater, canal and vertical-slum cases.

The round must not be described as fully visually accepted until the three post-fix browser regressions are captured and inspected.
