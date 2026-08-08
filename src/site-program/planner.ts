import type { SeededRandom } from "../core/random";
import type { SettlementBuildingKind } from "../schema";
import type { DistrictProgram, DistrictRole, ParcelProgram, RoadProgram, SitePlanningInput, SiteProgram, SiteType } from "./schema";

const contains = (text: string, terms: readonly string[]): boolean => terms.some((term) => text.includes(term));

function sizeFactor(size: SitePlanningInput["request"]["size"]): number {
  return size === "small" ? 0.68 : size === "large" ? 1.38 : 1;
}

function inferSiteType(text: string, archetype: SitePlanningInput["archetype"]): SiteType {
  if (contains(text, ["矿业聚落", "矿山聚落", "mining settlement"])) return "mining-settlement";
  if (archetype === "harbor") return "harbor-district";
  if (archetype === "city") return "city-district";
  if (archetype === "village") return "village";
  return "town";
}

function districtRoles(siteType: SiteType): readonly DistrictRole[] {
  if (siteType === "harbor-district") return ["harbor", "industrial", "commercial", "residential", "sacred", "service"];
  if (siteType === "city-district") return ["civic", "commercial", "residential", "industrial", "sacred", "service"];
  if (siteType === "mining-settlement") return ["industrial", "residential", "service", "commercial", "agricultural"];
  if (siteType === "village") return ["commercial", "residential", "agricultural", "sacred", "service"];
  return ["commercial", "residential", "industrial", "civic", "service"];
}

function makeDistricts(siteType: SiteType, width: number, depth: number, density: number, rng: SeededRandom): DistrictProgram[] {
  const roles = districtRoles(siteType);
  const baseCount = siteType === "village" ? 4 : siteType === "town" ? 5 : 6;
  const count = Math.max(3, baseCount + (width > 88 ? 2 : width > 66 ? 1 : width < 46 ? -1 : 0));
  return Array.from({ length: count }, (_, index) => {
    const role = roles[index % roles.length] ?? "residential";
    const angle = (Math.PI * 2 * index) / count + rng.float(-0.18, 0.18);
    const radiusX = width * (siteType === "village" ? 0.24 : 0.31);
    const radiusZ = depth * (siteType === "village" ? 0.22 : 0.29);
    return {
      id: `district-${role}-${index + 1}`,
      label: `${role} district`,
      role,
      center: { x: width / 2 + Math.cos(angle) * radiusX, z: depth / 2 + Math.sin(angle) * radiusZ },
      size: { x: width * (siteType === "village" ? 0.32 : 0.28), z: depth * (siteType === "village" ? 0.3 : 0.27) },
      density: Math.min(1, density * (role === "residential" || role === "commercial" ? 1.12 : 0.86)),
    };
  });
}

function makeRoads(siteType: SiteType, width: number, depth: number, districts: readonly DistrictProgram[], density: number, rng: SeededRandom): RoadProgram[] {
  const centre = { x: width / 2, z: depth / 2 };
  const bend = { x: centre.x + rng.float(-width * 0.08, width * 0.08), z: centre.z + rng.float(-depth * 0.08, depth * 0.08) };
  const roads: RoadProgram[] = siteType === "village" || siteType === "mining-settlement"
    ? [
      { id: "road-main", hierarchy: "arterial", widthCells: 3, points: [{ x: 0, z: depth * 0.42 }, bend, { x: width, z: depth * 0.57 }], purpose: "rural" },
      { id: "road-cross", hierarchy: "street", widthCells: 2.2, points: [{ x: width * 0.28, z: 0 }, centre, { x: width * 0.72, z: depth }], purpose: "crowd" },
    ]
    : [
      { id: "road-arterial", hierarchy: "arterial", widthCells: siteType === "city-district" ? 4.2 : 3.4, points: [{ x: 0, z: depth * 0.36 }, bend, { x: width, z: depth * 0.57 }], purpose: siteType === "harbor-district" ? "cargo" : "crowd" },
      { id: "road-cross", hierarchy: "street", widthCells: 2.8, points: [{ x: width * 0.24, z: 0 }, centre, { x: width * 0.74, z: depth }], purpose: "crowd" },
      { id: "road-service", hierarchy: "lane", widthCells: 1.7, points: [{ x: width * 0.08, z: depth * 0.73 }, { x: width * 0.44, z: depth * 0.62 }, { x: width * 0.88, z: depth * 0.76 }], purpose: "service" },
    ];
  for (const [index, district] of districts.entries()) {
    roads.push({
      id: `road-district-${index + 1}`,
      hierarchy: siteType === "village" ? "trail" : "lane",
      widthCells: siteType === "village" ? 1.5 : 1.8,
      points: [centre, district.center],
      purpose: district.role === "industrial" || district.role === "service" ? "service" : "crowd",
    });
  }
  const alleyCount = siteType === "village" || siteType === "mining-settlement" ? Math.round(density * 2) : Math.round(density * 5);
  for (let index = 0; index < alleyCount; index += 1) {
    const from = districts[index % districts.length];
    const to = districts[(index + 2 + rng.int(0, Math.max(0, districts.length - 3))) % districts.length];
    if (!from || !to) continue;
    roads.push({
      id: `road-density-alley-${index + 1}`,
      hierarchy: siteType === "village" ? "trail" : "lane",
      widthCells: siteType === "village" ? 1.1 : 1.35,
      points: [
        { x: from.center.x + rng.float(-2, 2), z: from.center.z + rng.float(-2, 2) },
        { x: (from.center.x + to.center.x) / 2 + rng.float(-3, 3), z: (from.center.z + to.center.z) / 2 + rng.float(-3, 3) },
        { x: to.center.x + rng.float(-2, 2), z: to.center.z + rng.float(-2, 2) },
      ],
      purpose: index % 2 === 0 ? "service" : "crowd",
    });
  }
  if (siteType === "harbor-district") roads.push({ id: "road-quay", hierarchy: "quay", widthCells: 3, points: [{ x: 2, z: depth - 8 }, { x: width - 2, z: depth - 6.5 }], purpose: "cargo" });
  return roads;
}

function buildingKindFor(role: DistrictRole, index: number, text: string): SettlementBuildingKind {
  if (role === "harbor" || role === "industrial") return index % 4 === 0 ? "factory" : "warehouse";
  if (role === "sacred") return "shrine";
  if (role === "civic") return index % 2 === 0 ? "manor" : "tower";
  if (role === "commercial") {
    if (contains(text, ["公会", "guild"]) && index % 2 === 0) return "guild";
    return index % 3 === 0 ? "guild" : "tavern";
  }
  if (role === "agricultural") return index % 2 === 0 ? "barn" : contains(text, ["磨坊", "mill"]) ? "mill" : "home";
  if (contains(text, ["诊所", "clinic"]) && role === "service") return "clinic";
  if (role === "service" && contains(text, ["铁匠", "blacksmith"])) return "blacksmith";
  return "home";
}

function requestedBuildingKinds(text: string): SettlementBuildingKind[] {
  const requested: SettlementBuildingKind[] = [];
  const add = (kind: SettlementBuildingKind, terms: readonly string[]) => { if (contains(text, terms) && !requested.includes(kind)) requested.push(kind); };
  add("warehouse", ["仓库", "仓储", "warehouse"]);
  add("tavern", ["酒馆", "旅店", "旅馆", "酒店", "tavern", "inn", "hotel"]);
  add("guild", ["公会", "警察驻所", "警察局", "警局", "guild", "police station", "police post"]);
  add("guild", ["工头办公室", "办公室", "foreman office"]);
  add("shrine", ["神殿", "神庙", "小神殿", "教堂", "礼拜堂", "shrine", "temple", "church", "chapel"]);
  add("tower", ["岗楼", "瞭望塔", "灯塔", "无线电塔", "钟塔", "watchtower", "guard tower", "lighthouse", "radio tower", "bell tower"]);
  add("mill", ["磨坊", "mill"]);
  add("blacksmith", ["铁匠", "blacksmith"]);
  add("clinic", ["诊所", "clinic"]);
  add("factory", ["工厂", "厂房", "发电站", "工坊", "factory", "power station", "workshop"]);
  add("barn", ["马厩", "谷仓", "粮仓", "stable", "barn", "granary"]);
  add("manor", ["庄园", "宅邸", "manor", "mansion"]);
  add("home", ["矿工宿舍", "工人住宅", "村民住宅", "住宅", "宿舍", "worker housing", "dormitory", "residence"]);
  return requested;
}

function requestedSiteFeatures(text: string): string[] {
  const features: string[] = [];
  const add = (feature: string, terms: readonly string[]) => { if (contains(text, terms) && !features.includes(feature)) features.push(feature); };
  add("rail-yard", ["铁路货场", "铁路", "轨道", "rail yard", "railway"]);
  add("industrial-plant", ["工业街区", "发电站", "厂房", "工业区", "industrial district", "power station", "factory"]);
  add("conveyor-network", ["输送桥", "输送带", "conveyor"]);
  add("underground-maintenance", ["地下维护", "地下电缆", "maintenance tunnel", "cable level"]);
  add("flooded-site", ["洪水", "淹没", "被淹", "flooded", "flood"]);
  add("elevated-rail", ["高架铁路", "高架铁道", "elevated railway", "viaduct"]);
  add("mountain-monastery", ["山地修道院", "山顶修道院", "mountain monastery"]);
  add("radio-observatory", ["无线电观测", "气象站", "无线电塔", "radio observatory", "weather station"]);
  add("river-crossing", ["河上", "石桥", "河谷", "浅滩", "river bridge", "river crossing", "ford"]);
  return features;
}

function distanceToRoad(point: { x: number; z: number }, road: RoadProgram): { distance: number; entrance: { x: number; z: number } } {
  let best = { distance: Number.POSITIVE_INFINITY, entrance: road.points[0] ?? point };
  for (let index = 1; index < road.points.length; index += 1) {
    const a = road.points[index - 1]; const b = road.points[index];
    if (!a || !b) continue;
    const dx = b.x - a.x; const dz = b.z - a.z; const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2));
    const candidate = { x: a.x + dx * t, z: a.z + dz * t };
    const distance = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (distance < best.distance) best = { distance, entrance: candidate };
  }
  return best;
}

function makeParcels(input: SitePlanningInput, siteType: SiteType, width: number, depth: number, districts: readonly DistrictProgram[], roads: readonly RoadProgram[], rng: SeededRandom): ParcelProgram[] {
  const density = input.request.density;
  const parcelScale = input.request.size === "small" ? 0.7 : input.request.size === "large" ? 1.06 : 0.9;
  const promptText = input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const requiredKinds = requestedBuildingKinds(promptText);
  const nextKind = (role: DistrictRole): SettlementBuildingKind => requiredKinds.find((kind) => !parcels.some((parcel) => parcel.buildingKind === kind)) ?? buildingKindFor(role, parcels.length, promptText);
  const base = siteType === "village" ? 9 : siteType === "town" ? 16 : siteType === "mining-settlement" ? 12 : 24;
  const count = Math.max(5, Math.round(base * sizeFactor(input.request.size) * (0.52 + density * 0.96)));
  const parcels: ParcelProgram[] = [];
  for (let attempt = 0; parcels.length < count && attempt < count * 100; attempt += 1) {
    const district = districts[parcels.length % districts.length];
    if (!district) break;
    const kind = nextKind(district.role);
    const wide = kind === "warehouse" || kind === "factory" || kind === "barn" || kind === "manor";
    const parcelWidth = rng.float(wide ? 7.5 : 4.5, wide ? 12 : 7.5) * parcelScale;
    const parcelDepth = rng.float(wide ? 6 : 4.5, wide ? 10 : 7.5) * parcelScale;
    const x = district.center.x + rng.float(-district.size.x * 0.43, district.size.x * 0.43);
    const z = district.center.z + rng.float(-district.size.z * 0.43, district.size.z * 0.43);
    if (x < parcelWidth / 2 + 1 || x > width - parcelWidth / 2 - 1 || z < parcelDepth / 2 + 1 || z > depth - parcelDepth / 2 - (siteType === "harbor-district" ? 9 : 1)) continue;
    if (Math.hypot(x - width / 2, z - depth / 2) < Math.max(6, Math.min(width, depth) * 0.11)) continue;
    if (parcels.some((parcel) => Math.abs(parcel.center.x - x) < (parcel.size.x + parcelWidth) / 2 + 0.8 && Math.abs(parcel.center.z - z) < (parcel.size.z + parcelDepth) / 2 + 0.8)) continue;
    const roadChoices = roads.map((road) => ({ road, ...distanceToRoad({ x, z }, road) })).sort((a, b) => a.distance - b.distance);
    const frontage = roadChoices[0];
    if (!frontage || frontage.distance > Math.max(12, district.size.x * 0.55)) continue;
    // Reserve a genuine frontage setback. Without this check district spurs can
    // slice through already valid parcels, making the road graph and building
    // graph individually plausible but mutually impossible.
    const frontageClearance = Math.min(parcelWidth, parcelDepth) * 0.42 + frontage.road.widthCells * 0.5 + 0.35;
    if (frontage.distance < frontageClearance) continue;
    if (roadChoices.slice(1).some((choice) => choice.distance < Math.min(parcelWidth, parcelDepth) * 0.22 + choice.road.widthCells * 0.5 + 0.25)) continue;
    const fullBudget = input.request.size === "small" ? 1 : input.request.size === "large" ? 4 : 3;
    const facadeBudget = Math.max(2, Math.round(count * 0.34));
    const lod = parcels.length < fullBudget ? "full-interior" : parcels.length < fullBudget + facadeBudget ? "facade" : "mass";
    parcels.push({
      id: `parcel-${parcels.length + 1}`,
      districtId: district.id,
      center: { x, z },
      size: { x: parcelWidth, z: parcelDepth },
      rotationY: Math.atan2(frontage.entrance.x - x, frontage.entrance.z - z),
      frontageRoadId: frontage.road.id,
      entrance: frontage.entrance,
      buildingKind: kind,
      buildingSeed: `${input.request.seed}/site/building/${parcels.length + 1}`,
      lod,
      floors: kind === "tower" ? { min: 3, max: 5 } : kind === "warehouse" || kind === "factory" || kind === "barn" ? { min: 1, max: 2 } : { min: 1, max: 3 },
      state: contains(input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US"), ["废弃", "abandoned"]) ? "abandoned" : contains(input.request.prompt, ["洪水", "淹没"]) ? "flooded" : "active",
    });
  }
  // Dense sites need a deterministic frontage-growth fallback. Random points
  // inside overlapping district ellipses leave small maps oddly empty because
  // most candidates land on the road network. Growing outward from road
  // segments produces the familiar irregular ribbon of real settlements while
  // retaining independent parcels and seeds.
  for (let attempt = 0; parcels.length < count && attempt < count * 220; attempt += 1) {
    const road = roads[rng.int(0, roads.length - 1)];
    if (!road || road.points.length < 2) continue;
    const segmentIndex = rng.int(1, road.points.length - 1);
    const a = road.points[segmentIndex - 1]; const b = road.points[segmentIndex];
    if (!a || !b) continue;
    const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    if (length < 2) continue;
    const t = rng.float(0.08, 0.92);
    const entrance = { x: a.x + dx * t, z: a.z + dz * t };
    const nearestDistrict = [...districts].sort((left, right) => Math.hypot(left.center.x - entrance.x, left.center.z - entrance.z) - Math.hypot(right.center.x - entrance.x, right.center.z - entrance.z))[0];
    if (!nearestDistrict) continue;
    const kind = nextKind(nearestDistrict.role);
    const wide = kind === "warehouse" || kind === "factory" || kind === "barn" || kind === "manor";
    const parcelWidth = rng.float(wide ? 7.5 : 4.5, wide ? 12 : 7.5) * parcelScale;
    const parcelDepth = rng.float(wide ? 6 : 4.5, wide ? 10 : 7.5) * parcelScale;
    const offset = Math.min(parcelWidth, parcelDepth) * 0.55 + road.widthCells * 0.5 + rng.float(0.5, 1.4);
    const side = rng.bool() ? 1 : -1;
    const x = entrance.x + (-dz / length) * offset * side;
    const z = entrance.z + (dx / length) * offset * side;
    if (x < parcelWidth / 2 + 1 || x > width - parcelWidth / 2 - 1 || z < parcelDepth / 2 + 1 || z > depth - parcelDepth / 2 - (siteType === "harbor-district" ? 9 : 1)) continue;
    if (Math.hypot(x - width / 2, z - depth / 2) < Math.max(5, Math.min(width, depth) * 0.09)) continue;
    if (parcels.some((parcel) => Math.abs(parcel.center.x - x) < (parcel.size.x + parcelWidth) / 2 + 0.6 && Math.abs(parcel.center.z - z) < (parcel.size.z + parcelDepth) / 2 + 0.6)) continue;
    const fullBudget = input.request.size === "small" ? 1 : input.request.size === "large" ? 4 : 3;
    const facadeBudget = Math.max(2, Math.round(count * 0.34));
    const lod = parcels.length < fullBudget ? "full-interior" : parcels.length < fullBudget + facadeBudget ? "facade" : "mass";
    parcels.push({
      id: `parcel-${parcels.length + 1}`,
      districtId: nearestDistrict.id,
      center: { x, z },
      size: { x: parcelWidth, z: parcelDepth },
      rotationY: Math.atan2(entrance.x - x, entrance.z - z),
      frontageRoadId: road.id,
      entrance,
      buildingKind: kind,
      buildingSeed: `${input.request.seed}/site/building/${parcels.length + 1}`,
      lod,
      floors: kind === "tower" ? { min: 3, max: 5 } : kind === "warehouse" || kind === "factory" || kind === "barn" ? { min: 1, max: 2 } : { min: 1, max: 3 },
      state: contains(input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US"), ["废弃", "abandoned"]) ? "abandoned" : contains(input.request.prompt, ["洪水", "淹没"]) ? "flooded" : "active",
    });
  }
  return parcels;
}

export function planSettlementSite(input: SitePlanningInput, rng: SeededRandom): SiteProgram {
  const text = input.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const promptFeatures = requestedSiteFeatures(text);
  const siteType = inferSiteType(text, input.archetype);
  const base: readonly [number, number] = siteType === "harbor-district" ? [72, 54] : siteType === "city-district" ? [82, 68] : siteType === "village" ? [48, 42] : siteType === "mining-settlement" ? [58, 46] : [60, 48];
  const factor = sizeFactor(input.request.size);
  const width = Math.round(base[0] * factor) + rng.int(-3, 4);
  const depth = Math.round(base[1] * factor) + rng.int(-3, 4);
  const districts = makeDistricts(siteType, width, depth, input.request.density, rng.fork("districts"));
  const roads = makeRoads(siteType, width, depth, districts, input.request.density, rng.fork("roads"));
  const parcels = makeParcels(input, siteType, width, depth, districts, roads, rng.fork("parcels"));
  const fullInteriorCount = parcels.filter((parcel) => parcel.lod === "full-interior").length;
  const facadeCount = parcels.filter((parcel) => parcel.lod === "facade").length;
  const massCount = parcels.length - fullInteriorCount - facadeCount;
  const roadLengthCells = roads.reduce((sum, road) => sum + road.points.slice(1).reduce((roadSum, point, index) => {
    const previous = road.points[index]; return roadSum + (previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0);
  }, 0), 0);
  const parcelArea = parcels.reduce((sum, parcel) => sum + parcel.size.x * parcel.size.z, 0);
  const isHarbor = siteType === "harbor-district";
  return {
    version: 1,
    id: `site-${input.request.seed}`,
    seed: input.request.seed,
    siteType,
    bounds: { x: width, z: depth },
    terrain: { kind: isHarbor ? "coast" : siteType === "mining-settlement" ? "valley" : siteType === "village" ? "rolling" : "urban", buildableRatio: isHarbor ? 0.78 : 0.9, elevationBandsFeet: siteType === "village" || siteType === "mining-settlement" ? [0, 5, 10] : [0, 5], ...(isHarbor ? { waterEdge: [{ x: 0, z: depth - 7.5 }, { x: width * 0.28, z: depth - 8.5 }, { x: width * 0.58, z: depth - 6.7 }, { x: width, z: depth - 9 }] } : {}) },
    districts,
    roads,
    parcels,
    openSpaces: [
      { id: "central-open-space", kind: siteType === "village" ? "market" : "plaza", center: { x: width / 2, z: depth / 2 }, size: { x: siteType === "village" ? 8 : 10, z: siteType === "village" ? 7 : 9 } },
      ...(siteType === "village" ? [{ id: "village-fields", kind: "farm" as const, center: { x: width * 0.2, z: depth * 0.78 }, size: { x: width * 0.28, z: depth * 0.2 } }, { id: "village-orchard", kind: "orchard" as const, center: { x: width * 0.78, z: depth * 0.18 }, size: { x: width * 0.22, z: depth * 0.2 } }] : []),
      ...(isHarbor ? [{ id: "fish-market", kind: "market" as const, center: { x: width * 0.55, z: depth - 12 }, size: { x: 12, z: 7 } }, { id: "harbor-quay", kind: "quay" as const, center: { x: width / 2, z: depth - 7 }, size: { x: width - 5, z: 4 } }] : []),
    ],
    encounterZones: [
      { id: "site-entry", kind: "entrance", center: roads[0]?.points[0] ?? { x: 0, z: depth / 2 }, radiusCells: 2 },
      { id: "site-centre-choke", kind: "chokepoint", center: { x: width / 2, z: depth / 2 }, radiusCells: 3 },
      ...(isHarbor ? [{ id: "quay-hazard", kind: "hazard" as const, center: { x: width / 2, z: depth - 5 }, radiusCells: 4 }] : []),
    ],
    requiredFeatures: [...(isHarbor ? ["coast", "docks", "cargo-road", "warehouse-district", "market", "mixed-buildings", "roof-route"] : siteType === "village" ? ["organic-roads", "well", "farms", "orchard", "mixed-buildings"] : ["road-hierarchy", "districts", "mixed-buildings"]), ...promptFeatures],
    lodPolicy: { fullInteriorCount, facadeCount, massCount },
    diagnostics: { roadLengthCells, parcelCoverage: parcelArea / (width * depth), districtCount: districts.length },
  };
}
