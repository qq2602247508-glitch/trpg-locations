# Big Perfect Round 01 · Regression 08

日期：2026-08-12

## 本轮修复

- 补充 `public/favicon.svg` 并在 `index.html` 显式声明，消除浏览器自动请求 `/favicon.ico` 的 404。
- 固定 `tower`、`building`、`tavern`、`dungeon`、`sewer`、`cave` 类型不再走 BGE 组合检索，避免固定建筑被错误改写成 forest composition。
- 森林村庄 settlement terrain 新增两处有支撑树冠战斗平台、支撑树干、垂直楼梯与高地战术节点。
- 幽暗地域聚落新增三处可站立洞穴腔体、两段洞穴通道和两处高地岩架。
- composition cache key 增加 `kind`，防止同提示在不同生成类型间串用规划结果。

## 验证

- 全量 Vitest：284/284，13 个测试文件。
- 新增语义/几何回归：森林树冠平台、幽暗地域腔体/通道/岩架、固定 tower composition ownership。
- 生成器与几何专项：150/150。
- 生产构建：通过。
- `git diff --check`：通过。
- Promptfoo 本地 Ollama：10/10，7,267 tokens；该数值只记录评测用量，不宣称 Token 节省。

## 跨领域 Chromium 验收

真实 Chromium 矩阵覆盖：

- 森林村庄：large / density 82
- 洪水歌剧院：large / density 74
- 峡谷下使馆与索桥：large / density 78
- 冰川裂隙矮人聚落：large / density 86
- 幽暗地域地下湖村庄：medium / density 64
- 多层法师塔：medium / density 68

每个场景均执行总览、低角度和楼层选择；全部诊断通过，所有语义 warning 清零，网络失败 0，console error 0。

矩阵审计：[matrix-audit.json](./matrix-audit.json)  
语义审计：[semantic-audit.json](./semantic-audit.json)

截图目录包含每个场景的 `overview.png` 和 `low.png`。代表性截图：

- [森林村庄总览](./forest-village-overview.png)
- [洪水歌剧院总览](./flooded-opera-overview.png)
- [峡谷使馆总览](./canyon-embassy-overview.png)
- [冰川聚落总览](./ice-settlement-overview.png)
- [幽暗地域总览](./underdark-lake-overview.png)
- [多层法师塔总览](./multi-floor-tower-overview.png)

## Token 工具证据

- RTK：用于测试、构建、Git 状态/diff 和高噪声输出压缩。
- `token-ast-grep`：定位生成器调用与渲染 preset；无可靠 baseline，不记录节省。
- `token-repomix`：本轮尝试使用 `--stdout`、白名单和 12,000 Token 上限；工具仍被预算保护直接拒绝，未产生有效产物，也未记录节省。
- Promptfoo：本地 Ollama 10/10，记录 7,267 评测 tokens，不把质量提升或评测用量冒充 Token 节省。

## 剩余开放项

- 仍需继续扩大不同固定建筑、洞窟、地牢和特殊状态的浏览器视图覆盖。
- 部分复杂场景仍需要更细的内部/地下楼层截图，而不是只验证总览、低角度和单层选择。
