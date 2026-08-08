import type { SceneKind } from "../schema";
import { classifyInput } from "../semantic/classify";
import type {
  CoverageOperator,
  MorphologyOperator,
  Ruleset,
  SceneDomain,
  SceneEra,
  SceneProgram,
  SceneProgramRegion,
  SceneProgramRelation,
} from "./schema";

function has(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalized(prompt: string): string {
  return prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function inferRuleset(text: string): Ruleset {
  if (has(text, ["coc", "call of cthulhu", "克苏鲁", "调查员", "调查", "线索", "侦探", "san值", "1920"])) return "coc";
  if (has(text, ["d&d", "dnd", "龙与地下城", "战斗", "伏击", "boss", "法术", "巨龙"])) return "dnd";
  return "generic";
}

function inferEra(text: string): SceneEra {
  if (has(text, ["1920", "1920s", "爵士时代", "民国"])) return "1920s";
  if (has(text, ["前现代", "前工业", "旧城", "古城", "premodern", "pre-modern"])) return "medieval";
  if (has(text, ["现代", "当代", "modern", "医院", "警局", "地铁", "机场"])) return "modern";
  if (has(text, ["未来", "赛博", "太空", "future", "cyber"])) return "future";
  if (has(text, ["工业", "维多利亚", "蒸汽", "industrial", "victorian"])) return "industrial";
  if (has(text, ["古代", "远古", "ancient", "遗迹"])) return "ancient";
  if (has(text, ["城堡", "中世纪", "medieval", "酒馆", "神殿", "龙骨", "阿弗纳斯"])) return "medieval";
  return "timeless";
}

function inferDomain(text: string, requestedKind: SceneKind): { domain: SceneDomain; primaryKind: Exclude<SceneKind, "adaptive"> } {
  if (requestedKind !== "adaptive") {
    if (requestedKind === "settlement") return { domain: "settlement", primaryKind: requestedKind };
    if (requestedKind === "wilderness" || requestedKind === "cave") return { domain: "natural", primaryKind: requestedKind };
    if (requestedKind === "sewer") return { domain: "infrastructure", primaryKind: requestedKind };
    if (requestedKind === "dungeon") return { domain: "building", primaryKind: requestedKind };
    return { domain: "building", primaryKind: requestedKind };
  }
  // A city modifier describes context; an explicit institution still owns the
  // spatial domain (for example "modern city hospital").
  // An explicit dungeon noun owns the topology even when the prompt also names
  // a room function such as laboratory, temple, prison, or archive.
  const hasWildernessBuilding = has(text, ["木屋", "小屋", "猎人屋", "cabin", "lodge", "hut", "cottage", "outpost"])
    && has(text, ["森林", "树林", "林间", "巨树", "树根", "山地", "河谷", "沼泽", "海岸", "forest", "woodland", "tree", "mountain", "valley", "swamp", "coast"]);
  if (hasWildernessBuilding) return { domain: "natural", primaryKind: "wilderness" };
  const hasCompoundRoadSite = has(text, ["驿站", "road station", "coach stop"])
    && has(text, ["主路", "桥", "马厩", "收费岗", "仓库", "main road", "bridge", "stable", "toll", "warehouse"]);
  if (hasCompoundRoadSite) return { domain: "settlement", primaryKind: "settlement" };
  const hasBuildingSubject = has(text, ["庄园", "宅邸", "教堂", "神殿", "堡垒", "警局", "警察局", "医院", "学校", "车站", "修道院", "办公楼", "银行", "市政厅", "公寓", "住宅", "发电站", "研究所", "防空洞", "电影院", "夜总会", "诊所", "大学", "manor", "mansion", "church", "temple", "fortress", "police station", "monastery", "office", "bank", "city hall", "apartment", "residence", "power station", "institute", "bunker", "cinema", "nightclub", "clinic", "university"]);
  const hasExplicitDungeonSubject = has(text, ["地牢", "地下城", "迷宫", "龙巢", "地下神殿", "dungeon", "labyrinth", "lair"]);
  // A settlement is the parent site and named buildings are its children.
  // "港区有酒馆和神殿" must therefore plan a district, not collapse into
  // whichever child building noun appears last in the prompt.
  const hasStrongSettlementSubject = has(text, ["城镇", "村庄", "村落", "市场村", "聚居地", "街区", "港区", "港口区", "贵族区", "贫民区", "商业区", "住宅区", "殖民地区", "深水城", "水城", "运河城", "聚落", "小镇", "town", "village", "market village", "district", "harbor", "water city", "canal city", "settlement"])
    || (has(text, ["工业区"]) && !has(text, ["废弃工业区", "工业遗址", "industrial ruin"]));
  const hasSettlementSubject = hasStrongSettlementSubject || (!hasBuildingSubject && has(text, ["城市", "city"]));
  if (hasSettlementSubject) return { domain: "settlement", primaryKind: "settlement" };
  if (hasExplicitDungeonSubject || (!hasBuildingSubject && has(text, ["墓穴", "crypt"]))) return { domain: "building", primaryKind: "dungeon" };
  if (has(text, ["法师塔", "魔法塔", "巫师塔", "炼金塔", "炼金术塔", "wizard tower", "mage tower", "alchemy tower"])) return { domain: "building", primaryKind: "tower" };
  if (has(text, ["灯塔", "lighthouse", "light house"])) return { domain: "building", primaryKind: "tower" };
  if (has(text, ["医院", "旅馆", "酒店", "学校", "警局", "警察局", "工厂", "宅邸", "庄园", "教堂", "神殿", "神庙", "堡垒", "要塞", "城堡", "灯塔", "建筑", "观测所", "天文馆", "天文台", "研究所", "实验室", "博物馆", "剧院", "车站", "修道院", "办公楼", "银行", "市政厅", "公寓", "住宅", "发电站", "防空洞", "电影院", "夜总会", "诊所", "大学", "hospital", "hotel", "school", "police", "factory", "manor", "mansion", "church", "temple", "fortress", "citadel", "castle", "lighthouse", "observatory", "planetarium", "laboratory", "museum", "theatre", "station", "monastery", "office", "bank", "city hall", "apartment", "residence", "power station", "institute", "bunker", "cinema", "nightclub", "clinic", "university"])) return { domain: "building", primaryKind: "building" };
  if (has(text, ["工业区", "工业遗址", "废弃工业区", "潮汐", "潮池", "珊瑚庭院", "珊瑚礁"])) return { domain: "natural", primaryKind: "wilderness" };
  if (has(text, ["城市", "城镇", "村庄", "街区", "港区", "深水城", "水城", "运河城", "聚落", "city", "town", "village", "district", "harbor", "water city", "canal city", "settlement"])) return { domain: "settlement", primaryKind: "settlement" };
  if (has(text, ["下水道", "排水", "隧道", "地铁", "sewer", "drain", "subway"])) return { domain: "infrastructure", primaryKind: "sewer" };
  const classified = classifyInput(text);
  if (classified.kind !== "adaptive") return inferDomain(text, classified.kind);
  return { domain: "natural", primaryKind: "wilderness" };
}

function inferOperators(text: string): { morphology: MorphologyOperator[]; coverage: CoverageOperator[] } {
  const morphology: MorphologyOperator[] = [];
  const coverage: CoverageOperator[] = [];
  if (has(text, ["陨石", "流星", "撞击坑", "meteor", "impact crater"])) morphology.push("impact-crater", "radial-fractures", "basin");
  if (has(text, ["火山", "caldera", "volcano"])) morphology.push("caldera");
  if (has(text, ["熔岩", "岩浆", "lava", "magma", "阿弗纳斯", "地狱"])) morphology.push("lava-flow");
  if (has(text, ["河流", "河谷", "溪流", "河道", "水城", "运河", "支流", "river", "stream", "canal", "water city"])) morphology.push("channel-cut");
  if (has(text, ["河床", "干涸", "dry river", "wadi"])) morphology.push("dry-channel");
  if (has(text, ["裂谷", "峡谷", "rift", "chasm"])) morphology.push("rift", "ravine");
  if (has(text, ["浮空", "浮岛", "空岛", "floating island", "sky island", "levitating"])) morphology.push("floating-islands");
  if (has(text, ["地牢", "地下城", "迷宫", "龙巢", "墓穴", "地下神殿", "dungeon", "labyrinth", "crypt", "lair"])) morphology.push("interior-partitions", "vertical-stack");
  if (has(text, ["墓地", "埋葬", "墓园", "grave", "burial", "cemetery"])) morphology.push("burial-field", "crypt-sink");
  if (has(text, ["城市", "街区", "深水城", "水城", "运河城", "city", "district", "water city", "canal city"])) morphology.push("urban-blocks");
  if (has(text, ["医院", "旅馆", "酒店", "学校", "警局", "警察局", "建筑", "庄园", "宅邸", "教堂", "神殿", "神庙", "堡垒", "要塞", "城堡", "灯塔", "博物馆", "工厂", "剧院", "车站", "修道院", "办公楼", "银行", "市政厅", "公寓", "住宅", "发电站", "防空洞", "电影院", "夜总会", "诊所", "大学", "hospital", "hotel", "school", "police", "manor", "mansion", "church", "temple", "fortress", "citadel", "castle", "lighthouse", "museum", "factory", "theatre", "station", "monastery", "office", "bank", "city hall", "apartment", "residence", "power station", "institute", "bunker", "cinema", "nightclub", "clinic", "university"])) morphology.push("interior-partitions", "vertical-stack");
  if (has(text, ["观测所", "天文馆", "天文台", "observatory", "planetarium"])) morphology.push("interior-partitions", "vertical-stack");
  if (has(text, ["森林", "树林", "forest", "woodland"])) coverage.push("woodland", "dense");
  if (has(text, ["蘑菇", "菌林", "fungal", "mushroom"])) coverage.push("fungal");
  if (has(text, ["墓碑", "墓地", "tombstone", "cemetery"])) coverage.push("grave-markers");
  if (has(text, ["龙骨", "巨龙遗骸", "dragonbone", "dragon bones"])) coverage.push("dragon-bones");
  if (has(text, ["残骸", "战车", "wreck", "battlefield", "阿弗纳斯"])) coverage.push("wreck-field");
  if (has(text, ["浮空", "浮岛", "空岛", "floating island", "sky island", "levitating"])) coverage.push("floating-islands");
  if (has(text, ["灰烬", "焦土", "ash", "地狱", "阿弗纳斯"])) coverage.push("ash");
  if (has(text, ["遗迹", "废墟", "瓦砾", "ruin", "rubble"])) coverage.push("rubble");
  if (has(text, ["医院", "学校", "警局", "警察局", "hospital", "school", "police"])) coverage.push("institutional-rooms");
  if (has(text, ["旅馆", "酒店", "住宅", "hotel", "residential"])) coverage.push("residential-rooms");
  if (has(text, ["调查", "线索", "侦探", "investigation", "evidence", "coc"])) coverage.push("evidence");
  // Absence of a recognised landform is not evidence for a random one.
  // Keep the local fallback neutral and let an Ollama-authored SceneProgram or
  // future vocabulary modules introduce a specific, auditable operator.
  if (morphology.length === 0) morphology.push("plain");
  if (coverage.length === 0) coverage.push("sparse");
  return { morphology: unique(morphology), coverage: unique(coverage) };
}

function region(id: string, label: string, fn: SceneProgramRegion["function"], scale: number, elevation: SceneProgramRegion["elevation"], features: string[] = [], hazards: string[] = []): SceneProgramRegion {
  return { id, label, function: fn, scale, elevation, features, hazards };
}

function buildingRegions(text: string): SceneProgramRegion[] {
  if (has(text, ["医院", "hospital"])) return [
    region("public-entry", "Reception and public waiting", "public", 0.18, "level", ["reception", "waiting"], []),
    region("ward", "Patient ward", "private", 0.26, "raised", ["beds", "nurse-station"], []),
    region("surgery", "Surgery and treatment", "investigation", 0.16, "raised", ["operating-room", "sterile-corridor"], []),
    region("records", "Records and administration", "investigation", 0.12, "level", ["archives", "locked-office"], []),
    region("service", "Kitchen, laundry and plant", "service", 0.15, "low", ["service-corridor", "boiler"], ["machinery"]),
    region("morgue", "Basement morgue", "hazard", 0.13, "sunken", ["cold-room", "autopsy"], ["restricted-access"]),
  ];
  if (has(text, ["观测所", "天文馆", "天文台", "observatory", "planetarium"])) return [
    region("arrival", "Instrument court and public entry", "approach", 0.14, "level", ["brass-instruments", "visitor-control"], []),
    region("dome", "Rotating observatory dome", "combat", 0.22, "high", ["telescope", "open-sky-dome"], ["exposed-edge"]),
    region("archive", "Restricted astronomical archive", "investigation", 0.16, "sunken", ["star-charts", "sealed-drawers"], ["forbidden-records"]),
    region("water", "Mirror-water calibration room", "hazard", 0.16, "low", ["mirror-pool", "refraction"], ["deep-water"]),
    region("mechanism", "Clockwork drive and service gantry", "service", 0.17, "vertical", ["gear-train", "catwalk"], ["moving-machinery"]),
    region("roof", "Open rooftop platform", "landmark", 0.15, "raised", ["sky-platform", "signal-beacon"], []),
  ];
  if (has(text, ["旅馆", "酒店", "hotel"])) return [
    region("lobby", "Lobby and reception", "public", 0.2, "level", ["desk", "lounge"], []),
    region("guest-wing", "Guest rooms", "private", 0.34, "raised", ["rooms", "corridor"], []),
    region("dining", "Dining and function room", "public", 0.18, "level", ["dining", "stage"], []),
    region("staff", "Staff and kitchen service", "service", 0.16, "low", ["kitchen", "service-stair"], []),
    region("plant", "Basement plant and stores", "investigation", 0.12, "sunken", ["boiler", "stores"], []),
  ];
  return [
    region("entry", "Public approach", "approach", 0.18, "level", ["entrance"], []),
    region("main", "Primary functional space", "public", 0.38, "level", ["main-hall"], []),
    region("private", "Restricted rooms", "private", 0.24, "raised", ["private-room"], []),
    region("service", "Service and storage", "service", 0.2, "low", ["service-route"], []),
  ];
}

function naturalRegions(text: string, morphology: readonly MorphologyOperator[], coverage: readonly CoverageOperator[]): SceneProgramRegion[] {
  if (morphology.includes("impact-crater")) return [
    region("approach", "Ejecta approach", "approach", 0.18, "raised", ["ejecta-blocks"], []),
    region("rim", "Broken impact rim", "combat", 0.24, "high", ["overlook", "rim-crossing"], ["unstable-edge"]),
    region("basin", "Crater basin", "hazard", 0.28, "sunken", ["impact-glass"], ["exposure"]),
    region("core", "Impact core", "landmark", 0.12, "low", ["meteor-fragment"], ["radiation"]),
    region("fractures", "Radial fracture field", "circulation", 0.18, "low", ["fracture-routes"], ["collapse"]),
  ];
  if (morphology.includes("floating-islands")) return [
    region("lower-debris", "Falling-debris approach", "approach", 0.16, "low", ["debris-field", "anchor-chain"], ["void-fall"]),
    region("ash-island", "Lower broken island", "combat", 0.24, "raised", ["lava-veins", "broken-edge"], ["collapse"]),
    region("middle-island", "Middle floating island", "circulation", 0.28, "high", ["suspended-bridge", "wind-gap"], ["shear-wind"]),
    region("upper-island", "Upper command island", "landmark", 0.22, "vertical", ["sky-fort", "anchor-spire"], ["exposed-edge"]),
    region("underside", "Hanging underside and chains", "hazard", 0.1, "sunken", ["chain-route", "cavernous-rock"], ["falling-rock"]),
  ];
  if (coverage.includes("dragon-bones")) return [
    region("approach", "Burial approach", "approach", 0.16, "level", ["grave-markers"], []),
    region("skull", "Dragon skull arena", "combat", 0.22, "raised", ["skull", "jaw-gate"], []),
    region("spine", "Spinal high route", "circulation", 0.24, "high", ["spine-bridge"], ["exposed"]),
    region("ribs", "Rib field", "combat", 0.22, "level", ["rib-cover"], []),
    region("crypt", "Burial crypt", "investigation", 0.16, "sunken", ["sealed-tomb"], ["collapse"]),
  ];
  if (has(text, ["阿弗纳斯", "avernus", "地狱", "hell"])) return [
    region("war-road", "Infernal war road", "circulation", 0.24, "raised", ["iron-road", "vehicle-lane"], []),
    region("river", "Toxic river crossing", "hazard", 0.2, "sunken", ["ford", "broken-bridge"], ["toxic-water"]),
    region("wrecks", "War machine wreck field", "combat", 0.22, "level", ["wreck-cover"], ["fire"]),
    region("outpost", "Iron outpost", "landmark", 0.18, "high", ["watch-platform"], []),
    region("ash-waste", "Ash waste flank", "natural", 0.16, "low", ["ash-dunes"], ["lava-fissure"]),
  ];
  return [
    region("approach", "Primary approach", "approach", 0.18, "low", ["entry-route"], []),
    region("lowland", "Lower tactical field", "natural", 0.28, "low", ["cover"], []),
    region("landmark", "Central landmark", "landmark", 0.2, "raised", ["objective"], []),
    region("highland", "Overlooking high ground", "combat", 0.2, "high", ["overlook"], []),
    region("alternate", "Alternate route zone", "circulation", 0.14, "level", ["flank-route"], []),
  ];
}

function settlementRegions(): SceneProgramRegion[] {
  return [
    region("gate", "Primary arrival and gate", "approach", 0.12, "level", ["gate", "traffic"], []),
    region("market", "Commercial and market core", "commercial", 0.22, "level", ["market", "plaza"], []),
    region("civic", "Civic landmark district", "civic", 0.18, "raised", ["landmark", "administration"], []),
    region("residential", "Residential quarters", "residential", 0.28, "level", ["homes", "alleys"], []),
    region("service", "Industry, storage and service edge", "industrial", 0.2, "low", ["service-road", "storage"], []),
  ];
}

function dungeonRegions(text: string): SceneProgramRegion[] {
  const style = has(text, ["矿井", "矿坑", "mine"]) ? "mine" : has(text, ["神殿", "祭坛", "temple"]) ? "temple" : has(text, ["龙巢", "lair"]) ? "lair" : "crypt";
  return [
    region("descent", "Descent and guarded entrance", "approach", 0.14, "low", ["gate", "guard-post"], []),
    region("service", `${style} service and storage level`, "service", 0.2, "level", ["stores", "back-route"], []),
    region("hazards", "Trap and hazard galleries", "hazard", 0.18, "raised", ["traps", "chokepoints"], ["collapse", "ambush"]),
    region("secret", "Hidden chamber network", "investigation", 0.18, "vertical", ["false-wall", "secret-stairs"], ["sealed-door"]),
    region("sanctum", "Deep sanctum and boss arena", "combat", 0.3, "high", ["boss-room", "treasure", "objective"], []),
  ];
}

function chainRelations(regions: readonly SceneProgramRegion[]): SceneProgramRelation[] {
  return regions.slice(1).map((current, index) => ({ from: regions[index]?.id ?? regions[0]?.id ?? "entry", to: current.id, type: "connects" as const }));
}

export function planSceneProgramLocally(prompt: string, requestedKind: SceneKind = "adaptive"): SceneProgram {
  const text = normalized(prompt);
  const ruleset = inferRuleset(text);
  const era = inferEra(text);
  const { domain, primaryKind } = inferDomain(text, requestedKind);
  const { morphology, coverage } = inferOperators(text);
  const regions = primaryKind === "dungeon" ? dungeonRegions(text) : domain === "settlement" ? settlementRegions() : domain === "building" || domain === "interior" ? buildingRegions(text) : naturalRegions(text, morphology, coverage);
  const landmarks = unique(regions.flatMap((item) => item.features).filter((_, index) => index < 8));
  const hazards = unique(regions.flatMap((item) => item.hazards).filter((_, index) => index < 8));
  const gameplayMode = ruleset === "coc" ? "investigation" : has(text, ["追逐", "chase"]) ? "chase" : ruleset === "dnd" ? "combat" : "mixed";
  const topology = morphology.includes("impact-crater") ? "radial" : domain === "settlement" ? "network" : morphology.includes("caldera") ? "loop" : domain === "building" ? "branching" : "open";
  return {
    version: 1,
    source: "local",
    title: prompt.trim().slice(0, 64) || "Procedural scene",
    domain,
    primaryKind,
    ruleset,
    era,
    topology,
    morphology,
    coverage,
    regions,
    relations: chainRelations(regions),
    landmarks,
    hazards,
    gameplay: {
      mode: gameplayMode,
      objectives: ruleset === "coc" ? ["discover the hidden relationship", "reach a safe exit"] : ["control the central landmark", "preserve an alternate route"],
      evidence: ruleset === "coc" ? ["document trail", "physical trace", "witness location"] : [],
      encounterBeats: gameplayMode === "chase" ? ["approach", "obstruction", "escape"] : ["approach", "reveal", "resolution"],
    },
    constraints: {
      gridFeet: 5,
      routeRedundancy: ruleset === "coc" ? 2 : 3,
      verticalRoutes: regions.some((item) => item.elevation === "high" || item.elevation === "vertical") ? 1 : 0,
      realism: ruleset === "coc" || era === "modern" || era === "1920s" ? "strict" : "plausible",
    },
  };
}
