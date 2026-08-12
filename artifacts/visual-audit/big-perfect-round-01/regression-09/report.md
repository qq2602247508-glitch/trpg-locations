# Big Perfect Round 01 · Regression 09

日期：2026-08-12

## 本轮修复

为固定建筑/地下生成器补齐真实可站立面的网格语义标签：

- Dungeon 每层房间 floor slab 与连接走廊增加 `standable` / `support-surface`。
- Cave chamber floor 与 natural ledge 增加 `standable` / `support-surface`。
- Sewer 上下检修道增加 `standable` / `support-surface`。
- Wizard tower B1 greenhouse floor 增加 `standable` / `support-surface`。

网格分类器仍保持严格排除水体、熔岩、虚空、装饰和自然细节；本轮修复的是生成器合同，不放宽渲染器猜测。

## 固定场景多楼层 Chromium 验收

真实 Chromium 覆盖：

- 警察局 building：1F、2F、屋顶、B1
- 法师塔含地下温室：1F–4F、B1
- 神殿地牢：1F–4F
- 多腔体洞窟：1F
- 古城下水道：上下两层

结果：

- 5/5 场景诊断通过
- 所有数字楼层均有非零真实网格候选
- 地牢各层网格候选：29–47
- 洞窟网格候选：9
- 下水道每层网格候选：1
- 法师塔 B1 网格候选：6
- 网络失败：0
- Console error：0

固定矩阵审计：[fixed-matrix-audit.json](./fixed-matrix-audit.json)

代表性截图：

- [神殿地牢 1F](./temple-dungeon-floor-0.png)
- [多腔体洞窟 1F](./connected-cave-floor-0.png)
- [法师塔 B1](./wizard-tower-greenhouse-floor-4.png)
- [警察局 B1](./program-building-floor-3.png)
- [下水道上层](./sewer-cross-section-floor-1.png)

人工查看确认：地牢房间/走廊、洞窟腔体、塔楼 B1 地面均显示网格；水体和墙体没有被铺格。

## 验证

- 全量 Vitest：285/285，13 个测试文件。
- 网格/几何专项：151/151。
- 生产构建：通过。
- `git diff --check`：通过。
- Promptfoo 本地 Ollama：10/10，7,267 tokens；仅记录评测用量，不宣称 Token 节省。

## Token 工具证据

- RTK：用于测试、构建、Git 状态/diff 和高噪声输出压缩。
- `token-ast-grep`：用于定位固定场景 floor labels、路线和生成器调用；无可靠 baseline，不记录节省。
- `token-repomix`：本轮按白名单和 12,000 Token 上限尝试；工具预算保护未生成有效产物，不记录节省。
- Promptfoo：本地 Ollama 10/10，记录 7,267 评测 tokens，不把质量结果冒充 Token 节省。

## 剩余开放项

- 继续补固定建筑、洞窟、地牢的透明内部、地下低角度和网格近景验收。
- 继续扩大多 Seed、多密度、多尺寸的真实浏览器覆盖。
