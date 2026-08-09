# Round 37 visual audit

日期：2026-08-09

## 功能优先级自动聚焦

提示词：`建在火山灰峡谷边缘的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥`

Seed：`round37-laboratory-priority`  
规模：中型·地点  
密度：62%

![实验室优先聚焦](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-37-laboratory-priority-focus.png)

通过：

- 选择器把提示词中先出现的实验室功能赋予更高优先级；
- 自动选择 `guild · industrial · archive/laboratory`，而不是后续只含档案库的建筑；
- 聚焦后 1F 的墙、隔断、工作台、试剂架、危险容器和网格清楚可见；
- 视口高度修复持续有效；
- 同一提示更换 Seed 后仍然由程序选择，不是写死建筑编号。

仍未通过：

- 当一个建筑同时包含多个功能时，选项只显示简化模块串，下一轮可增加“主功能”徽标和一键循环同功能建筑。

自动验证：

```text
180 tests passed
npm run build passed
git diff --check passed
```
