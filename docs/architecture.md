# 生成架构

TRPG Locations 将空间逻辑与渲染分离。渲染器只消费 `GeneratedScene`，不参与决定房间尺寸、道路拓扑或战术路线。

## 不变量

- 一格恒为 5 英尺（1.524 米）。
- 同一请求与种子必须生成相同的规划结果。
- 尺寸、拓扑和派生数据由程序规则决定；语义模型只能产生意图和标签。
- 建筑、基础设施和自然空间使用不同的生成语法。
- 聚落规划器只组合道路、地块和建筑模块；建筑模块本身仍由独立建筑语法生成。
- `BuildingInstance` 是聚落与建筑生成器之间的持久边界：每个地块保存独立 Seed、原型、楼层高度分布、占地和 `detailLevel`，因此可在不重排城市道路的情况下按需展开完整室内。
- 生成结果必须经过验证，严重错误不能伪装为成功。

## 数据流

```text
GenerationRequest
  -> SceneProgram v1 (local planner or constrained Ollama planner)
  -> deterministic SceneProgram compiler
  -> seeded domain generator registry
  -> scene primitives / rooms / routes / tactical features
  -> validation and bounded repair
  -> Three.js renderer
```

## SceneProgram v1

`SceneProgram` is the semantic intermediate representation between prose and geometry. It contains domain, ruleset, era, topology, morphology/coverage operators, abstract regions, region relations, gameplay objectives and bounded constraints. It never contains coordinates, exact dimensions, cells or meshes.

- The model may propose regions and relations, but deterministic generators still own every 5-ft dimension, elevation, opening, route point and primitive.
- The local parser rejects unknown shapes, undeclared relation endpoints and invalid enums. A narrow Ollama boundary normalizes only unambiguous synonyms before the same strict parser.
- Recognised physical operators and known functional domains use the fast local planner. Ollama is reserved for unresolved building or natural concepts; failure falls back to the local plan without stopping generation.
- Fixed generators retain their established named RNG streams. Adding semantic compilation therefore does not reshuffle already-valid maps.
- The compiler annotates domain output and may place non-blocking evidence, but it cannot invent routes across room centres. Only a domain generator with knowledge of real surfaces and openings may author movement geometry.
- D&D plans favour combat routes and control points. CoC plans favour real functions, evidence, restricted spaces and escape routes.

Current cross-domain realizations include impact craters, radial fractures, infernal wastes, dragon-bone coverage, functional institutions, three-level basement/ground/upper circulation, and settlement networks. Unknown constructed locations use the functional building compiler instead of hashing into a manor, fortress or other unrelated fantasy archetype.

## 坐标约定

- Three.js 世界坐标以米为单位，Y 轴向上。
- 规划尺寸以战术格表达，进入几何层时乘以 `GRID_METERS`。
- `position.x/z` 是几何中心，`position.y` 是几何底面高度；`size` 是完整世界尺寸。渲染器只在构造矩阵时把底面高度换算为几何中心，楼层与路线因此共享同一基准面。
- `level` 是逻辑楼层，`position.y` 是实际高度，两者都必须存在，便于剖切和验证。
- 网格不是单独贴在地面上的装饰：渲染器按 `floorHeightFeet` 累加每个楼层的底面高度，在每个楼板上生成 5 英尺线框，并与楼层剖切共享过滤规则。同楼层的数千个地形格会合并为一个线段批次，既保留每个高低面上的格线，也避免每格一个 draw call。
- 建筑半透明是渲染器的可切换表现层：带墙体/建筑标签的实例批次进入 ghost 材质分组，使用低 opacity、关闭 depthWrite 来显示内部，不改变规则层的碰撞或可达性。

## 扩展场景

新增类别时优先组合以下能力，而不是新增固定地图：

- domain：建筑、聚落、基础设施、自然空间
- form：线性、分支、环形、庭院、垂直、地下
- function：居住、公共、后勤、宗教、防御、工业
- circulation：主路径、替代路径、垂直路径、秘密路径
- environment：潮湿、寒冷、沿海、山地、废弃、繁荣

当前域注册表：

- `building`：通过 `archetype` 选择中轴圣所、庭院翼楼、操练厅/宿舍、书库回廊、作业跨、仓储猫道、堡垒幕墙或矿井巷道。
- `settlement`：通过 `archetype` 选择村庄、城镇、城市或港区，先生成弯折道路图和广场，再沿道路法线生成地块，执行边界、广场、水岸和建筑互相碰撞约束。输入密度会传播到建筑数量；城墙按道路门户分段；区内房间、区际枢纽和广场构成分层关系图。
- 聚落中的住宅、酒馆、神殿、仓库、塔楼、庄园由 `buildingModule` 分别生成不同的轮廓、翼楼/中轴/高耸体量、屋顶和战术点；规划器只负责选择与拼贴，不把单一矩形换材质当作新建筑。
- 路线除几何类型外，还可携带 `purpose` 和 0..1 `traffic`；因此同一套可达性图可表达市民通勤、市场聚集、服务通道和港口货运，不需要把这些规则写进渲染器。
- 路线还可带 `schedule: day | night | all`。渲染器按时段过滤路线，并同步调整昼夜环境光、雾色和暖色补光；楼层剖切与时段过滤可以叠加。
- `wilderness` 使用两层组合：基础空间语法提供河谷、裂谷、山地、冰原、遗迹、地下湖等尺度；`TerrainMorphology` 再叠加河道切割、干河床、火山口、熔岩流、墓丘/墓穴、林冠、菌林、湿地或遗迹覆盖。森林和河流因此是“连续河谷 + 两岸林群”，不是先选森林后忽略河流。
- 地貌算子先生成高程/缺口语义场，再由统一 realization pass 生成每个可走顶面和相邻高度之间的真实垂直面。火山、墓地、河床等共享 realization 合同，但高程函数、材质域、路线和战术地标不同，不是完整地图模板换 Seed。
- 自然场景的细节不是套建筑房间模板：每次生成还会按 Seed 增加不规则天然掩体、地形障碍、危险点与可站立自然物；`terrain/standable` 图元在自身顶面生成局部网格，使格线与高低差一起走。
- 楼梯网格由 `stairs` 图元的宽度、运行长度、升高和旋转推导，每一级踏步各自生成贴面线段；因此网格不会穿过坡道，也不会退回全局平面。

专用生成器只在该类别确实具有独特空间规律时增加。

## 性能原则

- 重复几何优先实例化。
- 静态几何按材质与楼层组织。
- 调试线框、路线和战术标记可独立关闭。
- 小场景继续全域实例合批；世界跨度超过 60 格时，实例按 28 格空间块分批，使放大查看街区时的视锥剔除真正生效。
- 规划与校验由 `generation.worker.ts` 移出渲染主线程；不支持 Worker 的环境使用按需加载的确定性回退。
- Three.js/`SceneRenderer` 是独立延迟块；当前首屏 JS 约 20 KB，SceneProgram + 规划 worker 约 163 KB，渲染块约 555 KB（压缩前）。
- 大型聚落后续按区块生成，建筑内部按需加载。

## 本地语义边界

`scene-program/ollamaPlanner.ts` 请求本机 Ollama 返回完整但抽象的 SceneProgram。请求同时提供 JSON Schema、精确对象模板和枚举约束；由于部分 MLX runner 只把 schema 当提示，返回值仍必须经过本地规范化和严格解析。成功结果在 worker 内按规范化提示缓存 32 条。模型不可用、超时或返回不合规时立即使用本地 SceneProgram；米/英尺尺寸、高程 realization、路线边、随机流、碰撞和修复不存在模型入口。
