# Round 70 · 水城规划、独立地标与陌生村庄组合验收

日期：2026-08-10  
服务：`http://127.0.0.1:5241/`  
网格：1 格 = 5 英尺

## 本轮修复

- 修复深水城提示同时包含海崖与运河时，海岸悬崖错误夺取父地貌的问题。
- 明确运河/水城现在由河流地形程序拥有主水系，生成弯曲主运河、三条支流、不同等级桥梁、沿岸路线和码头。
- 海崖不再只是语义标签：水城一侧河岸增加 15 英尺岩质高岸、垂直面和可站立上层。
- `法师塔 / 魔法塔 / 巫师塔 / 炼金塔` 会进入城镇独立建筑请求队列。
- 新增可复用 `wizard-tower` 建筑积木：
  - 三种独立体块轮廓；
  - 炼金实验区；
  - 试剂架和炼金容器；
  - 法术藏书区；
  - 仪式圆阵；
  - 屋顶望远镜与观测高点。
- 修复功能模块按地块序号错贴的问题。建筑请求与功能模块现在分别排队，并按承载建筑语法绑定。
- 增加旧矿井复合原子：
  - 矿井门洞；
  - 双轨矿车轨道与枕木；
  - 服务路线；
  - 地下水井、绞盘和可达井底；
  - 战术瓶颈与危险区。
- 外置温室不再覆盖父建筑房间；温室改为独立附属体块，并生成朝向主建筑的真实门洞与服务路线。

## 场景 A · 深水城港区

提示词：

> D&D 深水城港区，沿海崖和旧城坡地展开，有弯曲石板主街、鱼市码头、法师塔、神殿、酒馆、贫民巷、城墙门楼和跨运河石桥

Seed：`round70-deepwater-harbor`  
规模：中型 · 地点  
密度：20%

整体透视：

![深水城水城与海崖复合总览](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/deepwater-overview-fixed2.jpg)

规划顶视图：

![深水城规划顶视图](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/deepwater-top-fixed2.jpg)

低角度高差：

![深水城低角度体量](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/deepwater-low-angle-fixed2.jpg)

结果：

- 通过：中世纪题材、运河父地貌、主水道、支流、石桥、码头、独立酒馆、独立神殿、独立法师塔、海崖高岸、5 英尺网格。
- 语义覆盖由 67% 提升到 100%。
- 场景诊断通过；同一 Seed 可确定性复现。
- 仍需改进：顶视图中的高岸岩块面积较大，对左岸建筑轮廓有一定遮挡；后续需要更细的坡道/挡墙分段和更清晰的岸上道路。

## 场景 B · 法师塔聚焦

完整多层体量：

![法师塔完整内部与体量](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/wizard-tower-full-fixed.jpg)

1F 聚焦：

![法师塔首层炼金区域](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/wizard-tower-interior-fixed.jpg)

结果：

- 通过：独立塔楼实例、多层垂直空间、地下层、炼金设施、藏书设施、仪式设施、屋顶观测设施。
- 不再使用通用守望塔标签和家具。
- 仍需改进：聚焦视图中的墙体与橙色战术设施对比偏强；旋转楼梯和更高层独立房间仍可继续丰富。

## 换 Seed 验收

Seed：`round70-deepwater-harbor-variant`

![深水城换 Seed 结构](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/deepwater-variant.jpg)

结果：

- 地图边界从 345 × 290 英尺变为 355 × 275 英尺。
- 建筑位置、建筑组合、河道扰动、岸线高地和街区关系均发生变化。
- 主题、运河语法和 100% 语义覆盖保持稳定。

## 陌生组合回归

提示词：

> 建在旧矿井口的蘑菇农夫村庄，有木屋、菌类温室、矿车轨道、地下水井和石桥

Seed：`round70-mine-mushroom-village`  
规模：中型 · 地点  
密度：62%

生成器级验证通过：

- 父级保持为村庄；
- 木屋为独立建筑；
- 菌类温室绑定到适合的独立功能建筑，而不是错贴到木屋；
- 旧矿井入口、矿车轨道、地下水井和垂直路线均为真实几何；
- 语义覆盖不低于 90%；
- 拓扑和几何校验通过。

本场景的浏览器输入在验收过程中被应用安全策略拒绝，因此本轮没有伪造或补写浏览器截图。它保留为下一轮的首个浏览器视觉回归项目。

## 自动验证

```text
npm run check
222 tests passed

npm run build
passed

git diff --check
passed
```

本轮截图目录：

`/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-70/`
