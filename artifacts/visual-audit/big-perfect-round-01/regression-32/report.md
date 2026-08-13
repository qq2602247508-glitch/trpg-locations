# Regression 32 · Final hard-prompt browser visual audit

Date: 2026-08-13

Commit: `cc4b521`

## Scope

Fresh Chromium evidence for the exact short forest-village prompt, the flooded opera house contract, and the hanging canyon embassy/rope-bridge contract. The forest prompt is exercised at medium and large seed-variant scales.

This final rerun also verifies the routing correction for the exact hanging-canyon prompt: it is owned by the `rift` parent, reports `terrainKind: "rift"`, and keeps the named embassy as the tactical landmark.

## Result

- **forest-village-medium** — SceneProgram · The Living Crossroads; valid=true; geometry errors=0; warnings=0; primitives=2733; rooms=23; routes=14; snapshots=5.
- **forest-village-large-seed-variant** — SceneProgram · The Living Crossroads; valid=true; geometry errors=0; warnings=0; primitives=4556; rooms=30; routes=18; snapshots=5.
- **flooded-opera** — SceneProgram · The Drowned Orpheum; valid=true; geometry errors=0; warnings=0; primitives=138; rooms=9; routes=8; snapshots=4.
- **canyon-embassy** — SceneProgram · The Hanging Embassy at Split Earth; valid=true; geometry errors=0; warnings=0; primitives=8583; rooms=13; routes=11; snapshots=5.

All four cases passed. Every case has valid scene diagnostics, zero geometry errors, empty warnings, zero request failures, and zero console/page errors. Semantic room/tag assertions are encoded in the browser script and passed when this report is written.

Additional gates passed:

- `npm test`: 334/334 tests passed.
- `npm run build`: passed.
- Promptfoo/Ollama semantic regression: 24/24 passed.
- Build chunks remain split: generation worker 2.66 kB, `SceneRenderer` 45.66 kB, and Three.js 523.67 kB. The only size warning is the dependency-owned Three.js chunk.

## Screenshots

- [forest-village-medium-overview.png](./forest-village-medium-overview.png)
- [forest-village-medium-low-angle.png](./forest-village-medium-low-angle.png)
- [forest-village-medium-grid-close.png](./forest-village-medium-grid-close.png)
- [forest-village-medium-floor-cut.png](./forest-village-medium-floor-cut.png)
- [forest-village-medium-focused-building.png](./forest-village-medium-focused-building.png)
- [forest-village-large-seed-variant-overview.png](./forest-village-large-seed-variant-overview.png)
- [forest-village-large-seed-variant-low-angle.png](./forest-village-large-seed-variant-low-angle.png)
- [forest-village-large-seed-variant-grid-close.png](./forest-village-large-seed-variant-grid-close.png)
- [forest-village-large-seed-variant-floor-cut.png](./forest-village-large-seed-variant-floor-cut.png)
- [forest-village-large-seed-variant-focused-building.png](./forest-village-large-seed-variant-focused-building.png)
- [flooded-opera-overview.png](./flooded-opera-overview.png)
- [flooded-opera-low-angle.png](./flooded-opera-low-angle.png)
- [flooded-opera-grid-close.png](./flooded-opera-grid-close.png)
- [flooded-opera-floor-cut.png](./flooded-opera-floor-cut.png)
- [canyon-embassy-overview.png](./canyon-embassy-overview.png)
- [canyon-embassy-low-angle.png](./canyon-embassy-low-angle.png)
- [canyon-embassy-grid-close.png](./canyon-embassy-grid-close.png)
- [canyon-embassy-floor-cut.png](./canyon-embassy-floor-cut.png)
- [canyon-embassy-focused-building.png](./canyon-embassy-focused-building.png)

## Notes

Floor and focused-building screenshots are conditional on the live selector exposing a usable option; the audit records the available options so a missing control is distinguishable from a failed interaction. Manual visual sampling of the canyon overview/low-angle, flooded-opera overview, and forest grid-close PNGs confirmed populated geometry, visible terrain identity, and the corrected title/routing state.
