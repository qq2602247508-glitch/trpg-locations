# Round 67 · 森林母体与嵌入猎人营地

## 目标

固定提示词：

> 非常茂密的古老森林，起伏山脊、林间峡谷、巨石高地、倒木和隐蔽猎人营地

固定 Seed：`round67-forest-plain-b`  
变体 Seed：`round67-forest-plain-c`  
规模：中型 · 地点  
密度：88%  
网格：1 格 = 5 英尺 / 1.524 米

## 发现的问题

初始截图中，同一提示被错误解释为城镇：

- `settlement · GENERIC`
- 32 间城市房间；
- 语义覆盖 47%；
- 森林、封闭林冠和倒木没有落实为地貌几何；
- 顶视图退回方盒子街区。

根因是领域选择器把“营地 / camp”当成强城镇主体，覆盖了“森林”自然母体。这个错误会影响所有“森林/山地/河谷 + 猎人营地、野外营地、哨所”组合，而不是单个提示词。

## 本轮修复

- `猎人营地 / hunter camp / ranger camp` 加入自然嵌入设施词汇。
- “采矿营地”继续保留为聚落主体。
- 普通“营地 / camp”只有在没有自然母体时才提升为聚落。
- 自然母体 + 小型营地优先进入：

```text
自然地貌生成器
→ 森林/河谷/山地母体
→ 嵌入式建筑程序
→ 独立木屋内部
```

- 新增回归测试，确保该类提示不会再次变成城镇。

## 浏览器视觉证据

| 视图 | Seed | 结果 |
|---|---|---|
| 修复前错误城镇 | `round67-forest-plain-b` | [round-67-forest-a.png](./round-67-forest-a.png) |
| 修复后森林总览 | `round67-forest-plain-b` | [round-67-forest-b-fixed.png](./round-67-forest-b-fixed.png) |
| 修复后低角度 | `round67-forest-plain-b` | [round-67-forest-low.png](./round-67-forest-low.png) |
| 木屋内部聚焦 | `round67-forest-plain-b` | [round-67-forest-interior.png](./round-67-forest-interior.png) |
| 换 Seed 结构回归 | `round67-forest-plain-c` | [round-67-forest-variant.png](./round-67-forest-variant.png) |

## 自我验收

- 隐藏标题后，修复后总览能直接看出密林、林下空地、明显高差、树冠、倒木/根系和中央猎人木屋。
- 低角度确认森林不是一块平地，边缘与林冠有层次，木屋被地貌包围。
- 木屋内部聚焦显示真实墙、门厅、起居区、储藏、楼梯/烟囱和网格。
- 同 Seed 回归保持确定性；变体 Seed 改变 bounds（250×225 ft → 275×215 ft）、地形单元数和树/根系布局。
- 语义覆盖从 47% 提升到 100%，诊断从 76/100 提升到 99/100。
- 仍未完全通过：低角度森林的树冠仍是风格化几何，尚未有真正可攀爬的粗树干平台；下一轮将把“树干、倒木、巨石、高地”统一为可站立战术原子，并加入站立面网格与路线校验。

## 自动校验

```text
npm run check       12 files / 217 tests passed
npm run build       passed
git diff --check    passed
```
