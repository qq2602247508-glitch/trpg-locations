# Round 19 — parent-owned mangrove building placement audit

## Change

Mangrove settlement buildings no longer use only the generic semantic terrain
placement stream. They are now placed from six deterministic tidal-spine
nodes, alternating sides of the channel, while retaining their independent
BuildingModule seeds and interiors.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round19-tidal-buildings`
- Scale/density: medium / 62%
- Diagnostic: 97/100, semantic coverage 100%, 18 routes, 28 rooms.
- Screenshot: `round-19-mangrove-parent-nodes.jpg`

## Self-check

- Buildings are visibly distributed along parent tidal nodes rather than
  forming one central pile.
- The scene still contains independent warehouses, tavern, tower and full
  interior modules.
- Water and mangrove cover remain visible between building groups.
- Remaining failure: the route graph still has a visually dominant central
  axis; parcel-access segments should be generated from nearby root-boardwalk
  waypoints in the next pass instead of using a fixed horizontal offset.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- Same Seed and varied Seed behavior remain deterministic/structural.
