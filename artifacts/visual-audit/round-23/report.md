# Round 23 — mangrove top-view route audit

## Change

Parent-root access was restricted to the first three key harbor buildings and a
small number of full-interior sites. Other buildings use local short access
segments, keeping the parent route graph from becoming a city-wide road.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round23-key-root-sites`
- View: orthographic planning top view
- Screenshot: `round-23-mangrove-top.jpg`
- Diagnostic: 97/100, semantic coverage 100%, 22 routes, 26 rooms.

## Self-check

- Passed: key structures retain parent-root connections; ordinary buildings no
  longer all receive long parent routes.
- Passed: the scene remains deterministic and valid.
- Not passed: the main route still reads as a diagonal axis in top view. This
  is now identified as a parent tidal-spine planning problem, not an access
  count problem. The next pass must replace the single S spine with multiple
  offset water bays and branch-specific local loops.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.
