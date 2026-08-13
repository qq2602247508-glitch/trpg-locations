# Regression 28 — circular standable surface grid

日期：2026-08-13

## Selected hard requirement

“Every standable surface ... must receive a readable surface-following grid without covering voids.”

## Evidence map

| Requirement | Current evidence | Status | Reason |
|---|---|---|---|
| Standable-surface grid | `src/render/SceneRenderer.ts:284-305, 1268-1301`; `tests/generators.test.ts:51-91`; regression-25 grid screenshots | partial | Cylinders were admitted as grid owners, but renderer emitted rectangular bounding-box lines over circular-platform voids; prior browser audit did not assert footprint containment. |
| Architectural transparency | regression-24/report.md; `SceneRenderer.ts:isArchitecturalGhostPrimitive` | proven | Before/after camera-stable screenshots and focused building evidence exist. |
| Vertical connector support/destination | regression-27/report.md; `tests/validation.geometry.test.ts` connector cases | proven | 187 production connectors and 51 browser connectors had zero clearance errors. |
| Vegetation parent/anchor/contact | `tests/validation.geometry.test.ts` canopy cases; `tests/generators.test.ts:1104-1120` | partial | Unit coverage proves anchor rejection, but current supplied browser reports do not include a dedicated canopy-contact audit. |
| Post-composition stair collision | regression-27/report.md; `src/validation/scene.ts` clearance checks | proven | Composition matrix and browser checks report zero geometry/clearance errors. |
| Hybrid domain preservation | regression-25/report.md Promptfoo 24/24; `tests/generators.test.ts:782+` | partial | Semantic regression passes, but no compact browser evidence specifically proves forest structure remains around settlement for the shortest hybrid prompt. |
| Very short prompt decomposition | regression-25/report.md; Promptfoo cases `森林村庄`, `洪水歌剧院` | proven | Promptfoo explicitly covers both short prompts with passing semantic assertions. |
| Building entry mode change | regression-24/report.md; `tests/composition.interface.test.ts:132+`; `App.ts:331-386` | proven | Embedded and instanced paths have screenshots, floor changes, return-state evidence, and replay metadata tests. |
| Forced local model control/status | regression-26/report.md; `scripts/regression-26-browser.ts`; `planningStatus.ts` | proven | Forced path visibly reports Ollama outcome and deterministic fallback; normal fixed-kind path no longer invokes Ollama. |
| Mandatory visual acceptance breadth | regression-24–27 reports and screenshots | partial | Existing rounds cover several views, but grid acceptance was visual-only and did not validate circular footprint boundaries. |

## Reproduction and root cause

`isTacticalGridSurface()` intentionally returned `true` for standable cylinders. In `buildGrid()`, the surface path then iterated `minLocalX..maxLocalX` and `minLocalZ..maxLocalZ` for every admitted primitive, treating a cylinder like a box. A circular platform therefore received grid segments outside its standable footprint. The missing test was a renderer-level footprint check, not a generator-tag issue.

## Implementation

- Added `clippedCylinderGridSegments()` in `src/render/SceneRenderer.ts` and routed cylinder surfaces through chord-clipped segments.
- Added `tests/generators.test.ts` regression coverage for endpoint containment and edge-chord collapse.
- Added `scripts/regression-28-browser.ts` and captured generated circular-platform browser evidence using `tower / medium / 0.72`, seed `regression-28-circular-wizard-roof`, prompt `三层法师塔，有圆形屋顶决斗平台、炼金室和地下储藏室`.
- The browser audit selects 3F, switches to top camera, and targets the generated `wizard-roof-duel-platform`. Other standable slabs on the same floor correctly retain their own rectangular grids, so the screenshot is runtime evidence while the endpoint-containment test is the authoritative footprint proof.

## Results

- Targeted generator tests: 152/152 passed.
- Full Vitest: 329/329 passed across 16 test files.
- TypeScript build: passed.
- Production build: passed; existing >500 kB chunk warning only.
- Browser audit: `sceneValid=true`, `geometryErrors=0`, `warnings=[]`, network failures `[]`, console errors `[]`; the selected circular surface is `wizard-roof-duel-platform`, level 2, diameter `14.99616m`.
- Promptfoo via `token-promptfoo`: 24/24 passed, 8,363 evaluation tokens; recorded as quality evidence only, with no token-saving claim.
- AST review: `clippedCylinderGridSegments()` has one production call in the cylinder grid branch and one targeted test call.
- Narrow Repomix review: 4 files, 6,044 tokens, below the 12,000-token budget.

Screenshots:

- `circular-platform-overview.png`
- `circular-platform-grid-close.png`

JSON:

- `browser-audit.json`
