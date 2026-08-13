# Regression 27 — connector clearance evidence

日期：2026-08-13

## 规则

对每个 meaningful stairs / explicit ladder，在已验证上下落点之间建立保守净空体积：

- 仅检查端点内缩后的连接器中段，内缩量为 `max(0.45m, runLength * 0.16)`。
- 沿连接线按既有 route sampling 采样；水平半宽为 `max(0.28m, connectorWidth / 2 + 0.08m)`。
- 垂直范围覆盖 connector 高度，并增加 `0.12m–0.42m` 的小容差。
- blocker 必须有可信标签：`wall`、`blocks-movement`、`solid-obstacle`、`obstacle`、`beam`、`main-beam`、`crossbeam`、`floor-slab` 或 `solid`。
- 排除 `water`、opening evidence、`decorative/nonblocking`、`railing`、边缘防护和 structural support 类标签。
- 同一连接器附近的 opening 只有在与 blocker footprint 同时相交时才可放行。
- 其他 building 的 dormant underground primitive 不参与当前 building connector 的阻挡判断。

这不是通用物理引擎，而是面向组合后垂直交通的保守、标签驱动几何证据。

## 证据结果

- 聚焦 geometry tests：24/24 通过。
- 全量 Vitest：328/328 通过，16 个测试文件。
- 生产构建：通过。
- 固定生产矩阵：63/63 通过（7 fixed kinds × 3 sizes × 3 seeds/densities）。
- 生产矩阵共检查 187 个 connector。
- `connectorClearanceErrorCount = 0`。
- `geometryErrorCount = 0`，invalid rows = 0。
- 浏览器：submerged clinic、underground greenhouse、archive station、forest 共 4 场。
- 四场浏览器证据分别检查 16、14、11、10 个 connector，共 51 个；每场均强制要求 `connectorCount > 0`。
- 每场都有 overview、low、low-support 三视图；三个地下功能模块另有 B1 focused-basement 视图，共 15 张当前有效截图。
- 浏览器四场均 `sceneValid=true`、`geometryErrors=0`、`connectorClearanceErrorCount=0`、network failures=0、console errors=0。
- 发现并修复真实 P1：地下 `submerged-room` access 与共享 basement east wall 冲突；地下 greenhouse access 与 east/south frame 冲突；archive access 与 shared basement east wall 冲突。修复均为生成器局部位置/楼梯 run 调整，未放宽 blocker 分类。
- 修复验证后 building manifest 丢失 `siteProfile`、`functionalModules`、`state` 的问题，使浏览器能按功能模块精确进入对应建筑与 B1，并保留场景重放元数据。
- Promptfoo：24/24 通过（deterministic local baseline + forced Ollama）。

## 文件

- `src/validation/scene.ts`
- `tests/validation.geometry.test.ts`
- `tests/validation.scene.test.ts`
- `tests/composition.interface.test.ts`
- `src/generators/buildingModule.ts`
- `scripts/regression-27-matrix.ts`
- `scripts/regression-27-browser.ts`
- `matrix-audit.json`
- `browser-audit.json`
- 四场景共 15 张当前有效 PNG 截图

## 风险

规则依赖可信 blocker 标签；未标记为 blocker 的任意体积不会被推断为通用碰撞体。旋转 primitive 使用现有保守 footprint 近似，仍不是三角网格级碰撞检测。
