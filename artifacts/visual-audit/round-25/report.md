# Round 25 — mangrove bay-loop geometry audit

## Change

- Re-shaped the three mangrove root-boardwalk loops with distinct, non-collinear
  polygon vertices.
- Reduced the offset from key buildings to their parent tidal nodes.
- Kept ordinary buildings on local short root access while preserving key
  parent routes.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round25-bay-loops`
- View: orthographic planning top view
- Screenshot: `round-25-mangrove-bay-loops-top.jpg`
- Diagnostic: 97/100, semantic coverage 100%, 22 routes, 29 rooms.

## Self-check

- Passed: building placement and local access remain valid after loop reshaping.
- Passed: automated topology and reachability remain valid.
- Not passed: the overview still contains one dominant diagonal axis. The
  remaining cause is now isolated to the parent tidal-spine generator itself;
  loop vertices and local access offsets are no longer the primary cause.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.
