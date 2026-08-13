# Regression 29 — vegetation anchoring and terrain contact

日期：2026-08-13

## 选定硬性要求

树冠与树干不得分离；植被根部必须接触组合完成后的真实地形表面。

## 真实缺陷与修复

本轮在河岸 woodland 覆盖中复现了 33/96 棵树的接触错误：植被层使用独立的正弦河岸高度估算，而连续河谷父地形已经生成了不同的高程和水道空洞，导致树被放在水道/空洞上方。

同时，红树林根柱/冠层原本不是可审计的 `tree-trunk` / `tree-canopy` 装配，且部分冠层横向或垂直偏离根柱。

修复内容：

- woodland 树和古树只在最终组合场景中足迹下存在真实、非水 `floor + terrain` surface 时生成，并使用该 surface 顶面作为树基高程。
- 红树林根柱和冠层共享稳定的 `tree-anchor:mangrove-*` 标签。
- 红树林根柱标记为 `tree-trunk`，冠层标记为 `tree-canopy + canopy-layer`。
- 红树林冠层中心由实际根柱高度和冠层高度计算，保证真实竖向装配，不放宽脱离验证。
- `validateScene` 新增植被指标：`vegetationTrunksChecked`、`vegetationCanopyGroupsChecked`、`vegetationGroundContactErrorCount`、`vegetationDetachedCanopyErrorCount`。
- 接触验证使用独立的 `0.16 grid` 容差，不复用宽松路线容差；显式漂浮/装饰植被继续排除。

## 矩阵证据

- 4 个场景族：pure forest、short forest settlement、mangrove swamp、woodland facility。
- 每族 3 个尺寸/密度/seed 组合，共 12/12 rows。
- `trunksChecked = 1681`
- `anchoredCanopyGroups = 2171`
- `groundedContactErrors = 0`
- `detachedCanopyErrors = 0`
- `geometryErrors = 0`
- `invalidRows = 0`
- 红树林专门样本也有非零覆盖：22、32、42 根—冠层装配分别通过 small/medium/large。

证据 JSON：

- `matrix-audit.json`

## 浏览器证据

两组真实 Playwright 场景均通过 `sceneValid=true`、`geometryErrors=0`、接触/脱离错误为 0、network failures=0、console errors=0。

纯森林：

- 210 roots/trunks
- 314 canopy groups
- overview、low-angle trunk base、low-angle contact emphasis

红树林走私港村：

- 37 mangrove root pillars
- 37 mangrove canopy groups
- 使用专门 prompt：隐藏在红树林沼泽中的走私港村……
- overview、low-angle trunk base、low-angle contact emphasis

当前有效截图：

- `forest-low-angle-overview.png`
- `forest-low-angle-low-angle-trunk-base.png`
- `forest-low-angle-low-angle-contact-emphasis.png`
- `mangrove-village-low-angle-overview.png`
- `mangrove-village-low-angle-low-angle-trunk-base.png`
- `mangrove-village-low-angle-low-angle-contact-emphasis.png`

证据 JSON：

- `browser-audit.json`

## 测试与风险

- 新增 trunk 接触负例、无 anchor 元数据正例和红树林共享 anchor 正例。
- 最终门禁已完成：Vitest 332/332、生产构建通过、`git diff --check` 通过、Promptfoo 24/24、窄 Repomix 6,950 tokens。
- 本轮提交和推送在最终收口阶段完成后，报告中的远端提交号会由提交记录确认。
- 验证是标签驱动的组合级几何合同，不是三角网格级通用碰撞引擎；明确漂浮岛/魔法漂浮植被不属于此合同。
