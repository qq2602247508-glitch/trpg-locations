# Round 17 — parent-terrain geometry and visual audit

## Scope

This round re-tested the three round-16 compound grammars after changing the
actual terrain atoms:

- hollow-tree city;
- mangrove smuggler port;
- floating salt-crystal monastery.

The changes were geometric, not metadata-only:

- bark segments became thicker tangential wall arcs with deliberate rotten gaps;
- the canopy became a seeded ring of upper crown masses;
- mangrove boardwalks became bent multi-segment routes and building population
  was reduced to preserve water readability;
- floating islands gained stepped ledges, thicker undersides and segmented
  suspension bridges whose height follows the island bands.

## Browser evidence

All images were generated in the local browser at `127.0.0.1:5241` and viewed
after saving.

### Hollow-tree city

- Prompt: `生长在一株巨大空心古树内部的魔法学者城市，有螺旋树干街道、枝干住宅、悬挂书库、树脂升降梯、根系档案库、树冠观测台和腐烂空洞危险区`
- Seed: `round16-hollow-tree-a`
- Scale/density: medium / 62%
- Diagnostic: 98/100, semantic coverage 100%, 15 routes, 36 rooms
- Evidence:
  - `hollow-tree-city-fixed-round17.jpg`
  - `hollow-tree-shell-round17.jpg`
- Passed: thicker enclosing bark geometry, interior settlement, vertical route,
  canopy level, root archive.
- Remaining: shell gaps are still visibly repeated wall segments; a closer
  section/ghost view is still needed to prove the rotten void as a natural
  opening rather than a missing segment.

### Mangrove smuggler port

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round16-mangrove-port-a`
- Scale/density: medium / 62%
- Diagnostic: 97/100, semantic coverage 100%, 18 routes, 28 rooms after
  terrain-preserving building cap.
- Evidence:
  - `mangrove-smuggler-port-fixed-round17.jpg`
- Passed: tidal pools/channels, denser mangrove crown, dock and independent
  building interiors remain present.
- Remaining: boardwalk growth is still too radial/orthogonal instead of
  following a branching tidal-root network; the white circular landmark remains
  visually ambiguous.

### Salt-crystal floating monastery

- Prompt: `漂浮在盐晶洞窟上方的修道院群，有三层盐晶浮岛、礼拜堂、僧侣居室、钟塔、悬索桥、盐雾花园和洞底潮池`
- Seed A: `round16-salt-monastery-a`
- Seed B: `round16-salt-monastery-b`
- Scale/density: medium / 62%
- Seed A evidence:
  - `salt-crystal-monastery-fixed-round17.jpg`
  - `salt-crystal-monastery-low-angle-round17.jpg`
- Seed B evidence:
  - `salt-crystal-monastery-seed-b-fixed-round17.jpg`
- Diagnostic: 96/100 on both seeds, semantic coverage 94%, 10 routes, 29 rooms.
- Measured variation: seed A is 290×260 ft / 572 primitives; seed B is
  300×250 ft / 551 primitives. Building placement and composition change while
  retaining three height bands.
- Passed: actual island undersides, stepped edges, segmented bridges, valid
  vertical route and measurable Seed variation.
- Remaining: cavern wall/ceiling and tide pool are not visually dominant in the
  normal overview; crystal landmarks need stronger shape contrast.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.

## Round-17 decision

The geometry changes are valid and materially improve the parent terrains, but
the round is not a final completion gate. Round 18 should add:

1. a branching root-boardwalk planner driven by tidal channel waypoints;
2. a close/ghost view for the hollow-tree shell and rotten void;
3. a cavern envelope and brighter crystal/tide-pool framing for floating sites;
4. dedicated visual regression images for those views before claiming completion.
