# Round 44 · 森林父地形与树冠战术网络

## 提示词

> 非常茂密的原始森林，三片不规则林间空地、封闭林冠、灌木、倒木、浅溪、大树和树冠战斗平台

## 本轮改动

`src/generators/wilderness.ts`：

- 密度现在会改变三片林间空地的实际占地：
  - 稀疏森林空地更宽；
  - 高密度森林空地更收紧；
- 密度和 Seed 共同影响宏观高程起伏，不再只改变树数量；
- 巨树增加三组根部支撑/根墙，作为掩体和攀爬点；
- 相邻巨树平台在距离允许时生成：
  - 受支撑的树冠桥；
  - 桥面 5 英尺网格；
  - 侧向护栏；
  - alternate 路线；
  - 树冠瓶颈战术点。

## 浏览器验收

### Seed A

- Seed：`round44-forest-structure-a`
- 规模：250 × 220 ft
- 密度：62%
- 1,895 个地形格；
- 340 个垂直面；
- 175 棵聚类树；
- 3 个树冠平台；
- 8 条路线；
- 98 / 100；
- 语义覆盖 100%。

整体视图中可以看到橙色树冠桥穿过林冠，树根和平台形成不同高度的战术路线。

![森林结构 Seed A](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-44-forest-structure-a.png)

### 正交顶视图

顶视图确认：

- 林间空地不是完整矩形；
- 浅溪横切地图；
- 树冠桥和地面路径不是同一层；
- 5 英尺网格覆盖地面和树冠桥面。

![森林顶视图](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-44-forest-top.png)

### Seed B

- Seed：`round44-forest-structure-b`
- 规模：250 × 230 ft
- 密度：62%
- 1,995 个地形格；
- 348 个垂直面；
- 2,862 个图元；
- 98 / 100；
- 语义覆盖 100%。

Seed B 的整体边界、高程、空地位置和树冠桥布局发生变化。

![森林结构 Seed B](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-44-forest-structure-b.png)

## 自我验收

- 隐藏标题后能否判断是森林？可以，林冠、树群、溪流和树冠桥共同成立。
- 是否仍是平地加几棵树？不再完全是；有 340/348 个垂直面、溪流、空地边缘和树冠网络。
- 树冠平台是否真实可站立？是，平台、桥面和路线都带 `standable` 与 `surface-grid`。
- Seed 是否只移动装饰？不是，地图尺寸、高程、空地占地和路线发生变化。
- 是否完全达到最终自然场景质量？还没有。树冠模型仍是低多边形占位风格，后续需要增加林下岩壁、湿地边缘、倒木桥和更强的材质/主题风格。

## 自动验证

```text
185 tests passed
npm run build passed
git diff --check passed
```
