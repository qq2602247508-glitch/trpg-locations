# Regression 16 · Dynamic Focus Cutaway Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 87%.
- Baseline commit: `929494c fix: show stair hatch in basement focus`.
- Baseline gates: 293/293 tests, production build passed, no known P0/P1 in regression-15.

## Target

Replace fixed east/south building-focus cutaway behavior with a camera-relative spatial cutaway that remains correct for rotated buildings and after the user orbits the focus camera.

## Root cause

The focus camera already approached each building in its authored local orientation, but primitive filtering still removed only generator-authored `focus-cutaway` tags. This caused retained near walls to occlude irregular basements and made the cutaway stale after OrbitControls movement.

During browser verification, a second interaction defect was found: listening only for OrbitControls `end` captured the mouse-release direction, while damping continued moving the camera. The final screenshot and the cutaway therefore disagreed.

The archive stairwell also uses the explicit `stairwell-wall` semantic tag without a generic `wall` tag, so it required its own local-envelope treatment.

## Fix

- Added a testable `dynamicFocusCutawayIds` spatial function.
- Derives outward normals from authored wall size and rotation.
- Uses the focused envelope's own bounds, independent of world-axis orientation.
- Computes stairwell cutaway from the stairwell's separate local bounds.
- Excludes room partitions, screens, furniture and ordinary structural supports.
- Recomputes on OrbitControls `change`, with a direction threshold to limit rebuilds during damping.
- Rebuilds geometry and reapplies floor visibility without recentering the user's camera.
- Preserves non-wall authored `focus-cutaway`, including the nearest archive shelf.
- Added a read-only focus audit snapshot for deterministic browser regression evidence.

## Automated verification

- Full Vitest suite: **294/294 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Unit regressions prove:
  - east/south near walls are selected from an east/south camera;
  - the same local walls remain selected after a 90-degree building rotation;
  - partitions and landing supports remain;
  - semantic stairwell walls without a generic `wall` tag participate;
  - the real `browser-r12-ice` scene selects west basement and west stairwell walls from a west camera.

The production build still reports chunks larger than 500 kB. The main client remains approximately 598.39 kB and SceneRenderer approximately 567.34 kB.

## Token-efficient tools

- RTK: full tests, production build and Git checks.
- `token-ast-grep`: structural location of focus calls and final dynamic cutaway invocation.
- `token-repomix`: strict three-file whitelist, **5,485 tokens**, below the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,267 real tokens**:
  - prompt: 3,759;
  - completion: 3,508.
- Promptfoo is quality evidence only; no token-saving claim was recorded.

## Browser evidence

Deterministic scene:

- prompt: broken ice field with crevasses, ice bridge, laboratory, underground archive, observation platform and bidirectional vertical escape;
- seed: `browser-r12-ice`;
- size: large;
- density: 0.72;
- B1 focused building with transparency enabled;
- status: `建筑内部聚焦`;
- scene diagnostics valid, warnings empty;
- 339 primitives and 15 routes.

Evidence:

- `ice-focus-default-angle.png`
- `ice-focus-orbit-left.png`
- `ice-focus-orbit-right.png`
- `browser-audit.json`

The audit records distinct final-camera cutaways:

- default east/south view: east and south basement walls plus camera-facing stairwell walls;
- north view: north basement wall plus the north-facing stairwell side;
- west view: both split west basement walls plus the west stairwell side.

Direct pixel review confirms that the camera does not snap back after orbiting. The stair flights, hatch, landing, archive cover, grid and structural supports remain visible. No P0/P1 was introduced.

Remaining P2:

- some extreme angles can still be partially obscured by standable floor slabs or far-side silhouette walls;
- dynamic cutaway currently rebuilds primitive batches after material camera-direction changes rather than using per-instance visibility.

## Remaining gaps

- Complete support, collision, clearance and destination validation for all stairs, ladders, bridges and platforms.
- Building entry and return mechanics for embedded and independent interiors.
- Global ownership of every valid 5 ft tactical grid surface.
- Forced Ollama success, timeout, schema-rejection and rule-fallback source UI.
- Broader multi-prompt and multi-seed browser matrix.
- Bundle-size and dynamic-cutaway rebuild performance optimization.

Strict overall completion advances from approximately **87% to 88%**. The long-running Goal remains active.
