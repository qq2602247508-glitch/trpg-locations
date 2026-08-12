# Big Perfect Round 01 · Regression 07

日期：2026-08-12

## 代码与回归

- 新增透明渲染合同：聚落中的建筑外壳、墙体和自有楼面在半透明模式下 ghost；家具、房间设施和战术对象保持实心。
- 新增建筑聚焦路线合同：优先保留建筑 ID 前缀路线，并兼容保守的局部旧路线；退出聚焦后重建完整路线层。
- 全量 Vitest：281/281，13 个测试文件。
- 生成器专项：133/133。
- 生产构建：通过。
- `git diff --check`：通过。
- Promptfoo 本地 Ollama：10/10，7,267 tokens；这是语义评测用量，不宣称 Token 节省。

## 浏览器验收

通过现有本机 Chromium 对 `http://127.0.0.1:5241/` 执行真实 UI 流程：

1. 生成大型深水城港区：9,727 primitives、54 rooms、36 routes、23 building instances，诊断通过。
2. 打开路线调试与建筑半透明：截图显示建筑外壳透明后，内部房间、楼面网格、家具和路线仍可见。
3. 进入 `settlement-building-1` 仓库：进入视图收敛到单栋建筑，保留局部路线与内部楼梯。
4. 切换到主要上层：上层楼面和网格可见，未恢复整座聚落的道路/屋顶。
5. 返回聚落：完整屋顶、港区道路、水道和其他建筑恢复。

截图与审计文件：

- [01-settlement-overview.png](./01-settlement-overview.png)
- [02-transparent-overview.png](./02-transparent-overview.png)
- [03-focused-ground-floor.png](./03-focused-ground-floor.png)
- [04-focused-alternate-floor.png](./04-focused-alternate-floor.png)
- [05-returned-settlement.png](./05-returned-settlement.png)
- [browser-audit.json](./browser-audit.json)

每张 PNG 均为 1720×1080，已通过文件类型和尺寸核验。浏览器记录了一个静态资源 404；页面生成、交互和 Canvas 渲染均成功，未发现 page error。

## Token 工具证据

- RTK：用于测试、构建、Git 状态/diff 和高噪声输出压缩。
- `token-ast-grep`：用于定位 `buildingTransparency`、`focusedBuildingId`、`setFloorView` 和 `buildGrid` 调用点；无可靠 baseline，不记录节省。
- `token-repomix`：以 12,000 Token 上限和白名单尝试跨模块交接包；工具因仓库 `artifacts/context/repomix-output.xml` 权限错误失败，无产物、无节省记录。
- Promptfoo：完成本地 Ollama 10/10 语义回归，记录本次评测 7,267 tokens，不把质量评测用量当 Token 节省。

## 仍存开放项

- 浏览器连接器自身仍不能回传或落盘截图；本轮改用现有 Playwright/Chromium 完成真实可见截图交付。
- 资产服务器的静态 404 仍未定位；不影响当前本地应用生成与交互，但后续应确认缺失资源是否只是 favicon/开发辅助文件。
