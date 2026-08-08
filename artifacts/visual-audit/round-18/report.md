# Round 18 — parent terrain route and depth audit

## Changes

- Replaced the mangrove single rectangular channel with a deterministic,
  rotated S-shaped tidal spine.
- Moved the salt cavern tide pool to a visible underground band and added
  low crystal/rock pool rims.
- Changed mangrove parcel access from pale stone roads to short wooden
  root-boardwalk connections.

## Browser evidence

### Mangrove smuggler port

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round18-mangrove-access`
- Evidence: `mangrove-smuggler-port-fixed-round17.jpg`,
  `round-18-mangrove-s-plain.jpg`, `round-18-mangrove-access.jpg`
- Diagnostic remains 97/100 and semantic coverage remains 100%.
- Passed: the main water body now has a curved segmented spine; mangrove
  canopy and wetland pools remain visible; building access uses wood.
- Not passed: boardwalks still converge into a radial center because parcel
  placement and boardwalk waypoints are not yet jointly planned around the
  tidal graph. The central pale circular landmark is still ambiguous.

### Salt-crystal monastery

- Prompt: `漂浮在盐晶洞窟上方的修道院群，有三层盐晶浮岛、礼拜堂、僧侣居室、钟塔、悬索桥、盐雾花园和洞底潮池`
- Seed: `round18-salt-pool`
- Evidence: `round-18-salt-pool.jpg`
- Diagnostic remains 96/100 and semantic coverage remains 94%.
- Passed: floating island bodies, undersides, segmented bridges and three
  height bands remain valid after the depth change.
- Not passed: the tide pool is still not dominant in the overview camera; a
  dedicated cavern-envelope camera/geometry pass is still required.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.

## Next round

The next structural task is a parent-owned route graph for mangrove sites:
buildings should attach to tidal waypoints and root branches, not independently
to the settlement parcel graph. Salt sites need a camera-visible cavern shell
and explicit pool framing.
