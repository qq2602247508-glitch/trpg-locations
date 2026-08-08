# Round 09 visual audit — building semantics, layer isolation, and fallback removal

Date: 2026-08-08

All captures use the real Vite browser application at `127.0.0.1:5241`, adaptive prototype, medium scale, 62% density. Every final capture below reported `校验通过` in the UI. Earlier failed/intermediate captures remain in `round-09/` as regression evidence and are not counted as passes.

## Required prompt matrix

| # | Prompt | Seed | Evidence | Passed | Remaining observation |
|---|---|---|---|---|---|
| 1 | D&D 三层法师塔，真正的螺旋楼梯连接三层，底层炼金实验室，中层藏书室，顶层观星台和屋顶决战平台。 | `wizard-audit-09` | `wizard-1f-final.png`, `wizard-2f-final.png`, `wizard-3f-roofsplit.png`, `wizard-roof-final.png` | Three distinct floors; 18-step continuous spiral per flight; laboratory/library/observatory geometry; roof separated from top-storey inspection | Cut overview remains visually dense when every floor grid is shown together |
| 2 | D&D 庄园宅邸，有不规则中央庭院、主楼、东西侧翼、仆从通道、家族墓穴和屋顶伏击点。 | `manor-seed-a`, `manor-seed-b` | `manor-seed-a.png`, `manor-seed-b.png` | Asymmetric room union; courtyard, wings, service route, roof, B1 separated; seeds visibly move/resize/swap wings | Exterior architectural detail is still deliberately low-poly |
| 3 | D&D 山地堡垒，有城门杀伤区、角塔、墙头通道、内堡和地下军械库。 | `fortress-audit-09` | `fortress-split-overview.png`, `fortress-wallwalk-final.png`, `fortress-armory-final.png` | Gate kill zone, four bastions, keep, elevated wall walk, stair route, isolated B1 armory with racks/crates | Isolated wall-walk view is sparse because it intentionally hides the ground level |
| 4 | D&D 破败神殿，中央圣坛、两侧祷告室、地下墓室、钟楼高台和秘密祭司通道。 | `temple-audit-09` | `temple-overview.png` | Cruciform nave, two prayer rooms, altar/vestry, bell platform and below-grade crypt are real rooms and connections | Ruin damage vocabulary needs a later geometry pass |
| 5 | COC 1920 年代警察局，两层，前台、开放办公区、审讯室、档案室、拘留区、证物库和后巷押送入口。 | `police-audit-09` | `police-detailed-overview.png`, `police-detailed-1f.png`, `police-detailed-2f.png`, `police-detailed-b1.png` | Every requested function is a separate room; rear sally port; two different above-ground plans; isolated evidence-vault B1 | Furniture remains schematic rather than period-authentic asset art |
| 6 | COC 海边精神病院，主楼、两侧病房翼楼、治疗室、地下锅炉房、封闭庭院和秘密实验室。 | `asylum-audit-09` | `asylum-detailed-overview.png`, `asylum-detailed-1f.png`, `asylum-detailed-2f.png`, `asylum-detailed-b1.png` | Separate clinical wings, treatment/restraint room, morgue, enclosed court, upper wards/research and isolated boiler/lab B1 with machinery | Coastal exterior dressing is not yet represented by terrain around the building |
| 7 | 现实废弃工业区，有三栋高低不同的厂房、锅炉车间、锈蚀管道、输送桥、积水坑、维护猫道和可攀爬平台。 | `industrial-audit-09` | `industrial-opaque-overview.png`, `industrial-opaque-low-angle.png` | Three measured height bands; solid (not accidental ghost) factories; conveyor, pipe rack, flooded pit and real catwalk stair | Factory interiors need denser machinery clusters |
| 8 | 被巨树贯穿的炼金塔，断裂楼层、悬桥、地下温室和树冠战斗平台。 | `tree-tower-audit-09` | `tree-tower-final-overview.png`, `tree-tower-top-floor.png`, `tree-tower-b1.png` | Tree pierces authored openings; spiral circulation, bridge, climb support, standable canopy and isolated B1 greenhouse all validate | Overall cut view still has the stacked-floor visual density noted above |
| 9 | 临海灯塔，螺旋交通、储藏层、守塔人住所、灯室和外部维护平台。 | `lighthouse-audit-09` | `lighthouse-cut-roofsplit.png`, `lighthouse-lamp-floor-final.png`, `lighthouse-roof-final.png` | No longer falls back to a rectangular civic building; round five-level tower, continuous spiral, dedicated uses, lamp and maintenance gallery | Gallery silhouette is clearest in roof/floor view, not the all-floor cut |
| 10 | 哥特式博物馆，中央展厅、两翼展馆、地下藏品库、员工通道、玻璃穹顶和屋顶追逐路线。 | `museum-audit-09` | `museum-final-overview.png`, `museum-glass-dome-final.png` | Central arrival, separate exhibition wings, staff route, isolated vault, reachable roof and real scaled sphere dome | Gothic ornament remains abstract low-poly geometry |

## Unknown-combination audit

Prompt: `COC 1920年代山顶气象修道院，有环形回廊、无线电室、档案密库、屋顶天线平台和地下防空洞。`

- Seed: `weather-monastery`
- Evidence: `unknown-weather-monastery-overview-final.png`, `unknown-weather-monastery-roof-final.png`, `unknown-weather-monastery-b1.png`
- Pass: classified as a building without a dedicated named archetype; produced a chapel/refectory, cloister/archive wing, radio/weather wing, enclosed cloister, scriptorium, wireless observation room, antenna roof and isolated air-raid shelter.
- This uses composable subject/form/function/vertical tags and the common room-graph compiler, not a one-off full-scene template.

## Defects found and fixed during this round

1. Lighthouse was routed to the rectangular fallback. It now routes to the tower grammar with lighthouse-specific program and geometry.
2. Instanced rendering encoded `ghost/solid` in the batch key but ignored it when choosing material. Natural/industrial buildings were therefore always transparent. The batch now carries the resolved material mode.
3. Numeric top-floor views included opaque roof platforms and hid rooms. Roof-platform geometry now lives in the roof inspection layer, except true wall walks.
4. Roof and upper-floor camera targeting stayed at ground height. Per-layer bounds now control target and distance.
5. Basement layers shared logical indices with roofs/high platforms, and the global ground plane hid them. Composed buildings now have labelled independent `屋顶` and `B1` layers; B1 hides the global ground and focuses its own bounds.
6. Police and asylum functions were combined into macro rooms. They are now independent rooms with explicit connection graphs and dedicated fixtures.
7. Giant-tree greenhouse and canopy routes lacked isolated B1 inspection and climb support. Both are now explicit and pass route validation.
8. Same-seed replay remains identical; two manor seeds now alter wing order, room positions, dimensions and route geometry.

## Automated evidence

- `npm run check`: 132/132 tests passed after this round.
- `npm run build`: passed.
- New regression coverage checks lighthouse routing/spirals, industrial height bands and catwalk access, giant-tree B1 isolation, unfamiliar mixed-use composition, and structural seed variance.

