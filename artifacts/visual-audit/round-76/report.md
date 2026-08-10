# Round 76 — Natural parent + embedded building audit

## Target prompt

建在潮汐洞穴群中的古老修道院，退潮时出现石路，涨潮时部分区域被淹，有海蚀礼拜堂、僧侣居室、钟塔、藏经洞、潮池庭院和悬崖逃生梯

- Seed: `tidal-cave-monastery-76`
- Size: large
- Density: 78%
- Grid: 5 ft per cell
- Result: 8-node cave graph, 3 full-interior building instances, 4 observation layers, 20 routes, 455 primitives, 99/100 diagnostics, 100% semantic coverage

## Generic unfamiliar prompt

潮汐海蚀洞中的废弃气象观测站，有潮池、盐风侵蚀的仪器室、地下避难库、岩架维修梯和退潮时可走的石脊

- Seed: `strange-cave-weather-station`
- Size: large
- Density: 70%
- Result: cave parent retained, one full-interior tower/observation building embedded, 7-node cave graph, 4 observation layers, 16 routes, 325 primitives, 99/100 diagnostics, 100% semantic coverage

## Visual evidence

| View | File | Result |
|---|---|---|
| Target overall perspective | `target-final.png` | Cave chambers and natural walls remain the macro structure; chapel, quarters and bell tower appear as separate embedded masses. |
| Target focused chapel interior | `chapel-interior-fixed.png` | Real walls, floor, partition, altar/fixtures, stair and basement-ready interior are visible. |
| Target low angle | `low-angle-fixed.png` | Cave wall height, building roofs and parent/child elevation relationship are visible. |
| Target changed Seed | `target-seed-b.png` | Same semantic composition, different chamber arrangement and building placement. |
| Unfamiliar cave station overall | `strange-weather-station-overview.png` | Unknown cave + facility combination retains cave topology and produces a separate tower/observation child. |
| Unfamiliar cave station interior | `strange-weather-station-interior.png` | Independent interior geometry and vertical route are present. |

## Variation evidence

The same monastery prompt with Seed `tidal-cave-monastery-76-b` produced a different
title, chamber arrangement, building positions, and primitive count (471 versus 455)
while retaining the same cave grammar and three building roles.

## Self-review

- Parent ownership: passed. Named cave/tidal context no longer falls back to settlement or a generic building.
- Child ownership: passed. Monastery and unfamiliar weather-station buildings are separate `BuildingInstance` modules.
- Semantic geometry: passed for both prompts; composition coverage is 100%.
- Same Seed determinism: passed by automated regression and browser re-generation.
- Changed Seed variation: passed; target Seed B changes chamber layout and building positions.
- Topology: passed; cave graph remains connected and embedded buildings are connected to their chamber rooms.
- Vertical layers: passed; building floors/B1 are exposed as four renderer observation layers.
- Remaining visual limitation: the overview camera intentionally frames the full cave graph, so individual building interiors are small until the user selects “聚焦内部”. This is an LOD/readability trade-off, not a missing-geometry failure.
