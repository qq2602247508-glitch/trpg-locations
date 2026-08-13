# Regression 30 · exact short prompt `森林村庄`

## Result

Passed on August 13, 2026.

The browser audit exercised the exact short prompt `森林村庄` across four
size/density/seed combinations:

| Case | Size | Density | Scene | Geometry | Warnings | Browser errors |
|---|---|---:|---|---:|---:|---:|
| forest-village-small | small | 0.28 | valid | 0 | 0 | 0 |
| forest-village-medium | medium | 0.62 | valid | 0 | 0 | 0 |
| forest-village-large-dense | large | 0.94 | valid | 0 | 0 | 0 |
| forest-village-large-seed-variant | large | 0.62 | valid | 0 | 0 | 0 |

Every case produced overview, low-angle, grid-close, and focused-building
screenshots. The audit also confirmed settlement/village semantics, the
forest-clearing parent terrain, positive building/room/route counts, primary
and alternate routes, trees, canopy platforms, a bridge, and stream-crossing
tags. All four cases had zero network failures and zero console/page errors.

## Fix

`src/generators/buildingModule.ts` now derives building profile and envelope
generation from the persisted `BuildingLot.seed`. This makes overview
generation and on-demand building replay consume the same canonical random
stream, even when the caller's scene stream is namespaced.

The focused-building replay now passes for the medium case that previously
reported:

`Building settlement-building-1 replay manifest does not match its stable seed.`

## Evidence

- Machine-readable audit: `browser-audit.json`
- Targeted tests: 180/180 passed
- Screenshots: 16 PNG files in this directory
- Representative visual evidence:
  - `forest-village-small-overview.png`
  - `forest-village-medium-low-angle.png`
  - `forest-village-large-dense-grid-close.png`
  - `forest-village-medium-focused-building.png`
