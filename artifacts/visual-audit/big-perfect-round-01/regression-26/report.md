# Regression 26 · 分阶段生成耗时与重复模型回放修复

日期：2026-08-13

## 本轮结论

本轮不仅拆分了生成耗时，还通过新计时证据发现并修复了一个普通 fixed kind 场景的 P1 性能缺陷。

修复前，普通 `building` 工坊被 `plain+sparse` 启发式误判为需要自动 Ollama：

1. Worker 内先等待 Ollama。
2. 普通 Worker 10 秒超时。
3. 客户端启动 in-thread fallback。
4. fallback 再次调用 Ollama。

结果是只有 18–31 primitives 的工坊需要约 22.7 秒，并产生约 10 秒 transport residual。

修复后：

- 非强制 fixed kind 直接采用确定性规划。
- 自动 Ollama 只允许用于 `adaptive` 且确实 unresolved 的输入。
- 普通 Worker timeout fallback 禁止再次自动调用 Ollama，避免重复模型副作用。
- 显式 `forceLocalModel=true` 继续保留模型调用和明确回退契约。

## Timing 合同

`GeneratedScene.timing`：

- `planningMs`：SceneProgram、Composition、BGE/Ollama 规划阶段。
- `geometryMs`：确定性 `generateScene` 阶段。
- `totalMs`：客户端请求到 resolve 的端到端总耗时。
- `transportMs`：`max(0, total - planning - geometry)`。

兼容规则：

- `generationMs` 保留，并统一等于 `timing.totalMs`。
- timing 不参与场景内容、Seed 确定性或质量评分。
- validation 会修复非有限、负数或小于分项合计的 timing。
- 旧版没有 timing 的场景继续有效。

## 浏览器前后对照

普通工坊修复前：

- total：22,749.1 ms
- planning：12,723.6 ms
- geometry：5.3 ms
- transport：10,020.2 ms
- semantic：`ollama-schema-rejected / rule fallback`

普通工坊修复后：

- total：37.4 ms
- planning：1.3 ms
- geometry：2.6 ms
- transport：33.5 ms
- semantic：`local`
- 网络失败：0
- console error：0

端到端耗时降低约 99.8%，且不再误触发 Ollama。

强制 Ollama 场景：

- total：12,869.5 ms
- planning：12,833.5 ms
- geometry：9.1 ms
- transport：26.9 ms
- semantic：`ollama-schema-rejected / rule fallback`
- 网络失败：0
- console error：0

强制路径仍明确显示模型 Schema 拒绝与规则回退，没有静默伪装成功；几何生成只占约 9 ms。

## 视觉证据

- [普通规则场景](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-26/ordinary-rules.png)
- [强制 Ollama 场景](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-26/forced-ollama.png)
- [browser-runtime.json](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/big-perfect-round-01/regression-26/browser-runtime.json)

## 自动验证

- 定向 timing / validation / planning tests：15/15 passed。
- 全量测试：16 files，322/322 passed。
- Promptfoo：24/24 passed，8,354 tokens，0 failures / 0 errors；未记录 Token 节省。
- 生产构建：通过。
- `git diff --check`：通过。
- AST：确认 Ollama 生产调用仅存在于 Worker 与 in-thread 规划边界。
- Repomix：9 个相关文件，7,716 tokens，低于 12,000 上限。

## 未解决风险

- 强制 Ollama 当前模型仍需约 12.8 秒并返回 Schema 拒绝；产品已正确回退，但后续可继续改善模型 schema adherence 或选择更适合的本地模型配置。
- 浏览器 total 仍包含 Worker 启动、消息传输与模块加载；已通过 `transportMs` 显式分离，但尚未继续拆成 worker startup 与 message latency。
- 长期 Goal 仍需完成全部硬性项的逐条最终证据审计和更广楼层/内部组合矩阵。
