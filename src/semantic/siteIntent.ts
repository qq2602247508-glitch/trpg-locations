export type EmbeddedFacilityProfile = "quarantine" | "weather" | "research" | "observatory" | "forge" | "sanatorium" | "ranger" | "border" | "shelter" | "custom";
export interface EmbeddedFacilityCapabilities {
  communications: boolean;
  generator: boolean;
  undergroundStore: boolean;
  laboratory: boolean;
  washRoom: boolean;
}
export type EmbeddedFacilityUse = "residential" | "industrial" | "medical" | "sacred" | "research" | "security" | "hospitality" | "storage" | "service";
export type EmbeddedFacilitySpace = "observation" | "laboratory" | "archive" | "workshop" | "greenhouse" | "distillation" | "submerged-room";
export type EmbeddedFacilityTheme = "clockwork" | "specimen" | "airship" | "communications" | "alchemy" | "generic";
export interface EmbeddedFacilityIntent {
  profile: EmbeddedFacilityProfile;
  use: EmbeddedFacilityUse;
  spaces: EmbeddedFacilitySpace[];
  theme: EmbeddedFacilityTheme;
  abandoned: boolean;
}

const NATURAL_PARENT_TERMS = [
  "森林", "树林", "林间", "巨树", "树根", "山地", "高山", "山顶", "山脊", "风化岩脊", "峰顶", "山坡", "岩坡", "裸岩", "峭壁", "山谷", "河谷", "峡谷", "高原", "荒原", "草原", "沙漠",
  "沼泽", "湿地", "泥炭", "泥沼", "红树林", "海岸", "海崖", "岛屿", "冻土", "冰原", "冰盖", "冰帽", "雪原", "极地", "冰川", "火山", "熔岩",
  "裂谷", "地裂", "深渊", "陨石坑", "撞击坑", "流星坑", "洞穴", "洞窟", "岩窟", "溶洞", "海蚀洞", "潮汐洞穴", "洞穴群",
  "forest", "woodland", "tree", "mountain", "mountain top", "ridge", "weathered rock ridge", "summit", "rock slope", "bare rock", "cliff", "valley", "canyon", "plateau", "moor", "steppe", "desert",
  "swamp", "wetland", "bog", "peat", "mangrove", "coast", "cliff", "island", "tundra", "ice", "ice sheet", "ice cap", "snowfield", "polar", "glacier", "volcanic", "lava",
  "rift", "chasm", "fissure", "impact crater", "meteor crater", "cave", "cavern", "grotto", "sea cave", "tidal cavern", "cave network",
] as const;

const SHELTER_TERMS = [
  "木屋", "小屋", "猎人屋", "猎人营地", "林间屋", "野外营房", "野外哨所", "猎人小站", "cabin", "lodge", "hut", "cottage", "hunter camp", "ranger camp", "outpost",
] as const;

const PROFILE_TERMS: Readonly<Record<Exclude<EmbeddedFacilityProfile, "shelter" | "custom">, readonly string[]>> = {
  quarantine: ["检疫站", "隔离站", "quarantine station", "isolation station"],
  weather: ["气象站", "气象观测站", "测候站", "weather station", "meteorological station"],
  research: [
    "科研站", "研究站", "观测站", "监测站", "实验站", "地震站", "水文站", "生态站", "测绘站", "通信站", "雷达站",
    "research station", "observation station", "monitoring station", "field station", "experimental station", "seismic station",
    "hydrology station", "ecological station", "survey station", "radio station",
  ],
  observatory: [
    "天文台", "天文观测站", "观星台", "观星塔", "星象台",
    "observatory", "astronomical station", "stargazing tower", "star platform",
  ],
  forge: [
    "铸造所", "铸造厂", "锻造所", "黑铁铸造所", "熔炉车间", "熔炉工坊", "铁匠铺",
    "forge", "foundry", "black-iron foundry", "smelter", "forge workshop",
  ],
  sanatorium: [
    "疗养站", "疗养院", "山间疗养院", "康复院", "疗养所",
    "sanatorium", "convalescent home", "mountain clinic", "retreat hospital",
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

function hasGenericFacilityNoun(text: string): boolean {
  return /(?:修复|收藏|标本|档案|抄写|制图|测量|系留|维护|观景|警戒|巡查|实验|工艺|冶炼|蒸馏|酿造|医疗|救护|避难|储备|货运|信号|灯号|祭祀|礼拜|学术|研究|勘探|采集|加工)[^，。；;]{0,8}(?:站|所|院|塔|楼|馆|屋|堡|堂|庙|工坊|车间|基地|营房|设施|实验室|仓|库)/u.test(text)
    || /(?:station|facility|observatory|repair shop|collection hall|specimen hall|archive|scriptorium|cartography room|survey post|mooring tower|maintenance depot|lookout|watch post|laboratory|workshop|foundry|distillery|brewery|clinic|infirmary|shelter|depot|signal tower|chapel|shrine|academy|research outpost|hangar|warehouse)\b/u.test(text);
}

function hasExplicitNaturalEmbeddingRelation(text: string): boolean {
  return /(?:中的|里的|内部的|上的|上方的|下方的|旁边的|沿岸的|背后的|边缘的)/u.test(text)
    || /(?:建在|位于|嵌在|藏在|坐落在)[^，。；;]{0,28}(?:中|内|上|旁|边缘|沿岸|背后|下方)/u.test(text)
    || /\b(?:in|inside|within|on|along|behind|beneath|under|at the edge of)\b[^,.;]{0,36}\b(?:forest|swamp|marsh|mountain|ridge|valley|canyon|glacier|ice field|tundra|volcanic|crater|cavern|cave|coast|river)\b/u.test(text);
}

export function hasNaturalParentContext(prompt: string): boolean {
  return includesAny(normalized(prompt), NATURAL_PARENT_TERMS);
}

export function embeddedFacilityProfile(prompt: string): EmbeddedFacilityProfile | undefined {
  const text = normalized(prompt);
  if (includesAny(text, PROFILE_TERMS.quarantine)) return "quarantine";
  if (includesAny(text, PROFILE_TERMS.sanatorium)) return "sanatorium";
  if (includesAny(text, PROFILE_TERMS.forge)) return "forge";
  if (includesAny(text, PROFILE_TERMS.observatory)) return "observatory";
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
  if (hasGenericFacilityNoun(text)) return "custom";
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
  const text = normalized(prompt);
  const profile = embeddedFacilityProfile(text);
  if (!hasNaturalParentContext(text) || profile === undefined) return false;
  // Known stations/cabins already carry a strong facility contract. A custom
  // noun is more ambiguous ("mountain archive monastery", "cliff museum"):
  // require an explicit parent-child relation so an architectural prompt does
  // not get hijacked merely because its name contains a terrain adjective.
  return profile !== "custom" || hasExplicitNaturalEmbeddingRelation(text);
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

export function embeddedFacilityIntent(prompt: string): EmbeddedFacilityIntent | undefined {
  const text = normalized(prompt);
  const profile = embeddedFacilityProfile(text);
  if (!profile) return undefined;
  const has = (terms: readonly string[]) => includesAny(text, terms);
  const use: EmbeddedFacilityUse = has(["教堂", "礼拜堂", "神殿", "寺院", "修道院", "祭祀", "chapel", "shrine", "temple", "monastery", "abbey"]) ? "sacred"
    : has(["医院", "诊所", "医务", "救护", "疗养", "病房", "clinic", "hospital", "infirmary", "sanatorium", "medical"]) ? "medical"
      : has(["铸造", "熔炉", "锻造", "工坊", "车间", "加工", "冶炼", "factory", "forge", "foundry", "workshop", "smelter"]) ? "industrial"
        : has(["哨所", "警戒", "巡查", "防御", "守备", "堡", "watch post", "outpost", "guard", "bunker", "fort"]) ? "security"
          : has(["酒馆", "旅店", "客栈", "酒店", "招待", "tavern", "inn", "hotel", "lodge", "hostel"]) ? "hospitality"
            : has(["仓库", "储备", "货运", "补给", "depot", "warehouse", "storehouse", "supply"]) ? "storage"
              : has(["住宅", "住处", "木屋", "小屋", "宿舍", "cabin", "cottage", "house", "quarters"]) ? "residential"
                : has(["研究", "实验", "观测", "天文", "标本", "档案", "制图", "测量", "research", "laboratory", "observatory", "specimen", "archive", "survey"]) ? "research"
                  : "service";
  const spaces = new Set<EmbeddedFacilitySpace>();
  if (has(["观测", "观察", "瞭望", "天文", "观星", "信号塔", "信号平台", "系留塔", "系留平台", "塔台", "observation", "observatory", "lookout", "signal tower", "signal platform", "mooring tower", "mooring platform"])) spaces.add("observation");
  if (has(["实验室", "化验", "校准", "标本处理", "研究室", "laboratory", "lab", "calibration", "specimen processing"])) spaces.add("laboratory");
  if (has(["档案", "藏书", "记录", "图纸", "星图", "标本馆", "收藏", "气囊仓", "燃料库", "archive", "library", "records", "chart room", "collection", "specimen hall", "gas-cell store", "fuel store", "fuel bunker"])) spaces.add("archive");
  if (has(["工坊", "车间", "修复", "维护", "机械", "锻造", "铸造", "workshop", "repair", "maintenance", "machine shop", "forge", "foundry"])) spaces.add("workshop");
  if (has(["温室", "苗圃", "植物房", "greenhouse", "nursery", "conservatory"])) spaces.add("greenhouse");
  if (has(["蒸馏", "酿造", "炼金", "精炼", "distillation", "distillery", "brewery", "alchemy", "refinery"])) spaces.add("distillation");
  if (has(["水下", "半淹", "沉没", "潜水舱", "submerged", "underwater", "flooded chamber", "dive chamber"])) spaces.add("submerged-room");
  if (spaces.size === 0) {
    if (use === "industrial" || use === "service") spaces.add("workshop");
    else if (use === "research") spaces.add("laboratory");
    else if (use === "storage") spaces.add("archive");
    else if (use === "security") spaces.add("observation");
  }
  const theme: EmbeddedFacilityTheme = has(["钟表", "钟楼机械", "发条", "齿轮", "clock", "clockwork", "horology", "gearwork"]) ? "clockwork"
    : has(["古生物", "化石", "标本", "骨架", "specimen", "fossil", "paleontology", "skeleton display"]) ? "specimen"
      : has(["飞艇", "气球", "飞船", "系留", "airship", "dirigible", "balloon", "mooring"]) ? "airship"
        : has(["无线电", "通信", "信号", "天线", "radio", "communications", "signal", "antenna"]) ? "communications"
          : has(["炼金", "蒸馏", "炼药", "alchemy", "distillation", "apothecary"]) ? "alchemy"
            : "generic";
  return {
    profile,
    use,
    spaces: [...spaces],
    theme,
    abandoned: has(["废弃", "荒废", "破败", "坍塌", "abandoned", "derelict", "ruined", "collapsed"]),
  };
}
