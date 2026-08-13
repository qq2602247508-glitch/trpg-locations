# Regression 25 · 性能归一化与跨题材浏览器矩阵

日期：2026-08-13

## 本轮结论

本轮没有发现可复现的 P1 几何缺陷，因此没有为了降低指标而修改具体场景生成器。新增了规模归一化性能审计，使不同地图尺寸、密度和题材可以比较 primitive 成本与语义产出。

审计公开以下指标：

- `primitiveDensity = primitives / (bounds.x × bounds.z)`
- `semanticYield = (rooms + routes + tactical) / primitives × 100`
- `budgetScore`：按真实矩阵观察到的约 `0.02–1.45 primitives/cell` 标尺计算，避免所有场景虚假得到 100。
- `qualityScore = budgetScore × 0.6 + yieldScore × 0.4`
- Node `generationMs`：只记录确定性生成链路耗时，不参与场景内容或确定性评分。
- 浏览器 `generationMs`：记录用户端到端请求耗时，包含 Worker、Ollama 规划、规则回退和确定性生成，不能与 Node 几何耗时直接比较。

## 自动矩阵

- 48 个样本：12 个代表主题 × 2 种尺寸 × 2 种密度。
- 覆盖：settlement、wilderness、cave、sewer、building、adaptive。
- 756 个既有 stress matrix 样本继续全部通过。

最差样本：

- `wilderness-forest / large / 0.35`
- 6,381 primitives，面积 5,644 cells，primitive density 1.1306
- semantic yield 0.5015，quality 73，诊断 PASS
- Node generation 约 55.78 ms

次差样本：

- `wilderness-forest / large / 0.82`
- quality 75，诊断 PASS

最佳样本：

- `adaptive-forest / medium / 0.82`
- 3,136 primitives，semantic yield 1.7538，quality 100

完整数据：

- [node-matrix.md](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/node-matrix.md)
- [node-matrix.json](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/node-matrix.json)
- [browser-runtime.json](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/browser-runtime.json)

## 浏览器视觉证据

本轮 Playwright 等待 `window.__TRPG_SCENE__.diagnostics.valid === true` 后才截图。4 个代表场景各保存 overview、low-angle、grid-close，共 12 张最终态截图；网络失败和 console error 均为 0。

森林大图最低质量样本：

- [overview](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/wilderness-forest-large-035-overview.png)
- [low-angle](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/wilderness-forest-large-035-low-angle.png)
- [grid close-up](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/wilderness-forest-large-035-grid-close.png)

adaptive tower：

- [overview](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-tower-large-035-overview.png)
- [low-angle](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-tower-large-035-low-angle.png)
- [grid close-up](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-tower-large-035-grid-close.png)

workshop：

- [overview](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/building-workshop-large-082-overview.png)
- [low-angle](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/building-workshop-large-082-low-angle.png)
- [grid close-up](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/building-workshop-large-082-grid-close.png)

另一个森林代表：

- [overview](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-forest-medium-082-overview.png)
- [low-angle](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-forest-medium-082-low-angle.png)
- [grid close-up](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-25/adaptive-forest-medium-082-grid-close.png)

## 模型回退与耗时口径

workshop 浏览器端显示 `Ollama Schema 拒绝 · 规则回退`，且场景仍明确标记规则来源；这证明模型失败状态没有被静默隐藏。该场景 Node 确定性生成约 0.5 ms，而浏览器端到端显示约 9.7 s，差异来自本地模型请求/回退等待，不是 31 个 primitives 的几何成本。后续应继续拆分 UI 中的 planning latency 与 geometry latency。

## 门禁

- 定向性能与 stress 测试：11/11 passed。
- Promptfoo：24/24 passed，8,354 tokens，0 failed / 0 errors；新增 `森林村庄`、`洪水歌剧院` 极短提示，未记录 Token 节省。
- 全量测试、生产构建和 `git diff --check` 在提交前重新运行。

## 未解决风险

- wilderness large 的 semantic yield 与 quality 仍低于其他代表样本，但当前诊断有效、路线和战术节点存在，尚不足以证明 P1。
- 浏览器 generation time 仍是端到端时延，下一轮可进一步拆解 Worker、Ollama、规则生成和渲染准备阶段。
- 长期 Goal 仍需继续扩大更多提示、Seed、尺寸、密度、楼层和内部视图的组合矩阵。
