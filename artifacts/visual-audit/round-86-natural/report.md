# Round 86 — volcanic, rift, and glacier audit

Date: 2026-08-11

## Scope

This round did not reimplement the previously accepted forest and river work. It audited and upgraded the remaining volcanic, rift, and glacier grammars, their parent-domain routing, density/Seed behavior, embedded-building interfaces, and low-angle visual inspection.

## Prompts

1. `破碎火山口，环形断壁、三条熔岩支流、玄武岩桥、火山灰坡和高处观测台`
2. `巨大裂谷将地图完全切成两岸，有天然石桥、绳桥、裂谷底路线、侧壁洞穴和断崖哨所`
3. `冰川裂谷，两岸完全分离，有冰桥、雪脊、融水池、裂谷底和废弃测量站`

All scenes used adaptive routing and large scale. Sparse captures use density 20%; dense captures use density 90%.

## Failures found from the browser baseline

- A rift prompt containing `侧壁洞穴` tied with the cave classifier and was rendered as a generic cavern network.
- `冰川裂谷` was rendered with the generic rift grammar, discarding the glacier, melt pools, snow ridges, and polar facility vocabulary.
- Volcanic Seeds all produced the same concentric caldera silhouette; density mostly increased branches and props.
- The volcanic alternate route could place a control point on a broken rim gap with no standable evidence.
- Dense glacier ridges produced too many overlapping white bars and made the main crevasse unreadable.
- A snow-ridge route could have all control points outside a building while the segment between them still crossed a solid wall.
- The first automated batch capture could click while the previous generation button was still disabled. Its first frame retained the previous scene. Final captures were retaken with an explicit rendered-Seed receipt check.

## Changes

- Parent ownership now compares the first explicit macro term: rift-first prompts retain rift ownership even when they contain a subordinate cave; cave-first prompts remain caves.
- Ice and underground-lake parents are resolved before their subordinate fissure or Underdark features.
- Rift geometry now has Seeded longitudinal, cross-map, diagonal, and dense forked macro forms.
- Rift bridges, descent, reservations, rooms, routes, tactical points, and optional side cave are derived from the same oriented fracture frame.
- Plain `哨所`, `岗哨`, and `测量站` are recognized as embedded wilderness facilities.
- Ice `裂谷` explicitly cuts both glacier banks and creates a deep crevasse bottom, cliff faces, and exactly two supported crossings.
- Ice ridge, shelf, and thaw-pool counts remain density-driven but were reduced to preserve visual hierarchy.
- Volcanic terrain now supports breached caldera, eccentric crater, broken ring, twin vent, and collapsed flank macro forms.
- Volcanic outlet direction spans the full compass, and the bridge and routes derive from its tangent/normal frame.
- Volcanic route points snap to actual high-rim cells.
- Low-angle camera presets now frame the volcanic crater and glacier crevasse rather than the underside of the map.
- Ridge-route/building collision checks sample whole route segments rather than only endpoints.

## Final visual evidence

### Volcanic

- `volcanic-low-v2.png`: Seed `round-86-volcanic`, density 20, breached-caldera form.
- `volcanic-high-final-overview.png`: Seed `round-86-volcanic`, density 90, twin-vent form, diagnostics 99/100.
- `volcanic-alt-v2.png`: Seed `round-86-volcanic-alt`, density 90, collapsed-flank form.
- `volcanic-high-low-angle-v4.png`: visible lava floor, broken vertical rim, outlet, high shelves, and basalt crossing.

Pass: density changes macro form; Seed changes form/outlet orientation; lava, bridge, rim high ground, vertical faces, and routes are visible. Semantic coverage is 100% and the final topology check is valid.

Remaining: the outer ash slope still uses stepped 5-foot elevation bands and can be smoothed further in a later visual-polish round.

### Rift

- `rift-low-final-v2.png`: Seed `round-86-rift-low-final`, density 20, diagonal 8-cell fracture.
- `rift-high-final-v2.png`: Seed `round-86-rift-high-final`, density 90, forked 14-cell fracture.
- `rift-alt-final-v2.png`: Seed `round-86-rift-alt-final`, density 90, different fracture orientation and bank outline.
- `rift-high-low-angle-v2.png`: explicit vertical faces, deep playable bottom, supported crossings, and bank-height difference.

Pass: no cave fallback; both banks are physically separated; density changes width and branching; Seed changes the macro path; side cave, two bridge types, bottom descent, and embedded outpost exist as geometry.

Remaining: the side-cave mouth is small in the full-scene overview and deserves a dedicated close-up camera in a later interaction round.

### Glacier

- `ice-low-final-v2.png`: Seed `round-86-ice-low-final`, density 20, eight base rows and sparse ridge system.
- `ice-high-final-v2.png`: Seed `round-86-ice-high-final`, density 90, twelve base rows and denser ridges/shelves/pools.
- `ice-alt-final-v2.png`: Seed `round-86-ice-alt-final`, density 90, changed crevasse path, bank erosion, and station placement.
- `ice-high-low-angle-v3.png`: the camera targets the actual crevasse walls and shows the lower blue void below both banks.

Pass: ice parent is retained; both banks, melt pools, snow ridges, two supported ice bridges, deep bottom, and full-interior survey station exist; density and Seed alter meso structure; route/wall checks are clean.

Remaining: the polar station's orange service circulation is visually louder than ideal and should be restyled in the later global material pass.

## Automated verification

- `npm run check`: 12 test files, 253 tests passed.
- Targeted generator/composition matrix: 187 tests passed.
- `npm run build`: passed; existing Vite chunk-size warnings only.
- `git diff --check`: passed.

## Self-audit result

- Hidden-title terrain recognition: pass for all three domains.
- Same Seed replay: pass by deterministic test and browser Seed receipt.
- Density changes structure: pass (rift fork/width, volcanic macro form, glacier ridge/base-row/pool topology).
- Different Seed changes macro layout: pass.
- Parent/child composition: pass for rift outpost and glacier survey station.
- Supported routes and vertical connections: pass after volcanic rim snapping and whole-segment building collision checks.
- No regression to forest or river implementations: pass; their code paths were not replaced in this round.

