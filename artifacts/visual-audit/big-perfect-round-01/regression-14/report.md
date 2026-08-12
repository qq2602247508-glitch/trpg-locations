# Regression 14 · Focused Archive Cutaway Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 85%.
- Baseline commit: `39aa4d3 fix: anchor building exterior approaches`.
- Baseline gates: 292/292 tests, production build passed, no known P0/P1 in regression-13.

## Target

Improve the building-focus and transparent inspection path for the underground archive in the ice research facility. The previous focused B1 view looked like an orange wall blocked the room, stairs and tactical route.

## Root cause

The basement south and east structural walls already carried `focus-cutaway`. The apparent orange wall was not a structural wall: it was the nearest of three archive shelf rows.

All three shelves correctly existed as tactical cover in the normal scene, but focused-building mode had no way to remove the nearest row for an interior inspection view.

## Fix

- Preserved all three archive shelves in generated scene data.
- Preserved `cover` on all three shelves.
- Marked only the local `x=+1.05` shelf row (`archive-shelf-3`) as `focus-cutaway`.
- Normal floor and transparent views still render all three shelves.
- Focused-building mode uses the existing renderer filter to omit the nearest row, exposing the archive aisle, stair landing and tactical grid.
- No renderer or validator behavior was weakened.

## Automated verification

- Full Vitest suite: **292/292 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Regression assertions prove:
  - exactly three archive shelves remain;
  - all three remain tactical cover;
  - exactly one shelf is a focus cutaway;
  - the other two remain visible in focused mode;
  - scene diagnostics remain valid with no warnings.

## Token-efficient tools

- RTK: full tests, build and Git output.
- `token-ast-grep`: structural location of `setBuildingFocus`, focus filtering and generated archive geometry.
- `token-repomix`: strict two-file whitelist, **3,348 tokens**, below the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,267 real tokens**:
  - prompt: 3,759;
  - completion: 3,508.
- No token-saving claim was recorded without a comparable baseline.

## Chromium evidence

The fixed browser run reported:

- status: `校验通过`;
- 339 primitives;
- 15 routes;
- overview: 73 draw calls, 6,618 triangles, 118 FPS;
- focused B1: 13 draw calls, 708 triangles, 30 FPS.

Evidence:

- `ice-research-floor-3-normal.png`
- `ice-research-building-focus.png`
- `browser-audit.json`

### Visual comparison

- Normal B1 retains the complete archive and therefore remains heavily occluded. This is the full-structure reference, not the focused reading view.
- Focused B1 removes only the nearest shelf row. The stair, floor grid, archive aisle, remaining cover and orange route are visibly more readable.
- Independent review classified focused B1 as P2, not P0/P1.
- Remaining P2:
  - retained left/back wall still hides part of the room relationship;
  - the upper stair/platform connection can read as slightly suspended from this angle.

No P0/P1 remains in the intended focused-building view.

## Remaining gaps

- Improve dynamic cutaway selection for retained near-side walls across rotated and irregular functional modules.
- Improve visible support/landing evidence around the upper stair connection.
- Continue the long-term building-entry/return, standable-grid ownership, route support, forced Ollama failure-source UI, broad seed matrix and bundle-size work.
- Production build still reports chunks larger than 500 kB; main client bundle is approximately 598.37 kB.

Strict overall completion advances from approximately **85% to 86%**. The long-running Goal remains active.
