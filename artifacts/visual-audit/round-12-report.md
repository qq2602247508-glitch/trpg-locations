# Round 12 城市形态与建筑 LOD 视觉审计

日期：2026-08-08  
基线：`89f66ec test: record round eleven site visual audit`  
网格合同：1 格 = 5 英尺 = 1.524 米

## 结论

本轮已把聚落生成从“道路附近随机散布体块”改为可审计的：

自然约束 → 锚点 → 分级道路 → 路口节点 → 道路围合街区 → 临街地块 → 退界与入口 → 独立建筑模块 → 建筑外部路线。

严格顶视图已能读出道路、路口、街区、地块和建筑朝向；规划分层可以分别查看道路、道路与地块、建筑轮廓。大量 mass/facade 建筑不再退化为单一长方体，三种 LOD 使用同一个 `BuildingEnvelopeProgram` 签名和体块布局。

本轮没有达到“所有城市形态都已成品级”的结论。仍然明确未通过：

- 港区、COC 海滨小镇和一般城市仍共享较多正交街道语法；
- 山坡贵族区以梯田表达高差，但道路仍是分段直线网络，不是真正沿等高线的曲线道路；
- full-interior 会消费相同 envelope 并补齐附属体块，但主内部壳体尚未做到与 facade/mass 每一条外边界严格一一同构；
- 任意多边形道路/建筑碰撞仍缺少统一 SAT 校验器，目前依靠街区、地块和退界约束防止穿越；
- Vite 的 `SceneRenderer` 产物仍有 560.74 kB，超过 500 kB 警告线；
- 城镇远景建筑的房间内部仍只在 full-interior LOD 生成，facade/mass 只保留外轮廓与主题立面，这是性能策略，不是缺失完整内部。

## 架构改动

### SiteProgram

- 新增道路节点 `RoadNodeProgram`，道路记录连接节点；
- 新增 `BlockProgram`，街区由道路间隔和场地边界派生；
- 地块从街区切分，并记录 `blockId`、临街道路、建筑占地与入口；
- 道路层级扩展为主路、普通街、小巷、步道、码头路、桥、铁路、高架和维护路；
- 新增路口数、街区数、平均地块面积、开放空间率、建筑覆盖率等审计指标；
- 规模改变场地边界、路网、街区和建筑数量；密度改变道路图、地块切分和 LOD 人口；Seed 改变道路间距、街区与建筑布局。

### BuildingEnvelopeProgram

- mass / facade / full-interior 共用相同 Seed、占地、主要体块、入口、层数、屋顶和状态；
- 每种建筑至少由两个体块构成；
- 住宅、酒馆、神殿、庄园、塔楼、仓库、工厂、公会/诊所使用不同体块语法；
- facade 保留门、窗、雨棚、烟囱、装卸台、磨轮等用途设施；
- mass 保留复合轮廓和屋顶，只省略小立面细节；
- full-interior 在相同 envelope 上增加真实房间、墙、门、楼层、地下层和路线；
- 建筑状态会改变几何：废弃体块收损并生成瓦砾，临时改造增加路障。

### Renderer 与审计视图

- 真正的 `OrthographicCamera` 正交顶视图；
- 顶视图自动适配场地边界；数值楼层按该层可见几何重新聚焦；
- “仅道路 / 道路与地块 / 建筑轮廓”规划分层；
- 聚落底板不再铺强烈全场网格，网格只跟随道路、平台、桥和可站立表面；
- 相邻地块和街区使用低对比层次，建筑轮廓和道路保持更高可读性；
- 修复旋转物体 AABB 取景误差；
- 建筑楼层剖切减少多层网格叠加。

## 修改前基线

用户给出的 Round 11 混乱顶视图：道路、高架、铁路与建筑互相穿插，街区和地块不可读。

![Round 11 confusing top](./round-12/baseline/user-confusing-top.png)

正式修改前浏览器透视图：

![Round 12 baseline perspective](./round-12/baseline/industrial-perspective-before.png)

## 规划分层验收

固定提示：深水城港区，有弯曲海岸、六码头、沿岸货运大道、仓储街区、鱼市广场、沿港巷、公会大厅、神殿、巡逻塔和屋顶走私路线。  
Seed：`r12-harbor-fixed`；规模：large；密度：78%。

### 仅道路

![Harbor roads](./round-12/01-harbor/roads-only.png)

通过：主横路、次横路、纵向连接路和路口节点可辨；没有建筑掉在道路中央；不同道路连续。  
未通过：沿岸货运大道只体现为轻微弯曲，港区的巷网仍过于规则。

### 道路与地块

![Harbor parcels](./round-12/01-harbor/roads-blocks-parcels.png)

通过：街区由道路围合；地块位于街区内部；地块拥有临街边；转角和普通地块宽度不同。  
未通过：地块仍以正交矩形为主，尚未支持任意海岸多边形切地。

### 建筑轮廓

![Harbor outlines](./round-12/01-harbor/building-outlines.png)

通过：建筑朝向道路；可看到 L/T/翼楼/塔楼/跨间轮廓；不再普遍是单盒；道路和建筑轮廓可以分开审计。  
未通过：同一种住宅/仓库在远景 LOD 的变体数量仍有限。

## 十个强制场景

| 场景 | Seed / 规模 / 密度 | 视觉结论 | 性能读数 |
|---|---|---|---|
| 深水城港区 | `r12-harbor-fixed` / large / 78% | 港岸、码头、货运路、仓储带和临街地块可读；道路仍偏正交 | 449 图元，95 draw calls，60 FPS |
| 河桥边境村庄 | `r12-village-fixed` / medium / 58% | 木墙、疏松道路、村庄锚点、农田果园与独立建筑可读；不是缩小棋盘城 | 163 图元，22 draw calls，60 FPS |
| COC 海滨小镇 | `r12-coc-coast-fixed` / medium / 70% | 公共建筑与住宅街区可读；与奇幻港区的道路语法差异仍不足 | 255 图元，39 draw calls，60 FPS |
| 1920s 工业街区 | `r12-industrial-fixed` / medium / 68% | 铁路在边缘，厂区与装卸关系、输送桥和地下维护层可见 | 284 图元，73 draw calls，60 FPS |
| 中世纪城门街区 | `r12-gate-fixed` / large / 72% | 城门、双塔、直线杀伤区和市场主路存在；街区外围仍偏空 | 447 图元，80 draw calls，60 FPS |
| 河道水城 | `r12-water-city-fixed` / large / 74% | 主运河、支流、桥和避让河道的地块可读；河岸地块仍较规则 | 359 图元，107 draw calls，61 FPS |
| 山坡贵族区 | `r12-hillside-fixed` / large / 62% | 梯田高差、庄园与上下层商业带可辨；等高线道路未完全达标 | 236 图元，79 draw calls，60 FPS |
| 战损街区 | `r12-war-fixed` / medium / 76% | 瓦砾、路障、断损体块、绕行路线真实改变几何 | 350 图元，72 draw calls，60 FPS |
| 垂直贫民街区 | `r12-vertical-fixed` / medium / 82% | 巨型桥墩、三层平台、吊桥、梯子、水池和桥下维修层形成独立空间语法 | 360 图元，73 draw calls，60 FPS |
| 火星殖民港 | `r12-mars-fixed` / large / 66% | 气闸、控制塔、温室、栈道和地下生命维持层存在；平面路网仍接近工业区 | 415 图元，75 draw calls，61 FPS |

代表图：

![Harbor perspective](./round-12/01-harbor/perspective.png)

![Village perspective](./round-12/02-village/perspective.png)

![COC coast top](./round-12/03-coc-coast/top.png)

![Industrial perspective](./round-12/04-industrial/perspective.png)

![Water city top](./round-12/06-water-city/top.png)

![Hillside top](./round-12/07-hillside-nobles/top.png)

![War damaged](./round-12/08-war-damage/perspective.png)

![Vertical slum low](./round-12/09-vertical-slum/low.png)

![Mars port](./round-12/10-mars-port/perspective.png)

## 楼层检查

同一港区核心建筑的 1F、主要上层、B1、屋顶：

![Harbor 1F](./round-12/01-harbor/core-1f.png)

![Harbor upper](./round-12/01-harbor/core-upper.png)

![Harbor B1](./round-12/01-harbor/core-b1.png)

![Harbor roof](./round-12/01-harbor/roof.png)

通过：数值楼层使用当前层几何自动聚焦；B1 房间、入口/楼梯核、上层和屋顶桥均为真实几何。  
未通过：只有 full-interior 地标拥有全部楼层；上层房间组织仍比独立单体建筑生成器简单。

## 规模、密度和随机性

### 视觉对照

港区 small / 30%：

![Harbor small](./round-12/01-harbor/scale-small/top.png)

港区 large / 88%：

![Harbor large](./round-12/01-harbor/scale-large/top.png)

港区换 Seed：

![Harbor alternate seed](./round-12/01-harbor/seed-alt/top.png)

结论：规模会显著改变边界和街区数；密度改变道路、地块和建筑数量；换 Seed 会改变路距、街区宽度、地块和建筑排列，不只是换颜色。相同 Seed 的自动确定性回归通过。

### 27 组自动矩阵

LOD 列顺序为 full / facade / mass。

| scene | size | density | bounds | road cells | junctions | blocks | parcels | buildings | coverage | LOD | avg parcel | open ratio | rooms | routes | primitives | valid |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| harbor | small | 28 | 51x37 | 121 | 1 | 4 | 10 | 10 | .139 | 1/4/5 | 43.3 | .171 | 15 | 13 | 135 | PASS |
| harbor | small | 62 | 51x37 | 146 | 2 | 6 | 10 | 10 | .110 | 1/4/5 | 35.0 | .171 | 15 | 14 | 138 | PASS |
| harbor | small | 94 | 51x37 | 146 | 2 | 6 | 11 | 11 | .110 | 1/4/6 | 31.9 | .171 | 16 | 14 | 144 | PASS |
| harbor | medium | 28 | 69x54 | 174 | 1 | 4 | 14 | 14 | .169 | 3/5/6 | 74.0 | .104 | 27 | 19 | 206 | PASS |
| harbor | medium | 62 | 69x54 | 283 | 4 | 9 | 23 | 23 | .140 | 3/8/12 | 39.0 | .104 | 36 | 21 | 292 | PASS |
| harbor | medium | 94 | 69x54 | 325 | 6 | 12 | 22 | 22 | .144 | 3/8/11 | 40.9 | .104 | 35 | 22 | 293 | PASS |
| harbor | large | 28 | 100x77 | 422 | 4 | 9 | 23 | 23 | .116 | 4/8/11 | 66.4 | .064 | 40 | 24 | 325 | PASS |
| harbor | large | 62 | 100x77 | 585 | 9 | 16 | 32 | 32 | .173 | 4/12/16 | 69.2 | .064 | 49 | 26 | 414 | PASS |
| harbor | large | 94 | 100x77 | 748 | 16 | 25 | 41 | 41 | .125 | 4/15/22 | 39.9 | .064 | 58 | 28 | 510 | PASS |
| village | small | 28 | 30x26 | 53 | 1 | 5 | 5 | 5 | .107 | 1/2/2 | 35.0 | .172 | 10 | 6 | 98 | PASS |
| village | small | 62 | 30x26 | 53 | 1 | 5 | 5 | 5 | .107 | 1/2/2 | 35.0 | .172 | 10 | 6 | 98 | PASS |
| village | small | 94 | 30x26 | 88 | 2 | 5 | 5 | 5 | .106 | 1/2/2 | 34.6 | .172 | 10 | 7 | 102 | PASS |
| village | medium | 28 | 49x45 | 87 | 1 | 5 | 7 | 7 | .073 | 3/3/1 | 48.2 | .125 | 20 | 12 | 170 | PASS |
| village | medium | 62 | 49x45 | 87 | 1 | 5 | 9 | 9 | .095 | 3/3/3 | 48.8 | .125 | 22 | 12 | 186 | PASS |
| village | medium | 94 | 49x45 | 147 | 2 | 5 | 9 | 9 | .092 | 3/3/3 | 47.3 | .125 | 22 | 13 | 190 | PASS |
| village | large | 28 | 64x59 | 114 | 1 | 5 | 9 | 9 | .067 | 4/3/2 | 59.3 | .115 | 26 | 15 | 203 | PASS |
| village | large | 62 | 64x59 | 114 | 1 | 5 | 13 | 13 | .082 | 4/5/4 | 49.8 | .115 | 30 | 15 | 239 | PASS |
| village | large | 94 | 64x59 | 192 | 2 | 5 | 13 | 13 | .080 | 4/5/4 | 48.9 | .115 | 30 | 16 | 243 | PASS |
| industrial | small | 28 | 55x44 | 85 | 1 | 4 | 6 | 6 | .114 | 1/2/3 | 71.9 | .109 | 12 | 9 | 96 | PASS |
| industrial | small | 62 | 55x44 | 171 | 4 | 9 | 12 | 12 | .117 | 1/4/7 | 38.5 | .109 | 18 | 11 | 154 | PASS |
| industrial | small | 94 | 55x44 | 171 | 4 | 9 | 18 | 18 | .125 | 1/6/11 | 27.3 | .109 | 24 | 11 | 198 | PASS |
| industrial | medium | 28 | 81x68 | 260 | 4 | 9 | 16 | 16 | .146 | 3/6/7 | 81.6 | .088 | 30 | 17 | 234 | PASS |
| industrial | medium | 62 | 81x68 | 390 | 9 | 16 | 23 | 23 | .100 | 3/8/12 | 38.3 | .088 | 37 | 19 | 298 | PASS |
| industrial | medium | 94 | 81x68 | 390 | 9 | 16 | 28 | 28 | .124 | 3/10/15 | 39.1 | .088 | 42 | 19 | 338 | PASS |
| industrial | large | 28 | 117x91 | 368 | 4 | 9 | 23 | 23 | .117 | 4/8/11 | 87.4 | .080 | 41 | 20 | 315 | PASS |
| industrial | large | 62 | 117x91 | 552 | 9 | 16 | 28 | 28 | .145 | 4/10/14 | 87.9 | .080 | 46 | 22 | 359 | PASS |
| industrial | large | 94 | 117x91 | 736 | 16 | 25 | 41 | 41 | .124 | 4/15/22 | 52.2 | .080 | 59 | 24 | 488 | PASS |

矩阵说明：建筑覆盖率并不要求随密度严格单调，因为新增道路和地块切分会同时改变可建面积；但道路长度、路口、地块、建筑和 LOD 人口产生了可测量变化。村庄保持更低路口数和更松散布局，没有强行套用城市棋盘。

## 顶视图 20 项自问自答

1. 隐藏标题后能否判断类型：港区/工业区/村庄/水城/垂直街区通过；COC 小镇与一般城市只部分通过。
2. 主路、次路、小巷和铁路：工业区通过；普通城市的主次宽度可辨，但小巷变体不足。
3. 道路交叉：生成道路交叉均有 `RoadNodeProgram` 或明确高度层；通过。
4. 道路穿建筑：地块退界回归未发现；通过。
5. 建筑掉在道路中央：未发现；通过。
6. 道路宽度符合用途：主路/街道/巷/铁路不同；通过。
7. 道路围合街区：规划分层中清楚可见；通过。
8. 地块切分：可见且地块在街区内；通过。
9. 建筑沿临街边：通过。
10. 入口面向道路/开放空间：通过自动邻近检查和视觉抽查。
11. 连续但不机械的街墙：村庄通过，港区与 COC 小镇部分通过。
12. 后院/后巷/服务空间：港区、工业区和 COC 小镇存在，但变体仍有限；部分通过。
13. 公共建筑面向主路或广场：通过。
14. 工业建筑与铁路/装卸场：通过。
15. 港区仓库与码头/货运路：通过。
16. 是否仍像随机撒方盒：不再随机撒落；远景体块仍偏简化。
17. 不同用途能否凭轮廓区分：塔楼、神殿、庄园、仓库、住宅可辨；诊所/公会仍需立面细节辅助。
18. mass/facade 是否仍为完整长方体：已不普遍是单长方体；通过。
19. 网格噪声：全场底网格已移除；通过。
20. 换 Seed 是否新结构：道路间距、街区和地块变化；通过。

## 建筑 10 项自问自答

1. 用途轮廓：住宅、酒馆、仓库、神殿、庄园、塔楼和工厂具有不同 envelope；通过。
2. 两个以上体块：所有审计建筑 envelope `partCount >= 2`；通过。
3. 屋顶对应体块：每个主要 envelope part 单独生成屋顶；通过。
4. 入口真实并临街：通过。
5. 用途设施：烟囱、门廊、装卸台、雨棚、磨轮按类型生成；通过。
6. facade/full 外轮廓：共享稳定 envelope 签名；几何主壳体尚非逐边严格同构，部分通过。
7. mass 保留体块与屋顶：通过。
8. 建筑不超地块：自动尺寸钳制通过。
9. 建筑不穿模：浏览器抽查未见严重重叠；缺少任意多边形 SAT，部分通过。
10. 隐藏颜色区分用途：塔楼/神殿/庄园/仓库明显，住宅/诊所/公会仍部分依赖立面；部分通过。

## 自动验证

```text
npm run check
150 / 150 tests passed

npm run build
build passed
SceneRenderer chunk: 560.74 kB (143.05 kB gzip)
warning: chunk exceeds 500 kB

git diff --check
passed
```

新增关键回归：

- 三种 LOD 的 `BuildingEnvelopeProgram` 签名一致；
- 道路密度改变道路图、路口、街区和地块；
- 地块位于街区内、建筑位于地块内且拥有临街道路；
- 水城、战损、垂直贫民区、火星殖民区和城门街区均落实为物理几何；
- “深水城”不再被“水城”子串误判为运河城市；
- 山坡贵族区保持在 settlement 规划域；
- 相同 Seed 确定性复现，换 Seed 改变空间布局。

## 下一阶段建议

1. 把正交街区生成器扩展为多段折线/曲线道路和任意多边形街区切分，优先港区与山坡城市；
2. 对 full-interior 采用 envelope 边界直接生成外墙，彻底消除 LOD 主壳体差异；
3. 新增统一 2D SAT/多边形布尔校验，覆盖道路、铁路、水体、地块和建筑；
4. 扩充住宅、诊所、公会、警局的 facade 变体；
5. 对 `SceneRenderer` 动态拆包，消除 500 kB 构建警告，但保持运行时批处理策略。
