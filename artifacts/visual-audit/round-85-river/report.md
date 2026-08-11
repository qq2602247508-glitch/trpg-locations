# Round 85 — River macro-structure and terrain/building interface audit

Date: 2026-08-11

## Fixed-seed density comparison

- Prompt: `蜿蜒河谷，主河从高处落入深潭，两条支流、河岸悬崖、浅滩和旧石桥`
- Seed: `round-85-river`
- Size: large
- Density comparison: 20% / 90%

### Baseline failure

The earlier river implementation varied sine phase, width and tributary count,
but retained one horizontal U-shaped valley. The waterfall always dropped seven
feet, the room program always contained the same three regions, and every seed
received one bridge plus one ford. Density therefore looked like a prop-count
control instead of a spatial control.

### Repairs

- Added five macro valley forms: floodplain, asymmetric gorge, double canyon,
  S-confluence and braided reach.
- Seed now selects X- or Z-axis flow and changes the full channel/bank graph.
- Density changes bank profile, elevation bands, tributary count, channel width
  and legal crossing count.
- Prompt semantics select a 3–7 ft ordinary drop, 8–16 ft waterfall, or 18–30
  ft dramatic canyon drop.
- Waterflow routes now follow actual channel segments and descend vertically at
  the waterfall instead of interpolating through dry space.
- Added a river-specific low-angle camera aimed from downstream at the authored
  waterfall face.

### Result

20% density:

- asymmetric-gorge form;
- Z-axis flow;
- 793 bank cliff segments;
- 1 tributary;
- 24-foot waterfall;
- 2 legal crossings;
- diagnostic score: 95 / 100;
- warnings: 0.

90% density:

- double-canyon form;
- Z-axis flow;
- 907 bank cliff segments;
- 3 tributaries;
- 21-foot waterfall;
- 3 legal crossings;
- diagnostic score: 96 / 100;
- warnings: 0.

Evidence:

- `low-density-v2.png`
- `high-density-v2.png`
- `high-density-low-angle-fixed.png`
- `high-density-routes.png`

## Seed variation

- Prompt: same as fixed target
- Seed: `round-85-river-alt`
- Size: large
- Density: 90%

The alternate seed rotated the whole hydrology from Z-axis to X-axis flow and
changed channel bends, cliff signature, waterfall height and crossing
positions. It generated 965 cliff segments and a 20-foot drop while retaining
three tributaries and three legal crossings.

Evidence: `alternate-seed.png`

## Braided-reach target

- Prompt: `宽阔冲积河谷，分汊河道围绕河中岛洲，有浅滩、倒木桥和下游跌水`
- Seed: `round-85-braided`
- Size: large
- Density: 82%

Result:

- two continuous watercourses split and rejoin;
- a real standable floodplain island remains between them;
- the island is registered as a combat room and high-ground feature;
- 3 tributaries, 10-foot drop and 3 legal crossings;
- diagnostic score: 96 / 100;
- warnings: 0.

Evidence: `braided-overview.png`

## Unfamiliar terrain/building composite

- Prompt: `峡谷瀑布旁的水文档案哨所，有悬崖办公室、地下洪水记录库、跨瀑维护桥、河边取样码头和上游逃生路`
- Seed: `round-85-hydrology-outpost`
- Size: medium
- Density: 78%

### Failure found during browser review

The parent river can now run along either axis, but the embedded-building code
still assumed a horizontal river and a north/south shore. Dock, porch and bank
descent placement could therefore become skewed after a seed rotated the river.
The requested waterfall maintenance bridge and explicit escape route also had
no dedicated geometry contract.

### Repairs

- Derived a reusable river-site frame from the waterflow tangent and bank
  normal.
- Placed the building, porch, fence, bank descent and dock relative to that
  frame for either river axis.
- Added a supported sampling dock with piles and an authored route.
- Added a supported maintenance bridge directly above the waterfall, with its
  own service route and tactical chokepoint.
- Prompt-requested escape routes now generate regardless of the numeric density
  threshold and lead upstream along the safe bank.
- Preserved the full-interior research building and real B1 archive shelves and
  stairs.

Result:

- double-canyon parent terrain with an 18-foot waterfall;
- independently generated full-interior guild/research building;
- selectable 1F and B1;
- real archive geometry, sampling dock, cross-falls bridge and escape route;
- 4 logical layers;
- diagnostic score: 99 / 100;
- warnings: 0.

Evidence:

- `outpost-overview-final.png`
- `outpost-waterfall-low-angle.png`
- `outpost-1f.png`
- `outpost-b1.png`

## Automatic verification

- TypeScript build: passed.
- Vitest: 12 files, 252 tests passed.
- Production Vite build: passed.
- `git diff --check`: passed.

New contracts cover:

- deterministic same-seed replay;
- different-seed macro hydrology signatures;
- density-driven tributary and crossing counts;
- semantic waterfall height bands;
- braided channel and standable island geometry;
- axis-independent river/building placement;
- prompt-required maintenance bridge, sampling dock, archive and escape route.

## Visual self-audit

Passed:

- Low and high density no longer look like the same valley with a different
  number of decorations.
- Alternate seed visibly rotates and reshapes the macro river system.
- The dramatic-drop prompt produces a clearly deeper canyon instead of the old
  fixed seven-foot step.
- The low-angle preset now exposes the channel, cliff faces and waterfall
  crossing rather than showing a blank foreground plateau.
- The unfamiliar hydrology outpost remains a river-owned composite and does not
  fall back to a generic isolated building.
- 1F and B1 contain real walls, rooms, stairs, work furniture and archive racks.
- All audited scenes report zero validation warnings.

Still open for later rounds:

- Water materials remain visually restrained and could show current direction
  more clearly without becoming noisy.
- Tributary mouths are structurally present but need richer erosion silhouettes.
- The braided island is readable from overview, but a dedicated top-down water
  debug layer would make its topology easier to inspect.
- The hydrology outpost exterior is functional but still has limited facade
  detail compared with the strongest standalone buildings.
