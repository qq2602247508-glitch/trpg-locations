# Regression 10：透明内部与多楼层视觉验收

日期：2026-08-12  
仓库：TRPG Locations  
基线提交：`7c8bbdc fix: grid fixed-scene walkable surfaces`

## 验收范围

本轮使用真实 Chromium（Canvas 1046×809）验收三个大尺寸、高密度场景：

- 警察局固定建筑：`kind=building`，density 72，4 floors，159 primitives，14 rooms，13 routes。
- 多层神殿地牢：`kind=dungeon`，density 84，4 floors，174 primitives，25 rooms，8 routes。
- 带地下温室的法师塔：`kind=tower`，density 76，6 floors，232 primitives，12 rooms，8 routes。

每个场景均执行 overview、路线调试、建筑半透明、低角度、正交顶视图、楼层选择和网格近景，并保存 PNG。

## 结果

所有 18 个步骤均显示“校验通过”；三个场景均 `scene.diagnostics.valid=true`。本轮 Chromium 记录：

- 网络失败：0
- console error：0
- Canvas：1046×809
- 观察到的帧率：约 113–168 FPS

代表性性能数据：

| 场景 | 视图 | Draw calls | Triangles | FPS |
|---|---|---:|---:|---:|
| 警察局 | overview | 20 | 2,558 | 121 |
| 警察局 | transparent + routes + low | 36 | 6,302 | 121 |
| 警察局 | floor 3 / near-grid | 8 | 384 | 120 |
| 神殿地牢 | overview | 24 | 2,486 | 121 |
| 神殿地牢 | transparent + routes | 32 | 4,790 | 132 |
| 神殿地牢 | floor 4 / near-grid | 10 | 986 | 120 |
| 法师塔 | overview | 37 | 3,962 | 120 |
| 法师塔 | transparent + routes + low | 51 | 10,874 | 168 |
| 法师塔 | B1 / near-grid | 8 | 1,380 | 121 |

## 人工视觉结论

- 建筑半透明模式确实揭示了房间、楼层、家具和战斗路线；路线调试线在透明建筑内部仍可读。
- 神殿顶视图和楼层视图显示了连续的战斗路线、连接房间和 5 英尺网格，没有出现空白画布或只剩单条细梯的退化。
- 法师塔真实 B1 视图显示为“仅查看 B1”，能看到地下螺旋交通、入口平台和网格；近景视图仍保留可读网格。
- 低角度和正交顶视图均完成浏览器截图验收，未发现严重重叠或不可辨识的视图退化。

### 楼层标签说明

首次脚本版本把 `3/4` 当作地下层目标，实际选择了神殿 4F 和塔楼 5F。该问题位于临时验收脚本，不是应用源码。随后修正脚本为按选项文本匹配 `B1` 并重跑；最终审计 JSON 已覆盖修正后的真实 B1 选择。神殿本次生成没有 B1 选项，因此其楼层证据准确记为 4F；塔楼证据准确记为 B1。

## 自动门禁

- Vitest：13 files，285/285 passed。
- 生产构建：通过（TypeScript + Vite）；保留既有的大 chunk warning。
- Promptfoo + 本地 Ollama：10/10 passed，0 failed，0 errors，实测 7,267 tokens。
- `git diff --check`：待提交前执行。

## 截图产物

本目录包含三场景的 overview、transparent、transparent-low、transparent-top、楼层和 near-grid PNG，以及 `visual-matrix-audit.json`。

## 未完成范围

本报告只证明本轮三个场景和视图组合。Goal 仍保持 active；更多固定建筑、洞窟、地牢、洪水歌剧院、峡谷使馆、森林村庄、冰原、地下湖、多 Seed/尺寸/密度矩阵，以及 10 条长期目标的逐项最终审计仍需后续完成。
