import type { GeneratedScene, GenerationRequest } from "../schema";
import { embeddedFacilityCapabilities, shouldComposeWildernessFacility } from "../semantic/siteIntent";
import { CAPABILITY_CARDS, COMPOSITION_GRAMMARS, DESIGNER_MOTIFS, FUNCTIONAL_MODULES } from "./catalog";
import type { DomainDensityProfile, SceneCompositionProgram, SceneCompositionProgramSummary, SemanticCoverageReport, SemanticRequirement, StyleProgram } from "./schema";
import { resolveCapabilityDomain } from "./capabilityDomain";

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US");
const has = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));

function hasSettlementParent(text: string): boolean {
  return has(text, [
    "城镇", "村镇", "村庄", "村落", "灯塔村", "海岸村", "海崖村", "渔村", "聚居地", "街区", "港区", "港镇", "港村", "水镇", "水城", "运河城", "小镇",
    "town", "village", "settlement", "district", "port town", "harbor village", "water town", "water city", "canal city",
  ]);
}

function hasExplicitWaterCity(text: string): boolean {
  // “深水城” is the proper name Waterdeep, not the Chinese morphology noun
  // “水城”. Remove the proper name before testing the generic substring.
  const morphologyText = text.replaceAll("深水城", "");
  return has(morphologyText, [
    "水城", "河道水城", "水镇", "潮汐水镇", "运河城", "水上市集", "水上市场", "泄洪渠",
    "canal city", "water city", "water town", "tidal town", "water market",
  ]);
}

/**
 * BGE is allowed to retrieve child capabilities, but macro terrain cards need
 * explicit textual evidence.  Without this boundary an embedding can confuse
 * “翼港整备所” with a floating-island card and silently replace the authored
 * mountain/canyon parent.  The deterministic planner remains the owner of
 * parent morphology.
 */
const MACRO_CAPABILITY_CUES: Record<string, readonly string[]> = {
  "terrain.crater-rim": ["陨石坑", "撞击坑", "流星坑", "impact crater", "meteor crater"],
  "terrain.caldera": ["火山", "火山口", "破火山口", "熔岩", "岩浆", "caldera", "volcano", "volcanic", "lava"],
  "terrain.ravine": ["裂谷", "裂缝", "裂隙", "深渊", "峡谷", "ravine", "rift", "chasm", "fissure", "canyon"],
  "terrain.crevasse": ["冰川", "冰隙", "冰裂", "冰裂沟", "crevasse", "glacier", "fissure"],
  "terrain.floating-island": ["浮空岛", "浮空岩岛", "浮岛", "空岛", "悬空岛", "漂浮岩岛", "floating island", "sky island", "levitating island"],
  "terrain.salt-crystal-island": ["盐晶浮岛", "盐晶岛", "floating monastery", "salt crystal island"],
  "terrain.cave-chamber": ["洞穴", "洞窟", "岩窟", "溶洞", "海蚀洞", "cave", "cavern", "grotto", "sea cave"],
  "terrain.marsh-basin": ["沼泽", "湿地", "泥沼", "marsh", "swamp", "bog", "wetland"],
  "water.meandering-channel": ["河流", "河谷", "溪流", "河川", "河湾", "river", "stream", "riverbank"],
  "water.tributary": ["支流", "分流", "tributary", "branch channel"],
  "water.waterfall": ["瀑布", "落差", "waterfall", "cascade"],
  "water.cavern-tide-pool": ["潮汐洞穴", "潮池", "潮汐池", "tidal cavern", "tidal pool", "tide pool"],
  "ecology.mangrove-canopy": ["红树林", "mangrove"],
  "ecology.tree-cluster": ["森林", "林地", "树林", "树群", "树冠", "forest", "woodland", "canopy"],
  "ecology.undergrowth": ["森林", "林下", "灌木", "蕨类", "undergrowth", "forest floor"],
  "ecology.fallen-log": ["森林", "倒木", "fallen log", "woodland"],
  "ecology.ancient-tree": ["巨树", "古树", "树冠平台", "ancient tree", "giant tree"],
  "ecology.fungal-grove": ["蘑菇", "菌类", "菌林", "fungus", "fungal", "mushroom"],
};

function filterRetrievedCapabilities(prompt: string, ids: readonly string[]): string[] {
  const text = normalized(prompt);
  const hasExplicitParent = has(text, [
    "森林", "林地", "树林", "巨树", "树冠", "forest", "woodland", "canopy", "ancient tree", "giant tree",
    "山", "高山", "山地", "山脊", "峡谷", "高原", "峰顶", "mountain", "ridge", "canyon", "plateau", "summit",
    "冰原", "冰盖", "冰川", "冻土", "雪原", "ice field", "ice sheet", "glacier", "tundra", "permafrost",
    "河流", "河谷", "溪流", "河川", "瀑布", "river", "stream", "riverbank", "waterfall",
    "沼泽", "湿地", "泥沼", "marsh", "swamp", "bog", "wetland",
    "洞穴", "洞窟", "岩窟", "溶洞", "海蚀洞", "cave", "cavern", "grotto", "sea cave",
    "火山", "火山口", "熔岩", "岩浆", "volcano", "volcanic", "caldera", "lava",
    "裂谷", "裂缝", "裂隙", "深渊", "rift", "ravine", "chasm", "fissure",
    "浮空岛", "浮空岩岛", "浮岛", "空岛", "悬空岛", "漂浮岩岛", "floating island", "sky island",
    "陨石坑", "撞击坑", "流星坑", "impact crater", "meteor crater",
  ]);
  if (!hasExplicitParent) return [...ids];
  return ids.filter((id) => {
    const cues = MACRO_CAPABILITY_CUES[id];
    return !cues || cues.some((cue) => text.includes(cue));
  });
}

function domainFor(prompt: string): SceneCompositionProgram["primaryDomain"] {
  const text = normalized(prompt);
  if (has(text, ["陨石坑", "撞击坑", "流星坑", "impact crater", "meteor crater"])) return "crater";
  // Ice fields may contain secondary fissures without becoming a generic
  // two-bank rift. The parent material/process owns the composition domain.
  if (has(text, ["冰原", "冰盖", "冰川", "冻土", "雪原", "ice field", "ice sheet", "glacier", "tundra", "permafrost"])) return "ice";
  if (has(text, ["浮空岛", "浮空岩岛", "浮岛", "空岛", "悬空岛", "悬空石盘", "漂浮岩岛", "floating island", "sky island", "levitating island"])) return "floating";
  if (has(text, ["洞穴", "洞窟", "岩窟", "溶洞", "地底洞室", "海蚀洞", "潮汐洞穴", "洞穴群", "cave", "cavern", "grotto", "sea cave", "tidal cavern", "cave network"])) return "cave";
  if (has(text, ["裂谷", "裂缝", "裂隙", "深渊", "rift", "crevasse", "chasm", "ravine"])) return "rift";
  if (has(text, ["火山", "熔岩", "岩浆", "volcano", "volcanic", "caldera", "lava"])) return "volcanic";
  if (has(text, ["盐碱荒原", "盐碱地", "盐沼荒原", "盐壳荒地", "salt wasteland", "salt flat", "salt flats", "salt desert"])) return "salt-waste";
  // Mangroves are tidal wetlands. They must not be claimed by the generic
  // forest branch merely because the Chinese word contains “树林”.
  if (has(text, ["红树林", "mangrove"])) return "swamp";
  // A dock, quay or waterwheel is a child facility, not proof that an entire
  // named town/harbor is a canal city. Preserve settlement ownership unless
  // the prompt explicitly names a water-city morphology.
  if (hasExplicitWaterCity(text)) return "river";
  if (hasSettlementParent(text)) return "settlement";
  if (has(text, ["河谷", "河流", "溪流", "瀑布", "river", "stream", "waterfall", "valley"])) return "river";
  if (has(text, ["森林", "林地", "树林", "雨林", "丛林", "巨树", "树冠", "forest", "woodland", "rainforest", "jungle", "canopy"])) return "forest";
  if (has(text, ["沼泽", "湿地", "泥沼", "marsh", "swamp", "bog", "wetland"])) return "swamp";
  return "generic";
}

function densityProfile(domain: string, value: number): DomainDensityProfile {
  const density = Math.max(0, Math.min(1, value));
  if (domain === "settlement") return { domain, normalized: density, structuralComplexity: 0.38 + density * 0.56, routeComplexity: 0.34 + density * 0.54, hazardFrequency: 0.08 + density * 0.26, ecologicalCoverage: 0.08 + density * 0.24, landmarkFrequency: 0.28 + density * 0.6, detailFrequency: 0.3 + density * 0.66 };
  if (domain === "forest") return { domain, normalized: density, structuralComplexity: 0.35 + density * 0.55, routeComplexity: 0.25 + density * 0.35, hazardFrequency: 0.15 + density * 0.35, ecologicalCoverage: 0.22 + density * 0.73, landmarkFrequency: 0.15 + density * 0.45, detailFrequency: 0.2 + density * 0.75 };
  if (domain === "swamp") return { domain, normalized: density, structuralComplexity: 0.32 + density * 0.5, routeComplexity: 0.34 + density * 0.46, hazardFrequency: 0.35 + density * 0.58, ecologicalCoverage: 0.28 + density * 0.62, landmarkFrequency: 0.16 + density * 0.42, detailFrequency: 0.25 + density * 0.7 };
  if (domain === "river") return { domain, normalized: density, structuralComplexity: 0.35 + density * 0.5, routeComplexity: 0.3 + density * 0.45, hazardFrequency: 0.2 + density * 0.55, ecologicalCoverage: 0.2 + density * 0.55, landmarkFrequency: 0.2 + density * 0.45, detailFrequency: 0.15 + density * 0.7 };
  if (domain === "volcanic" || domain === "crater" || domain === "rift") return { domain, normalized: density, structuralComplexity: 0.4 + density * 0.55, routeComplexity: 0.25 + density * 0.45, hazardFrequency: 0.3 + density * 0.65, ecologicalCoverage: 0.02, landmarkFrequency: 0.25 + density * 0.55, detailFrequency: 0.2 + density * 0.75 };
  if (domain === "ice") return { domain, normalized: density, structuralComplexity: 0.34 + density * 0.58, routeComplexity: 0.28 + density * 0.5, hazardFrequency: 0.22 + density * 0.62, ecologicalCoverage: 0.01, landmarkFrequency: 0.18 + density * 0.5, detailFrequency: 0.18 + density * 0.72 };
  if (domain === "salt-waste") return { domain, normalized: density, structuralComplexity: 0.44 + density * 0.5, routeComplexity: 0.34 + density * 0.48, hazardFrequency: 0.42 + density * 0.5, ecologicalCoverage: 0.04 + density * 0.12, landmarkFrequency: 0.3 + density * 0.52, detailFrequency: 0.24 + density * 0.7 };
  if (domain === "floating") return { domain, normalized: density, structuralComplexity: 0.45 + density * 0.52, routeComplexity: 0.4 + density * 0.52, hazardFrequency: 0.42 + density * 0.5, ecologicalCoverage: 0.04 + density * 0.16, landmarkFrequency: 0.4 + density * 0.5, detailFrequency: 0.22 + density * 0.7 };
  if (domain === "cave") return { domain, normalized: density, structuralComplexity: 0.42 + density * 0.5, routeComplexity: 0.38 + density * 0.5, hazardFrequency: 0.3 + density * 0.58, ecologicalCoverage: 0.05 + density * 0.32, landmarkFrequency: 0.2 + density * 0.48, detailFrequency: 0.2 + density * 0.72 };
  return { domain: "generic", normalized: density, structuralComplexity: 0.25 + density * 0.45, routeComplexity: 0.25 + density * 0.35, hazardFrequency: 0.15 + density * 0.35, ecologicalCoverage: 0.15 + density * 0.45, landmarkFrequency: 0.15 + density * 0.35, detailFrequency: 0.2 + density * 0.65 };
}

function styleFor(prompt: string, domain: string): StyleProgram {
  const text = normalized(prompt);
  const era = has(text, ["1920", "现代", "modern", "工业", "industrial"]) ? "historic" : has(text, ["d&d", "法师", "魔法", "中世纪", "medieval", "fantasy"]) ? "fantasy-medieval" : "timeless";
  const materialFamily = has(text, ["盐晶", "salt crystal"]) ? ["salt-crystal", "ice", "rock", "water"]
    : has(text, ["红树林", "mangrove"]) ? ["mangrove", "wood", "mud", "water"]
      : has(text, ["空心古树", "古树内部", "hollow tree"]) ? ["bark", "wood", "root", "moss"]
        : has(text, ["冻土", "冰原", "冰川", "tundra", "glacier", "ice field"]) ? ["ice", "snow", "weathered-metal", "wood"]
      : domain === "volcanic" ? ["basalt", "obsidian", "lava"] : domain === "salt-waste" ? ["salt-crust", "brine", "stone", "bleached-wood"] : domain === "floating" ? ["rock", "dark-stone", "metal", "void"] : domain === "cave" ? ["rock", "mineral", "water", "fungus"] : domain === "swamp" ? ["mud", "water", "reed", "wood", "moss"] : domain === "forest" ? ["wood", "moss", "earth", "stone"] : domain === "river" ? ["water", "rock", "earth", "moss"] : ["rock", "earth"];
  const climate = has(text, ["盐晶", "salt crystal"]) ? "cold-dry-cavern"
    : has(text, ["红树林", "mangrove"]) ? "tropical-wet"
      : has(text, ["冰", "glacier", "snow"]) ? "cold"
      : domain === "volcanic" ? "hot-dry" : domain === "salt-waste" ? "cold-dry-salt" : domain === "floating" ? "exposed-high-altitude" : domain === "cave" ? "subterranean" : domain === "swamp" ? "humid-wetland" : domain === "river" || domain === "forest" ? "temperate-wet" : "neutral";
  const silhouetteTags = has(text, ["盐晶", "salt crystal"]) ? ["three-floating-levels", "crystal-spires", "cavern-void"]
    : has(text, ["红树林", "mangrove"]) ? ["root-canopy", "tidal-channel", "boardwalks"]
      : has(text, ["空心古树", "古树内部", "hollow tree"]) ? ["bark-shell", "spiral-cavity", "canopy-platform"]
      : domain === "salt-waste" ? ["broken-salt-crust", "brine-basins", "salt-ridges", "fractured-route"] : domain === "floating" ? ["three-height-bands", "exposed-undersides", "void-gaps"] : domain === "cave" ? ["connected-chambers", "rock-ledges", "dark-passages"] : domain === "swamp" ? ["broken-dry-islands", "water-pools", "raised-boardwalks"] : domain === "forest" ? ["layered-canopy", "irregular-clearings"] : domain === "river" ? ["incised-valley", "descending-water"] : domain === "volcanic" ? ["broken-rim", "radial-fractures"] : ["broken-rim"];
  return { era, climate, materialFamily, paletteTags: materialFamily, silhouetteTags, forbiddenTags: domain === "volcanic" ? ["living-tree", "lush-grass"] : [] };
}

function semanticRequirements(prompt: string, domain: string): SemanticRequirement[] {
  const text = normalized(prompt);
  const facilityCapabilities = embeddedFacilityCapabilities(text);
  const settlementParent = hasSettlementParent(text);
  const output: SemanticRequirement[] = [];
  const add = (id: string, phrase: string, tags: string[], importance: SemanticRequirement["importance"] = "major") => output.push({ id, sourcePhrase: phrase, requiredTags: tags, importance });
  if (has(text, ["空心古树", "古树内部", "树内城市", "hollow tree"])) {
    add("hollow-tree-shell", "空心古树承载结构", ["hollow-tree", "bark-wall"], "critical");
    add("tree-spiral-street", "螺旋树干街道", ["spiral-tree-street", "vertical-route"], "critical");
    add("tree-root-archive", "根系档案库", ["root-archive", "underground"], "major");
    add("tree-canopy-platform", "树冠观测台", ["canopy-observatory", "high-ground"], "critical");
    return output;
  }
  const isSmugglerMangrove = has(text, ["走私港", "走私港村", "走私", "smuggler port", "smuggling port"]);
  if (has(text, ["红树林", "mangrove"]) && isSmugglerMangrove) {
    add("mangrove-core", "红树林潮汐地貌", ["mangrove", "tidal-channel"], "critical");
    add("mangrove-boardwalk", "树根栈道", ["root-boardwalk", "standable"], "critical");
    add("smuggler-dock", "沉船码头", ["smuggler-dock", "wreck-field"], "major");
    add("underwater-entry", "水下秘密入口", ["underwater-entry", "portal"], "critical");
    add("patrol-tower", "巡逻塔", ["patrol-tower", "high-ground"], "major");
    return output;
  }
  if (has(text, ["盐晶", "浮空修道院", "修道院群", "salt crystal", "floating monastery"])) {
    const explicitlyFloating = has(text, ["浮空", "浮岛", "悬空", "floating", "levitating"]);
    if (explicitlyFloating) add("salt-islands", "三层盐晶浮岛", ["salt-crystal", "floating-island"], "critical");
    else add("salt-cavern", "盐晶洞穴承载体", ["salt-crystal", "cavern-wall"], "critical");
    add("monastery-buildings", "修道院建筑群", ["shrine", "building"], "critical");
    if (explicitlyFloating) add("salt-bridges", "悬索桥", ["suspension-bridge", "vertical-route"], "critical");
    else add("salt-cavern-route", "洞穴垂直交通", ["vertical-opening"], "critical");
    add("salt-cavern-pool", "洞底潮池", ["cavern-tide-pool", "watercourse"], "major");
    add("bell-tower", "钟塔", ["tower", "high-ground"], "major");
    return output;
  }
  const cavernMonastery = domain === "cave"
    && has(text, ["修道院", "寺院", "monastery", "abbey", "cloister"])
    && has(text, ["潮汐", "涨潮", "退潮", "潮池", "海蚀", "tidal", "high tide", "low tide", "sea-eroded"]);
  if (cavernMonastery) {
    add("cavern-parent", "潮汐洞穴群", ["cavern", "cave-passage"], "critical");
    add("cavern-chapel", "海蚀礼拜堂", ["sea-eroded-chapel", "shrine"], "critical");
    add("monastic-quarters", "僧侣居室", ["monastic-quarters", "residential"], "critical");
    add("cavern-bell-tower", "钟塔", ["bell-tower", "high-ground"], "critical");
    add("scripture-cave", "藏经洞", ["archive", "underground"], "critical");
    add("tidal-court", "潮池庭院", ["cavern-tide-pool", "tidal-pool"], "critical");
    add("low-tide-route", "退潮石路", ["low-tide-stone", "route"], "critical");
    add("cliff-escape", "悬崖逃生梯", ["cliff-escape-ladder", "vertical-route"], "critical");
    return output;
  }
  const mountainMonastery = shouldComposeWildernessFacility(text)
    && has(text, ["修道院", "寺院", "monastery", "abbey", "cloister"])
    && has(text, ["山顶", "山脊", "风化岩脊", "峰顶", "mountain top", "ridge", "summit", "weathered rock ridge"]);
  if (mountainMonastery) {
    add("mountain-ridge-parent", "风化岩脊承载地貌", ["mountain", "ridge", "vertical-face"], "critical");
    add("monastery-compound", "修道院复合建筑", ["building", "shrine", "settlement-building"], "critical");
    if (has(text, ["无线电", "radio"])) add("radio-room", "无线电室", ["radio-console", "communications"], "critical");
    if (has(text, ["气象", "weather", "meteorological"])) add("weather-deck", "气象观测设施", ["weather-instruments", "observation"], "major");
    if (has(text, ["地下防空洞", "防空洞", "bunker", "air-raid shelter"])) add("air-raid-shelter", "地下防空洞", ["bunker", "underground"], "critical");
    if (has(text, ["天线", "antenna", "aerial"])) add("antenna-tower", "屋顶天线", ["antenna", "vertical-landmark"], "critical");
    if (has(text, ["维护栈道", "外部栈道", "维修栈道", "maintenance walkway", "maintenance catwalk"])) add("maintenance-walk", "外部维护栈道", ["external-maintenance-walk", "supported", "standable"], "critical");
    return output;
  }
  if (domain === "forest") {
    add("forest-core", "森林", ["forest", "tree", "canopy"], "critical");
    if (has(text, ["茂密", "封闭林冠", "dense", "closed canopy"])) add("dense-canopy", "封闭林冠", ["canopy", "tree-cluster"], "critical");
    if (has(text, ["灌木", "林下", "undergrowth"])) add("undergrowth", "林下灌木", ["undergrowth"], "major");
    if (has(text, ["空地", "clearing"])) add("clearings", "林间空地", ["clearing"], "major");
    if (has(text, ["浅溪", "溪流", "小溪", "溪边", "溪畔", "林溪", "stream", "creek", "streamside", "creekside"])) {
      add("forest-stream", "林间浅溪", ["stream", "watercourse"], "critical");
    }
    if (has(text, ["木桥", "溪边木桥", "footbridge", "foot bridge"])) {
      add("forest-footbridge", "跨溪木桥", ["wood-bridge", "bridge", "stream-crossing"], "critical");
    }
    if (has(text, ["根桥", "树根桥", "root bridge", "root-bridge"])) add("forest-root-bridge", "根桥", ["root-bridge", "bridge"], "critical");
    if (has(text, ["古老石环", "石环", "巨石环", "stone ring", "standing-stone ring"])) add("forest-stone-ring", "古老石环", ["standing-stone-ring", "ancient-stone"], "critical");
    if (has(text, ["倒木", "fallen log"])) add("fallen-log", "倒木", ["fallen-log"], "major");
    if (has(text, ["树冠战斗平台", "树冠平台", "树冠观察台", "树冠信号台", "树冠哨台", "树冠瞭望台", "canopy platform", "canopy observatory", "canopy signal platform", "canopy lookout"])) add("canopy-platform", "树冠战斗平台", ["canopy-platform", "high-ground"], "critical");
  }
  if (domain === "ice") {
    add("ice-eroded-base", "破碎不规则冰盖边缘", ["ice-base-plate", "eroded-ice-edge"], "critical");
    if (has(text, ["雪脊", "snow ridge", "wind ridge"])) add("ice-asymmetric-ridge", "迎风坡与背风坡雪脊", ["snow-ridge", "snow-ridge-leeward"], "critical");
    if (has(text, ["融水池", "冻融池", "thaw pool", "meltwater pool"])) add("ice-thaw-pools", "融水池", ["thaw-pool", "hazard"], "major");
    if (has(text, ["裂缝", "裂隙", "冰隙", "crevasse", "fissure"])) add("ice-secondary-fracture", "次级裂缝", ["secondary-crevasse", "vertical-face"], "major");
  }
  if (domain === "floating") {
    add("floating-island-core", "有厚度浮空岛", ["floating-island", "vertical-face"], "critical");
    add("floating-island-levels", "多档浮空高度", ["island:lower", "island:middle", "island:upper"], "critical");
    add("floating-island-access", "岛间垂直交通", ["vertical-route", "floating-island"], "critical");
  }
  if (domain === "cave") {
    add("cave-chambers", "相连洞穴腔体", ["cavern", "natural"], "critical");
    add("cave-passages", "洞穴通道", ["cave-passage"], "critical");
    add("cave-ledges", "洞穴高低岩架", ["ledge", "high-ground"], "major");
  }
  if (domain === "swamp") {
    const coldWetland = has(text, ["冻土", "冰原", "冰川", "tundra", "glacier", "ice field"]);
    add("swamp-core", coldWetland ? "冻土湿地" : "沼泽湿地", coldWetland ? ["wetland", "water"] : ["swamp", "water"], "critical");
    add("swamp-boardwalk", "架高木桥与栈道", ["boardwalk", "bridge"], "critical");
    if (has(text, ["红树林", "mangrove"])) add("mangrove-wetland", "红树林根网与潮汐水道", ["mangrove", "tidal-channel"], "critical");
    if (shouldComposeWildernessFacility(text)) add("wetland-station", "湿地独立站点", ["building", "foundation"], "critical");
    if (has(text, ["瞭望塔", "观察塔", "lookout tower", "watchtower"])) add("wetland-lookout", "瞭望塔", ["lookout-tower", "high-ground"], "critical");
    if (has(text, ["巡逻塔", "patrol tower"])) add("wetland-patrol", "巡逻塔", ["lookout-tower", "high-ground"], "critical");
    if (has(text, ["隔离棚", "隔离区", "quarantine shed", "isolation shed"])) add("quarantine-shed", "独立隔离棚", ["quarantine-shed", "restricted"], "critical");
    if (has(text, ["潮汐码头", "潮汐栈桥", "tidal dock", "tidal pier"])) add("tidal-dock", "潮汐码头", ["tidal-dock", "water-access"], "critical");
    if (has(text, ["秘密药品库", "药品库", "medical cache", "medicine vault"])) add("medical-vault", "秘密药品库", ["medical-vault", "underground"], "critical");
    if (facilityCapabilities.communications) add("communications-tower", "通信/天线设施", ["communications-tower", "high-ground"], "critical");
    if (facilityCapabilities.generator) add("generator-shed", "备用发电设施", ["generator-shed", "service"], "major");
    if (has(text, ["冰水裂沟", "冰裂沟", "ice-water fissure", "ice fissure"])) add("ice-water-fissure", "冰水裂沟", ["ice-fissure", "water", "hazard"], "critical");
    if (facilityCapabilities.undergroundStore) add("underground-reserve", "地下储备/样本库", ["reserve-vault", "underground"], "critical");
    if (has(text, ["陷阱沟", "壕沟", "trench", "ditch"])) add("wetland-trench", "陷阱沟", ["trench", "hazard"], "major");
    if (has(text, ["倒木防线", "倒木", "fallen-log defense", "log barricade"])) add("wetland-log-defense", "倒木防线", ["fallen-log-defense", "cover"], "major");
  }
  if (domain === "salt-waste") {
    add("salt-crust-field", "盐壳高地与破碎盐面", ["salt-wasteland", "salt-crust", "salt-ridge"], "critical");
    add("brine-basin", "卤水盆地", ["brine-basin", "brine-pool", "hazard"], "critical");
    add("salt-fracture-route", "盐裂缝与交替路线", ["salt-fracture", "route"], "major");
  }
  if (domain === "river") {
    const waterCity = hasExplicitWaterCity(text);
    if (waterCity) {
      add("water-city-main", "弯曲主河道", ["water-city", "main-canal", "watercourse"], "critical");
      add("water-city-branches", "支流网络", ["water-city", "branch-canal", "watercourse"], "critical");
      if (has(text, ["石桥", "stone bridge"])) add("water-city-stone-bridge", "石桥", ["water-city", "stone-bridge", "bridge"], "critical");
      if (has(text, ["木桥", "wood bridge"])) add("water-city-wood-bridge", "木桥", ["water-city", "wood-bridge", "bridge"], "critical");
      if (has(text, ["水上市集", "水上市场", "water market"])) add("water-city-market", "水上市集", ["water-city", "market-dock", "quay"], "critical");
      if (has(text, ["船坞", "码头", "dock", "quay"])) add("water-city-dock", "船坞与码头", ["water-city", "dock", "quay"], "critical");
      if (has(text, ["沿岸街巷", "沿岸不规则街巷", "岸线街巷", "waterfront lanes", "waterfront streets"])) add("water-city-bank-lanes", "沿岸不规则街巷", ["water-city", "bank-route"], "major");
    } else {
      add("river-core", "主河道", ["river", "watercourse"], "critical");
      if (has(text, ["支流", "tributary"])) add("tributary", "支流", ["tributary"], "critical");
      if (has(text, ["瀑布", "落差", "waterfall", "drop"])) add("waterfall", "瀑布落差", ["waterfall", "vertical-water"], "critical");
      if (has(text, ["深潭", "deep pool"])) add("deep-pool", "深潭", ["deep-pool"], "major");
    }
  }
  if (domain === "volcanic") { add("volcano-core", "火山口", ["caldera", "lava"], "critical"); if (has(text, ["支流", "branch"])) add("lava-branches", "熔岩支流", ["lava-branch"], "critical"); if (has(text, ["黑曜石", "obsidian"])) add("obsidian", "黑曜石脊", ["obsidian-ridge"], "major"); if (has(text, ["玄武岩", "basalt"])) add("basalt", "玄武岩战术台地", ["basalt-platform", "high-ground"], "major"); }
  if (domain === "crater") { add("crater-core", "陨石坑", ["impact-crater", "crater-rim"], "critical"); if (has(text, ["裂缝", "fracture"])) add("crater-fracture", "放射裂缝", ["radial-fracture"], "major"); }
  if (domain === "rift") { add("rift-core", "裂谷双岸", ["rift", "crevasse", "rift-bank"], "critical"); if (has(text, ["裂谷底", "底部", "rift floor", "bottom"])) add("rift-bottom", "深层裂谷底", ["rift-bottom"], "critical"); if (has(text, ["桥", "bridge"])) add("rift-crossing", "跨谷桥", ["bridge", "rift-crossing"], "critical"); if (has(text, ["下降", "梯", "descent", "ladder"])) add("rift-descent", "贴崖下降交通", ["cliff-descent", "vertical-route"], "major"); }
  if (has(text, ["海岸悬崖", "海崖", "黑沙海岸", "coastal cliff", "black sand coast"])) add("coastal-cliff", "海岸悬崖", ["coastal-cliff"], "critical");
  if (has(text, ["鲸骨", "whalebone"])) add("whalebone-landmark", "鲸骨地标", ["whalebone"], "critical");
  if (has(text, ["风暴缆车", "风暴索道", "悬崖缆车", "storm cableway", "cliff cableway"])) add("storm-cableway", "风暴缆车", ["storm-cableway", "support"], "critical");
  if (has(text, ["海蚀洞", "sea cave", "sea-eroded cave"])) add("sea-cave", "地下海蚀洞", ["sea-cave", "underground"], "critical");
  if (has(text, ["吊脚木屋", "吊脚屋", "stilt house", "stilt cabin"])) add("stilt-houses", "吊脚木屋", ["stilt-foundation", "home"], "major");
  if (has(text, ["潮池", "潮汐池", "tide pool", "tidal pool"])) add("tide-pools", "海岸潮池", ["tide-pool", "water"], "major");
  if (has(text, ["旧矿井口", "废弃矿井", "矿车轨道", "矿井入口", "abandoned mine", "old mine", "mine entrance", "mine-cart track", "mine cart track"])) {
    add("mine-remnant", "旧矿井口与矿车轨道", ["mine-entrance", "mine-cart-track"], "critical");
  }
  if (has(text, ["地下水井", "矿井水井", "地下取水井", "underground well", "subterranean well"])) {
    add("underground-well", "地下水井", ["underground-well", "vertical-route"], "critical");
  }
  if (has(text, ["菌类温室", "菌菇温室", "蘑菇温室", "fungal greenhouse", "mushroom greenhouse"])) {
    add("fungal-greenhouse", "菌类温室", ["greenhouse", "fungal"], "critical");
  }
  if (!settlementParent && shouldComposeWildernessFacility(text)) add("embedded-building", "场地建筑", ["building", "interior", "foundation"], "critical");
  return output;
}

export function compileSceneComposition(request: GenerationRequest, source: SceneCompositionProgram["source"] = "local", retrievedCapabilityIds: string[] = []): SceneCompositionProgram {
  const lexicalDomain = domainFor(request.prompt);
  const text = normalized(request.prompt);
  const compatibleRetrievedCapabilityIds = filterRetrievedCapabilities(request.prompt, retrievedCapabilityIds);
  const settlementParent = hasSettlementParent(text);
  const subordinateCaveFeature = settlementParent
    && has(text, ["地下海蚀洞", "地下洞穴", "秘密洞穴", "洞穴入口", "underground sea cave", "underground cave", "secret cave", "cave entrance"]);
  const retrievedDomain = resolveCapabilityDomain(compatibleRetrievedCapabilityIds);
  // A named natural parent with an embedded facility already has deterministic
  // macro ownership in the scene planner. Retrieval may enrich the child, but
  // must not replace a mountain ridge with an unrelated river grammar merely
  // because a water capability ranked nearby in embedding space. The same
  // ownership rule applies to named settlements: retrieval may contribute a
  // fungal greenhouse, mine, bridge, or water atom, but it cannot turn the
  // whole village into a forest merely because one child capability is close
  // in embedding space.
  const domain = subordinateCaveFeature
    ? "settlement"
    : lexicalDomain === "generic"
    ? settlementParent
      ? "settlement"
      : shouldComposeWildernessFacility(request.prompt)
        ? lexicalDomain
        : retrievedDomain.domain ?? lexicalDomain
    : lexicalDomain;
  const isWaterCity = domain === "river" && hasExplicitWaterCity(text);
  const grammarId = isWaterCity ? "grammar.water-city-v1" : COMPOSITION_GRAMMARS.find((entry) => entry.domain === domain)?.id ?? "grammar.generic-v1";
  const motifIds: string[] = [];
  const domainMotif = {
    forest: "motif.closed-canopy-clearings",
    swamp: "motif.wetland-boardwalk-station",
    river: "motif.waterfall-valley",
    volcanic: "motif.broken-caldera",
    crater: "motif.impact-basin",
    rift: "motif.rift-two-banks",
    ice: "motif.eroded-ice-ridges",
    floating: "motif.three-tier-floating-stack",
    cave: "motif.connected-cavern-graph",
    "salt-waste": "motif.salt-crust-basin",
  }[domain];
  if (domainMotif) motifIds.push(domainMotif);
  if (isWaterCity) motifIds.push("motif.water-city-quays");
  if (!hasSettlementParent(text) && shouldComposeWildernessFacility(text)) motifIds.push("motif.embedded-building");
  if (has(text, ["空心古树", "古树内部", "树内城市", "hollow tree"])) motifIds.push("motif.hollow-tree-city");
  if (has(text, ["红树林", "mangrove"]) && has(text, ["走私港", "走私港村", "走私", "smuggler port", "smuggling port"])) motifIds.push("motif.mangrove-smuggler-port");
  if (has(text, ["盐晶", "浮空修道院", "修道院群", "salt crystal", "floating monastery"])) {
    const explicitlyFloating = has(text, ["浮空", "浮岛", "悬空", "floating", "levitating"]);
    motifIds.push(explicitlyFloating ? "motif.salt-crystal-monastery" : "motif.salt-crystal-cavern-monastery");
  }
  const selectedMotifIds = [...new Set(motifIds)];
  const moduleIds = new Set(selectedMotifIds.flatMap((id) => DESIGNER_MOTIFS.find((entry) => entry.id === id)?.moduleIds ?? []));
  const capabilityIds = [...new Set([...FUNCTIONAL_MODULES.filter((entry) => moduleIds.has(entry.id)).flatMap((entry) => entry.capabilityIds), ...compatibleRetrievedCapabilityIds])].filter((id) => CAPABILITY_CARDS.some((entry) => entry.id === id));
  const root = request.seed;
  return { version: 1, source, primaryDomain: domain, grammarId, motifIds: selectedMotifIds, capabilityIds, seeds: { root, macro: `${root}/macro`, meso: `${root}/meso`, tactical: `${root}/tactical`, building: `${root}/building`, ecology: `${root}/ecology`, micro: `${root}/micro`, style: `${root}/style` }, density: densityProfile(domain, request.density), style: styleFor(request.prompt, domain), requirements: semanticRequirements(request.prompt, domain) };
}

export function auditSemanticCoverage(scene: GeneratedScene, program: SceneCompositionProgram): SemanticCoverageReport {
  const tags = new Set<string>();
  for (const primitive of scene.primitives) for (const tag of primitive.tags ?? []) tags.add(tag);
  for (const feature of scene.tactical) { tags.add(feature.kind); tags.add(feature.note.toLocaleLowerCase("en-US")); }
  for (const room of scene.rooms) { tags.add(room.id); tags.add(room.name.toLocaleLowerCase("en-US")); }
  const items = program.requirements.map((requirement) => {
    const realizedTags = requirement.requiredTags.filter((tag) => [...tags].some((candidate) => candidate.includes(tag)));
    const coverageRatio = requirement.requiredTags.length > 0 ? realizedTags.length / requirement.requiredTags.length : 1;
    const capabilityIds = CAPABILITY_CARDS.filter((card) => card.tags.some((tag) => requirement.requiredTags.some((required) => tag.includes(required) || required.includes(tag)))).map((card) => card.id);
    const threshold = requirement.importance === "critical" ? 1 : requirement.importance === "major" ? 0.5 : 0.34;
    return { ...requirement, realizedTags, capabilityIds, coverageRatio, lowConfidence: coverageRatio > 0 && coverageRatio < 1, covered: coverageRatio >= threshold };
  });
  const weight = (importance: SemanticRequirement["importance"]) => importance === "critical" ? 4 : importance === "major" ? 2 : 1;
  const possible = items.reduce((sum, item) => sum + weight(item.importance), 0) || 1;
  const achieved = items.reduce((sum, item) => sum + weight(item.importance) * item.coverageRatio, 0);
  return { score: Math.round((achieved / possible) * 100), coveredCritical: items.filter((item) => item.importance === "critical" && item.covered).length, totalCritical: items.filter((item) => item.importance === "critical").length, items, missing: items.filter((item) => !item.covered).map((item) => item.sourcePhrase), lowConfidence: items.filter((item) => item.lowConfidence).map((item) => item.sourcePhrase), degraded: [] };
}

export function summarizeComposition(program: SceneCompositionProgram, semanticCoverage?: SemanticCoverageReport): SceneCompositionProgramSummary { return { version: 1, source: program.source, primaryDomain: program.primaryDomain, grammarId: program.grammarId, motifIds: program.motifIds, capabilityIds: program.capabilityIds, density: program.density, style: program.style, ...(semanticCoverage ? { semanticCoverage } : {}) }; }
