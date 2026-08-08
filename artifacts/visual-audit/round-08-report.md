# Round 08 architectural visual audit

All browser captures below were generated from the running app on `127.0.0.1:5241` with the prompt and seed shown.

| Prompt | Seed | Size / density | View | Result |
|---|---|---|---|---|
| D&D 山地堡垒，有城门杀伤区、角塔、墙头通道、内堡和地下军械库 | `fortress-regression-01` | medium / 62% | cut overview | 230×190 ft, 2 levels, 66 primitives, 98/100; outer curtain walls, gate kill zone, four bastions and wall walks are real geometry |
| COC 1920 年代警察局，两层，前台、开放办公区、审讯室、档案室、拘留区、证物库和后巷押送入口 | `police-audit-1920` | medium / 62% | cut overview + 1F | 200×190 ft, 3 inspection layers, 68 primitives, 100/100; wings, courtyard, evidence cages, partitions and below-grade vault route |
| COC 海边精神病院，主楼、两侧病房翼楼、治疗室、地下锅炉房、封闭庭院和秘密实验室 | `asylum-audit-02` | medium / 62% | cut overview | 200×190 ft, 3 layers, 83 primitives, 100/100; ward wings, therapeutic court, beds, autopsy/plant and basement route |
| 被巨树贯穿的炼金塔，断裂楼层、悬桥、地下温室和树冠战斗平台 | `tree-alchemy-audit` | medium / 62% | cut overview | 70×70 ft, 5 floors, 268 primitives, 100/100; locally classified as tower, true vertical trunk, floor openings, canopy platform, bridge and subterranean greenhouse |

## Iteration findings

- Basement rooms previously shared the ground inspection layer and appeared as detached blocks. `BuildingProgram` now supports an absolute below-grade elevation while preserving a separate inspection level; stairs compare real Y coordinates rather than numeric level indices.
- Fortress programs now add a continuous curtain-wall perimeter, four corner bastions, wall-walk slabs, portcullis and explicit high-ground geometry.
- Museum programs now receive a real glass-dome and parapet roof structure.
- Unknown “alchemy tower + giant tree + underground greenhouse” is no longer sent to a generic wilderness fallback: the local classifier routes it to the tower grammar and composes the requested vertical features.
- The worker only calls Ollama for genuinely unresolved semantic combinations. Known architectural prompts now return in a few milliseconds; the unknown combination is still deterministic and schema-constrained.

## Remaining visual caveat

The current cutaway renderer intentionally uses ghost materials for architectural shells and slabs. In the overview this can look dense at the default camera; the per-floor view remains the authoritative tactical inspection view. Geometry and topology validation pass for all captures above.
