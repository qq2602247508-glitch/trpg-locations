import type { SceneKind } from "../schema";
import { hashSeed } from "../core/random";

type KnownSceneKind = Exclude<SceneKind, "adaptive">;

export type ClassificationSource = "keyword" | "adaptive" | "ollama";
export type AdaptiveEnvironment = "interior" | "urban" | "underground" | "wilderness" | "coastal" | "ruin";
export type AdaptiveTopology = "linear" | "branching" | "open" | "vertical" | "loop";
export type AdaptiveVerticality = "low" | "medium" | "high";
export type AdaptiveWater = "none" | "minor" | "major";
export type AdaptiveLighting = "bright" | "dim" | "dark";
export type AdaptiveCover = "sparse" | "moderate" | "dense";
export type AdaptiveTheme = "cozy" | "grim" | "mystic" | "industrial" | "wild" | "neutral";

export interface AdaptiveFeatures {
  /** Broad physical setting for composition and material choices. */
  environment: AdaptiveEnvironment;
  /** Layout bias, not a prebuilt map template. */
  topology: AdaptiveTopology;
  verticality: AdaptiveVerticality;
  water: AdaptiveWater;
  lighting: AdaptiveLighting;
  cover: AdaptiveCover;
  theme: AdaptiveTheme;
  /** Recognised landmarks, in deterministic first-occurrence order. */
  anchors: string[];
  /** Recognised encounter risks, in deterministic first-occurrence order. */
  hazards: string[];
  /** Compact, composable semantic hints for an adaptive generator. */
  tags: string[];
  /** Local keyword evidence used by the feature decomposition. */
  evidence: string[];
}

export interface InputClassification {
  kind: SceneKind;
  source: ClassificationSource;
  /** 0..1 confidence in the selected fixed category; adaptive is intentionally conservative. */
  confidence: number;
  normalizedPrompt: string;
  matchedKeywords: string[];
  categoryScores: Record<KnownSceneKind, number>;
  traits: AdaptiveFeatures;
  semanticModel?: string;
}

interface KeywordRule {
  term: string;
  weight: number;
}

interface SignalRule<T extends string> {
  value: T;
  terms: readonly string[];
}

const KNOWN_KINDS = ["tavern", "tower", "sewer", "cave", "dungeon", "building", "settlement", "wilderness"] as const satisfies readonly KnownSceneKind[];

const CATEGORY_RULES: Readonly<Record<KnownSceneKind, readonly KeywordRule[]>> = {
  tavern: [
    { term: "tavern", weight: 4 },
    { term: "inn", weight: 3 },
    { term: "alehouse", weight: 3 },
    { term: "pub", weight: 3 },
    { term: "酒馆", weight: 4 },
    { term: "旅店", weight: 3 },
    { term: "客栈", weight: 4 },
    { term: "酒吧", weight: 3 },
    { term: "茶馆", weight: 3 },
  ],
  tower: [
    { term: "tower", weight: 4 },
    { term: "watchtower", weight: 4 },
    { term: "lighthouse", weight: 4 },
    { term: "spire", weight: 3 },
    { term: "belfry", weight: 3 },
    { term: "高塔", weight: 4 },
    { term: "塔楼", weight: 4 },
    { term: "瞭望塔", weight: 4 },
    { term: "灯塔", weight: 4 },
    { term: "尖塔", weight: 3 },
    { term: "法师塔", weight: 6 },
    { term: "魔法塔", weight: 6 },
    { term: "巫师塔", weight: 6 },
    { term: "wizard tower", weight: 6 },
    { term: "mage tower", weight: 6 },
  ],
  sewer: [
    { term: "sewer", weight: 4 },
    { term: "drain", weight: 3 },
    { term: "drainage", weight: 3 },
    { term: "culvert", weight: 3 },
    { term: "下水道", weight: 4 },
    { term: "排水沟", weight: 4 },
    { term: "排污", weight: 3 },
    { term: "暗渠", weight: 4 },
    { term: "涵洞", weight: 3 },
  ],
  cave: [
    { term: "cave", weight: 4 },
    { term: "cavern", weight: 4 },
    { term: "grotto", weight: 4 },
    { term: "spelunk", weight: 3 },
    { term: "山洞", weight: 4 },
    { term: "洞穴", weight: 4 },
    { term: "溶洞", weight: 4 },
    { term: "矿洞", weight: 3 },
    { term: "地洞", weight: 3 },
  ],
  dungeon: [
    { term: "dungeon", weight: 5 }, { term: "labyrinth", weight: 4 }, { term: "crypt", weight: 4 },
    { term: "地牢", weight: 5 }, { term: "地下城", weight: 5 }, { term: "迷宫", weight: 4 }, { term: "墓穴", weight: 4 }, { term: "龙巢", weight: 4 },
  ],
  building: [
    { term: "church", weight: 4 },
    { term: "chapel", weight: 4 },
    { term: "temple", weight: 4 },
    { term: "shrine", weight: 4 },
    { term: "manor", weight: 4 },
    { term: "estate", weight: 3 },
    { term: "barracks", weight: 4 },
    { term: "garrison", weight: 3 },
    { term: "library", weight: 4 },
    { term: "archive", weight: 3 },
    { term: "workshop", weight: 4 },
    { term: "forge", weight: 3 },
    { term: "warehouse", weight: 4 },
    { term: "depot", weight: 3 },
    { term: "fortress", weight: 4 },
    { term: "bastion", weight: 3 },
    { term: "mine", weight: 4 },
    { term: "mineshaft", weight: 4 },
    { term: "教堂", weight: 4 },
    { term: "神殿", weight: 4 },
    { term: "寺庙", weight: 4 },
    { term: "庄园", weight: 4 },
    { term: "宅邸", weight: 3 },
    { term: "兵营", weight: 4 },
    { term: "军营", weight: 3 },
    { term: "图书馆", weight: 4 },
    { term: "档案馆", weight: 3 },
    { term: "工坊", weight: 4 },
    { term: "锻炉", weight: 3 },
    { term: "仓库", weight: 4 },
    { term: "货栈", weight: 3 },
    { term: "堡垒", weight: 4 },
    { term: "要塞", weight: 4 },
    { term: "矿井", weight: 4 },
    { term: "矿场", weight: 3 },
  ],
  settlement: [
    { term: "village", weight: 4 },
    { term: "town", weight: 4 },
    { term: "city", weight: 4 },
    { term: "district", weight: 3 },
    { term: "harbor", weight: 4 },
    { term: "port", weight: 3 },
    { term: "村庄", weight: 4 },
    { term: "城镇", weight: 4 },
    { term: "城市", weight: 4 },
    { term: "街区", weight: 3 },
    { term: "港区", weight: 4 },
    { term: "港口", weight: 3 },
    { term: "深水城", weight: 5 },
  ],
  wilderness: [
    { term: "river", weight: 4 },
    { term: "valley", weight: 4 },
    { term: "rift", weight: 4 },
    { term: "chasm", weight: 3 },
    { term: "mountain", weight: 4 },
    { term: "ice", weight: 4 },
    { term: "glacier", weight: 3 },
    { term: "ruin", weight: 3 },
    { term: "underground lake", weight: 5 },
    { term: "河谷", weight: 4 },
    { term: "裂谷", weight: 4 },
    { term: "山地", weight: 4 },
    { term: "冰原", weight: 4 },
    { term: "遗迹", weight: 3 },
    { term: "地下湖", weight: 5 },
    { term: "幽暗地域", weight: 4 },
    { term: "森林", weight: 4 },
    { term: "墓地", weight: 4 },
    { term: "墓园", weight: 4 },
    { term: "火山", weight: 5 },
    { term: "河床", weight: 4 },
    { term: "volcano", weight: 5 },
    { term: "cemetery", weight: 4 },
    { term: "graveyard", weight: 4 },
    { term: "riverbed", weight: 4 },
  ],
};

const ENVIRONMENT_RULES: readonly SignalRule<AdaptiveEnvironment>[] = [
  { value: "underground", terms: ["underground", "dungeon", "crypt", "catacomb", "tunnel", "mine", "地牢", "地下", "墓穴", "墓室", "隧道", "矿井"] },
  { value: "coastal", terms: ["coast", "shore", "beach", "harbor", "dock", "sea", "ocean", "riverbank", "海岸", "海边", "码头", "港口", "河岸"] },
  { value: "wilderness", terms: ["forest", "jungle", "swamp", "mountain", "valley", "desert", "meadow", "volcano", "cemetery", "graveyard", "riverbed", "wild", "森林", "丛林", "沼泽", "山谷", "沙漠", "火山", "墓地", "墓园", "河床", "荒野"] },
  { value: "urban", terms: ["city", "street", "market", "district", "plaza", "alley", "town", "城市", "街道", "市场", "广场", "巷", "城镇"] },
  { value: "ruin", terms: ["ruin", "ruined", "temple", "shrine", "fortress", "ancient", "遗迹", "废墟", "神殿", "祠堂", "古老", "残破"] },
  { value: "interior", terms: ["hall", "chamber", "room", "house", "manor", "castle", "indoors", "大厅", "房间", "宅邸", "城堡", "室内"] },
];

const TOPOLOGY_RULES: readonly SignalRule<AdaptiveTopology>[] = [
  { value: "vertical", terms: ["stair", "stairs", "ladder", "balcony", "roof", "cliff", "multi-level", "楼梯", "梯子", "阳台", "屋顶", "悬崖", "多层"] },
  { value: "loop", terms: ["loop", "ring", "circular", "circuit", "环形", "回路", "循环", "圆形"] },
  { value: "branching", terms: ["branch", "junction", "crossroad", "maze", "fork", "分支", "岔路", "路口", "迷宫"] },
  { value: "open", terms: ["open", "courtyard", "arena", "plaza", "vast", "宽阔", "庭院", "竞技场", "空旷", "广场"] },
  { value: "linear", terms: ["corridor", "passage", "bridge", "causeway", "hallway", "走廊", "通道", "桥", "栈道"] },
];

const VERTICALITY_RULES: readonly SignalRule<AdaptiveVerticality>[] = [
  { value: "high", terms: ["tower", "spire", "cliff", "high-rise", "multi-level", "高塔", "尖塔", "悬崖", "高层", "多层"] },
  { value: "medium", terms: ["stair", "stairs", "ladder", "balcony", "split-level", "楼梯", "梯子", "阳台", "夹层"] },
  { value: "low", terms: ["flat", "single-level", "low ceiling", "平坦", "单层", "低矮"] },
];

const WATER_RULES: readonly SignalRule<AdaptiveWater>[] = [
  { value: "major", terms: ["flood", "river", "canal", "sea", "ocean", "lake", "waterfall", "洪水", "河流", "运河", "海", "湖", "瀑布"] },
  { value: "minor", terms: ["water", "wet", "drip", "drain", "puddle", "stream", "积水", "潮湿", "滴水", "排水", "水坑", "溪流"] },
  { value: "none", terms: ["dry", "arid", "无水", "干燥"] },
];

const LIGHTING_RULES: readonly SignalRule<AdaptiveLighting>[] = [
  { value: "dark", terms: ["dark", "pitch black", "unlit", "shadow", "黑暗", "漆黑", "无光", "阴影"] },
  { value: "dim", terms: ["dim", "torch", "candle", "moonlit", "gloom", "昏暗", "火把", "蜡烛", "月光", "幽暗"] },
  { value: "bright", terms: ["bright", "sunlit", "daylight", "glowing", "明亮", "阳光", "日光", "发光"] },
];

const COVER_RULES: readonly SignalRule<AdaptiveCover>[] = [
  { value: "dense", terms: ["dense", "cluttered", "crates", "pillars", "rubble", "树林", "密集", "杂乱", "箱子", "柱子", "瓦砾"] },
  { value: "moderate", terms: ["cover", "tables", "furniture", "rocks", "树木", "掩体", "桌子", "家具", "岩石"] },
  { value: "sparse", terms: ["empty", "bare", "clear floor", "空荡", "裸露", "空地"] },
];

const THEME_RULES: readonly SignalRule<AdaptiveTheme>[] = [
  { value: "cozy", terms: ["cozy", "warm", "friendly", "festive", "温暖", "舒适", "热闹", "友好"] },
  { value: "grim", terms: ["grim", "bloody", "decay", "haunted", "阴森", "血腥", "腐朽", "闹鬼"] },
  { value: "mystic", terms: ["arcane", "magic", "ritual", "mystic", "秘法", "魔法", "仪式", "神秘"] },
  { value: "industrial", terms: ["industrial", "factory", "forge", "machine", "蒸汽", "工厂", "锻炉", "机械"] },
  { value: "wild", terms: ["wild", "overgrown", "beast", "natural", "野性", "蔓生", "野兽", "自然"] },
  { value: "neutral", terms: ["neutral", "ordinary", "普通", "寻常"] },
];

const ANCHOR_RULES: readonly SignalRule<string>[] = [
  { value: "altar", terms: ["altar", "祭坛"] },
  { value: "bridge", terms: ["bridge", "桥"] },
  { value: "dock", terms: ["dock", "码头"] },
  { value: "gate", terms: ["gate", "门楼", "大门"] },
  { value: "statue", terms: ["statue", "雕像"] },
  { value: "well", terms: ["well", "水井"] },
  { value: "stage", terms: ["stage", "舞台"] },
  { value: "throne", terms: ["throne", "王座"] },
  { value: "workshop", terms: ["workshop", "工坊"] },
];

const HAZARD_RULES: readonly SignalRule<string>[] = [
  { value: "fire", terms: ["fire", "flame", "burning", "火焰", "燃烧"] },
  { value: "lava", terms: ["lava", "熔岩"] },
  { value: "acid", terms: ["acid", "acidic", "酸液", "酸性", "腐蚀"] },
  { value: "collapse", terms: ["collapse", "crumbling", "坍塌", "摇摇欲坠"] },
  { value: "pit", terms: ["pit", "chasm", "深坑", "裂隙"] },
  { value: "spikes", terms: ["spike", "尖刺"] },
  { value: "poison", terms: ["poison", "toxic", "毒气", "剧毒"] },
  { value: "flood", terms: ["flood", "drowning", "洪水", "溺水"] },
];

const KIND_DEFAULTS: Readonly<Record<KnownSceneKind, Omit<AdaptiveFeatures, "anchors" | "hazards" | "tags" | "evidence">>> = {
  tavern: { environment: "interior", topology: "open", verticality: "low", water: "none", lighting: "bright", cover: "moderate", theme: "cozy" },
  tower: { environment: "interior", topology: "vertical", verticality: "high", water: "none", lighting: "dim", cover: "moderate", theme: "neutral" },
  sewer: { environment: "underground", topology: "branching", verticality: "low", water: "minor", lighting: "dim", cover: "moderate", theme: "grim" },
  cave: { environment: "underground", topology: "branching", verticality: "medium", water: "minor", lighting: "dark", cover: "dense", theme: "wild" },
  dungeon: { environment: "underground", topology: "branching", verticality: "high", water: "minor", lighting: "dim", cover: "moderate", theme: "grim" },
  building: { environment: "interior", topology: "linear", verticality: "medium", water: "none", lighting: "dim", cover: "moderate", theme: "neutral" },
  settlement: { environment: "urban", topology: "open", verticality: "low", water: "none", lighting: "bright", cover: "moderate", theme: "neutral" },
  wilderness: { environment: "wilderness", topology: "branching", verticality: "medium", water: "minor", lighting: "dim", cover: "dense", theme: "wild" },
};

function normalizePrompt(prompt: string): string {
  return prompt
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

function countTerm(input: string, term: string): number {
  if (term.length === 0 || input.length === 0) {
    return 0;
  }

  // Latin terms use word boundaries so "bar" does not match "barrow".
  if (/^[a-z0-9][a-z0-9 -]*$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "g");
    return [...input.matchAll(expression)].length;
  }

  let matches = 0;
  let start = 0;
  while (start < input.length) {
    const found = input.indexOf(term, start);
    if (found < 0) {
      break;
    }
    matches += 1;
    start = found + term.length;
  }
  return matches;
}

function scoreRules(input: string, rules: readonly KeywordRule[]): { score: number; matches: string[] } {
  let score = 0;
  const matches: string[] = [];
  for (const rule of rules) {
    const occurrences = countTerm(input, rule.term);
    if (occurrences > 0) {
      score += occurrences * rule.weight;
      matches.push(rule.term);
    }
  }
  return { score, matches };
}

function categoryScores(input: string): { scores: Record<KnownSceneKind, number>; matches: Record<KnownSceneKind, string[]> } {
  const scores = {} as Record<KnownSceneKind, number>;
  const matches = {} as Record<KnownSceneKind, string[]>;
  for (const kind of KNOWN_KINDS) {
    const result = scoreRules(input, CATEGORY_RULES[kind]);
    scores[kind] = result.score;
    matches[kind] = result.matches;
  }
  return { scores, matches };
}

function bestKind(scores: Record<KnownSceneKind, number>): KnownSceneKind | undefined {
  let best: KnownSceneKind | undefined;
  let bestScore = 0;
  for (const kind of KNOWN_KINDS) {
    const score = scores[kind];
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

function signalFor<T extends string>(
  input: string,
  rules: readonly SignalRule<T>[],
): { value: T | undefined; matches: string[] } {
  let bestValue: T | undefined;
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const rule of rules) {
    let score = 0;
    const matches: string[] = [];
    for (const term of rule.terms) {
      const occurrences = countTerm(input, term);
      if (occurrences > 0) {
        score += occurrences;
        matches.push(term);
      }
    }
    if (score > bestScore) {
      bestValue = rule.value;
      bestScore = score;
      bestMatches = matches;
    }
  }
  return { value: bestValue, matches: bestMatches };
}

function deterministicFallback<T>(input: string, salt: string, values: readonly T[]): T {
  const index = hashSeed(`${salt}\u001f${input}`) % values.length;
  return values[index] as T;
}

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Decomposes any prompt into generator traits without a model call or network
 * access. Explicit local wording wins; vague or novel prompts receive a stable
 * hash-derived fallback rather than an unstable hard-coded map.
 */
export function decomposeAdaptiveFeatures(prompt: string): AdaptiveFeatures {
  const normalized = normalizePrompt(prompt);
  const categories = categoryScores(normalized);
  const categoryHint = bestKind(categories.scores);
  const defaults = categoryHint === undefined ? undefined : KIND_DEFAULTS[categoryHint];

  const environment = signalFor(normalized, ENVIRONMENT_RULES);
  const topology = signalFor(normalized, TOPOLOGY_RULES);
  const verticality = signalFor(normalized, VERTICALITY_RULES);
  const water = signalFor(normalized, WATER_RULES);
  const lighting = signalFor(normalized, LIGHTING_RULES);
  const cover = signalFor(normalized, COVER_RULES);
  const theme = signalFor(normalized, THEME_RULES);

  const anchors = ANCHOR_RULES.filter((rule) => rule.terms.some((term) => countTerm(normalized, term) > 0)).map((rule) => rule.value);
  const hazards = HAZARD_RULES.filter((rule) => rule.terms.some((term) => countTerm(normalized, term) > 0)).map((rule) => rule.value);

  const resolvedEnvironment = environment.value ?? defaults?.environment ?? deterministicFallback(normalized, "environment", ["interior", "urban", "wilderness", "ruin"] as const);
  const resolvedTopology = topology.value ?? defaults?.topology ?? deterministicFallback(normalized, "topology", ["linear", "branching", "open", "loop"] as const);
  const resolvedVerticality = verticality.value ?? defaults?.verticality ?? deterministicFallback(normalized, "verticality", ["low", "medium"] as const);
  const resolvedWater = water.value ?? defaults?.water ?? deterministicFallback(normalized, "water", ["none", "none", "minor"] as const);
  const resolvedLighting = lighting.value ?? defaults?.lighting ?? deterministicFallback(normalized, "lighting", ["bright", "dim", "dark"] as const);
  const resolvedCover = cover.value ?? defaults?.cover ?? deterministicFallback(normalized, "cover", ["sparse", "moderate", "dense"] as const);
  const resolvedTheme = theme.value ?? defaults?.theme ?? deterministicFallback(normalized, "theme", ["neutral", "mystic", "wild", "grim"] as const);

  const evidence = uniqueInOrder([
    ...environment.matches,
    ...topology.matches,
    ...verticality.matches,
    ...water.matches,
    ...lighting.matches,
    ...cover.matches,
    ...theme.matches,
  ]);
  const tags = uniqueInOrder([
    `environment:${resolvedEnvironment}`,
    `topology:${resolvedTopology}`,
    `verticality:${resolvedVerticality}`,
    `water:${resolvedWater}`,
    `lighting:${resolvedLighting}`,
    `cover:${resolvedCover}`,
    `theme:${resolvedTheme}`,
    ...anchors.map((anchor) => `anchor:${anchor}`),
    ...hazards.map((hazard) => `hazard:${hazard}`),
  ]);

  return {
    environment: resolvedEnvironment,
    topology: resolvedTopology,
    verticality: resolvedVerticality,
    water: resolvedWater,
    lighting: resolvedLighting,
    cover: resolvedCover,
    theme: resolvedTheme,
    anchors,
    hazards,
    tags,
    evidence,
  };
}

/**
 * Classifies the four fixed generators with local keyword evidence. If no
 * category has evidence, the request is intentionally routed to `adaptive` and
 * its composable traits are returned for deterministic generation.
 */
export function classifyInput(prompt: string): InputClassification {
  const normalizedPrompt = normalizePrompt(prompt);
  const result = categoryScores(normalizedPrompt);
  const selected = bestKind(result.scores);
  const scores = result.scores;
  const traits = decomposeAdaptiveFeatures(prompt);

  if (selected === undefined) {
    return {
      kind: "adaptive",
      source: "adaptive",
      confidence: 0.35,
      normalizedPrompt,
      matchedKeywords: [],
      categoryScores: scores,
      traits,
    };
  }

  const orderedScores = KNOWN_KINDS.map((kind) => scores[kind]).sort((left, right) => right - left);
  const topScore = orderedScores[0] as number;
  const nextScore = orderedScores[1] as number;
  const separation = topScore === 0 ? 0 : (topScore - nextScore) / topScore;
  const confidence = Math.max(0.5, Math.min(0.98, 0.66 + separation * 0.3));

  return {
    kind: selected,
    source: "keyword",
    confidence,
    normalizedPrompt,
    matchedKeywords: result.matches[selected],
    categoryScores: scores,
    traits,
  };
}

/** Alias for callers that use scene-specific naming. */
export const classifySceneInput = classifyInput;
