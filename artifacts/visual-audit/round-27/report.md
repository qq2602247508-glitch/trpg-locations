# Round 27 — mangrove orthogonal root access audit

## Change

Key parent-root access routes now use an orthogonal dog-leg relay:

`root waypoint → aligned X/Z relay → building door`

This removes long diagonal access lines while preserving a real route graph.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round27-dogleg`
- View: orthographic planning top view
- Screenshot: `round-27-mangrove-dogleg-top.jpg`
- Diagnostic: 97/100, semantic coverage 100%, 22 routes, 29 rooms.

## Self-check

- Passed: long diagonal parent access lines are substantially reduced.
- Passed: routes remain valid and buildings remain independently generated.
- Remaining: a few short diagonal loop chords remain by design; the scene now
  reads as local root paths rather than one city-wide modern avenue.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.
