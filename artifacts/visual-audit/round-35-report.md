# Round 35 visual audit

日期：2026-08-09

## 聚焦镜头修复

提示词：`建在火山灰峡谷边缘的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥`

Seed：`round33-specialist-modules`  
规模：中型·地点  
密度：62%

### 修复前

聚焦视图的 canvas 高度被右侧长诊断面板撑到约 2666px，浏览器首屏只能看到建筑顶部边缘，无法验收内部。

### 修复后 1F

![聚焦建筑 1F](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-35-focus-framing-ui-fixed.png)

通过：

- 画布高度降为约 914px，与视口匹配；
- 建筑完整进入视口；
- 墙、地板、隔断、工作台、试剂架和危险容器可见；
- 相机目标使用当前楼层真实几何 minY/maxY 中心；
- 侧栏独立滚动，不再改变舞台高度。

### 修复后 B1

![聚焦建筑 B1](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-35-focus-b1-real.png)

通过：

- B1 选择状态明确显示；
- 地下楼梯真实连接地面与 B1；
- 地下楼板、储藏体块和网格可见；
- 镜头没有再次贴底或被裁切。

仍未通过：

- B1 的具体“档案库”家具在当前选择的第一个 guild 建筑中不够突出；下一轮应自动选择包含目标功能模块的建筑进行聚焦，而不是默认第一个建筑。

自动验证：

```text
180 tests passed
npm run build passed
git diff --check passed
```
