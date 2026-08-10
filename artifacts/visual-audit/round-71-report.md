# Round 71 视觉审计报告

日期：2026-08-10  
基线：`731880d feat: compose water cities and specialist settlement atoms`

## 本轮目标

本轮围绕建筑—自然复合接口进行闭环验收：

- 聚落父领域必须拥有场景所有权；
- BGE 只能补充能力原子，不能把聚落误改成森林、河谷或洞穴；
- 陌生矿井蘑菇村必须由聚落、矿井、温室、建筑和交通原子组合；
- 独立法师塔必须与聚落中的法师塔保持同等级的观星层、屋顶和螺旋交通；
- 地下建筑不应被无关的父场景道路误判为穿墙；
- 同一 Seed 回归一致，换 Seed 改变空间结构。

## 代码改动

- `src/composition/planner.ts`
  - 增加 `settlement` 组合领域；
  - 增加 `grammar.settlement-compound-v1`；
  - 命名聚落优先保留父领域所有权；
  - BGE 检索只作为子能力补充。
- `src/workers/generation.worker.ts`
  - 聚落也允许进行 BGE 能力检索，但不允许检索结果替换聚落父语法。
- `src/composition/schema.ts`
  - `DomainDensityProfile` 支持 `settlement`。
- `src/validation/scene.ts`
  - 无关父场景道路不再与 dormant full-interior 地下墙体产生误穿墙警告；
  - 建筑自身入口、地下路线仍继续校验。
- `src/generators/buildingModule.ts`
  - 地下室局部地坪下移到 16 英尺；
  - 菌类温室增加真实菌柄、菌盖和掩体几何。
- `src/generators/tower.ts`
  - 独立法师塔观星层改为望远镜基座、镜筒、镜片和星图桌；
  - 屋顶改为真实平顶战斗平台；
  - 增加环形女儿墙和通往屋顶的螺旋段。
- `tests/generators.test.ts`
  - 增加矿井蘑菇村父领域回归；
  - 增加独立法师塔功能楼层和屋顶路线回归。

## 自动验证

```text
npm run check
223/223 passed

npm run build
passed

git diff --check
passed
```

## 视觉验收

### 1. 陌生组合：矿井蘑菇村

完整提示词：

> 建在旧矿井口的蘑菇农夫村庄，有木屋、菌类温室、矿车轨道、地下水井和石桥

同 Seed：`round71-mine-mushroom-village`  
规模：中型 · 地点  
密度：62%

代表截图：

- [总览](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/mine-mushroom-parent-fixed-regression.png)
- [顶视](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/mine-mushroom-parent-fixed-top.png)
- [温室聚焦](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/mine-mushroom-greenhouse-focus-regression.png)

通过：

- 场景父领域为 `settlement`；
- 组合语法为 `grammar.settlement-compound-v1`；
- 没有错误的 `grammar.forest-v1` 或“森林缺失”警告；
- 木屋、完整温室建筑、矿井轨道、地下水井、石桥均有几何；
- 诊断 99/100，拓扑与可达性通过。

仍未通过：

- 总览镜头下菌类温室仍偏小，菌类主题需要更强的远景地标层级；
- 矿井入口与轨道在总览中仍需要更明显的垂直/材质对比。

换 Seed：`round71-mine-mushroom-village-alt`

- [换 Seed 顶视](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/mine-mushroom-alt-seed-top.png)

换 Seed 后建筑朝向、温室位置、道路拓扑和矿井/桥的相对关系均发生结构变化，不是只移动装饰。

### 2. 深水城高岸港区

完整提示词：

> D&D 深水城港区，沿海崖和旧城坡地展开，有弯曲石板主街、鱼市码头、法师塔、神殿、酒馆、贫民巷、城墙门楼和跨运河石桥

Seed：`round71-deepwater-cliff-route`  
规模：中型 · 地点  
密度：62%

代表截图：

- [总览](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/deepwater-final-regression-overview.png)
- [顶视](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/deepwater-final-regression-top.png)
- [低角度](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/deepwater-final-regression-low.png)

通过：

- 弯曲主水道和支流；
- 分层高岸、护墙和两组下降交通；
- 法师塔、神殿、酒馆等必要建筑跨 Seed 保留；
- 顶视可以辨认水道分区和不同层级的桥。

仍未通过：

- 低角度总览镜头偏远；
- 城市建筑外立面的细节密度仍低于独立建筑场景；
- 需要下一轮继续完善远景代理体到近景独立内部的 LOD 过渡。

### 3. 独立法师塔

完整提示词：

> D&D 三层法师塔，真正的螺旋楼梯连接三层，底层炼金实验室，中层藏书室，顶层观星台和屋顶决战平台

Seed：`round71-wizard-tower-visual`  
规模：中型 · 地点  
密度：62%

代表截图：

- [1F](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/wizard-tower-fixed-1f.png)
- [2F](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/wizard-tower-fixed-2f.png)
- [3F](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/wizard-tower-fixed-3f.png)
- [低角度](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-71/wizard-tower-fixed-low.png)

通过：

- 三层圆形墙体；
- 54 级以上连续螺旋踏步；
- 炼金实验室、藏书室和观星层独立功能几何；
- 平顶决战平台、环形女儿墙和屋顶螺旋路线；
- 自动拓扑与垂直路线校验通过。

仍未通过：

- 低角度中楼板边缘仍偏工程白模；
- 观星层功能设施在远景仍较小，需要更好的局部镜头或 LOD。

## 自问自答结论

1. 隐藏标题后，矿井村能判断为聚落，深水城能判断为水城，法师塔能判断为圆形多层塔。通过。
2. 聚落不再由 BGE 误切换到森林。通过。
3. 同一 Seed 可复现，换 Seed 改变布局拓扑。通过。
4. 真实房间、道路、地下室和螺旋路线存在。通过。
5. 远景建筑细节和低角度立面仍未达到独立建筑最高质量。未通过，保留到下一轮。

