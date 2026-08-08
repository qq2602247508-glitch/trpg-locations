# Round 10 building visual audit

Date: 2026-08-08

Baseline: `50c83e7 feat: isolate architectural layers and expand building programs`

Final audit settings unless stated otherwise: size `medium`, density `62%`, deterministic prompt-specific seed, adaptive prototype. Every mandatory prompt was generated in the real browser and captured as `overall.png`, `1f.png`, `upper.png`, `b1.png`, `roof.png`, and `low.png` under its numbered directory.

## Audit workflow and corrections

1. Captured the pre-change baseline and identified generic institution fallback, stacked grid interference, giant diagonal stairs, missing exterior massing, metadata-only theme features, and the lack of a sloped roof primitive.
2. Added stateful BuildingProgram massing, exterior spaces, specialist fixtures, dedicated academy/station/power/hospitality programs, compact stairs, and solid/ghost/low-camera review modes.
3. Replayed all 12 prompts with their fixed seeds and inspected the images, not only the diagnostics.
4. Visual inspection found that seven four-level programs had initially captured level value `2` as B1 even though their actual B1 selector value was `3`. Those seven B1 images were regenerated with the correct level and re-inspected.
5. Side-by-side seed inspection found that academy changes were semantically mirrored but visually symmetric, while police variation was initially negligible. Academy wings/towers were staggered and police secure/service wings now swap sides. A route that crossed a tower after mirroring was found by validation and repaired.
6. Side-by-side hospitality inspection found tavern and hotel shared the same footprint. They now use different bounds, public-room proportions, guest-room grids, service positions, roof routes, and rear-yard logic. A row-wrap corridor regression was found by validation and repaired.
7. Added a validated `gable` triangular-prism primitive to the shared scene contract and Three.js renderer. Church, academy, tavern and hotel massing now uses actual pitched roof geometry instead of stacked flat plates, then received a second browser screenshot pass.

## Mandatory prompt matrix

| # | Prompt | Seed | Result | Main passes | Remaining visual limitations |
|---|---|---|---|---|---|
| 1 | 破败哥特式教堂，十字形中殿、两侧祷告室、坍塌耳堂、钟楼、地下墓室和临时木桥。 | `r10-church-01` | Pass | Cross-shaped room graph, separate transepts, nave pews, altar, crypt coffins, bell tower, collapse rubble, temporary bridge and intersecting pitched gables are geometry. | Buttresses and window tracery are still simplified. |
| 2 | D&D 法师学院，中央讲堂、两座研究塔、炼金翼、图书馆、地下召唤室、屋顶连桥和秘密教授通道。 | `r10-academy-01` | Pass with limitations | Separate specialist rooms, two tower masses, instruments, roof bridge, secret route and B1 ritual dais. | B1 stair occupies too much of the single ritual room; facade remains low-poly. |
| 3 | D&D 城门要塞，外门、瓮城杀伤区、双塔、墙头路线、内部门厅、军械库和地下逃生道。 | `r10-fortress-01` | Pass with limitations | Continuous curtain walls, gate opening, portcullis, kill approach, ditch, four bastions, battlements, wall walks, keep and armory. | Gatehouse/keep silhouette is still visually blocky; machicolations and arrow-slit detail remain absent. |
| 4 | D&D 三层酒馆旅店，一层酒馆与厨房、二层客房、三层阁楼、后院马厩、酒窖和屋顶追逐路线。 | `r10-tavern-01` | Pass | Irregular compact inn, taproom tables, distinct public/service rooms, two guest levels, cellar, stable, pitched public-room roofs and roof route. | Furniture set remains deliberately simple; upper-storey roof articulation needs more dormers. |
| 5 | COC 1920年代市警察局，接待区、开放办公区、局长办公室、审讯室、档案室、拘留区、证物库、车库和后巷押送入口。 | `r10-police-01` | Pass | Every requested function is an independent room; cell bars, counters, tables, evidence shelves, vehicle, rear sally port and B1 annex are visible geometry. | Street facade lacks period-specific brick/signage detail; upper massing is still austere. |
| 6 | COC 海崖精神病院，主楼、两侧病房、治疗翼、封闭庭院、地下锅炉房、秘密手术室和悬崖维护道路。 | `r10-asylum-01` | Pass with limitations | Two wards, therapeutic court, treatment/morgue, upper isolation wing, separate boiler/surgery rooms and cliff road/drop. | Exterior still reads as a simplified institutional compound; secret surgery needs richer equipment variety. |
| 7 | 1920年代豪华酒店，大堂、餐厅、宴会厅、厨房、员工通道、不同客房层、地下锅炉房和屋顶追逐路线。 | `r10-hotel-01` | Pass with limitations | Broad urban plan distinct from tavern, separate public halls, rear service spine, long guest-room floors, garage, cellar and roof circuit. | Grand-lobby/ballroom decoration and period facade are sparse. |
| 8 | 废弃发电站，涡轮大厅、控制室、锅炉区、输送桥、维护猫道、地下电缆层和被淹设备坑。 | `r10-power-01` | Pass | Industrial hall grammar, turbines, boilers, control bank, stacks, tanks, conveyor, catwalk, cable level, flood water and alternate route. | Pipe networks and structural trusses remain under-detailed. |
| 9 | 阿弗纳斯地狱堡垒，黑铁城门、战争机器车间、熔岩沟、锁链升降台、城墙战道、囚笼区和恶魔仪式核心。 | `r10-hell-01` | Pass with limitations | Fortress topology plus lava trenches, vertical chains, foundry, cage yard, lift, wall walks and B1 ritual core. | Infernal machinery and ritual fixtures are readable but still abstract geometric props. |
| 10 | 被洪水淹没的博物馆，中央展厅、两翼展馆、半淹地下库房、员工通道、破裂玻璃穹顶和屋顶逃生路线。 | `r10-museum-01` | Pass with limitations | Central/wing galleries, cases, staff route, flooded vault, shattered dome pieces and reachable roof. | Gothic exterior identity remains weaker than the interior museum identity. |
| 11 | 山顶无线电修道院与气象观测站，环形回廊、礼拜堂、无线电室、档案密库、地下防空洞、屋顶天线和外部维护栈道。 | `r10-monastery-01` | Pass with limitations | Unknown mixed prompt composes cloister, chapel, radio/weather room, archive, bunker, antenna and maintenance platform without default-box fallback. | It inherits part of the institution massing family and needs a dedicated mountain-base terrain transition. |
| 12 | 建在旧火车站里的炼金公会，有站台大厅、实验车间、档案车厢、地下货运隧道、钟楼和屋顶输送桥。 | `r10-guild-01` | Pass with limitations | Dedicated linear station grammar, two platforms/track bed, alchemy lab, archive railcar, clock tower, roof conveyor and freight tunnel. | Tunnel furnishing and station canopy detail remain sparse. |

## Seed and determinism checks

- Exact-seed replay: all fixed-seed scenes reproduced their room graph and passed validation; the automated suite also covers deterministic generation.
- Academy alternative seed: `r10-academy-variant-2` visibly swaps the long/narrow specialist wings and staggers opposite tower positions.
- Tavern alternative seed: `r10-tavern-alt-77` moves the service/stable side and changes the visible compound footprint.
- Police alternative seed: `r10-police-alt-77` swaps the records/interview wing with the detention/sally-port/garage wing.
- Unknown combinations: prompts 11 and 12 both produced composed programs rather than the generic wilderness or rectangular-shell fallback.

## Automated verification

- `npm run check`: 9 test files, 135/135 tests passed.
- `npm run build`: production build passed.
- `git diff --check`: passed.
- Vite reports only the existing chunk-size advisory for `SceneRenderer` (>500 kB); it is not a build failure.

## Overall judgement

Round 10 materially improves architecture semantics and tactical readability: real specialist rooms, independent basement geometry, compact local vertical circulation, roof routes, exterior approach spaces, state-driven destruction/flood/lava geometry, true pitched gable prisms, and visible seed-dependent layouts are present. It is now a much stronger procedural architecture prototype, but it is not a finished high-detail architectural renderer. The largest remaining gaps are richer compound/dormer roof meshes, period-specific facades, denser bespoke furnishing for some basements, and more sophisticated multi-flight/spiral stairs for deep level changes.
