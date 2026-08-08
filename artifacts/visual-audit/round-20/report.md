# Round 20 — mangrove root-boardwalk access audit

## Change

Each mangrove building entrance now finds the nearest parent root-boardwalk
waypoint and emits a two-segment wooden access route:

`root waypoint → bent relay → building door`

This replaces the previous fixed horizontal offset and creates explicit route
records for the access paths.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round20-root-access`
- Screenshot: `round-20-mangrove-root-access.jpg`
- Diagnostic: 97/100, semantic coverage 100%, 33 routes, 28 rooms.

## Self-check

- Passed: every building access now has a parent root waypoint and a route
  record; the number of routes increases measurably.
- Passed: independent building modules remain present.
- Not passed: the overview still reads a dominant vertical axis because the
  main boardwalk and several root branches overlap in the camera projection.
  The next pass must plan local loops and cul-de-sacs around the water rather
  than adding more radial connectors.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.
