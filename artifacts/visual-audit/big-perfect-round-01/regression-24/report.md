# Regression 24 report

日期：2026-08-13  
范围：facade/mass 按需建筑内部、full-interior 内嵌建筑、settlement 返回状态、透明切换、空心古树垂直通路。

## 结论

本轮实现可提交候选，未发现生成器、回放元数据、建筑进入/返回或古树可站立几何的阻断缺陷。另修复了一个 UI 边界状态问题：建筑不存在或按需 replay manifest 无效时，进入按钮不再提前创建脏的返回会话。

## 关键行为

- facade/mass 建筑在 settlement 中仅生成外部 envelope、功能模块摘要和可回放 manifest，不生成 `focus-interior` 几何。
- facade/mass 进入时由 `generateBuildingInteriorScene()` 使用 `BuildingInstance.seed`、`envelopeProgram`、`interiorProgram` 重新生成独立内部；稳定 seed 与 envelope signature 不匹配会显式失败。
- full-interior 建筑继续由 `instantiateFullInterior()` 内嵌生成，建筑 identity tag、房间图、连接和垂直核心保持归属。
- 返回 settlement 时恢复原 scene、floor view、相机、target、透明状态、low/top camera 状态和选中建筑。
- 空心古树包含真实 `stairs`、`stair-landing` / `support-surface` / `standable` 几何，并与 `hollow-tree-spiral-route` 对齐。

## 浏览器视觉审计

证据文件：

- `building-focus-audit.json`
- `extra-browser-audit.json`
- `canal-demand-tower-settlement-overview.png`
- `canal-demand-tower-focused-ground.png`
- `canal-demand-tower-focused-upper.png`
- `canal-demand-tower-focused-basement.png`
- `canal-demand-tower-returned-settlement.png`
- `canal-full-guild-settlement-overview.png`
- `canal-full-guild-focused-ground.png`
- `canal-full-guild-focused-upper.png`
- `canal-full-guild-focused-basement.png`
- `canal-full-guild-returned-settlement.png`
- `mangrove-full-tavern-settlement-overview.png`
- `mangrove-full-tavern-focused-ground.png`
- `mangrove-full-tavern-focused-upper.png`
- `mangrove-full-tavern-focused-basement.png`
- `mangrove-full-tavern-returned-settlement.png`
- `canal-transparency-off.png`
- `canal-transparency-on.png`
- `hollow-tree-overview.png`
- `hollow-tree-spiral-low.png`

按需 tower（修复后）楼层三角形：

- ground：516
- upper：324
- basement：420

修复前记录：`upper=0 triangles`；修复后 upper 已恢复为 `324 triangles`。settlement overview / returned settlement 分别为 `91,518 triangles`；同一审计中的其他场景按其自身地图规模记录为 `98,514 triangles`。

full-interior guild 与 tavern 均可进入 ground、upper、basement，并保持建筑内部几何归属；guild 审计中的 focus primitive count 为 0，说明没有额外旧式 focus blueprint 泄漏到 settlement。

透明切换前后：

- camera：`x=169.7736, y=126.3072, z=160.4772`
- target：`x=65.532, y=0.12, z=48.006`
- near/far：`0.1 / 1645.92`
- 仅 `buildingTransparency` 从 `false` 变为 `true`，相机参数不变。

空心古树：

- route：`hollow-tree-spiral-route`
- 真实楼梯：`hollow-tree-spiral-route-stairs`
- 下层 landing：`hollow-tree-spiral-route-lower-landing`
- 额外根部楼梯：`hollow-tree-root-stairs`
- route 与 traversal 几何均有 `standable`；landing 具有 `stair-landing`、`support-surface`、`standable`。

网络与控制台：

- `networkFailures: []`
- `consoleErrors: []`
- 生成诊断 warnings：`[]`

## 代码证据

- `src/generators/buildingModule.ts:1976`：`instantiateBuildingModule()`；facade/mass 仅保留 envelope 与 manifest，不再调用旧 `addFocusInteriorBlueprint()`。
- `src/generators/buildingModule.ts:2121`：`generateBuildingInteriorScene()`；稳定 seed replay、manifest 校验和独立 full interior 生成。
- `src/generators/buildingModule.ts:1840`：`instantiateFullInterior()`；full-interior 内嵌 geometry 与 `BuildingInstance` identity。
- `src/generators/siteSettlement.ts:272`：空心古树 spiral steps、真实 stairs、lower landing 和 vertical route。
- `src/schema.ts:87`：`BuildingInstance` replay metadata，包括 `siteProfile`、`functionalModules`、`state`。
- `src/ui/App.ts:331`：建筑进入/返回；先校验并生成按需内部，成功后才创建 `BuildingEntrySession`。
- `src/ui/buildingEntrySession.ts:13`：scene/view snapshot 与 camera/target clone。
- `tests/composition.interface.test.ts:132`：facade/mass placeholder、stable replay metadata、无 `focus-interior`。
- `tests/generators.test.ts:472` 附近：按需 replay、stairs/landing、楼层与状态合同。

## 门禁结果

- 定向测试：3 files，164/164 passed。
- 全量 `npm test`：15 files，315/315 passed。
- `npm run build`：通过；TypeScript 与 Vite production build 均成功。
- `git diff --check`：通过。
- Promptfoo：20/20 passed，7,258 tokens，0 failed / 0 errors；该结果仅作为确定性规则模式与强制 Ollama 模式的质量证据，未记录 Token 节省。
- 最终代码状态下重新运行完整 Playwright 浏览器矩阵与额外审计：成功；截图和 JSON 已被本轮结果覆盖。
- 构建仅有既存的大 chunk warning（超过 500 kB），不是本轮失败。

## 未解决风险

- 本轮只覆盖 Regression 24 指定的建筑进入、透明模式与空心古树场景；长期 Goal 中完整的多提示、多 Seed、多尺寸、多密度视觉矩阵与性能/组合覆盖仍需后续轮次继续扩展。
