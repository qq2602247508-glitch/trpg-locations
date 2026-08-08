import type { CapabilityCard, CapabilityStatus, CompositionGrammar, DesignerMotif, FunctionalModule, SpatialAtomDefinition } from "./schema";

const atom = (value: Omit<SpatialAtomDefinition, "version" | "parameters" | "footprintCells" | "elevationFeet" | "ports" | "inputPorts" | "outputPorts" | "supportSurfaces" | "walkableSurfaces" | "blockedVolumes" | "clearanceVolumes" | "traversal" | "adjacencyConditions" | "placementConstraints" | "constraints" | "tacticalEffects" | "gridRule" | "lod" | "instancingStrategy" | "performanceBudget" | "validation" | "visualFixtures" | "failureConditions"> & Partial<SpatialAtomDefinition>): SpatialAtomDefinition => ({
  version: 1,
  parameters: [], footprintCells: { min: [1, 1], max: [64, 64] }, elevationFeet: { min: -100, max: 300 }, ports: [], inputPorts: [], outputPorts: [], supportSurfaces: [], walkableSurfaces: [], blockedVolumes: [], clearanceVolumes: [], traversal: ["walk"], adjacencyConditions: [], placementConstraints: [], constraints: [], tacticalEffects: [], gridRule: "surface", lod: "batched", instancingStrategy: "merged-batch", performanceBudget: { maxTriangles: 12000, maxDrawCalls: 2 }, validation: ["finite-geometry", "surface-grid-aligned"], visualFixtures: ["small-sparse", "medium-balanced", "large-dense", "same-seed-replay", "different-seed-variation"], failureConditions: ["zero-height", "floating-without-support"],
  ...value,
});

export const GEOMETRY_PRIMITIVES = [
  { id: "primitive.box", status: "production-ready", description: "板、梁、墙和地形单元。", builder: "box", supportsGrid: true, supportsBatching: true },
  { id: "primitive.cylinder", status: "production-ready", description: "柱、树干、圆台与池体。", builder: "cylinder", supportsGrid: true, supportsBatching: true },
  { id: "primitive.path-band", status: "production-ready", description: "道路、桥面、水道和曲线路径带。", builder: "corridor", supportsGrid: true, supportsBatching: true },
  { id: "primitive.stair-run", status: "production-ready", description: "带端点合同的连续台阶。", builder: "stairConnection", supportsGrid: true, supportsBatching: false },
  { id: "primitive.gable", status: "production-ready", description: "真实三角截面坡屋顶。", builder: "gable", supportsGrid: false, supportsBatching: true },
  { id: "primitive.water-surface", status: "production-ready", description: "水面与流体路径段。", builder: "water", supportsGrid: false, supportsBatching: true },
  { id: "primitive.free-polygon", status: "planned", description: "自由多边形可站立面。", builder: "planned:polygon", supportsGrid: true, supportsBatching: false },
  { id: "primitive.curved-wall", status: "prototype", description: "分段圆弧墙体。", builder: "roundWall", supportsGrid: false, supportsBatching: true },
  { id: "primitive.boolean-opening", status: "planned", description: "门窗、洞口和切割体。", builder: "planned:boolean-opening", supportsGrid: false, supportsBatching: false },
] as const satisfies readonly import("./schema").GeometryPrimitiveDefinition[];

export const SPATIAL_ATOMS: readonly SpatialAtomDefinition[] = [
  atom({ id: "terrain.height-field", status: "production-ready", category: "terrain", label: "分层高程场", description: "生成可站立面、坡面和真实垂直断面。", tags: ["terrain", "elevation", "cliff-face"], geometryBuilder: "renderMorphologyField" }),
  atom({ id: "terrain.irregular-clearing", status: "validated", category: "terrain", label: "不规则林间空地", description: "从生态覆盖中切出不规则战斗空间。", tags: ["clearing", "terrain", "standable"], geometryBuilder: "buildForestClearings" }),
  atom({ id: "terrain.crater-rim", status: "validated", category: "terrain", label: "破碎环坑", description: "有缺口、内坡和外缘喷出物的冲击坑。", tags: ["crater", "rim", "fracture"], geometryBuilder: "buildImpactCrater" }),
  atom({ id: "terrain.caldera", status: "validated", category: "terrain", label: "破火山口", description: "不完整环壁、熔岩底和多条危险出口。", tags: ["caldera", "volcanic", "lava"], geometryBuilder: "buildVolcanic" }),
  atom({ id: "water.meandering-channel", status: "production-ready", category: "water", label: "弯曲主河道", description: "宽度、曲率和水位随分层 Seed 改变。", tags: ["river", "channel", "waterflow"], geometryBuilder: "buildRiverValleyContinuous", gridRule: "water-edge" }),
  atom({ id: "water.tributary", status: "validated", category: "water", label: "支流", description: "以水流端口接入主河并改变岸线。", tags: ["tributary", "river", "waterflow"], geometryBuilder: "buildRiverTributary", gridRule: "water-edge" }),
  atom({ id: "water.waterfall", status: "validated", category: "water", label: "瀑布与跌水池", description: "上、下游水位不同并生成真实竖向水面。", tags: ["waterfall", "drop", "deep-pool"], geometryBuilder: "buildWaterfall", gridRule: "water-edge" }),
  atom({ id: "ecology.tree-cluster", status: "production-ready", category: "ecology", label: "树群", description: "按斑块而非均匀散点生成乔木和林冠。", tags: ["tree", "forest", "canopy", "cover"], geometryBuilder: "buildTreeCluster", lod: "instanced" }),
  atom({ id: "ecology.undergrowth", status: "validated", category: "ecology", label: "林下植被", description: "影响移动和视线的灌木、蕨类和枯枝。", tags: ["undergrowth", "forest", "difficult-terrain"], geometryBuilder: "buildUndergrowth", lod: "instanced" }),
  atom({ id: "ecology.fallen-log", status: "validated", category: "ecology", label: "倒木", description: "可攀爬、作掩体或桥接浅沟的倒木。", tags: ["fallen-log", "cover", "climbable"], geometryBuilder: "buildFallenLog" }),
  atom({ id: "ecology.ancient-tree", status: "validated", category: "ecology", label: "巨树战术点", description: "大型树干、根台和可达树冠平台。", tags: ["giant-tree", "canopy-platform", "high-ground"], geometryBuilder: "buildAncientTree" }),
  atom({ id: "route.surface-trail", status: "production-ready", category: "route", label: "贴地路径", description: "路径跟随可站立表面并连接战术区。", tags: ["route", "trail", "surface-grid"], geometryBuilder: "corridor" }),
  atom({ id: "route.bridge", status: "production-ready", category: "route", label: "桥梁", description: "跨越水、裂缝或高差的有支撑通道。", tags: ["bridge", "route", "supported"], geometryBuilder: "corridor" }),
  atom({ id: "route.vertical", status: "production-ready", category: "route", label: "垂直交通", description: "楼梯、坡道或梯子两端落在可站立面。", tags: ["vertical-route", "stairs", "support"], geometryBuilder: "stairConnection" }),
  atom({ id: "tactical.platform", status: "production-ready", category: "tactical", label: "战术平台", description: "有真实高度、入口与边缘防护的制高点。", tags: ["platform", "high-ground", "standable"], geometryBuilder: "buildTacticalPlatform" }),
  atom({ id: "structure.embedded-building", status: "production-ready", category: "structure", label: "场地内独立建筑", description: "以独立 Seed、地基和入口嵌入自然或聚落。", tags: ["building", "interior", "foundation", "entrance"], geometryBuilder: "instantiateBuildingModule", lod: "unique" }),
  atom({ id: "terrain.slope", status: "planned", category: "terrain", label: "连续斜坡", description: "在高程带之间提供合法步行过渡。", tags: ["slope", "terrain", "vertical-route"], geometryBuilder: "planned:slope" }),
  atom({ id: "terrain.terrace", status: "planned", category: "terrain", label: "自然台地", description: "带断面和边缘破碎的多级可站立台地。", tags: ["terrace", "shelf", "high-ground"], geometryBuilder: "planned:terrace" }),
  atom({ id: "terrain.ravine", status: "planned", category: "terrain", label: "弯曲沟谷", description: "连续切开场地并产生桥接需求。", tags: ["ravine", "void", "cliff-face"], geometryBuilder: "planned:ravine" }),
  atom({ id: "terrain.crevasse", status: "planned", category: "terrain", label: "冰川裂缝", description: "可完全断开地图的深裂隙网络。", tags: ["ice", "crevasse", "void"], geometryBuilder: "planned:crevasse" }),
  atom({ id: "terrain.cave-chamber", status: "planned", category: "terrain", label: "洞穴腔体", description: "带洞壁、顶高、入口与相邻通道的地下空间。", tags: ["cave", "chamber", "cave-wall"], geometryBuilder: "planned:cave-chamber" }),
  atom({ id: "terrain.floating-island", status: "planned", category: "terrain", label: "有厚度浮岛", description: "具有底面、边缘、支撑逻辑和垂直交通的浮空地形。", tags: ["floating-island", "vertical-face", "high-ground"], geometryBuilder: "planned:floating-island" }),
  atom({ id: "terrain.marsh-basin", status: "planned", category: "terrain", label: "沼泽盆地", description: "干地斑块、泥潭、水道和芦苇覆盖共同构成。", tags: ["swamp", "mud", "wetland"], geometryBuilder: "planned:marsh-basin" }),
  atom({ id: "terrain.coastal-cliff", status: "planned", category: "terrain", label: "海岸崖线", description: "海面、崖壁、潮台与上下崖路线。", tags: ["coast", "cliff", "tide"], geometryBuilder: "planned:coastal-cliff" }),
  atom({ id: "water.pool", status: "planned", category: "water", label: "水池与深潭", description: "有岸缘、深浅区和可渡点的水体。", tags: ["pool", "water", "hazard"], geometryBuilder: "planned:pool" }),
  atom({ id: "water.tidal-channel", status: "planned", category: "water", label: "潮汐水道", description: "水位状态改变合法路线与站立面。", tags: ["tide", "channel", "state-change"], geometryBuilder: "planned:tidal-channel" }),
  atom({ id: "water.lava-network", status: "prototype", category: "water", label: "熔岩网络", description: "主熔岩池、支流和跨越点组成的危险网络。", tags: ["lava", "lava-branch", "hazard"], geometryBuilder: "buildVolcanic" }),
  atom({ id: "ecology.root-network", status: "planned", category: "ecology", label: "巨树根系", description: "根墙、根桥、空洞和可攀爬根台。", tags: ["root", "giant-tree", "route"], geometryBuilder: "planned:root-network" }),
  atom({ id: "ecology.fungal-grove", status: "prototype", category: "ecology", label: "巨型菌林", description: "蘑菇伞台、菌柄掩体和孢子危险区。", tags: ["fungal", "mushroom", "platform"], geometryBuilder: "addGiantFungalLandmarks" }),
  atom({ id: "structure.room-cell", status: "planned", category: "structure", label: "功能房间", description: "带边界、入口、用途、净空和邻接端口的房间。", tags: ["room", "wall", "door"], geometryBuilder: "planned:room-cell" }),
  atom({ id: "structure.courtyard", status: "planned", category: "structure", label: "围合庭院", description: "由建筑体块围合而非独立地板声明的庭院。", tags: ["courtyard", "exterior", "enclosure"], geometryBuilder: "planned:courtyard" }),
  atom({ id: "structure.roof-system", status: "planned", category: "structure", label: "屋顶系统", description: "坡屋顶、屋脊、女儿墙、缺口和可达平台。", tags: ["roof", "parapet", "roof-route"], geometryBuilder: "planned:roof-system" }),
  atom({ id: "structure.spiral-stair", status: "prototype", category: "structure", label: "连续旋梯", description: "踏步连续旋转并连接真实楼层开口。", tags: ["spiral-stair", "vertical-route", "opening"], geometryBuilder: "buildSpiralStair" }),
  atom({ id: "structure.wall-opening", status: "planned", category: "structure", label: "墙与开口", description: "墙段、门洞、窗口、射击孔和破损缺口。", tags: ["wall", "door", "window", "opening"], geometryBuilder: "planned:wall-opening" }),
  atom({ id: "structure.supported-catwalk", status: "planned", category: "structure", label: "有支撑猫道", description: "立柱、梁、护栏、入口与网格完整的高架通道。", tags: ["catwalk", "support", "guardrail"], geometryBuilder: "planned:supported-catwalk" }),
  atom({ id: "tactical.cover-cluster", status: "planned", category: "tactical", label: "掩体组合", description: "服务视线与路线的高低掩体组，而非随机散点。", tags: ["cover", "line-of-sight", "tactical"], geometryBuilder: "planned:cover-cluster" }),
  atom({ id: "state.collapse", status: "planned", category: "state", label: "坍塌状态", description: "移除楼板和墙体并生成瓦砾、缺口与备用路线。", tags: ["collapse", "rubble", "alternate-route"], geometryBuilder: "planned:collapse" }),
  atom({ id: "state.flood", status: "planned", category: "state", label: "淹水状态", description: "水位改变房间、危险和路线。", tags: ["flood", "water", "state-change"], geometryBuilder: "planned:flood" }),
  atom({ id: "state.overgrowth", status: "planned", category: "state", label: "植物侵入", description: "根系与植被改变建筑开口、掩体和攀爬路线。", tags: ["overgrowth", "root", "climbable"], geometryBuilder: "planned:overgrowth" }),
  atom({ id: "structure.hollow-tree-shell", status: "validated", category: "structure", label: "空心古树壳体", description: "由不规则树皮段、根部支撑和内部环带共同形成可进入的巨树城市容器。", tags: ["hollow-tree", "bark-wall", "spiral-tree-street", "root-archive"], geometryBuilder: "addHollowTreeCity", tacticalEffects: ["cover", "high-ground", "hazard"], visualFixtures: ["tree-shell-small", "tree-shell-large", "same-seed-replay", "different-seed-variation"], failureConditions: ["solid-trunk-blocks-interior", "unsupported-canopy"] }),
  atom({ id: "ecology.mangrove-canopy", status: "validated", category: "ecology", label: "红树林冠层与根网", description: "把潮汐水道、树根栈道、吊脚建筑和冠层掩体绑定到同一湿地支撑面。", tags: ["mangrove", "canopy", "prop-root", "root-boardwalk"], geometryBuilder: "addMangroveSmugglerPort", tacticalEffects: ["cover", "hazard", "chokepoint"], visualFixtures: ["mangrove-sparse", "mangrove-dense", "same-seed-replay", "different-seed-variation"], failureConditions: ["dry-flat-marsh", "floating-dock"] }),
  atom({ id: "terrain.salt-crystal-island", status: "validated", category: "terrain", label: "盐晶浮岛", description: "分离的盐晶承载面、暴露底面和高度端口组成可建造浮空层。", tags: ["salt-crystal", "floating-island", "vertical-face", "high-ground"], geometryBuilder: "addFloatingIslandTerrain", tacticalEffects: ["high-ground", "hazard", "chokepoint"], visualFixtures: ["salt-island-low-angle", "salt-island-top", "same-seed-replay", "different-seed-variation"], failureConditions: ["coplanar-platforms", "floating-without-underside"] }),
  atom({ id: "water.cavern-tide-pool", status: "validated", category: "water", label: "洞底潮池", description: "浮空建筑下方的深水参照面，提供潮池危险和垂直空间尺度。", tags: ["cavern-tide-pool", "watercourse", "hazard"], geometryBuilder: "addFloatingIslandTerrain", tacticalEffects: ["hazard", "alternate-route"], visualFixtures: ["tide-pool-overview", "tide-pool-low-angle", "same-seed-replay"], failureConditions: ["water-without-basin", "unreachable-pool"] }),
  atom({ id: "structure.monastery-cluster", status: "validated", category: "structure", label: "修道院群", description: "礼拜堂、居室、钟塔和服务建筑分别落在父地貌的承载端口上。", tags: ["monastery", "shrine", "tower", "building", "suspension-bridge"], geometryBuilder: "instantiateBuildingModule", tacticalEffects: ["high-ground", "chokepoint", "cover"], visualFixtures: ["monastery-cluster-overview", "monastery-cluster-low-angle", "same-seed-replay"], failureConditions: ["single-box-monastery", "unconnected-island-buildings"] }),
] as const;

export const CAPABILITY_CARDS: readonly CapabilityCard[] = SPATIAL_ATOMS.map((entry) => ({ id: entry.id, label: entry.label, description: entry.description, status: entry.status, tags: entry.tags, atomIds: [entry.id], environments: entry.tags.filter((tag) => ["forest", "river", "volcanic", "cave", "building", "swamp", "coast"].includes(tag)), inputPorts: entry.inputPorts.map((port) => port.kind), outputPorts: entry.outputPorts.map((port) => port.kind), constraints: entry.constraints, recommendedWith: [], qualityGrade: entry.status === "production-ready" ? "A" : entry.status === "validated" ? "B" : entry.status === "prototype" ? "C" : "planned" }));

export const FUNCTIONAL_MODULES: readonly FunctionalModule[] = [
  { id: "module.forest-stratum", label: "森林垂直生态层", capabilityIds: ["terrain.height-field", "ecology.tree-cluster", "ecology.undergrowth"], requiredPorts: ["surface"], realizedTags: ["forest", "canopy", "undergrowth", "elevation"] },
  { id: "module.forest-tactical", label: "森林战术路径", capabilityIds: ["terrain.irregular-clearing", "ecology.fallen-log", "ecology.ancient-tree", "route.surface-trail", "tactical.platform"], requiredPorts: ["route"], realizedTags: ["clearing", "fallen-log", "giant-tree", "canopy-platform"] },
  { id: "module.river-system", label: "完整河流系统", capabilityIds: ["terrain.height-field", "water.meandering-channel", "water.tributary", "water.waterfall", "route.bridge"], requiredPorts: ["water", "route"], realizedTags: ["river", "tributary", "waterfall", "deep-pool"] },
  { id: "module.volcanic-system", label: "火山构造系统", capabilityIds: ["terrain.height-field", "terrain.caldera", "route.surface-trail", "tactical.platform"], requiredPorts: ["surface", "route"], realizedTags: ["caldera", "lava", "fracture", "basalt-platform"] },
  { id: "module.crater-system", label: "冲击坑系统", capabilityIds: ["terrain.height-field", "terrain.crater-rim", "route.surface-trail", "tactical.platform"], requiredPorts: ["surface", "route"], realizedTags: ["impact-crater", "rim", "ejecta", "central-impact"] },
  { id: "module.rift-system", label: "裂谷双岸系统", capabilityIds: ["terrain.height-field", "terrain.ravine", "route.bridge", "route.vertical", "tactical.platform"], requiredPorts: ["surface", "route", "vertical"], realizedTags: ["rift", "crevasse", "rift-bottom", "bridge", "cliff-descent"] },
  { id: "module.site-building", label: "自然场地建筑", capabilityIds: ["structure.embedded-building", "route.surface-trail"], requiredPorts: ["route", "support"], realizedTags: ["building", "interior", "foundation", "site-access"] },
  { id: "module.parent-terrain-compound", label: "承载地貌复合场所", capabilityIds: ["structure.hollow-tree-shell", "ecology.mangrove-canopy", "terrain.salt-crystal-island", "water.cavern-tide-pool", "structure.monastery-cluster", "route.vertical"], requiredPorts: ["support", "route", "vertical"], realizedTags: ["hollow-tree", "mangrove", "salt-crystal", "cavern-tide-pool", "building", "vertical-route"] },
] as const;

export const DESIGNER_MOTIFS: readonly DesignerMotif[] = [
  { id: "motif.closed-canopy-clearings", label: "封闭林冠与三空地", domain: "forest", moduleIds: ["module.forest-stratum", "module.forest-tactical"], requiredCapabilities: ["ecology.tree-cluster", "terrain.irregular-clearing"], structuralRules: ["clearings-are-irregular", "trails-connect-clearings", "canopy-platform-is-reachable"], identityChecks: ["canopy-coverage-visible", "at-least-two-elevation-bands"] },
  { id: "motif.waterfall-valley", label: "有落差的支流河谷", domain: "river", moduleIds: ["module.river-system"], requiredCapabilities: ["water.meandering-channel", "water.tributary", "water.waterfall"], structuralRules: ["water-level-monotonic", "tributaries-join-main-channel", "two-legal-crossings"], identityChecks: ["vertical-water-face-visible", "banks-form-valley"] },
  { id: "motif.broken-caldera", label: "破碎多支流火山口", domain: "volcanic", moduleIds: ["module.volcanic-system"], requiredCapabilities: ["terrain.caldera", "tactical.platform"], structuralRules: ["rim-has-gaps", "lava-has-branches", "safe-route-crosses-hazard"], identityChecks: ["caldera-readable-without-title", "basalt-high-ground-visible"] },
  { id: "motif.impact-basin", label: "喷出物与裂缝冲击坑", domain: "crater", moduleIds: ["module.crater-system"], requiredCapabilities: ["terrain.crater-rim", "tactical.platform"], structuralRules: ["rim-broken", "descent-route-reaches-floor", "fractures-radiate"], identityChecks: ["central-impact-visible", "rim-not-campfire"] },
  { id: "motif.rift-two-banks", label: "双岸与深层裂谷底", domain: "rift", status: "validated", moduleIds: ["module.rift-system"], requiredCapabilities: ["terrain.height-field", "route.bridge", "route.vertical"], structuralRules: ["void-separates-banks", "two-crossings", "bottom-is-reachable"], identityChecks: ["both-banks-visible", "vertical-faces-visible", "bridge-ends-supported"] },
  { id: "motif.embedded-building", label: "地貌内独立建筑", domain: "mixed-site", moduleIds: ["module.site-building"], requiredCapabilities: ["structure.embedded-building"], structuralRules: ["foundation-touches-terrain", "entrance-connects-site-route"], identityChecks: ["building-has-interior", "no-floating-access"] },
  { id: "motif.hollow-tree-city", label: "空心古树内部城市", domain: "forest", moduleIds: ["module.parent-terrain-compound"], requiredCapabilities: ["structure.hollow-tree-shell", "structure.embedded-building"], structuralRules: ["bark-encloses-cavity", "spiral-route-connects-levels", "root-archive-is-accessible"], identityChecks: ["tree-shell-visible", "city-inside-tree"] },
  { id: "motif.mangrove-smuggler-port", label: "红树林走私港", domain: "forest", moduleIds: ["module.parent-terrain-compound"], requiredCapabilities: ["ecology.mangrove-canopy", "water.tidal-channel", "structure.embedded-building"], structuralRules: ["tide-channel-divides-site", "boardwalks-follow-roots", "underwater-entry-is-reachable"], identityChecks: ["mangrove-silhouette-visible", "dock-is-not-flat-road"] },
  { id: "motif.salt-crystal-monastery", label: "盐晶浮空修道院群", domain: "generic", moduleIds: ["module.parent-terrain-compound"], requiredCapabilities: ["terrain.salt-crystal-island", "structure.monastery-cluster", "water.cavern-tide-pool"], structuralRules: ["three-island-height-bands", "bridges-connect-islands", "cavern-pool-below"], identityChecks: ["salt-crystals-visible", "vertical-scale-visible"] },
] as const;

export const COMPOSITION_GRAMMARS: readonly CompositionGrammar[] = [
  { id: "grammar.forest-v1", label: "森林生态—战术语法", domain: "forest", allowedMotifs: ["motif.closed-canopy-clearings", "motif.embedded-building"], orderingRules: ["macro-terrain", "clearings", "routes", "ecology", "tactical", "micro"], topologyChecks: ["all-clearings-reachable", "platform-reachable"] },
  { id: "grammar.river-v1", label: "河谷水文语法", domain: "river", allowedMotifs: ["motif.waterfall-valley", "motif.embedded-building"], orderingRules: ["macro-valley", "water-network", "crossings", "ecology", "micro"], topologyChecks: ["downhill-flow", "both-banks-reachable"] },
  { id: "grammar.volcanic-v1", label: "火山危险场语法", domain: "volcanic", allowedMotifs: ["motif.broken-caldera"], orderingRules: ["macro-caldera", "lava-network", "safe-shelves", "routes", "micro"], topologyChecks: ["objective-reachable", "hazard-not-total-block"] },
  { id: "grammar.crater-v1", label: "冲击坑语法", domain: "crater", allowedMotifs: ["motif.impact-basin"], orderingRules: ["macro-rim", "fractures", "descent", "ejecta", "micro"], topologyChecks: ["floor-reachable", "rim-route-exists"] },
  { id: "grammar.crevasse-v1", label: "裂谷与冰隙语法", domain: "rift", status: "validated", allowedMotifs: ["motif.rift-two-banks", "motif.embedded-building"], orderingRules: ["macro-fracture", "banks", "bottom", "crossings", "vertical-routes", "micro"], topologyChecks: ["banks-separated", "crossings-supported", "bottom-route-valid"] },
  { id: "grammar.generic-v1", label: "保守组合语法", domain: "generic", allowedMotifs: [], orderingRules: ["macro", "routes", "tactical", "micro"], topologyChecks: ["primary-route-exists"] },
] as const;

export function capabilityById(id: string): CapabilityCard | undefined { return CAPABILITY_CARDS.find((entry) => entry.id === id); }
export function motifById(id: string): DesignerMotif | undefined { return DESIGNER_MOTIFS.find((entry) => entry.id === id); }

export interface AtomQualityResult { atomId: string; ready: boolean; issues: string[]; }
export function auditAtomQuality(entry: SpatialAtomDefinition): AtomQualityResult {
  const issues: string[] = [];
  if (entry.footprintCells.min.some((value) => value <= 0) || entry.footprintCells.max.some((value, index) => value < entry.footprintCells.min[index]!)) issues.push("invalid-footprint-range");
  if (entry.elevationFeet.max < entry.elevationFeet.min) issues.push("invalid-elevation-range");
  if (!entry.geometryBuilder) issues.push("missing-geometry-builder");
  if (entry.validation.length < 2) issues.push("insufficient-automatic-validation");
  if (entry.visualFixtures.length < 3) issues.push("insufficient-visual-fixtures");
  if (entry.failureConditions.length < 2) issues.push("insufficient-failure-conditions");
  if (entry.status === "production-ready" && entry.geometryBuilder.startsWith("planned:")) issues.push("production-status-without-builder");
  return { atomId: entry.id, ready: issues.length === 0 && (entry.status === "validated" || entry.status === "production-ready"), issues };
}

export function catalogMaturity(): Record<CapabilityStatus, number> {
  return SPATIAL_ATOMS.reduce<Record<CapabilityStatus, number>>((counts, entry) => { counts[entry.status] += 1; return counts; }, { planned: 0, prototype: 0, validated: 0, "production-ready": 0 });
}
