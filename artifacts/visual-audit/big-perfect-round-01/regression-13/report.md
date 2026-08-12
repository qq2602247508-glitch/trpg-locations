# Regression 13 · Opera Exterior Anchor Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 84%.
- Baseline commit: `3f6cda6 fix: preserve composite scene identities`.
- Baseline gates: 291/291 tests, production build passed, regression-12 visual audit had no P0/P1.

## Target

Remove the detached-looking pale slab visible in the lower-right foreground of the flooded opera transparent view, without hiding or deleting a required service route.

## Root cause

The isolated primitive was identified as:

- ID: `civic-rear-alley`
- Position: `(73.152 m, 0, 67.056 m)`
- Size: `10.668 × 0.18 × 22.86 m`

The generic `institutional-street` exterior template authored the alley from raw `BuildingProgram` bounds. The compiled room footprints had already been transformed into scene-space coordinates, so the generic alley was separated from the opera backstage.

## Fix

- Exterior approaches now derive anchors from compiled `scene.rooms` footprints.
- Added the dedicated `opera-service-court` exterior style.
- Added a foyer approach that contacts the compiled foyer floor.
- Added a backstage loading/service court that contacts the compiled backstage floor.
- The opera no longer emits `civic-rear-alley`.
- Added a regression test requiring both approaches to:
  - remain inside scene bounds;
  - overlap a compiled building/program-room floor footprint;
  - preserve valid diagnostics with no warnings.

## Automated verification

- Full Vitest suite: **292/292 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Promptfoo local Ollama semantic regression: **10/10 passed**.
- Promptfoo real token use: **7,267**:
  - prompt: 3,759;
  - completion: 3,508.
- No Promptfoo token-saving claim was recorded.

## Token-efficient tools

- RTK: full tests, build and Git checks.
- `token-ast-grep`: structural search for BuildingProgram box/approach generation.
- `token-repomix`: strict three-file whitelist, 2,297 tokens under the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic quality regression.

## Chromium evidence

The fixed browser run reported:

- status: `校验通过`;
- 138 primitives;
- 8 routes;
- 20 draw calls;
- 2,030 triangles;
- 125 FPS in overview;
- no visible `civic-rear-alley`.

Screenshots:

- `drowned-opera-overview-fixed.png`
- `drowned-opera-transparent-fixed.png`
- `drowned-opera-low-fixed.png`
- `drowned-opera-top-fixed.png`

Direct and independent image review found:

- transparent view: PASS; the old detached slab is gone;
- low view: PASS; no new floating, intersection or grid error;
- top view: PASS; the backstage loading surface visibly contacts the service court and is not isolated;
- no P0/P1.

## Remaining gaps

- Improve low-angle visibility where the large green scene base obscures approach/terrain contact.
- Continue checking other BuildingProgram exterior styles for coordinate-space assumptions.
- Continue the long-term work on route support, standable-grid ownership, focused transparency, building entry/return, forced Ollama failure-source UI, broad seed matrices and bundle size.

Strict overall completion advances from approximately **84% to 85%**. The long-running Goal remains active.
