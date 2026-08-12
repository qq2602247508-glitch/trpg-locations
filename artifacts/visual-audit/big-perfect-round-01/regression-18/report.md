# Regression 18 · Building Entry and Return Session Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 89%.
- Baseline commit: `f1ddc85 feat: expose local planning outcomes`.
- Baseline gates: 299/299 tests, production build passed, no known P0/P1 in regression-17.

## Target

Upgrade building focus from a one-way filter into an explicit entry/return session that supports:

- authored full-interior buildings;
- facade and mass buildings with on-demand interior instances;
- exact return to the pre-entry settlement context;
- invalidation when a new scene is generated.

## Root cause

The previous return button called `setBuildingFocus()` without an ID and then forced the floor control to `roof`. It discarded:

- the prior numeric or cutaway floor;
- low-angle or top-camera state;
- building transparency;
- the user's perspective camera position and target.

It therefore exited the building filter but did not restore the place from which the user entered.

## Fix

- Added an immutable `SceneViewSnapshot` containing:
  - floor view;
  - perspective or top camera mode;
  - transparency state;
  - perspective camera position and target;
  - near and far clipping planes.
- Added renderer-level `captureSceneView()` and atomic `restoreSceneView()`.
- Return now:
  - removes building filtering;
  - rebuilds complete settlement context;
  - restores the original floor and transparency;
  - restores the exact perspective camera and target, or recomputes the complete top view;
  - synchronizes low/top/transparency UI controls.
- Added a UI building-entry session that stores one pre-entry snapshot.
- Generating a new scene clears the old session, preventing cross-Seed return.
- Updated visible controls to `进入内部` and `返回原场景`.
- Added a read-only view audit hook for browser regression evidence.

## Automated verification

- Full Vitest suite: **301/301 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Session tests prove:
  - camera and target coordinates are deeply copied;
  - B1, transparency, camera mode and clipping values are retained;
  - top-view mode is retained independently from perspective coordinates.

The production build still reports chunks larger than 500 kB.

## Token-efficient tools

- RTK: full tests, build and Git checks.
- `token-ast-grep`: structural verification of the single restore call and renderer-level restore method.
- `token-repomix`: strict four-file whitelist, **5,294 tokens**, below the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,267 real tokens**:
  - prompt: 3,759;
  - completion: 3,508.
- Promptfoo is quality evidence only; no token-saving claim was recorded.

## Browser evidence

Deterministic scene:

- prompt: tidal mangrove alchemist port village with root bridges, tree laboratory, distillation tower, flooded archive and submerged greenhouse;
- seed: `browser-r18-entry`;
- size: large;
- density: 0.72;
- 16 building instances.

### Full-interior entry

Building:

- `settlement-building-1`;
- `detailLevel: full-interior`.

Pre-entry:

- B1;
- transparency enabled;
- low perspective camera enabled.

Result:

- interior view shows the selected building's basement, stairs, tactical grid and local fixtures;
- return restores floor, transparency, camera mode, camera position, target and clipping planes;
- numeric restoration is exact within `1e-9`;
- status changes from `已进入建筑内部` to `已返回原场景`.

Evidence:

- `full-interior-before-entry.png`
- `full-interior-entered.png`
- `full-interior-returned.png`

### Facade / on-demand instance entry

Building:

- `settlement-building-13`;
- `detailLevel: facade`.

Pre-entry:

- cutaway floor mode;
- top camera;
- solid building shell.

Result:

- entry displays the generated on-demand internal rooms, stairs and tactical grid;
- return restores the complete top-down settlement, cutaway floor and solid-shell state;
- before/after screenshots show the same user-visible settlement framing.

Evidence:

- `facade-before-entry.png`
- `facade-entered.png`
- `facade-returned.png`

### Session invalidation

After entering a building, generating `browser-r18-new-scene` clears the prior session. Pressing return afterward does not restore the previous Seed or camera context.

All audited scenes remained valid. No P0/P1 was found.

## Remaining gaps

- Complete support, collision, clearance and destination validation for all vertical movement structures.
- Global ownership of every valid 5 ft grid surface.
- Broader multi-prompt and multi-seed browser matrix.
- Bundle-size and dynamic-cutaway rebuild performance optimization.

Strict overall completion advances from approximately **89% to 90%**. The long-running Goal remains active.
