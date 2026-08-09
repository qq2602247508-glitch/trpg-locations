export type EmbeddedFacilityProfile = "quarantine" | "weather" | "research" | "ranger" | "border" | "shelter";
export interface EmbeddedFacilityCapabilities {
  communications: boolean;
  generator: boolean;
  undergroundStore: boolean;
  laboratory: boolean;
  washRoom: boolean;
}

const NATURAL_PARENT_TERMS = [
  "森林", "树林", "林间", "巨树", "树根", "山地", "高山", "山顶", "山脊", "风化岩脊", "峰顶", "山坡", "岩坡", "裸岩", "峭壁", "山谷", "河谷", "峡谷", "高原", "荒原", "草原", "沙漠",
  "沼泽", "湿地", "泥炭", "泥沼", "红树林", "海岸", "海崖", "岛屿", "冻土", "冰原", "冰盖", "冰帽", "雪原", "极地", "冰川", "火山", "熔岩",
  "裂谷", "地裂", "深渊", "陨石坑", "撞击坑", "流星坑",
  "forest", "woodland", "tree", "mountain", "mountain top", "ridge", "weathered rock ridge", "summit", "rock slope", "bare rock", "cliff", "valley", "canyon", "plateau", "moor", "steppe", "desert",
  "swamp", "wetland", "bog", "peat", "mangrove", "coast", "cliff", "island", "tundra", "ice", "ice sheet", "ice cap", "snowfield", "polar", "glacier", "volcanic", "lava",
  "rift", "chasm", "fissure", "impact crater", "meteor crater",
] as const;

const SHELTER_TERMS = [
  "木屋", "小屋", "猎人屋", "猎人营地", "林间屋", "野外营房", "野外哨所", "猎人小站", "cabin", "lodge", "hut", "cottage", "hunter camp", "ranger camp", "outpost",
] as const;

const PROFILE_TERMS: Readonly<Record<Exclude<EmbeddedFacilityProfile, "shelter">, readonly string[]>> = {
  quarantine: ["检疫站", "隔离站", "quarantine station", "isolation station"],
  weather: ["气象站", "气象观测站", "测候站", "weather station", "meteorological station"],
  research: [
    "科研站", "研究站", "观测站", "监测站", "实验站", "地震站", "水文站", "生态站", "测绘站", "通信站", "雷达站",
    "research station", "observation station", "monitoring station", "field station", "experimental station", "seismic station",
    "hydrology station", "ecological station", "survey station", "radio station",
  ],
  ranger: ["林务站", "林务所", "巡护站", "护林站", "ranger station", "forestry station", "warden station"],
  border: ["边防站", "边境哨所", "边境岗哨", "border outpost", "frontier outpost"],
};

function normalized(text: string): string {
  return text.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function hasNaturalParentContext(prompt: string): boolean {
  return includesAny(normalized(prompt), NATURAL_PARENT_TERMS);
}

export function embeddedFacilityProfile(prompt: string): EmbeddedFacilityProfile | undefined {
  const text = normalized(prompt);
  if (includesAny(text, PROFILE_TERMS.quarantine)) return "quarantine";
  if (includesAny(text, PROFILE_TERMS.weather)) return "weather";
  if (includesAny(text, PROFILE_TERMS.ranger)) return "ranger";
  if (includesAny(text, PROFILE_TERMS.border)) return "border";
  if (includesAny(text, PROFILE_TERMS.research)) return "research";
  // Generalize unknown field disciplines without treating every railway,
  // police or power "station" as a wilderness facility. The discipline must
  // describe observation/research work immediately before the site noun.
  if (/(?:监测|观测|研究|科研|实验|测量|测绘|勘探|地震|水文|生态|环境|野外|地热)[^，。；;]{0,6}(?:站|所|哨|工坊|基地|实验室|设施)/u.test(text)) return "research";
  if (/(?:monitoring|observation|research|field|experimental|survey|seismic|hydrolog(?:y|ical)|ecological)\s+(?:station|post|laboratory|lab)/u.test(text)) return "research";
  if (includesAny(text, SHELTER_TERMS)) return "shelter";
  return undefined;
}

/**
 * A small facility embedded in an explicitly named natural parent is a
 * composite wilderness site. The terrain owns macro layout; the facility is
 * instantiated as a child BuildingProgram. This rule is deterministic and
 * remains authoritative even when an optional language model calls the noun
 * an institution.
 */
export function shouldComposeWildernessFacility(prompt: string): boolean {
  return hasNaturalParentContext(prompt) && embeddedFacilityProfile(prompt) !== undefined;
}

export function embeddedFacilityCapabilities(prompt: string): EmbeddedFacilityCapabilities {
  const text = normalized(prompt);
  return {
    communications: includesAny(text, ["通信塔", "无线电塔", "天线塔", "communications tower", "radio tower", "antenna tower"])
      || /(?:通信|无线电|天线)[^，。；;]{0,4}(?:塔|桅杆|阵列)/u.test(text)
      || /(?:communications?|radio|antenna)\s+(?:tower|mast|array)/u.test(text),
    generator: includesAny(text, ["发电机棚", "发电机房", "generator shed", "generator house"])
      || /(?:备用)?发电(?:机|机组)?[^，。；;]{0,3}(?:棚|房|间|舱)/u.test(text)
      || /(?:backup\s+)?generator\s+(?:shed|house|room|bay)/u.test(text),
    undergroundStore: includesAny(text, ["地下储备仓", "地下储藏室", "地下补给库", "地下物资库", "秘密药品库", "药品库", "underground reserve", "reserve vault", "supply vault", "medicine vault", "medical cache"])
      || /地下[^，。；;]{0,6}(?:库|仓|储藏室)/u.test(text)
      || /underground\s+[^,.;]{0,24}(?:vault|store|archive|cache)/u.test(text),
    laboratory: includesAny(text, ["实验室", "化验室", "laboratory", "lab"]),
    washRoom: includesAny(text, ["样本清洗间", "清洗间", "洗消区", "sample wash", "wash room", "decontamination"]),
  };
}
