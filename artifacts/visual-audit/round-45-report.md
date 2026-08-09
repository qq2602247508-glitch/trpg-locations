# Round 45 — 森林建筑复合与沼泽语法验收

## 固定 Seed：原始森林猎人小屋

- Prompt：`原始森林里的猎人小屋，有柴棚、陷阱线、溪边木桥和树冠观察台`
- Seed：`round45-forest-cabin`
- 规模：中型
- 密度：62%
- 结果：诊断 98/100，语义覆盖 100%，13 条路线。
- 通过：
  - 森林不再是平地散树，包含三片不规则空地、分层高程、林冠平台和树冠桥；
  - 木屋为独立 `full-interior` 建筑，拥有 1F、阁楼、屋顶和 B1；
  - 陷阱线、溪流木桥、树冠观察台均为真实几何；
  - 建筑根房间与最近森林空地建立拓扑连接；
  - 同 Seed 可复现。
- 未完全通过：
  - 聚落总览尺度下木屋细节仍被密集林冠遮挡，需要使用建筑聚焦视图检查内部；
  - 树冠观察台的屋顶和护栏仍偏简化。

截图：

- `round-45-forest-cabin-baseline.png`
- `round-45-forest-cabin-fixed.png`
- `round-45-forest-cabin-focus.png`
- `round-45-forest-cabin-seed-b.png`

## 换 Seed

- Prompt 同上
- Seed：`round45-forest-cabin-b`
- 结果：占地由 255×235 ft 变为 250×220 ft；地形可走格、垂直面、空地位置、树群和路径结构均变化，不只是装饰移动。

## 陌生组合：沼泽林务站

- Prompt：`沼泽边缘的废弃林务站，有木桥、瞭望塔、陷阱沟、倒木防线和地下储藏室`
- Seed：`round45-forest-unknown`
- 规模：中型
- 密度：62%
- 初始失败：被“瞭望塔”抢占为默认塔楼，语义覆盖 0%。
- 修复后：
  - 自然父场景识别为沼泽；
  - 林务站作为独立建筑嵌入；
  - 新增 `grammar.swamp-v1`；
  - 新增 `motif.wetland-boardwalk-station`；
  - 新增已验证原子 `terrain.marsh-basin`；
  - 生成 1358 个干地格、233 个垂直面、5 个不规则水池、连续水道和受支撑栈道；
  - 瞭望塔、陷阱沟、倒木防线和地下储藏室均落实；
  - 诊断 98/100，语义覆盖 100%，8 条路线。
- 未完全通过：
  - 湿地植被仍偏稀，芦苇和枯木的视觉层次需要继续增加；
  - 林务站外立面仍沿用通用住宅语法，后续需要独立的林务/巡护站外观模块；
  - 低角度默认镜头距离偏远，瞭望塔体量不够突出。

最终截图：

- `round-45-wetland-ranger-final-overview.png`
- `round-45-wetland-ranger-final-low.png`
- `round-45-wetland-ranger-final-top.png`

## 自动验收

- TypeScript：通过
- Vitest：187/187 通过
- Vite build：通过
- `git diff --check`：通过
- 新增回归：
  - 森林木屋提示必须生成陷阱线、溪流木桥、树冠观察台和独立建筑；
  - 沼泽林务站必须保持房间图连通、几何校验通过，并生成瞭望塔、陷阱沟和倒木防线。
