# Round 68 · 陨石坑村庄的放射裂缝原子

## 目标

固定提示词：

> 陨石坑中的山地小村庄，中央撞击坑、放射状裂缝、矿石堆、木屋、观测台和进入坑底的危险下坡路

固定 Seed：`round68-crater-village-a`  
变体 Seed：`round68-crater-village-b`  
规模：中型 · 地点  
密度：74%  
网格：1 格 = 5 英尺 / 1.524 米

## 发现的问题

初始结果已经能够保留陨石坑父地貌和环形村庄，但“放射状裂缝”只存在于 SceneProgram 的形态描述中，顶视图里几乎不可见。画面主要仍是完整环形台地，因此提示词的重要战术约束没有真正改变地貌。

## 本轮修复

- 新增可复用的撞击裂缝原子：
  - 由 Seed 决定 5–8 条主裂缝的角度和抖动；
  - 密度改变裂缝数量、分段和覆盖；
  - 裂缝从撞击核心穿过坑壁并延伸到外缘；
  - 裂缝格真实降低 10–15 英尺，不再只是表面黑线；
  - 裂缝拥有 `hazard`、`radial-fracture`、`fracture-bottom` 和真实垂直面；
  - 裂缝范围写入地形保留区，普通建筑不能覆盖。
- 新增矿石堆原子：
  - 按 Seed 分布在不同坑壁半径；
  - 作为掩体和撞击碎片；
  - 密度改变矿石堆数量。
- 新增自动回归，要求裂缝几何、矿石堆和保留区全部存在。

## 浏览器视觉证据

| 视图 | Seed | 结果 |
|---|---|---|
| 修复前顶视 | `round68-crater-village-a` | [round-68-crater-top.png](./round-68-crater-top.png) |
| 第一轮裂缝标记 | `round68-crater-village-a` | [round-68-crater-fixed-top.png](./round-68-crater-fixed-top.png) |
| 加深后的真实裂缝顶视 | `round68-crater-village-a` | [round-68-crater-bold-top.png](./round-68-crater-bold-top.png) |
| 低角度体量检查 | `round68-crater-village-a` | [round-68-crater-bold-low.png](./round-68-crater-bold-low.png) |
| 换 Seed 结构回归 | `round68-crater-village-b` | [round-68-crater-variant.png](./round-68-crater-variant.png) |

## 自我验收

- 顶视图能够直接看出撞击坑、环壁、坡道、环路、村庄和从核心向外扩散的裂缝。
- 裂缝不再只改变颜色：相关地形格降低并形成垂直边界，普通地块不能覆盖。
- 矿石堆是独立几何和掩体，不是 metadata。
- 固定 Seed 可复现；变体 Seed 的 bounds 从 245×230 ft 变为 225×205 ft，裂缝角度、坑缘破口、建筑分布和道路段均发生变化。
- 语义覆盖 100%，诊断 99/100，拓扑检查通过。
- 仍未完全通过：默认低角度相机过于贴近地图外缘，不能充分展示窄裂缝深度；后续应为“裂缝/深坑”增加局部聚焦视图，而不是继续加深全局相机。

## 自动校验

```text
npm run check       12 files / 218 tests passed
npm run build       passed
git diff --check    passed
```
