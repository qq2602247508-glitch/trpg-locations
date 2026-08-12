# Regression 15 · Basement Hatch Context Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 86%.
- Baseline commit: `5dc578a fix: reveal focused archive interiors`.
- Baseline gates: 292/292 tests, production build passed, no known P0/P1 in regression-14.

## Target

Resolve the remaining P2 impression that the upper archive stair and landing were suspended in the focused B1 view of the ice research facility.

## Geometry audit and root cause

The two archive stair flights already had real geometric contact:

- the lower flight intersects the archive floor and the middle landing;
- the upper flight intersects the middle landing and ground-floor endpoint;
- the upper endpoint overlaps the `archive-surface-hatch` footprint with only a small vertical separation.

The defect was therefore not missing support geometry. The level-0 surface hatch was excluded from the numeric B1 focus view, so the visible stair endpoint lacked its cross-storey destination evidence.

## Fix

- Added `floor-context:3` to the existing level-0 archive surface hatch.
- Preserved its original level, dimensions, ownership, entrance and vertical-opening semantics.
- Reused the renderer's existing explicit cross-storey context mechanism.
- Added no duplicate hatch, false support or full ground-floor geometry to the B1 view.

## Automated verification

- Full Vitest suite: **293/293 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Regression assertions prove:
  - the hatch remains on level 0;
  - it retains building ownership and vertical-opening semantics;
  - it explicitly contributes to floor-context level 3;
  - a real generated specialist archive preserves the same contract.

The production build still reports chunks larger than 500 kB. This remains an open long-term performance item.

## Token-efficient tools

- RTK: full tests, build and Git output.
- `token-ast-grep`: bounded structural location of the archive stair construction and building-focus path.
- `token-repomix`: strict two-file whitelist, **3,348 tokens**, below the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,267 real tokens**:
  - prompt: 3,759;
  - completion: 3,508.
- Promptfoo is recorded as quality evidence only; no token-saving claim was made.

## Browser and visual evidence

The browser audit generated the same deterministic scene:

- prompt: broken ice field with crevasses, ice bridge, laboratory, underground archive, observation platform and bidirectional vertical escape;
- seed: `browser-r12-ice`;
- size: large;
- density: 0.72;
- status: `校验通过`;
- 339 primitives;
- 15 routes;
- no diagnostics warnings.

Evidence:

- `ice-research-floor-3-normal.png`
- `ice-research-building-focus.png`
- `browser-audit.json`

Direct pixel comparison against regression-14 confirms:

- the normal B1 view remains structurally unchanged;
- the focused B1 view now shows the gray surface hatch above the upper landing;
- the stair, green landing and hatch form a readable vertical destination chain;
- the complete level 0 is not leaked into B1;
- no new P0/P1 defect is visible.

The remaining near-side wall/cutaway framing issue is still P2 and belongs to the broader dynamic cutaway work.

## Remaining gaps

- Dynamic near-side wall cutaway for rotated and irregular interiors.
- Complete support, clearance and landing validation across all stairs, platforms, bridges and ladders.
- Building entry and return mechanics.
- Global ownership rules for every 5 ft grid surface.
- Forced Ollama success, timeout, schema-rejection and rule-fallback source UI.
- Multi-seed browser matrix.
- Production chunk optimization below the current >500 kB warning threshold.

Strict overall completion advances from approximately **86% to 87%**. The long-running Goal remains active.
