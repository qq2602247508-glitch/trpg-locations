# Round 56 visual audit — glacier-spanning main crevasse

Date: 2026-08-09

## Scope

Round 56 promotes the ice-crevasse atom from a painted dark corridor to a real topology operation. Crevasse prompts split every base-plate row into east and west banks, add deep vertical ice walls and a non-standable bottom, and permit only two authored natural ice bridges.

## Topology and composition contract

- The crevasse removes standable floor across the full north–south extent.
- East and west banks are independent plate geometry.
- The bottom is a deep hazard and never standable.
- Exactly two natural ice bridges cross the reserved void; both are supported and grid-bearing.
- Snow ridges, thaw pools and raised ice shelves select a bank and cannot cover the main crevasse.
- Later generic standable props and terrain-complexity passes respect the same reserved-void contract.
- Same Seed replays exactly; a new Seed changes the fissure curve, width bands, bank outlines and bridge context.

## Browser audit matrix

Prompt: `巨大冰川裂缝从北到南完全切断冰原，只有两座狭窄冰桥可以跨越，两岸有破碎雪脊、冻融池和高低冰台`

Size: large

Density: 82%

### First realization — post-pass crossings

Seed: `round56-main-crevasse-a`

Evidence:

- `round-56/ice-crevasse-overview.jpg`
- `round-56/ice-crevasse-low.jpg`
- `round-56/ice-crevasse-top.jpg`

Result: fail. The base terrain was genuinely split and the low view exposed depth, but snow-ridge and shelf passes crossed the void after the main crevasse was authored. The two requested crossings were not tactically exclusive.

### Same-Seed bank-constrained regression

Evidence:

- `round-56/ice-crevasse-fixed-overview.jpg`
- `round-56/ice-crevasse-fixed-low.jpg`
- `round-56/ice-crevasse-fixed-top.jpg`

Result: partial. Snow ridges and local ice features stay on one bank, and bridges use ice instead of timber. Generic later-stage platforms could still occupy the reserved void.

### Same-Seed full-pipeline reserved-void regression

Evidence:

- `round-56/ice-crevasse-reserved-overview.jpg`
- `round-56/ice-crevasse-reserved-low.jpg`
- `round-56/ice-crevasse-reserved-top.jpg`

Result: pass for the crevasse prototype. The north–south void is visually continuous, low angle shows the deep cut, and only two narrow authored crossings remain. Ice shelves, standable props and natural-detail atoms are excluded from the void in their own later composition stages.

### Different-Seed structural regression

Seed: `round56-main-crevasse-b`

Evidence:

- `round-56/ice-crevasse-seed-b-low.jpg`
- `round-56/ice-crevasse-seed-b-top.jpg`

Result: pass. The second Seed changes fissure curvature, wide and narrow sections, bank silhouette and ridge distribution while retaining two-bank topology and two crossings.

## Automatic validation

- `npm run check`: 201/201 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Contracts verify separate east/west banks, deep non-standable bottoms, exactly two supported bridges, crossing routes, and zero overlap from later ice-shelf, natural-detail or standable-prop passes.

## Honest remaining failures

- Ice walls are segmented vertical plates without blue-ice strata, icicles, fractured overhangs or localized collapses.
- Raised ice shelves remain too rectangular and require a separate broken-shelf atom.
- The two bridges are mechanically correct but need edge thinning and irregular natural-arch silhouettes.
- The generic semantic-anchor pass does not yet consume the reserved-void contract; prompts that add arbitrary semantic landmarks require a later audit.
