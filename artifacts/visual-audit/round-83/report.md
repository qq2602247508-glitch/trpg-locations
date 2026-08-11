# Round 83 — 盐碱荒原领域与地下层回归

## 本轮目标

- 让盐碱荒原拥有独立的 wilderness archetype、composition domain、grammar、motif 和 SceneProgram 语义；
- 修复 B1 聚焦镜头把整个地下层压缩到一起的问题；
- 修复隔离礼拜所净化庭路线穿过服务翼实体墙的问题；
- 验证固定 Seed、替换 Seed 和陌生组合不会退回默认模板。

## 代码变更

- `src/render/SceneRenderer.ts`
  - 地下层聚焦相机按当前建筑的最大 `focus-cluster:*` 功能簇取景；
  - 不隐藏其他几何，只缩小当前 B1 的检查范围。
- `src/generators/wilderness.ts`
  - 新增 `salt-waste` archetype；
  - 盐碱荒原不再复用 `dry-riverbed` 父类型；
  - 增加独立尺寸、标题池、盐壳柱战术点和场地建筑适配；
  - 隔离礼拜所服务翼生成真实侧向门洞。
- `src/composition/planner.ts`
  - 增加 `salt-waste` domain、密度曲线、盐壳/卤水材质族、荒原轮廓和语义要求。
- `src/composition/catalog.ts`
  - 增加 `motif.salt-crust-basin`；
  - 增加 `grammar.salt-waste-v1`。
- `src/scene-program/schema.ts` / `localPlanner.ts`
  - 增加盐壳和卤水语义操作符。

## 浏览器验收

### 固定 Seed

提示词：

`盐碱荒原中的瘟疫隔离礼拜所，有露天净化庭、伤员病房、祈祷小堂、地下焚化燃料库和屋顶钟火信号台`

Seed：`round-83-salt`

结果：

- 305 × 235 ft；
- 4 层：12 / 10 / 8 / 10 ft；
- 2,867 个战术格；
- 3,283 个图元；
- 盐壳可行走格 2,343；
- 817 个破碎盐面；
- 3 个卤水盆地；
- 96 / 100；
- 0 条验证警告。

### 替换 Seed

Seed：`round-83-salt-alt`

变化：

- 2,404 个可行走盐壳格；
- 823 个破碎盐面；
- 281 个坡面段；
- 290 × 255 ft；
- 3,369 个图元；
- 建筑落点和地下层布局变化。

### 陌生组合

提示词：

`盐碱荒原里的流亡天文修道院，有卤水观测井、礼拜翼、地下档案库和屋顶信号台`

Seed：`round-83-stranger`

结果：

- 没有退回山地、酒馆或通用矩形；
- 保留 `salt-waste` 父地貌；
- 生成观测/档案独立建筑模块；
- 生成屋顶信号台和地下路线；
- 96 / 100；
- 0 条验证警告。

## 截图

- [盐碱荒原总览](./salt-overview.png)
- [隔离礼拜所一层](./salt-1f-canvas.png)
- [隔离礼拜所 B1](./salt-b1.png)
- [换 Seed 的 B1](./salt-b1-alt.png)
- [陌生天文修道院组合](./stranger-salt-overview.png)

## 自我验收

通过：

- 盐碱荒原不再显示为 `dry-riverbed`；
- SceneProgram 显示 `salt-crust + basin + radial-fractures`；
- 组合层显示 `grammar.salt-waste-v1`；
- 固定 Seed 可复现；
- 换 Seed 改变了地貌和建筑落点；
- 陌生组合保留父地貌并生成子建筑；
- 净化庭路线有真实门洞，不再穿墙；
- B1 镜头不再把整个聚落地下层缩成一个总览。

仍未完全通过：

- 总览截图仍受当前应用页面纵向布局影响，视觉构图还不是最终交互形态；
- 地下层中多个功能簇仍可能在复杂建筑中产生较高几何密度；
- 森林、河流、火山等其他自然领域仍需要同等深度的原子化升级。
