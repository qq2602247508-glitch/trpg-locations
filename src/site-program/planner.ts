import type { SeededRandom } from "../core/random";
import type { BuildingProgramSummary, SettlementBuildingKind, Vec2 } from "../schema";
import type {
  BlockProgram,
  BuildingFunctionalModuleProgram,
  BuildingFunctionalModuleKind,
  DistrictProgram,
  DistrictRole,
  OpenSpaceProgram,
  ParcelProgram,
  RoadNodeProgram,
  RoadProgram,
  SettlementMorphologyProgram,
  SitePlanningInput,
  SitePoint,
  SiteProgram,
  SiteType,
} from "./schema";

const contains = (text: string, terms: readonly string[]): boolean => terms.some((term) => text.includes(term));

function sizeFactor(size: SitePlanningInput["request"]["size"]): number {
  return size === "small" ? 0.68 : size === "large" ? 1.38 : 1;
}

function inferSiteType(text: string, archetype: SitePlanningInput["archetype"]): SiteType {
  if (contains(text, ["矿业聚落", "矿山聚落", "采矿营地", "矿业营地", "矿工营地", "mining settlement", "mining camp"])) return "mining-settlement";
  if (contains(text, ["火星殖民", "殖民地港口", "mars colony", "colony port"])) return "city-district";
  if (archetype === "harbor") return "harbor-district";
  if (archetype === "city") return "city-district";
  if (archetype === "village") return "village";
  return "town";
}

function requestedBuildingKinds(text: string): SettlementBuildingKind[] {
  const requested: SettlementBuildingKind[] = [];
  const numerals: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  const requestedCount = (terms: readonly string[]): number => {
    for (const term of terms) {
      const index = text.indexOf(term);
      if (index < 0) continue;
      const prefix = text.slice(Math.max(0, index - 14), index);
      const match = prefix.match(/([一二三四五六七八九]|[1-9])(?:栋|座|个|间)?[^，。,.]{0,9}$/);
      if (match?.[1]) return Math.min(9, numerals[match[1]] ?? (Number(match[1]) || 1));
    }
    return 1;
  };
  const add = (kind: SettlementBuildingKind, terms: readonly string[]) => {
    if (!contains(text, terms)) return;
    for (let index = 0; index < requestedCount(terms); index += 1) requested.push(kind);
  };
  add("warehouse", ["仓库", "仓储", "warehouse"]);
  add("tavern", ["酒馆", "旅店", "旅馆", "酒店", "酒吧", "tavern", "inn", "hotel", "bar"]);
  add("guild", ["公会", "学院", "学校", "大学", "警察驻所", "警察局", "警局", "办公室", "guild", "academy", "school", "college", "university", "police station", "police post", "office"]);
  add("shrine", ["神殿", "神庙", "教堂", "礼拜堂", "shrine", "temple", "church", "chapel"]);
  add("tower", ["岗楼", "瞭望塔", "巡逻塔", "观测塔", "观星穹顶", "灯塔", "无线电塔", "钟塔", "控制塔", "watchtower", "guard tower", "patrol tower", "observation tower", "observatory dome", "lighthouse", "radio tower", "bell tower", "control tower"]);
  add("mill", ["磨坊", "mill"]);
  add("blacksmith", ["铁匠", "武器工坊", "blacksmith", "weapon workshop"]);
  add("clinic", ["诊所", "医院", "野战医院", "clinic", "hospital"]);
  add("factory", ["工厂", "厂房", "发电站", "泵房", "工坊", "维修机库", "factory", "power station", "pump house", "pumphouse", "workshop", "hangar"]);
  add("barn", ["马厩", "谷仓", "粮仓", "stable", "barn", "granary"]);
  add("manor", ["庄园", "宅邸", "manor", "mansion"]);
  add("home", ["矿工宿舍", "工人住宅", "住宅", "宿舍", "棚屋", "居住模块", "worker housing", "dormitory", "residence", "shack", "habitat"]);
  return requested;
}

function requestedFunctionalModules(text: string): BuildingFunctionalModuleProgram[] {
  const modules: BuildingFunctionalModuleProgram[] = [];
  const elevatedLaboratory = contains(text, ["树上实验", "树冠实验", "高架实验", "tree laboratory", "canopy laboratory", "elevated laboratory"]);
  const floodedArchive = contains(text, ["半淹档案", "水下档案", "淹水档案", "flooded archive", "submerged archive"]);
  const submergedGreenhouse = contains(text, ["水下温室", "半淹温室", "潮池温室", "underwater greenhouse", "submerged greenhouse"]);
  const undergroundGreenhouse = !submergedGreenhouse && contains(text, ["地下菌类温室", "地下温室", "洞穴温室", "underground greenhouse", "subterranean greenhouse"]);
  const fungalGreenhouse = contains(text, ["菌类温室", "菌菇温室", "fungal greenhouse", "mushroom greenhouse"]);
  const add = (
    kind: BuildingFunctionalModuleKind,
    label: string,
    terms: readonly string[],
    levelRole: BuildingFunctionalModuleProgram["levelRole"],
    options: Pick<BuildingFunctionalModuleProgram, "minimumFootprintCells" | "tags"> & Partial<Pick<BuildingFunctionalModuleProgram, "requiresWater" | "requiresExteriorAccess" | "requiresVerticalLandmark">>,
  ) => {
    if (!contains(text, terms) || modules.some((module) => module.kind === kind)) return;
    modules.push({
      id: `function-${kind}-${modules.length + 1}`,
      kind,
      label,
      levelRole,
      ...options,
    });
  };
  add("laboratory", elevatedLaboratory ? "Elevated research laboratory" : "Research laboratory", ["实验屋", "实验室", "研究室", "研究屋", "laboratory", "research lab"], elevatedLaboratory ? "upper" : "ground", {
    minimumFootprintCells: 20,
    tags: ["research", "workbench", "hazard", ...(elevatedLaboratory ? ["tree-platform", "elevated"] : [])],
  });
  add("distillation", "Distillation works", ["蒸馏塔", "蒸馏室", "冷凝塔", "炼金塔", "distillation", "still", "condenser"], "exterior", {
    minimumFootprintCells: 18,
    requiresExteriorAccess: true,
    requiresVerticalLandmark: true,
    tags: ["distillation", "tank", "pipe", "maintenance-platform"],
  });
  add("archive", floodedArchive ? "Half-flooded secured archive" : "Secured archive", ["档案库", "档案室", "藏经洞", "书库", "archive", "records vault"], "basement", {
    minimumFootprintCells: 16,
    requiresWater: floodedArchive,
    tags: ["archive", "reserve-vault", "shelf", "restricted", ...(floodedArchive ? ["flooded", "water-access"] : [])],
  });
  add("greenhouse", submergedGreenhouse ? "Submerged cultivation greenhouse" : undergroundGreenhouse ? "Underground fungal greenhouse" : "Cultivation greenhouse", ["温室", "培育室", "植物研究", "greenhouse", "glasshouse", "cultivation"], submergedGreenhouse || undergroundGreenhouse ? "basement" : "exterior", {
    minimumFootprintCells: 20,
    requiresWater: submergedGreenhouse,
    requiresExteriorAccess: true,
    tags: ["greenhouse", "growing-bed", "wet-zone", ...(submergedGreenhouse ? ["submerged", "flooded"] : []), ...(undergroundGreenhouse ? ["underground"] : []), ...(fungalGreenhouse ? ["fungal"] : [])],
  });
  add("submerged-room", "Flood-adapted chamber", ["水下秘密入口", "水下入口", "水下通道", "半淹房间", "潮池入口", "submerged room", "underwater entrance", "half-flooded chamber"], "basement", {
    minimumFootprintCells: 18,
    requiresWater: true,
    tags: ["submerged", "flooded", "water-access"],
  });
  add("observation", "Observation platform", ["观测台", "观星台", "天线", "瞭望平台", "observation", "observatory", "antenna"], "roof", {
    minimumFootprintCells: 14,
    requiresExteriorAccess: true,
    requiresVerticalLandmark: true,
    tags: ["observation", "high-ground", "roof-platform"],
  });
  add("workshop", "Specialist workshop", ["车间", "工坊", "维修间", "试金", "workshop", "machine shop", "assay"], "ground", {
    minimumFootprintCells: 20,
    tags: ["workshop", "machinery", "cover"],
  });
  return modules;
}

function preferredCarrier(module: BuildingFunctionalModuleProgram): SettlementBuildingKind {
  if (module.kind === "observation") return "tower";
  if (module.kind === "distillation") return "factory";
  if (module.kind === "laboratory" && module.tags.includes("elevated")) return "home";
  if (module.kind === "submerged-room") return "warehouse";
  if (module.kind === "greenhouse") return "factory";
  if (module.kind === "laboratory" || module.kind === "archive") return "guild";
  return "factory";
}

function requestedSiteFeatures(text: string): string[] {
  const features: string[] = [];
  const add = (feature: string, terms: readonly string[]) => { if (contains(text, terms) && !features.includes(feature)) features.push(feature); };
  add("rail-yard", ["铁路货场", "铁路", "货运轨道", "rail yard", "railway", "freight rail"]);
  add("industrial-plant", ["工业街区", "发电站", "厂房", "工业区", "维修机库", "采矿营地", "矿业营地", "mining camp", "industrial district", "power station", "factory", "hangar"]);
  add("conveyor-network", ["输送桥", "输送带", "维护桥", "维修桥", "maintenance bridge", "conveyor"]);
  add("underground-maintenance", ["地下维护", "地下电缆", "桥下维修", "生命维持层", "maintenance tunnel", "cable level", "life support"]);
  add("flooded-site", ["洪水", "淹没", "被淹", "flooded", "flood"]);
  add("elevated-rail", ["高架铁路", "高架铁道", "elevated railway", "viaduct"]);
  add("mountain-monastery", ["山地修道院", "山顶修道院", "mountain monastery"]);
  add("radio-observatory", ["无线电观测", "气象站", "无线电塔", "radio observatory", "weather station"]);
  add("river-crossing", ["河上", "石桥", "河谷", "浅滩", "河桥", "river bridge", "river crossing", "ford"]);
  add("gate-district", ["城门街区", "城门到市场", "gate district", "city gate"]);
  const explicitWaterCity = contains(text, ["河道水城", "水上城市", "水上市集", "主运河", "支流", "运河", "潮汐沟渠", "水闸", "water city", "canal", "tidal channel", "sluice"]);
  if (explicitWaterCity) features.push("water-city");
  add("hillside-district", ["山坡贵族区", "等高线道路", "山顶神殿", "hillside", "contour road"]);
  add("war-damaged", ["战争破坏", "坍塌住宅", "临时街垒", "破损道路", "war-damaged", "barricade"]);
  add("vertical-slum", ["垂直贫民", "巨型桥墩", "桥墩棚屋", "多层棚屋", "vertical slum", "bridge pier settlement"]);
  add("colony-port", ["火星殖民", "气闸", "居住模块", "温室", "mars colony", "airlock"]);
  add("coastal-town", ["海滨小镇", "1920年代海滨", "coastal town", "seaside town"]);
  add("coastal-cliff", ["海崖港镇", "分层海崖", "悬崖港镇", "sea-cliff port", "cliff port"]);
  add("fantasy-harbor", ["深水城港区", "奇幻港区", "deepwater harbor", "fantasy harbor"]);
  add("impact-crater-settlement", ["陨石坑", "撞击坑", "流星坑", "impact crater", "meteor crater"]);
  add("volcanic-settlement", ["火山口村", "火山村", "火山聚落", "破火山口聚落", "火山灰峡谷", "熔岩营地", "volcanic settlement", "volcano village", "caldera village", "volcanic canyon"]);
  add("ice-crevasse-settlement", ["冰川裂隙", "冰川裂缝", "巨大裂隙", "冰隙聚落", "glacier crevasse", "crevasse settlement"]);
  add("underdark-settlement", ["幽暗地域村", "幽暗地域聚落", "地下聚落", "underdark village", "underdark settlement"]);
  add("hollow-tree-city", ["空心古树", "古树内部", "树内城市", "树上城市", "hollow tree", "hollow-tree city"]);
  add("mangrove-smuggler-port", ["红树林", "走私港", "港村", "红树林港", "mangrove", "smuggler port"]);
  add("salt-crystal-monastery", ["盐晶", "盐晶洞窟", "浮空修道院", "修道院群", "salt crystal", "floating monastery", "monastery cluster"]);
  add("tower-city", ["巨塔城市", "巨型塔楼结构", "城市分布在巨型塔", "tower city", "megastructure city"]);
  add("bone-swamp-settlement", ["石化龙骨", "肋骨栈道", "骨架高台", "dragonbone swamp", "fossil ribs"]);
  add("airship-wreck-settlement", ["坠毁飞艇", "飞艇残骸", "残骸主梁", "crashed airship", "airship wreck"]);
  add("premodern-old-city", ["深水城", "旧城", "老城", "中世纪", "古城", "medieval", "old city"]);
  add("wooden-wall", ["木墙", "木栅", "palisade", "wooden wall"]);
  return features;
}

function inferMorphology(text: string, siteType: SiteType, features: readonly string[], width: number, depth: number): SettlementMorphologyProgram {
  const era: SettlementMorphologyProgram["era"] = contains(text, ["1920", "爵士时代"]) ? "1920s"
    : contains(text, ["前现代", "前工业", "旧城", "古城", "premodern", "pre-modern"]) ? "medieval"
      : contains(text, ["现代", "当代", "modern"]) ? "modern"
      : contains(text, ["未来", "赛博", "火星", "future", "cyber"]) ? "future"
        : contains(text, ["远古", "古代", "ancient"]) ? "ancient"
          : contains(text, ["深水城", "中世纪", "奇幻", "城堡", "神殿", "medieval", "fantasy"]) ? "medieval"
            : "timeless";
  const roadPattern: SettlementMorphologyProgram["roadPattern"] = features.includes("impact-crater-settlement") || features.includes("volcanic-settlement") ? "radial-ring"
    : features.includes("water-city") ? "canal-banks"
      : features.includes("hillside-district") ? "contour"
        : siteType === "harbor-district" || features.includes("fantasy-harbor") ? "harbor-spine"
          : era === "modern" || era === "future" || features.includes("industrial-plant") ? "rectilinear"
            : "anchor-web";
  const growth: SettlementMorphologyProgram["growth"] = features.includes("vertical-slum") || features.includes("tower-city") ? "vertical"
    : features.includes("gate-district") ? "military"
      : features.includes("industrial-plant") ? "industrial"
        : roadPattern === "rectilinear" ? "planned" : "organic";
  const anchors: SettlementMorphologyProgram["anchors"] = roadPattern === "harbor-spine" || roadPattern === "canal-banks"
    ? [
        { id: "harbor-gate", kind: "gate", point: { x: width * 0.12, z: depth * 0.18 } },
        { id: "market", kind: "market", point: { x: width * 0.5, z: depth * 0.48 } },
        { id: "quay", kind: "harbor", point: { x: width * 0.62, z: depth * 0.82 } },
        { id: "temple", kind: "sacred", point: { x: width * 0.8, z: depth * 0.22 } },
      ]
    : roadPattern === "radial-ring"
      ? [
          { id: "crater-rim", kind: "terrain", point: { x: width * 0.5, z: depth * 0.5 } },
          { id: "market", kind: "market", point: { x: width * 0.5, z: depth * 0.2 } },
          { id: "gate", kind: "gate", point: { x: width * 0.08, z: depth * 0.58 } },
        ]
      : [
          { id: "gate", kind: "gate", point: { x: width * 0.08, z: depth * 0.58 } },
          { id: "market", kind: "market", point: { x: width * 0.5, z: depth * 0.5 } },
          { id: "temple", kind: "sacred", point: { x: width * 0.78, z: depth * 0.2 } },
          { id: "works", kind: "industry", point: { x: width * 0.76, z: depth * 0.78 } },
        ];
  return { era, growth, roadPattern, constraints: features.filter((feature) => ["water-city", "fantasy-harbor", "impact-crater-settlement", "hillside-district", "vertical-slum", "river-crossing", "hollow-tree-city", "mangrove-smuggler-port", "salt-crystal-monastery"].includes(feature)), anchors };
}

function roleSequence(siteType: SiteType, features: readonly string[]): readonly DistrictRole[] {
  if (features.includes("industrial-plant")) return ["industrial", "service", "residential", "commercial", "civic", "industrial"];
  if (siteType === "harbor-district") return ["harbor", "industrial", "commercial", "residential", "sacred", "service"];
  if (siteType === "mining-settlement") return ["industrial", "residential", "service", "commercial", "agricultural"];
  if (siteType === "village") return ["commercial", "residential", "agricultural", "sacred", "service"];
  return ["civic", "commercial", "residential", "industrial", "sacred", "service"];
}

function buildingKindFor(role: DistrictRole, index: number, text: string): SettlementBuildingKind {
  if ((role === "industrial" || role === "service") && contains(text, ["熔炉", "锻炉", "forge", "smelter"])) return "blacksmith";
  if (role === "harbor" || role === "industrial") return index % 3 === 0 ? "factory" : "warehouse";
  if (role === "sacred") return "shrine";
  if (role === "civic") return index % 2 === 0 ? "manor" : "tower";
  if (role === "commercial") return index % 3 === 0 ? "guild" : "tavern";
  if (role === "agricultural") return index % 2 === 0 ? "barn" : contains(text, ["磨坊", "mill"]) ? "mill" : "home";
  if (role === "service" && contains(text, ["诊所", "医院", "clinic", "hospital"])) return "clinic";
  if (role === "service" && contains(text, ["铁匠", "工坊", "blacksmith", "workshop"])) return "blacksmith";
  return "home";
}

function parcelBuildingProgram(kind: SettlementBuildingKind, floors: number): BuildingProgramSummary {
  const roomCount = kind === "manor" ? 8 : kind === "shrine" ? 6 : kind === "tavern" ? 7 : kind === "warehouse" || kind === "factory" ? 5 : kind === "tower" ? floors * 2 : 4 + floors;
  const topology: BuildingProgramSummary["topology"] = kind === "tower" ? "vertical" : kind === "manor" ? "courtyard" : kind === "shrine" ? "winged" : kind === "warehouse" || kind === "factory" ? "composite" : "composite";
  const requiredFeatures = kind === "tavern" ? ["taproom", "kitchen", "guest-room", "cellar"]
    : kind === "shrine" ? ["nave", "side-chapel", "vestry", "crypt"]
      : kind === "warehouse" || kind === "factory" ? ["loading-hall", "secure-store", "service-route", "catwalk"]
        : kind === "tower" ? ["entry", "vertical-core", "high-ground", "roof"]
          : kind === "manor" ? ["great-hall", "service-wing", "private-chambers", "cellar"]
            : ["entry", "public-room", "service-room", "private-room"];
  return { archetype: kind, requiredFeatures, roomCount, connectionCount: Math.max(3, roomCount), levels: floors + 1, topology };
}

function road(id: string, hierarchy: RoadProgram["hierarchy"], widthCells: number, points: SitePoint[], purpose: RoadProgram["purpose"], levelFeet = 0): RoadProgram {
  return { id, hierarchy, widthCells, points, purpose, levelFeet, nodeIds: [] };
}

function segmentIntersection(a: SitePoint, b: SitePoint, c: SitePoint, d: SitePoint): SitePoint | undefined {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const cross = r.x * s.z - r.z * s.x;
  if (Math.abs(cross) < 1e-6) return undefined;
  const q = { x: c.x - a.x, z: c.z - a.z };
  const t = (q.x * s.z - q.z * s.x) / cross;
  const u = (q.x * r.z - q.z * r.x) / cross;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return undefined;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

function attachRoadNodes(roads: RoadProgram[], width: number, depth: number): RoadNodeProgram[] {
  const records = new Map<string, { point: SitePoint; roads: Set<string>; levelFeet: number }>();
  const add = (point: SitePoint, roadId: string, levelFeet: number) => {
    const key = `${Math.round(point.x * 100) / 100}:${Math.round(point.z * 100) / 100}:${levelFeet}`;
    const record = records.get(key) ?? { point, roads: new Set<string>(), levelFeet };
    record.roads.add(roadId);
    records.set(key, record);
  };
  for (const candidate of roads) {
    const first = candidate.points[0]; const last = candidate.points.at(-1);
    if (first) add(first, candidate.id, candidate.levelFeet ?? 0);
    if (last) add(last, candidate.id, candidate.levelFeet ?? 0);
  }
  for (let leftIndex = 0; leftIndex < roads.length; leftIndex += 1) {
    const left = roads[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < roads.length; rightIndex += 1) {
      const right = roads[rightIndex];
      if (!right || (left.levelFeet ?? 0) !== (right.levelFeet ?? 0)) continue;
      for (let aIndex = 1; aIndex < left.points.length; aIndex += 1) {
        const a = left.points[aIndex - 1]; const b = left.points[aIndex];
        if (!a || !b) continue;
        for (let cIndex = 1; cIndex < right.points.length; cIndex += 1) {
          const c = right.points[cIndex - 1]; const d = right.points[cIndex];
          if (!c || !d) continue;
          const intersection = segmentIntersection(a, b, c, d);
          if (intersection) { add(intersection, left.id, left.levelFeet ?? 0); add(intersection, right.id, right.levelFeet ?? 0); }
        }
      }
    }
  }
  const nodes = [...records.values()].map((record, index): RoadNodeProgram => {
    const edge = record.point.x < 2.1 || record.point.x > width - 2.1 || record.point.z < 2.1 || record.point.z > depth - 2.1;
    return {
      id: `road-node-${index + 1}`,
      point: record.point,
      levelFeet: record.levelFeet,
      roadIds: [...record.roads],
      kind: record.roads.size > 1 ? "junction" : edge ? "entry" : "terminus",
    };
  });
  for (const candidate of roads) candidate.nodeIds = nodes.filter((node) => node.roadIds.includes(candidate.id)).map((node) => node.id);
  return nodes;
}

function axisIntervals(limit: number, centres: Array<{ value: number; width: number }>, minSpan = 7): Array<{ min: number; max: number }> {
  const intervals: Array<{ min: number; max: number }> = [];
  let cursor = 2;
  for (const item of [...centres].sort((a, b) => a.value - b.value)) {
    const end = item.value - item.width / 2 - 0.65;
    if (end - cursor >= minSpan) intervals.push({ min: cursor, max: end });
    cursor = item.value + item.width / 2 + 0.65;
  }
  if (limit - 2 - cursor >= minSpan) intervals.push({ min: cursor, max: limit - 2 });
  return intervals;
}

function urbanRoadsAndBlocks(siteType: SiteType, width: number, depth: number, density: number, features: readonly string[], rng: SeededRandom): { roads: RoadProgram[]; blocks: BlockProgram[]; districts: DistrictProgram[] } {
  const railReserve = features.includes("rail-yard") || features.includes("industrial-plant") ? depth * 0.22 : 0;
  const harborReserve = siteType === "harbor-district" ? 10 : 0;
  const buildableDepth = depth - Math.max(railReserve, harborReserve);
  const desiredVerticalCount = (width > 78 ? 2 : 1) + (density >= 0.35 ? 1 : 0) + (density >= 0.8 ? 1 : 0);
  const desiredHorizontalCount = (buildableDepth > 52 ? 2 : 1) + (buildableDepth >= 32 && density >= 0.45 ? 1 : 0) + (buildableDepth >= 44 && density >= 0.86 ? 1 : 0);
  const verticalCount = Math.min(width < 65 ? 2 : width < 90 ? 3 : 4, desiredVerticalCount);
  const horizontalCount = Math.min(buildableDepth < 45 ? 2 : buildableDepth < 65 ? 3 : 4, desiredHorizontalCount);
  const verticalXs = Array.from({ length: verticalCount }, (_, index) => width * ((index + 1) / (verticalCount + 1)) + rng.float(-1.4, 1.4));
  const horizontalZs = Array.from({ length: horizontalCount }, (_, index) => buildableDepth * ((index + 1) / (horizontalCount + 1)) + rng.float(-1.2, 1.2));
  const irregularHarbor = features.includes("fantasy-harbor");
  const roads: RoadProgram[] = [];
  for (const [index, z] of horizontalZs.entries()) roads.push(road(
    index === Math.floor(horizontalCount / 2) ? "road-arterial" : `road-street-horizontal-${index + 1}`,
    index === Math.floor(horizontalCount / 2) ? "arterial" : "street",
    index === Math.floor(horizontalCount / 2) ? (siteType === "city-district" ? 3.8 : 3.2) : 2.2,
    irregularHarbor ? [{ x: 1, z: z + rng.float(-0.7, 0.7) }, { x: width * 0.48, z: z + rng.float(-1.3, 1.3) }, { x: width - 1, z: z + rng.float(-0.7, 0.7) }] : [{ x: 1, z }, { x: width - 1, z }],
    siteType === "harbor-district" || features.includes("industrial-plant") ? "cargo" : "crowd",
  ));
  for (const [index, x] of verticalXs.entries()) roads.push(road(
    `road-street-vertical-${index + 1}`,
    index === 0 && features.includes("gate-district") ? "arterial" : "street",
    index === 0 && features.includes("gate-district") ? 3.5 : 2.25,
    irregularHarbor ? [{ x: x + rng.float(-0.6, 0.6), z: 1 }, { x: x + rng.float(-1, 1), z: buildableDepth * 0.54 }, { x: x + rng.float(-0.6, 0.6), z: buildableDepth - 1 }] : [{ x, z: 1 }, { x, z: buildableDepth - 1 }],
    index === verticalCount - 1 ? "service" : "crowd",
  ));
  if (siteType === "harbor-district") roads.push(road("road-quay", "quay", 2.8, [{ x: 2, z: depth - 10 }, { x: width * 0.52, z: depth - 9.3 }, { x: width - 2, z: depth - 10 }], "cargo"));
  const minimumBlockSpan = density >= 0.8 ? 5.2 : density >= 0.45 ? 6 : 7;
  const xIntervals = axisIntervals(width, verticalXs.map((value, index) => ({ value, width: roads.find((candidate) => candidate.id === `road-street-vertical-${index + 1}`)?.widthCells ?? 2.25 })), minimumBlockSpan);
  const zIntervals = axisIntervals(buildableDepth, horizontalZs.map((value, index) => ({ value, width: roads.find((candidate) => candidate.id === (index === Math.floor(horizontalCount / 2) ? "road-arterial" : `road-street-horizontal-${index + 1}`))?.widthCells ?? 2.2 })), minimumBlockSpan);
  const roles = roleSequence(siteType, features);
  const blocks: BlockProgram[] = [];
  const districts: DistrictProgram[] = [];
  for (const [zIndex, zInterval] of zIntervals.entries()) {
    for (const [xIndex, xInterval] of xIntervals.entries()) {
      const center = { x: (xInterval.min + xInterval.max) / 2, z: (zInterval.min + zInterval.max) / 2 };
      const size = { x: xInterval.max - xInterval.min, z: zInterval.max - zInterval.min };
      let role = roles[(xIndex + zIndex * xIntervals.length) % roles.length] ?? "residential";
      if (siteType === "harbor-district" && center.z > buildableDepth * 0.62) role = xIndex < Math.ceil(xIntervals.length / 2) ? "harbor" : "industrial";
      if (features.includes("industrial-plant") && center.z > buildableDepth * 0.58) role = "industrial";
      if (Math.hypot(center.x - width / 2, center.z - buildableDepth / 2) < Math.min(width, buildableDepth) * 0.13) role = "commercial";
      const districtId = `district-${role}-${blocks.length + 1}`;
      districts.push({ id: districtId, label: `${role} block`, role, center, size, density: Math.min(1, density * (role === "residential" || role === "commercial" ? 1.08 : 0.9)) });
      const frontages = roads
        .filter((candidate) => (candidate.levelFeet ?? 0) === 0 && candidate.hierarchy !== "rail" && candidate.points.length >= 2)
        .map((candidate) => ({ candidate, distance: closestSegment(center, candidate)?.distance ?? Number.POSITIVE_INFINITY }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 2)
        .map(({ candidate }) => candidate.id);
      const reservedPlant = features.includes("industrial-plant") && center.x > width * 0.64 && center.z < buildableDepth * 0.42;
      blocks.push({ id: `block-${blocks.length + 1}`, districtId, boundary: [{ x: xInterval.min, z: zInterval.min }, { x: xInterval.max, z: zInterval.min }, { x: xInterval.max, z: zInterval.max }, { x: xInterval.min, z: zInterval.max }], center, size, frontageRoadIds: frontages, setbackCells: role === "industrial" ? 1.1 : role === "civic" || role === "sacred" ? 1.5 : 0.75, openSpaceRatio: reservedPlant ? 0.72 : role === "residential" ? 0.18 : role === "industrial" ? 0.12 : 0.22 });
    }
  }
  return { roads, blocks, districts };
}

function organicBoundary(center: Vec2, size: Vec2, rng: SeededRandom): SitePoint[] {
  const hx = size.x / 2; const hz = size.z / 2;
  const jx = Math.min(1.5, size.x * 0.12); const jz = Math.min(1.5, size.z * 0.12);
  return [
    { x: center.x - hx + rng.float(-jx, jx), z: center.z - hz + rng.float(-jz, jz) },
    { x: center.x + hx + rng.float(-jx, jx), z: center.z - hz + rng.float(-jz, jz) },
    { x: center.x + hx + rng.float(-jx, jx), z: center.z + hz + rng.float(-jz, jz) },
    { x: center.x - hx + rng.float(-jx, jx), z: center.z + hz + rng.float(-jz, jz) },
  ];
}

function curvedPath(a: SitePoint, b: SitePoint, bend: number): SitePoint[] {
  const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.max(1, Math.hypot(dx, dz));
  const nx = -dz / length; const nz = dx / length;
  return [a, { x: a.x + dx * 0.32 + nx * bend, z: a.z + dz * 0.32 + nz * bend }, { x: a.x + dx * 0.68 - nx * bend * 0.45, z: a.z + dz * 0.68 - nz * bend * 0.45 }, b];
}

function organicRoadsAndBlocks(siteType: SiteType, width: number, depth: number, density: number, features: readonly string[], morphology: SettlementMorphologyProgram, rng: SeededRandom): { roads: RoadProgram[]; blocks: BlockProgram[]; districts: DistrictProgram[] } {
  const roads: RoadProgram[] = [];
  const centre = morphology.anchors.find((anchor) => anchor.id === "market")?.point ?? { x: width / 2, z: depth / 2 };
  const gate = morphology.anchors.find((anchor) => anchor.kind === "gate")?.point ?? { x: 1, z: depth * 0.55 };
  const sacred = morphology.anchors.find((anchor) => anchor.kind === "sacred")?.point ?? { x: width * 0.78, z: depth * 0.2 };
  const industry = morphology.anchors.find((anchor) => anchor.kind === "industry" || anchor.kind === "harbor")?.point ?? { x: width * 0.76, z: depth * 0.78 };
  if (morphology.roadPattern === "radial-ring") {
    const radiusX = width * 0.27; const radiusZ = depth * 0.28;
    const ring = Array.from({ length: 13 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 12;
      const noise = index === 12 ? 1 : rng.float(0.9, 1.1);
      return { x: width / 2 + Math.cos(angle) * radiusX * noise, z: depth / 2 + Math.sin(angle) * radiusZ * noise };
    });
    roads.push(road("road-crater-ring", "street", 2.1, ring, "crowd"));
    roads.push(road("road-crater-gate", "arterial", 2.7, curvedPath(gate, ring[6] ?? centre, 2.4), "rural"));
    roads.push(road("road-crater-ramp", "trail", 1.4, curvedPath(ring[9] ?? centre, { x: width * 0.5, z: depth * 0.5 }, -3), "rural", -5));
  } else if (morphology.roadPattern === "harbor-spine" || morphology.roadPattern === "canal-banks") {
    const quayZ = depth * 0.82;
    if (morphology.roadPattern === "harbor-spine") roads.push(road("road-quay-spine", "quay", 2.8, [
      { x: 2, z: quayZ + rng.float(-1, 1) }, { x: width * 0.27, z: quayZ - 1.5 },
      { x: width * 0.56, z: quayZ + 0.7 }, { x: width - 2, z: quayZ - 0.8 },
    ], "cargo"));
    roads.push(road("road-gate-market", "arterial", 3, curvedPath(gate, centre, 3.5), "crowd"));
    roads.push(road("road-market-quay", "street", 2.2, curvedPath(centre, industry, -2.8), "cargo"));
    roads.push(road("road-temple-lane", "lane", 1.35, curvedPath(centre, sacred, 2.2), "crowd"));
    roads.push(road("road-ropewalk-lane", "lane", 1.2, curvedPath({ x: width * 0.18, z: depth * 0.58 }, { x: width * 0.84, z: depth * 0.68 }, -3.1), "service"));
    if (morphology.roadPattern === "canal-banks") {
      roads.push(road("road-west-canal-bank", "quay", 1.8, [{ x: width * 0.42, z: 2 }, { x: width * 0.39, z: depth * 0.48 }, { x: width * 0.43, z: depth - 2 }], "cargo"));
      roads.push(road("road-east-canal-bank", "quay", 1.8, [{ x: width * 0.54, z: 2 }, { x: width * 0.57, z: depth * 0.5 }, { x: width * 0.53, z: depth - 2 }], "cargo"));
    }
  } else {
    roads.push(road("road-old-main", "arterial", 2.7, curvedPath(gate, centre, 3.6), "crowd"));
    roads.push(road("road-market-temple", "street", 2, curvedPath(centre, sacred, -2.6), "crowd"));
    roads.push(road("road-market-works", "street", 1.8, curvedPath(centre, industry, 2.2), "service"));
    roads.push(road("road-back-lane", "lane", 1.1, curvedPath({ x: width * 0.2, z: depth * 0.25 }, { x: width * 0.82, z: depth * 0.64 }, -4.2), "service"));
  }

  if (density > 0.52) roads.push(road("road-density-loop", "lane", density > 0.8 ? 1.35 : 1.05, [
    { x: width * 0.2, z: depth * 0.42 }, { x: width * 0.34, z: depth * 0.72 },
    { x: width * 0.67, z: depth * 0.74 }, { x: width * 0.82, z: depth * 0.43 },
    { x: width * 0.62, z: depth * 0.25 }, { x: width * 0.32, z: depth * 0.24 }, { x: width * 0.2, z: depth * 0.42 },
  ], "service"));
  if (density > 0.82) roads.push(road("road-density-alley", "lane", 0.9, curvedPath({ x: width * 0.28, z: depth * 0.68 }, { x: width * 0.72, z: depth * 0.3 }, 3.5), "service"));

  const scaleBand = Math.sqrt((width * depth) / (60 * 48));
  const morphologyMultiplier = morphology.roadPattern === "canal-banks" ? 1.35 : 1;
  const blockCount = Math.max(6, Math.round((8 + density * 7) * scaleBand * morphologyMultiplier));
  const roles = roleSequence(siteType, features);
  const blocks: BlockProgram[] = [];
  const districts: DistrictProgram[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const angle = (Math.PI * 2 * index) / blockCount + rng.float(-0.16, 0.16);
    const ring = morphology.roadPattern === "radial-ring" ? rng.float(0.34, 0.46) : index % 3 === 0 ? 0.23 : rng.float(0.28, 0.43);
    let center = { x: width * 0.5 + Math.cos(angle) * width * ring, z: depth * 0.5 + Math.sin(angle) * depth * ring };
    if (morphology.roadPattern === "harbor-spine") center = { x: width * (0.12 + 0.76 * ((index + 0.5) / blockCount)) + rng.float(-2, 2), z: depth * (0.25 + (index % 3) * 0.2) + rng.float(-1.7, 1.7) };
    if (morphology.roadPattern === "canal-banks") {
      const side = index % 2;
      const column = Math.floor(index / 2);
      const rows = Math.max(3, Math.ceil(blockCount / 2));
      center = {
        x: side === 0 ? width * rng.float(0.10, 0.37) : width * rng.float(0.63, 0.90),
        z: depth * (0.08 + 0.84 * ((column + 0.5) / rows)) + rng.float(-1.6, 1.6),
      };
    }
    center = { x: Math.max(5, Math.min(width - 5, center.x)), z: Math.max(5, Math.min(depth - 7, center.z)) };
    const size = { x: rng.float(8.5, 13.5), z: rng.float(7.5, 12.5) };
    let role = roles[index % roles.length] ?? "residential";
    if ((morphology.roadPattern === "harbor-spine" || morphology.roadPattern === "canal-banks") && center.z > depth * 0.6) role = index % 2 ? "harbor" : "commercial";
    const districtId = `district-${role}-${index + 1}`;
    const nearestRoad = roads.map((candidate) => ({ id: candidate.id, distance: Math.min(...candidate.points.map((point) => Math.hypot(point.x - center.x, point.z - center.z))) })).sort((a, b) => a.distance - b.distance)[0]?.id ?? roads[0]?.id ?? "road-old-main";
    districts.push({ id: districtId, label: `${role} accreted quarter`, role, center, size, density: Math.min(1, density * (role === "residential" || role === "commercial" ? 1.08 : 0.9)) });
    blocks.push({ id: `block-${index + 1}`, districtId, boundary: organicBoundary(center, size, rng.fork(`block-${index}`)), center, size, frontageRoadIds: [nearestRoad], setbackCells: role === "sacred" ? 1.4 : 0.65, openSpaceRatio: role === "sacred" ? 0.34 : role === "residential" ? 0.12 : 0.2 });
  }
  return { roads, blocks, districts };
}

function villageRoadsAndBlocks(width: number, depth: number, density: number, features: readonly string[], rng: SeededRandom): { roads: RoadProgram[]; blocks: BlockProgram[]; districts: DistrictProgram[] } {
  const centre = { x: width * 0.52, z: depth * 0.5 };
  const bridge = { x: width * 0.16, z: depth * 0.42 };
  const roads = [
    road("road-main", "arterial", 2.6, [{ x: 0, z: depth * 0.38 }, centre, { x: width, z: depth * 0.56 }], "rural"),
    road("road-bridge-spur", "street", 1.8, [bridge, centre], "rural"),
    road("road-shrine-spur", "trail", 1.25, [centre, { x: width * 0.76, z: depth * 0.16 }], "crowd"),
    ...(density > 0.72 ? [road("road-farm-loop", "trail", 1.1, [centre, { x: width * 0.76, z: depth * 0.78 }, { x: width * 0.28, z: depth * 0.82 }, bridge], "service")] : []),
  ];
  const roles = roleSequence("village", features);
  const anchors = [
    { center: { x: width * 0.31, z: depth * 0.3 }, size: { x: width * 0.25, z: depth * 0.24 }, frontage: "road-main" },
    { center: { x: width * 0.57, z: depth * 0.27 }, size: { x: width * 0.28, z: depth * 0.24 }, frontage: "road-shrine-spur" },
    { center: { x: width * 0.73, z: depth * 0.55 }, size: { x: width * 0.26, z: depth * 0.26 }, frontage: "road-main" },
    { center: { x: width * 0.46, z: depth * 0.72 }, size: { x: width * 0.3, z: depth * 0.23 }, frontage: density > 0.72 ? "road-farm-loop" : "road-main" },
    { center: { x: width * 0.2, z: depth * 0.61 }, size: { x: width * 0.2, z: depth * 0.2 }, frontage: "road-bridge-spur" },
  ];
  const districts: DistrictProgram[] = anchors.map((anchor, index) => ({ id: `district-${roles[index % roles.length]}-${index + 1}`, label: `${roles[index % roles.length]} village cluster`, role: roles[index % roles.length] ?? "residential", center: anchor.center, size: anchor.size, density }));
  const blocks: BlockProgram[] = anchors.map((anchor, index) => ({ id: `block-${index + 1}`, districtId: districts[index]?.id ?? "district-residential-1", boundary: [{ x: anchor.center.x - anchor.size.x / 2, z: anchor.center.z - anchor.size.z / 2 }, { x: anchor.center.x + anchor.size.x / 2, z: anchor.center.z - anchor.size.z / 2 }, { x: anchor.center.x + anchor.size.x / 2, z: anchor.center.z + anchor.size.z / 2 }, { x: anchor.center.x - anchor.size.x / 2, z: anchor.center.z + anchor.size.z / 2 }], center: anchor.center, size: anchor.size, frontageRoadIds: [anchor.frontage], setbackCells: 1.2, openSpaceRatio: 0.34 }));
  return { roads, blocks, districts };
}

function closestSegment(point: Vec2, candidate: RoadProgram): { a: SitePoint; b: SitePoint; projected: SitePoint; distance: number } | undefined {
  let best: { a: SitePoint; b: SitePoint; projected: SitePoint; distance: number } | undefined;
  for (let index = 1; index < candidate.points.length; index += 1) {
    const a = candidate.points[index - 1]; const b = candidate.points[index];
    if (!a || !b) continue;
    const dx = b.x - a.x; const dz = b.z - a.z; const length2 = dx * dx + dz * dz;
    const t = length2 <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
    const projected = { x: a.x + dx * t, z: a.z + dz * t };
    const distance = Math.hypot(point.x - projected.x, point.z - projected.z);
    if (!best || distance < best.distance) best = { a, b, projected, distance };
  }
  return best;
}

function makeParcels(input: SitePlanningInput, siteType: SiteType, blocks: readonly BlockProgram[], districts: readonly DistrictProgram[], roads: readonly RoadProgram[], features: readonly string[], rng: SeededRandom): ParcelProgram[] {
  const text = input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const required = requestedBuildingKinds(text);
  const requestedModules = requestedFunctionalModules(text);
  const waterCity = features.includes("water-city");
  const base = waterCity ? 28 : siteType === "village" ? 9 : siteType === "town" ? 15 : siteType === "mining-settlement" ? 12 : 22;
  const targetMultiplier = waterCity ? 1.12 : 1;
  const target = Math.max(5, Math.round(base * sizeFactor(input.request.size) * (0.5 + input.request.density * 0.9) * targetMultiplier));
  const parcels: ParcelProgram[] = [];
  const perBlock = Math.max(1, Math.ceil(target / Math.max(1, blocks.length)));
  for (const block of blocks) {
    if (parcels.length >= target) break;
    if (block.openSpaceRatio > 0.6) continue;
    const district = districts.find((candidate) => candidate.id === block.districtId);
    if (!district) continue;
    const frontageRoad = block.frontageRoadIds.map((id) => roads.find((candidate) => candidate.id === id)).find((candidate): candidate is RoadProgram => Boolean(candidate));
    if (!frontageRoad) continue;
    const segment = closestSegment(block.center, frontageRoad);
    if (!segment) continue;
    const dx = segment.b.x - segment.a.x; const dz = segment.b.z - segment.a.z; const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const ux = dx / length; const uz = dz / length;
    let nx = -uz; let nz = ux;
    if ((block.center.x - segment.projected.x) * nx + (block.center.z - segment.projected.z) * nz < 0) { nx *= -1; nz *= -1; }
    const frontageSpan = Math.max(6, Math.abs(ux) * block.size.x + Math.abs(uz) * block.size.z - 2);
    const targetFrontage = siteType === "village"
      ? 5.5
      : waterCity
        ? district.role === "industrial" || district.role === "harbor"
          ? 10.8 - input.request.density * 2.4
          : 8.8 - input.request.density * 2.1
        : district.role === "industrial" ? 9.2 - input.request.density * 3.8 : 7 - input.request.density * 2.5;
    const count = Math.min(perBlock, Math.max(1, Math.floor(frontageSpan / targetFrontage)));
    for (let slot = 0; slot < count && parcels.length < target; slot += 1) {
      const requestedModule = requestedModules[parcels.length];
      const kind = required[parcels.length] ?? (requestedModule ? preferredCarrier(requestedModule) : buildingKindFor(district.role, parcels.length, text));
      const wide = kind === "warehouse" || kind === "factory" || kind === "barn" || kind === "manor";
      const slotSpan = frontageSpan / count;
      const parcelFrontage = Math.max(4.8, Math.min(slotSpan - 0.6, waterCity ? (wide ? 13.5 : 10.2) : (wide ? 10.5 : 7.2)));
      const crossSpan = Math.max(6, Math.abs(nx) * block.size.x + Math.abs(nz) * block.size.z - 1.2);
      const parcelDepth = Math.max(5.2, Math.min(crossSpan * 0.72, waterCity ? (wide ? 13 : 10) : (wide ? 10 : 7.8)));
      const offsetAlong = (slot - (count - 1) / 2) * slotSpan + rng.float(-0.2, 0.2);
      const entrance = { x: segment.projected.x + ux * offsetAlong, z: segment.projected.z + uz * offsetAlong };
      const setback = frontageRoad.widthCells / 2 + block.setbackCells;
      const proposedCenter = { x: entrance.x + nx * (setback + parcelDepth / 2), z: entrance.z + nz * (setback + parcelDepth / 2) };
      const minX = block.center.x - block.size.x / 2; const maxX = block.center.x + block.size.x / 2;
      const minZ = block.center.z - block.size.z / 2; const maxZ = block.center.z + block.size.z / 2;
      const insetX = Math.min(Math.max(1.1, parcelFrontage * 0.28), Math.max(1.1, block.size.x / 2 - 0.4));
      const insetZ = Math.min(Math.max(1.1, parcelDepth * 0.28), Math.max(1.1, block.size.z / 2 - 0.4));
      const center = {
        x: Math.max(minX + insetX, Math.min(maxX - insetX, proposedCenter.x)),
        z: Math.max(minZ + insetZ, Math.min(maxZ - insetZ, proposedCenter.z)),
      };
      const state: ParcelProgram["state"] = features.includes("war-damaged") ? (parcels.length % 3 === 0 ? "temporary" : "abandoned") : features.includes("flooded-site") ? "flooded" : "active";
      const floors = kind === "tower" ? { min: 3, max: 5 } : kind === "warehouse" || kind === "factory" || kind === "barn" ? { min: 1, max: 2 } : { min: 1, max: 3 };
      const hx = parcelFrontage / 2; const hz = parcelDepth / 2;
      const boundary = [
        { x: center.x - ux * hx - nx * hz, z: center.z - uz * hx - nz * hz },
        { x: center.x + ux * hx - nx * hz, z: center.z + uz * hx - nz * hz },
        { x: center.x + ux * hx + nx * hz, z: center.z + uz * hx + nz * hz },
        { x: center.x - ux * hx + nx * hz, z: center.z - uz * hx + nz * hz },
      ];
      parcels.push({
        id: `parcel-${parcels.length + 1}`,
        blockId: block.id,
        districtId: block.districtId,
        center,
        size: { x: parcelFrontage, z: parcelDepth },
        buildingSize: {
          x: parcelFrontage * (siteType === "village" ? 0.68 : waterCity ? 0.92 : 0.82),
          z: parcelDepth * (district.role === "industrial" ? (waterCity ? 0.86 : 0.78) : waterCity ? 0.82 : 0.7),
        },
        rotationY: Math.atan2(entrance.x - center.x, entrance.z - center.z),
        frontageRoadId: frontageRoad.id,
        entrance,
        buildingKind: kind,
        buildingSeed: `${input.request.seed}/site/building/${parcels.length + 1}`,
        lod: "mass",
        floors,
        state,
        boundary,
        shapeSignature: boundary.map((point) => `${point.x.toFixed(1)},${point.z.toFixed(1)}`).join("|"),
        buildingProgram: parcelBuildingProgram(kind, floors.max),
        ...(requestedModule ? { functionalModules: [requestedModule] } : {}),
      });
    }
  }
  const ranked = [...parcels].sort((left, right) => {
    const requestedLeft = required.indexOf(left.buildingKind); const requestedRight = required.indexOf(right.buildingKind);
    const functionalLeft = (left.functionalModules?.length ?? 0) > 0; const functionalRight = (right.functionalModules?.length ?? 0) > 0;
    if (functionalLeft !== functionalRight) return functionalLeft ? -1 : 1;
    if ((requestedLeft >= 0) !== (requestedRight >= 0)) return requestedLeft >= 0 ? -1 : 1;
    return Math.hypot(left.center.x, left.center.z) - Math.hypot(right.center.x, right.center.z);
  });
  const requestedLandmarkBudget = Math.min(8, required.length + (waterCity ? 3 : 0));
  const defaultFullBudget = input.request.size === "small" ? 1 : input.request.size === "large" ? 4 : 3;
  const fullBudget = Math.min(parcels.length, Math.max(defaultFullBudget, requestedLandmarkBudget));
  const facadeBudget = Math.max(2, Math.round(parcels.length * (waterCity ? 0.44 : 0.36)));
  ranked.forEach((parcel, index) => { parcel.lod = index < fullBudget ? "full-interior" : index < fullBudget + facadeBudget ? "facade" : "mass"; });
  return parcels;
}

function roadLength(candidate: RoadProgram): number {
  return candidate.points.slice(1).reduce((sum, point, index) => {
    const previous = candidate.points[index];
    return sum + (previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0);
  }, 0);
}

export function planSettlementSite(input: SitePlanningInput, rng: SeededRandom): SiteProgram {
  const text = input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const features = requestedSiteFeatures(text);
  const siteType = inferSiteType(text, input.archetype);
  const base: readonly [number, number] = siteType === "harbor-district" ? [72, 54] : siteType === "city-district" ? [82, 68] : siteType === "village" ? [48, 42] : siteType === "mining-settlement" ? [58, 46] : [60, 48];
  const factor = sizeFactor(input.request.size);
  const width = Math.round(base[0] * factor) + rng.int(-3, 4);
  const depth = Math.round(base[1] * factor) + rng.int(-3, 4);
  const morphology = inferMorphology(text, siteType, features, width, depth);
  const layout = morphology.roadPattern !== "rectilinear"
    ? organicRoadsAndBlocks(siteType, width, depth, input.request.density, features, morphology, rng.fork("organic-layout"))
    : siteType === "village" || siteType === "mining-settlement"
      ? villageRoadsAndBlocks(width, depth, input.request.density, features, rng.fork("rural-layout"))
      : urbanRoadsAndBlocks(siteType, width, depth, input.request.density, features, rng.fork("urban-layout"));
  const roadNodes = attachRoadNodes(layout.roads, width, depth);
  let parcels = makeParcels(input, siteType, layout.blocks, layout.districts, layout.roads, features, rng.fork("parcels"));
  if (features.includes("water-city")) {
    const canalLines: Array<{ width: number; points: SitePoint[] }> = [
      { width: 4.8, points: [{ x: width * 0.39, z: depth * 0.03 }, { x: width * 0.44, z: depth * 0.23 }, { x: width * 0.41, z: depth * 0.43 }, { x: width * 0.49, z: depth * 0.62 }, { x: width * 0.46, z: depth * 0.79 }, { x: width * 0.54, z: depth * 0.97 }] },
      { width: 2.8, points: [{ x: width * 0.44, z: depth * 0.23 }, { x: width * 0.26, z: depth * 0.3 }, { x: width * 0.03, z: depth * 0.27 }] },
      { width: 3.05, points: [{ x: width * 0.41, z: depth * 0.43 }, { x: width * 0.61, z: depth * 0.39 }, { x: width * 0.96, z: depth * 0.33 }] },
      { width: 3.3, points: [{ x: width * 0.46, z: depth * 0.79 }, { x: width * 0.31, z: depth * 0.74 }, { x: width * 0.04, z: depth * 0.82 }] },
    ];
    const distanceToSegment = (point: SitePoint, a: SitePoint, b: SitePoint): number => {
      const dx = b.x - a.x; const dz = b.z - a.z; const length2 = dx * dx + dz * dz;
      const t = length2 <= 1e-6 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
      return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
    };
    parcels = parcels.filter((parcel) => {
      const buildingClearance = Math.max(0.75, Math.min(parcel.buildingSize.x, parcel.buildingSize.z) * 0.12);
      return canalLines.every((line) => line.points.slice(1).every((point, index) => {
        const previous = line.points[index];
        return previous ? distanceToSegment(parcel.center, previous, point) > line.width / 2 + buildingClearance : true;
      }));
    });
    const requested = requestedBuildingKinds(text);
    const requestedModules = requestedFunctionalModules(text);
    const desiredFullBudget = Math.min(parcels.length, Math.max(5, Math.min(8, requested.length + 3)));
    const reRanked = [...parcels].sort((left, right) => {
      const requestedLeft = requested.indexOf(left.buildingKind);
      const requestedRight = requested.indexOf(right.buildingKind);
      const functionalLeft = (left.functionalModules?.length ?? 0) > 0 || requestedModules.some((module) => preferredCarrier(module) === left.buildingKind);
      const functionalRight = (right.functionalModules?.length ?? 0) > 0 || requestedModules.some((module) => preferredCarrier(module) === right.buildingKind);
      if (functionalLeft !== functionalRight) return functionalLeft ? -1 : 1;
      if ((requestedLeft >= 0) !== (requestedRight >= 0)) return requestedLeft >= 0 ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
    const facadeBudget = Math.max(2, Math.round(reRanked.length * 0.44));
    reRanked.forEach((parcel, index) => {
      parcel.lod = index < desiredFullBudget ? "full-interior" : index < desiredFullBudget + facadeBudget ? "facade" : "mass";
    });
  }
  const fullInteriorCount = parcels.filter((parcel) => parcel.lod === "full-interior").length;
  const facadeCount = parcels.filter((parcel) => parcel.lod === "facade").length;
  const massCount = parcels.length - fullInteriorCount - facadeCount;
  const isHarbor = siteType === "harbor-district";
  const openSpaces: OpenSpaceProgram[] = [
    ...(features.includes("impact-crater-settlement")
      ? [{ id: "crater-rim-market", kind: "market" as const, center: { x: width * 0.5, z: depth * 0.16 }, size: { x: 9, z: 5 } }]
      : features.includes("water-city")
        ? [{ id: "canal-bank-market", kind: "market" as const, center: { x: width * 0.7, z: depth * 0.53 }, size: { x: 7, z: 5 } }]
        : [{ id: "central-open-space", kind: siteType === "village" ? "market" as const : "plaza" as const, center: { x: width / 2, z: (isHarbor ? depth - 10 : depth) * 0.5 }, size: { x: siteType === "village" ? 8 : 10, z: siteType === "village" ? 7 : 9 } }]),
    ...(siteType === "village" ? [{ id: "village-fields", kind: "farm" as const, center: { x: width * 0.2, z: depth * 0.78 }, size: { x: width * 0.28, z: depth * 0.2 } }, { id: "village-orchard", kind: "orchard" as const, center: { x: width * 0.78, z: depth * 0.18 }, size: { x: width * 0.22, z: depth * 0.2 } }] : []),
    ...(isHarbor ? [{ id: "fish-market", kind: "market" as const, center: { x: width * 0.55, z: depth - 13 }, size: { x: 12, z: 6 } }, { id: "harbor-quay", kind: "quay" as const, center: { x: width / 2, z: depth - 9 }, size: { x: width - 5, z: 3.5 } }] : []),
    ...(features.includes("industrial-plant") ? [{ id: "industrial-loading-yard", kind: "yard" as const, center: { x: width * 0.48, z: depth * 0.78 }, size: { x: width * 0.42, z: depth * 0.17 } }] : []),
  ];
  const parcelArea = parcels.reduce((sum, parcel) => sum + parcel.size.x * parcel.size.z, 0);
  const buildingArea = parcels.reduce((sum, parcel) => sum + parcel.buildingSize.x * parcel.buildingSize.z, 0);
  const openSpaceArea = openSpaces.reduce((sum, space) => sum + space.size.x * space.size.z, 0);
  return {
    version: 1,
    id: `site-${input.request.seed}`,
    seed: input.request.seed,
    siteType,
    morphology,
    bounds: { x: width, z: depth },
    terrain: { kind: isHarbor ? "coast" : siteType === "mining-settlement" ? "valley" : siteType === "village" ? "rolling" : "urban", buildableRatio: isHarbor ? 0.78 : 0.9, elevationBandsFeet: features.includes("hillside-district") ? [0, 5, 10, 15] : siteType === "village" || siteType === "mining-settlement" ? [0, 5, 10] : [0, 5], ...(isHarbor ? { waterEdge: [{ x: 0, z: depth - 8 }, { x: width * 0.28, z: depth - 9 }, { x: width * 0.58, z: depth - 7 }, { x: width, z: depth - 9 }] } : {}) },
    districts: layout.districts,
    roadNodes,
    roads: layout.roads,
    blocks: layout.blocks,
    parcels,
    openSpaces,
    encounterZones: [
      { id: "site-entry", kind: "entrance", center: layout.roads[0]?.points[0] ?? { x: 0, z: depth / 2 }, radiusCells: 2 },
      { id: "site-centre-choke", kind: "chokepoint", center: { x: width / 2, z: depth / 2 }, radiusCells: 3 },
      ...(isHarbor ? [{ id: "quay-hazard", kind: "hazard" as const, center: { x: width / 2, z: depth - 5 }, radiusCells: 4 }] : []),
    ],
    requiredFeatures: [...(isHarbor ? ["coast", "docks", "cargo-road", "warehouse-district", "market", "mixed-buildings", "roof-route"] : siteType === "village" ? ["organic-roads", "well", "farms", "orchard", "mixed-buildings"] : ["road-hierarchy", "districts", "mixed-buildings"]), ...features],
    lodPolicy: { fullInteriorCount, facadeCount, massCount },
    diagnostics: {
      roadLengthCells: layout.roads.reduce((sum, candidate) => sum + roadLength(candidate), 0),
      parcelCoverage: parcelArea / (width * depth),
      buildingCoverage: buildingArea / (width * depth),
      districtCount: layout.districts.length,
      junctionCount: roadNodes.filter((node) => node.kind === "junction").length,
      blockCount: layout.blocks.length,
      averageParcelArea: parcels.length > 0 ? parcelArea / parcels.length : 0,
      openSpaceRatio: openSpaceArea / (width * depth),
      curvedRoadRatio: layout.roads.length > 0 ? layout.roads.filter((candidate) => candidate.points.length > 2).length / layout.roads.length : 0,
      nonRectangularBlockRatio: layout.blocks.length > 0 ? layout.blocks.filter((block) => block.boundary.some((point, index) => {
        const next = block.boundary[(index + 1) % block.boundary.length];
        return Boolean(next && Math.abs(point.x - next.x) > 0.05 && Math.abs(point.z - next.z) > 0.05);
      })).length / layout.blocks.length : 0,
    },
  };
}
