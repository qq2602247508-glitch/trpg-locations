# Round 41 · 水城高层规划与时代风格回归

## 本轮改动

- `src/scene-program/localPlanner.ts`
  - 水城不再复用通用 settlement 区域；
  - 新增主运河、支流码头、桥梁层级、水上市集、沿岸建筑区、后勤巷道六个语义区域；
  - 无明确现代/1920 年代修饰时，水城默认进入 medieval 时代，避免视觉规划被解释成现代城市。
- `src/ui/App.ts`
  - 规划诊断现在显示 `domain · ruleset · era · gameplay · morphology`，不再只显示容易误导的 GENERIC 前缀。
- `tests/scene-program.test.ts`
  - 增加水城区域图与 medieval 时代断言。

## 浏览器验收

提示词：

> 河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷

Seed：`round41-water-city-medieval`

规模：295 × 260 ft；中型 · 地点；密度 62%；4 层；3,944 个图元；5 英尺网格。

结果：

- 场景诊断 98 / 100；
- 拓扑与可达性通过；
- 10 条路线；
- SceneProgram 生成 6 个语义区域；
- composition 使用 `grammar.water-city-v1`；
- 语义覆盖 100%；
- 规划标签显示为 `settlement · GENERIC · medieval · mixed · channel-cut + urban-blocks`。

视觉通过项：

- 主河道和支流水面连续；
- 石桥/木桥分别可辨；
- 中央市场码头与岸线进路存在；
- 建筑落在岸线可建区域，没有漂浮楼梯；
- 时代规划已从 timeless 调整为 medieval。

仍未通过项：

- 远景建筑仍偏低细节，后续需要水城专用的中世纪体块、屋檐、码头建筑和沿岸不规则建筑语法；
- 水城还没有独立的 `ruleset` 类型，`GENERIC` 仍表示通用游戏规则，而不是场景组合回退。

![Round 41 水城验收](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-41-water-city-medieval.png)
