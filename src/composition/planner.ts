import type { GeneratedScene, GenerationRequest } from "../schema";
import { CAPABILITY_CARDS, COMPOSITION_GRAMMARS, DESIGNER_MOTIFS, FUNCTIONAL_MODULES } from "./catalog";
import type { DomainDensityProfile, SceneCompositionProgram, SceneCompositionProgramSummary, SemanticCoverageReport, SemanticRequirement, StyleProgram } from "./schema";

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US");
const has = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));

function domainFor(prompt: string): SceneCompositionProgram["primaryDomain"] {
  const text = normalized(prompt);
  if (has(text, ["陨石坑", "撞击坑", "流星坑", "impact crater", "meteor crater"])) return "crater";
  if (has(text, ["裂谷", "裂缝", "裂隙", "深渊", "rift", "crevasse", "chasm", "ravine"])) return "rift";
  if (has(text, ["火山", "熔岩", "岩浆", "volcano", "volcanic", "caldera", "lava"])) return "volcanic";
  if (has(text, ["水城", "河道水城", "运河城", "水上市集", "船坞", "沿岸街巷", "canal city", "water city", "water market", "dock", "quay"])) return "river";
  if (has(text, ["河谷", "河流", "溪流", "瀑布", "river", "stream", "waterfall", "valley"])) return "river";
  if (has(text, ["森林", "林地", "树林", "巨树", "树冠", "forest", "woodland", "canopy"])) return "forest";
  if (has(text, ["沼泽", "湿地", "泥沼", "marsh", "swamp", "bog", "wetland"])) return "swamp";
  return "generic";
}

function densityProfile(domain: string, value: number): DomainDensityProfile {
  const density = Math.max(0, Math.min(1, value));
  if (domain === "forest") return { domain, normalized: density, structuralComplexity: 0.35 + density * 0.55, routeComplexity: 0.25 + density * 0.35, hazardFrequency: 0.15 + density * 0.35, ecologicalCoverage: 0.22 + density * 0.73, landmarkFrequency: 0.15 + density * 0.45, detailFrequency: 0.2 + density * 0.75 };
  if (domain === "swamp") return { domain, normalized: density, structuralComplexity: 0.32 + density * 0.5, routeComplexity: 0.34 + density * 0.46, hazardFrequency: 0.35 + density * 0.58, ecologicalCoverage: 0.28 + density * 0.62, landmarkFrequency: 0.16 + density * 0.42, detailFrequency: 0.25 + density * 0.7 };
  if (domain === "river") return { domain, normalized: density, structuralComplexity: 0.35 + density * 0.5, routeComplexity: 0.3 + density * 0.45, hazardFrequency: 0.2 + density * 0.55, ecologicalCoverage: 0.2 + density * 0.55, landmarkFrequency: 0.2 + density * 0.45, detailFrequency: 0.15 + density * 0.7 };
  if (domain === "volcanic" || domain === "crater" || domain === "rift") return { domain, normalized: density, structuralComplexity: 0.4 + density * 0.55, routeComplexity: 0.25 + density * 0.45, hazardFrequency: 0.3 + density * 0.65, ecologicalCoverage: 0.02, landmarkFrequency: 0.25 + density * 0.55, detailFrequency: 0.2 + density * 0.75 };
  return { domain: "generic", normalized: density, structuralComplexity: 0.25 + density * 0.45, routeComplexity: 0.25 + density * 0.35, hazardFrequency: 0.15 + density * 0.35, ecologicalCoverage: 0.15 + density * 0.45, landmarkFrequency: 0.15 + density * 0.35, detailFrequency: 0.2 + density * 0.65 };
}

function styleFor(prompt: string, domain: string): StyleProgram {
  const text = normalized(prompt);
  const era = has(text, ["1920", "现代", "modern", "工业", "industrial"]) ? "historic" : has(text, ["d&d", "法师", "魔法", "中世纪", "medieval", "fantasy"]) ? "fantasy-medieval" : "timeless";
  const materialFamily = has(text, ["盐晶", "salt crystal"]) ? ["salt-crystal", "ice", "rock", "water"]
    : has(text, ["红树林", "mangrove"]) ? ["mangrove", "wood", "mud", "water"]
      : has(text, ["空心古树", "古树内部", "hollow tree"]) ? ["bark", "wood", "root", "moss"]
        : domain === "volcanic" ? ["basalt", "obsidian", "lava"] : domain === "swamp" ? ["mud", "water", "reed", "wood", "moss"] : domain === "forest" ? ["wood", "moss", "earth", "stone"] : domain === "river" ? ["water", "rock", "earth", "moss"] : ["rock", "earth"];
  const climate = has(text, ["盐晶", "salt crystal"]) ? "cold-dry-cavern"
    : has(text, ["红树林", "mangrove"]) ? "tropical-wet"
      : has(text, ["冰", "glacier", "snow"]) ? "cold"
        : domain === "volcanic" ? "hot-dry" : domain === "swamp" ? "humid-wetland" : domain === "river" || domain === "forest" ? "temperate-wet" : "neutral";
  const silhouetteTags = has(text, ["盐晶", "salt crystal"]) ? ["three-floating-levels", "crystal-spires", "cavern-void"]
    : has(text, ["红树林", "mangrove"]) ? ["root-canopy", "tidal-channel", "boardwalks"]
      : has(text, ["空心古树", "古树内部", "hollow tree"]) ? ["bark-shell", "spiral-cavity", "canopy-platform"]
        : domain === "swamp" ? ["broken-dry-islands", "water-pools", "raised-boardwalks"] : domain === "forest" ? ["layered-canopy", "irregular-clearings"] : domain === "river" ? ["incised-valley", "descending-water"] : domain === "volcanic" ? ["broken-rim", "radial-fractures"] : ["broken-rim"];
  return { era, climate, materialFamily, paletteTags: materialFamily, silhouetteTags, forbiddenTags: domain === "volcanic" ? ["living-tree", "lush-grass"] : [] };
}

function semanticRequirements(prompt: string, domain: string): SemanticRequirement[] {
  const text = normalized(prompt);
  const output: SemanticRequirement[] = [];
  const add = (id: string, phrase: string, tags: string[], importance: SemanticRequirement["importance"] = "major") => output.push({ id, sourcePhrase: phrase, requiredTags: tags, importance });
  if (has(text, ["空心古树", "古树内部", "树内城市", "hollow tree"])) {
    add("hollow-tree-shell", "空心古树承载结构", ["hollow-tree", "bark-wall"], "critical");
    add("tree-spiral-street", "螺旋树干街道", ["spiral-tree-street", "vertical-route"], "critical");
    add("tree-root-archive", "根系档案库", ["root-archive", "underground"], "major");
    add("tree-canopy-platform", "树冠观测台", ["canopy-observatory", "high-ground"], "critical");
    return output;
  }
  if (has(text, ["红树林", "走私港", "港村", "mangrove", "smuggler port"])) {
    add("mangrove-core", "红树林潮汐地貌", ["mangrove", "tidal-channel"], "critical");
    add("mangrove-boardwalk", "树根栈道", ["root-boardwalk", "standable"], "critical");
    add("smuggler-dock", "沉船码头", ["smuggler-dock", "wreck-field"], "major");
    add("underwater-entry", "水下秘密入口", ["underwater-entry", "portal"], "critical");
    add("patrol-tower", "巡逻塔", ["patrol-tower", "high-ground"], "major");
    return output;
  }
  if (has(text, ["盐晶", "浮空修道院", "修道院群", "salt crystal", "floating monastery"])) {
    add("salt-islands", "三层盐晶浮岛", ["salt-crystal", "floating-island"], "critical");
    add("monastery-buildings", "修道院建筑群", ["shrine", "building"], "critical");
    add("salt-bridges", "悬索桥", ["suspension-bridge", "vertical-route"], "critical");
    add("salt-cavern-pool", "洞底潮池", ["cavern-tide-pool", "watercourse"], "major");
    add("bell-tower", "钟塔", ["tower", "high-ground"], "major");
    return output;
  }
  if (domain === "forest") { add("forest-core", "森林", ["forest", "tree", "canopy"], "critical"); if (has(text, ["茂密", "封闭林冠", "dense", "closed canopy"])) add("dense-canopy", "封闭林冠", ["canopy", "tree-cluster"], "critical"); if (has(text, ["灌木", "林下", "undergrowth"])) add("undergrowth", "林下灌木", ["undergrowth"], "major"); if (has(text, ["空地", "clearing"])) add("clearings", "林间空地", ["clearing"], "major"); if (has(text, ["浅溪", "溪流", "stream"])) add("forest-stream", "浅溪", ["stream", "watercourse"], "major"); if (has(text, ["倒木", "fallen log"])) add("fallen-log", "倒木", ["fallen-log"], "major"); if (has(text, ["树冠战斗平台", "树冠平台", "canopy platform"])) add("canopy-platform", "树冠战斗平台", ["canopy-platform", "high-ground"], "critical"); }
  if (domain === "swamp") {
    add("swamp-core", "沼泽湿地", ["swamp", "water"], "critical");
    add("swamp-boardwalk", "架高木桥与栈道", ["boardwalk", "bridge"], "critical");
    if (has(text, ["林务站", "林务所", "巡护站", "护林站", "ranger station", "forestry station"])) add("wetland-station", "湿地林务站", ["building", "foundation"], "critical");
    if (has(text, ["瞭望塔", "观察塔", "lookout tower", "watchtower"])) add("wetland-lookout", "瞭望塔", ["lookout-tower", "high-ground"], "critical");
    if (has(text, ["陷阱沟", "壕沟", "trench", "ditch"])) add("wetland-trench", "陷阱沟", ["trench", "hazard"], "major");
    if (has(text, ["倒木防线", "倒木", "fallen-log defense", "log barricade"])) add("wetland-log-defense", "倒木防线", ["fallen-log-defense", "cover"], "major");
  }
  if (domain === "river") {
    const waterCity = has(text, ["水城", "河道水城", "运河城", "水上市集", "船坞", "沿岸街巷", "canal city", "water city", "water market", "dock", "quay"]);
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
  if (has(text, ["木屋", "小屋", "林务站", "林务所", "巡护站", "护林站", "cabin", "lodge", "ranger station", "forestry station"])) add("embedded-building", "场地建筑", ["building", "interior", "foundation"], "critical");
  return output;
}

export function compileSceneComposition(request: GenerationRequest, source: SceneCompositionProgram["source"] = "local", retrievedCapabilityIds: string[] = []): SceneCompositionProgram {
  const domain = domainFor(request.prompt);
  const text = normalized(request.prompt);
  const isWaterCity = domain === "river" && has(text, ["水城", "河道水城", "运河城", "水上市集", "船坞", "沿岸街巷", "canal city", "water city", "water market", "dock", "quay"]);
  const grammarId = isWaterCity ? "grammar.water-city-v1" : COMPOSITION_GRAMMARS.find((entry) => entry.domain === domain)?.id ?? "grammar.generic-v1";
  const motifIds: string[] = [];
  const domainMotif = {
    forest: "motif.closed-canopy-clearings",
    swamp: "motif.wetland-boardwalk-station",
    river: "motif.waterfall-valley",
    volcanic: "motif.broken-caldera",
    crater: "motif.impact-basin",
    rift: "motif.rift-two-banks",
  }[domain];
  if (domainMotif) motifIds.push(domainMotif);
  if (isWaterCity) motifIds.push("motif.water-city-quays");
  if (has(text, ["木屋", "小屋", "林务站", "林务所", "巡护站", "护林站", "cabin", "lodge", "ranger station", "forestry station"])) motifIds.push("motif.embedded-building");
  if (has(text, ["空心古树", "古树内部", "树内城市", "hollow tree"])) motifIds.push("motif.hollow-tree-city");
  if (has(text, ["红树林", "走私港", "港村", "mangrove", "smuggler port"])) motifIds.push("motif.mangrove-smuggler-port");
  if (has(text, ["盐晶", "浮空修道院", "修道院群", "salt crystal", "floating monastery"])) motifIds.push("motif.salt-crystal-monastery");
  const selectedMotifIds = [...new Set(motifIds)];
  const moduleIds = new Set(selectedMotifIds.flatMap((id) => DESIGNER_MOTIFS.find((entry) => entry.id === id)?.moduleIds ?? []));
  const capabilityIds = [...new Set([...FUNCTIONAL_MODULES.filter((entry) => moduleIds.has(entry.id)).flatMap((entry) => entry.capabilityIds), ...retrievedCapabilityIds])].filter((id) => CAPABILITY_CARDS.some((entry) => entry.id === id));
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
