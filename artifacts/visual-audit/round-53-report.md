# Round 53 visual audit — merged terrain slope facades

Date: 2026-08-09

## Scope

Round 53 introduces a reusable triangular wedge primitive and a morphology-boundary compiler that adds visual slope facades without changing the authoritative horizontal 5-foot movement grid.

## Geometry contract

- New batchable `ramp` primitive: triangular prism, local +Z is the high edge.
- `rotationY` points the wedge toward the higher terrain band.
- Slope facades are explicitly tagged `non-walkable-facade`; they never become false grid-bearing movement surfaces.
- Adjacent facade cells with the same direction, elevation pair and material are merged into long runs.
- Multi-band differences and true void boundaries remain vertical cliffs.

## Browser audit matrix

### Forest, fixed seed before merging

Prompt: `茂密森林，层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断`

Seed: `round50-bge-canopy`

Density: 82%

Evidence:

- `forest-slope-overview.jpg`
- `forest-slope-low.jpg`

Result: partial. 497 one-cell wedges softened internal height changes but retained a visible per-cell rhythm.

### Dry channel, failed one-cell realization

Prompt: `干涸河床，弯曲冲沟、冲刷巨石、三处渡口、断裂沙洲和两侧侵蚀坡面`

Seed: `round53-dry-channel`

Density: 72%

Evidence:

- `dry-channel-slope-overview.jpg`
- `dry-channel-slope-low.jpg`

Result: fail. 421 one-cell wedges created serrated side silhouettes and amplified the mosaic effect.

### Dry channel, same-seed merged regression

Same prompt, seed and density.

Evidence:

- `dry-channel-slope-merged-overview.jpg`
- `dry-channel-slope-merged-low.jpg`

Result: partial pass. Contiguous edges merge into 222 long runs, reducing primitives from 2,880 to 2,681 while keeping 60 FPS. Internal grade changes read more continuously. Outer map walls and void holes remain vertical.

### Forest, alternate seed after merging

Prompt: same forest prompt.

Seed: `round53-forest-slope-b`

Density: 82%

Evidence:

- `forest-slope-seed-b-overview.jpg`
- `forest-slope-seed-b-low.jpg`

Result: pass for seed-sensitive slope compilation. The alternate terrain produces 611 elevation boundaries and 294 merged slope runs, with a different ridge, route and clearing graph.

## Automatic validation

- `npm run check`: 199/199 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Contracts verify positive wedge volume, explicit rotation, non-standable facade semantics and forest/dry-channel realization.

## Honest remaining failures

- Map perimeter columns still expose a rectangular base. A separate erosion-skirt atom must handle the outer silhouette.
- Voids and elevation jumps greater than one band deliberately remain cliffs, but they need fractured cliff facades to avoid smooth box walls.
- The wedge top has no tactical grid because it is visual terrain facing, not a legal movement surface. Legal traversal continues through authored trails and stairs.
- The camera can frame dense alternate-seed forests too tightly; scene-fit heuristics need a separate audit.

