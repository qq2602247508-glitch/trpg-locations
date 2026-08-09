# Round 39 · 水城语义组合回归

## 目标

修复陌生提示“河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷”被规划器标成 `grammar.generic-v1`、语义覆盖 0% 的问题。

## 代码变化

- `src/composition/planner.ts`
  - 将水城、运河城、水上市集、船坞、沿岸街巷识别为河流水城组合；
  - 新增主河、支流、石桥、木桥、水上市集、船坞和沿岸路线的语义需求；
  - 选择 `grammar.water-city-v1` 与 `motif.water-city-quays`。
- `src/composition/catalog.ts`
  - 新增水城母题和专用规划语法，规定水道先于街区、码头沿岸、建筑落在合法岸线。
- `src/generators/settlementTerrain.ts`
  - 在河流水城父地形上增加有合法岸线高程和进路的真实市场码头，不再只生成水面颜色或 metadata。
- `tests/composition.catalog.test.ts`
  - 增加水城语义覆盖、几何标签、同 Seed 复现和换 Seed 结构变化测试。

## 浏览器验收

完整提示词：

> 河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷

### Seed A

- Seed：`round39-water-city-fixed-a`
- 规模：中型 · 地点
- 密度：62%
- 视图：整体透视
- 结果：98 / 100；13 条路线；`grammar.water-city-v1`；语义覆盖 100%；3,589 个图元。
- 通过：主水道、支流、不同等级桥、沿岸码头、独立建筑、5 英尺网格、路线拓扑。
- 仍未通过：诊断面板的“规划”标签仍显示 GENERIC（这是 SceneProgram 的 ruleset 标签，不是 composition grammar 回退）；城市建筑细部仍需要后续专门的水城风格化。

![水城 Seed A 总览](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-39-water-city-canvas.png)

### Seed B

- Seed：`round39-water-city-fixed-b`
- 规模：310 × 250 ft
- 密度：62%
- 视图：整体透视
- 结果：98 / 100；13 条路线；`grammar.water-city-v1`；语义覆盖 100%；4,066 个图元。
- 通过：与 Seed A 相同的语义要求仍落实；建筑落点、占地尺寸和水岸布局改变。
- 仍未通过：部分远景建筑仍以低细节体块表达，下一轮应提升水城建筑轮廓与岸线功能设施。

![水城 Seed B 总览](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-39-water-city-b.png)

### 顶视图

- 视图：正交规划顶视图
- 通过：主水道连续穿过场地；两侧岸线和桥位可见；市场码头落在水边而非悬空。

![水城顶视图](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-39-water-city-top.png)

## 自动验证

```text
182 tests passed
npm run build passed
git diff --check passed
```

构建仍有 Three.js 大 chunk 警告，但没有构建失败。
