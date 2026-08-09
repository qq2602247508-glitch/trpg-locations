import type { GeneratedScene, GeneratorContext, MaterialKey, ScenePrimitive, SemanticGenerationHints } from "../schema";
import type { BuildingFunctionalModuleProgram } from "../site-program/schema";
import { embeddedFacilityCapabilities, embeddedFacilityProfile } from "../semantic/siteIntent";
import { resolveCapabilityDomain } from "../composition/capabilityDomain";
import { instantiateBuildingModule } from "./buildingModule";
import {
  CELL,
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  choose,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  cylinder,
  feetToMeters,
  primitive,
  ramp,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  water,
} from "./shared";

export type WildernessArchetype = "river-valley" | "dry-riverbed" | "impact-crater" | "volcanic" | "infernal-waste" | "burial-ground" | "rift" | "mountain" | "ice" | "ruin" | "underground-lake" | "underdark" | "forest" | "swamp" | "floating-islands" | "industrial-ruin" | "coral-tide";

interface TerrainMorphology {
  channel: boolean;
  dryChannel: boolean;
  impactCrater: boolean;
  crater: boolean;
  lava: boolean;
  burial: boolean;
  infernal: boolean;
  woodland: boolean;
  fungal: boolean;
  wetland: boolean;
  ruin: boolean;
}

const WILDERNESS_TERMS: Readonly<Record<WildernessArchetype, readonly string[]>> = {
  "river-valley": ["river", "stream", "creek", "riverbank", "river bend", "河谷", "河流", "河川", "河湾", "溪流", "溪谷", "水湾", "峡谷河"],
  "dry-riverbed": ["dry riverbed", "dry wash", "wadi", "干河床", "枯河床", "河床"],
  "impact-crater": ["impact crater", "meteor crater", "陨石坑", "撞击坑", "流星坑"],
  volcanic: ["volcano", "volcanic", "caldera", "火山", "火山口", "破火山口"],
  "infernal-waste": ["avernus", "hellscape", "infernal waste", "阿弗纳斯", "地狱荒原", "地狱"],
  "burial-ground": ["cemetery", "graveyard", "burial ground", "墓地", "墓园", "坟场", "陵园"],
  rift: ["rift", "chasm", "ravine", "裂谷", "裂隙", "深坑", "断崖"],
  mountain: ["mountain", "cliff", "ridge", "山地", "山脊", "高山", "峭壁"],
  ice: ["ice", "ice sheet", "ice cap", "polar", "glacier", "tundra", "冰原", "冰盖", "冰帽", "极地", "冰川", "冻土", "雪原"],
  ruin: ["ruin", "ruined", "wilderness ruin", "遗迹", "废墟", "残垣", "荒野遗迹"],
  "underground-lake": ["underground lake", "dark lake", "subterranean lake", "地下湖", "地底湖"],
  underdark: ["underdark", "幽暗地域", "地底世界", "地下洞窟", "菌林", "发光水晶", "mushroom", "fungal", "蘑菇", "菌类"],
  forest: ["forest", "woodland", "林地", "森林", "树林", "林间", "巨树", "树冠"],
  swamp: ["swamp", "marsh", "bog", "沼泽", "湿地"],
  "floating-islands": ["floating island", "sky island", "levitating island", "浮空岛", "浮空岩岛", "浮岛", "空岛", "悬浮岛", "悬空石盘", "漂浮岩岛"],
  "industrial-ruin": ["industrial district", "industrial ruins", "factory district", "废弃工业区", "工业区", "工业遗址", "厂房", "输送桥", "锈蚀管道"],
  "coral-tide": ["coral courtyard", "coral reef", "tide pool", "潮汐", "潮池", "珊瑚庭院", "珊瑚礁"],
};

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function analyzeTerrainMorphology(prompt: string, hints?: SemanticGenerationHints): TerrainMorphology {
  const normalized = [prompt, ...(hints?.anchors ?? []), ...(hints?.hazards ?? []), ...(hints?.tags ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  const dry = includesAny(normalized, ["dry", "dried", "arid", "desiccated", "干涸", "枯竭", "无水", "旱"]);
  const riverbed = includesAny(normalized, ["riverbed", "river bed", "wash", "wadi", "河床"]);
  const channel = includesAny(normalized, WILDERNESS_TERMS["river-valley"]) || riverbed || hints?.water === "major";
  const lava = includesAny(normalized, ["lava", "magma", "molten", "熔岩", "岩浆", "火山"]);
  return {
    channel,
    dryChannel: riverbed && dry || includesAny(normalized, ["dry riverbed", "dry wash", "wadi", "干河床", "枯河床"]),
    impactCrater: includesAny(normalized, WILDERNESS_TERMS["impact-crater"]) || normalized.includes("morphology:impact-crater"),
    crater: includesAny(normalized, WILDERNESS_TERMS.volcanic) || normalized.includes("morphology:caldera"),
    lava,
    burial: includesAny(normalized, WILDERNESS_TERMS["burial-ground"]) || includesAny(normalized, ["grave", "tombstone", "mausoleum", "crypt", "坟墓", "墓碑", "陵墓", "墓穴"]),
    infernal: includesAny(normalized, WILDERNESS_TERMS["infernal-waste"]) || normalized.includes("coverage:ash") && lava,
    woodland: includesAny(normalized, WILDERNESS_TERMS.forest) || (hints?.environment === "wilderness" && hints.cover === "dense"),
    fungal: includesAny(normalized, ["mushroom", "fungus", "fungal", "蘑菇", "菌类", "菌林"]),
    wetland: includesAny(normalized, WILDERNESS_TERMS.swamp),
    ruin: includesAny(normalized, WILDERNESS_TERMS.ruin) || hints?.environment === "ruin",
  };
}

/** Publish parent-terrain ownership before later semantic and building passes.
 * Linear hazards use a conservative cell-space AABB so child modules can
 * reject the whole rotated span without knowing its renderer geometry. */
function reserveLinearTerrain(
  scene: GeneratedScene,
  id: string,
  kind: "void" | "water" | "lava" | "unstable",
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  widthCells: number,
  clearanceCells: number,
  reason: string,
): void {
  (scene.terrainReservations ??= []).push({
    id,
    kind,
    centerCells: { x: (fromX + toX) / 2, z: (fromZ + toZ) / 2 },
    sizeCells: { x: widthCells, z: Math.max(1, Math.hypot(toX - fromX, toZ - fromZ)) },
    rotationY: Math.atan2(toX - fromX, toZ - fromZ),
    clearanceCells,
    reason,
  });
}

function reserveRadialTerrain(
  scene: GeneratedScene,
  id: string,
  kind: "void" | "water" | "lava" | "unstable",
  x: number,
  z: number,
  diameterCells: number,
  clearanceCells: number,
  reason: string,
): void {
  (scene.terrainReservations ??= []).push({
    id,
    kind,
    centerCells: { x, z },
    sizeCells: { x: diameterCells, z: diameterCells },
    clearanceCells,
    reason,
  });
}

export function classifyWildernessArchetype(prompt: string, hints?: SemanticGenerationHints, capabilityIds: readonly string[] = []): WildernessArchetype {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const morphology = analyzeTerrainMorphology(prompt, hints);
  if (WILDERNESS_TERMS["industrial-ruin"].some((term) => normalized.includes(term))) return "industrial-ruin";
  if (includesAny(normalized, ["红树林", "mangrove"])) return "swamp";
  if (WILDERNESS_TERMS["coral-tide"].some((term) => normalized.includes(term))) return "coral-tide";
  if (morphology.impactCrater) return "impact-crater";
  if (WILDERNESS_TERMS["floating-islands"].some((term) => normalized.includes(term))) return "floating-islands";
  if (morphology.infernal) return "infernal-waste";
  if (morphology.crater) return "volcanic";
  if (morphology.burial) return "burial-ground";
  if (morphology.dryChannel) return "dry-riverbed";
  // Cold wetlands are not ordinary temperate swamps or generic mountains.
  // Their frozen substrate owns the macro terrain while thaw pools and
  // boardwalks remain composable wetland layers, regardless of word order.
  if (includesAny(normalized, WILDERNESS_TERMS.ice) && includesAny(normalized, WILDERNESS_TERMS.swamp)) return "ice";
  // Water is a topology, woodland is a coverage layer. A mixed prompt must
  // retain a continuous river rather than becoming a flat forest with props.
  if (morphology.channel && morphology.woodland) return "river-valley";
  // Named biome/domain beats a secondary landmark in the same prompt. For
  // example “幽暗地域，连续裂谷” is an underdark map with a rift feature,
  // not a generic rift map.
  if (WILDERNESS_TERMS["underground-lake"].some((term) => normalized.includes(term))) return "underground-lake";
  if (WILDERNESS_TERMS.underdark.some((term) => normalized.includes(term))) return "underdark";
  let selected: WildernessArchetype = "mountain";
  let firstIndex = Number.POSITIVE_INFINITY;
  for (const archetype of Object.keys(WILDERNESS_TERMS) as WildernessArchetype[]) {
    if (archetype === "underdark") continue;
    for (const term of WILDERNESS_TERMS[archetype]) {
      const index = normalized.indexOf(term);
      if (index >= 0 && index < firstIndex) {
        firstIndex = index;
        selected = archetype;
      }
    }
  }
  if (firstIndex < Number.POSITIVE_INFINITY) return selected;
  if (hints?.water === "major") return "river-valley";
  if (hints?.environment === "underground") return "underdark";
  if (hints?.environment === "ruin") return "ruin";
  if (hints?.environment === "wilderness" && hints.cover === "dense") return "forest";
  // Local semantic retrieval may resolve unfamiliar language into known atoms.
  // It is only consulted after explicit prompt/hint ownership fails.
  const capabilityDomain = resolveCapabilityDomain(capabilityIds).domain;
  if (capabilityDomain === "forest") return "forest";
  if (capabilityDomain === "swamp") return "swamp";
  if (capabilityDomain === "river") return "river-valley";
  if (capabilityDomain === "volcanic") return "volcanic";
  if (capabilityDomain === "crater") return "impact-crater";
  if (capabilityDomain === "rift") return "rift";
  if (capabilityDomain === "floating") return "floating-islands";
  if (capabilityDomain === "cave") return "underdark";
  return selected;
}

function bounds(context: GeneratorContext, archetype: WildernessArchetype): { width: number; depth: number; height: number; density: number } {
  const { rng, request } = context;
  const base: readonly [number, number, number] = archetype === "industrial-ruin" ? [58, 46, 6] : archetype === "coral-tide" ? [56, 44, 5] : archetype === "rift" ? [61, 61, 5] : archetype === "river-valley" ? [64, 56, 6] : archetype === "dry-riverbed" ? [58, 44, 5] : archetype === "impact-crater" ? [56, 52, 7] : archetype === "volcanic" ? [54, 50, 8] : archetype === "infernal-waste" ? [60, 48, 6] : archetype === "floating-islands" ? [58, 48, 18] : archetype === "burial-ground" ? [46, 38, 4] : archetype === "mountain" ? [48, 46, 7] : archetype === "ice" ? [46, 36, 4] : archetype === "ruin" ? [34, 30, 4] : archetype === "underdark" ? [48, 36, 6] : archetype === "underground-lake" ? [44, 36, 6] : archetype === "forest" ? [52, 44, 3] : archetype === "swamp" ? [48, 40, 3] : [48, 34, 4];
  const scale = request.size === "small" ? 0.62 : request.size === "large" ? 1.55 : 1;
  return { width: Math.round(base[0] * scale) + rng.int(-2, 3), depth: Math.round(base[1] * scale) + rng.int(-2, 3), height: base[2], density: request.density };
}

function addCover(scene: GeneratedScene, rng: GeneratorContext["rng"], prefix: string, x: number, z: number, y: number, count: number, material: MaterialKey = "rock"): void {
  for (let index = 0; index < count; index += 1) {
    const rockX = x + rng.float(-3, 3);
    const rockZ = z + rng.float(-3, 3);
    const size = rng.float(0.9, 1.8);
    scene.primitives.push(primitive(`${prefix}-cover-${index}`, "sphere", 0, rockX, y + FLOOR_SLAB_METERS, rockZ, size * 1.524, size * 1.1, size * 1.524, material, ["cover", "natural-cover"]));
    scene.tactical.push(tacticalFeature(`${prefix}-cover-feature-${index}`, "cover", rockX, rockZ, y, Math.ceil(size / 1.4), "Natural debris provides hard cover and breaks a long sight line."));
  }
}

function buildRiverValley(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const riverZ = depth * 0.52;
  scene.primitives.push(
    box("river-north-bank", 0, width / 2, 0, depth * 0.24, width - 2, FLOOR_SLAB_METERS, depth * 0.45, "earth", ["floor", "terrain", "bank"]),
    box("river-south-bank", 0, width / 2, -0.55, depth * 0.81, width - 2, FLOOR_SLAB_METERS, depth * 0.36, "earth", ["floor", "terrain", "bank"]),
    water("river-main-channel", 0, width / 2, -0.22, riverZ, width - 2, 0.34, 4.2, ["river", "watercourse"]),
  );
  const crossingX = width * 0.48;
  scene.primitives.push(corridor("river-stone-bridge", 0, crossingX, riverZ - 3.8, crossingX, riverZ + 3.8, 0.12, 2.2, "stone", ["bridge"]));
  scene.rooms.push(createRoom("river-north-room", "North bank", "natural", 0, width / 2, depth * 0.24, width - 4, Math.max(5, depth * 0.38)), createRoom("river-south-room", "South bank", "natural", 0, width / 2, depth * 0.81, width - 4, Math.max(5, depth * 0.28)), createRoom("river-bridge-room", "Bridge crossing", "circulation", 0, crossingX, riverZ, 2, 8));
  connectRooms(scene.rooms, "river-north-room", "river-bridge-room");
  connectRooms(scene.rooms, "river-south-room", "river-bridge-room");
  scene.routes.push(
    createRoute("river-bank-route", "primary", [{ x: 1, z: depth * 0.24 }, { x: crossingX, z: riverZ - 3.8, y: 0.12 }, { x: crossingX, z: riverZ + 3.8, y: 0.12 }, { x: width - 1, z: depth * 0.81, y: -0.55 }]),
    createRoute("river-waterflow", "waterflow", [{ x: 1, z: riverZ, y: -0.22 }, { x: width / 2, z: riverZ, y: -0.22 }, { x: width - 1, z: riverZ, y: -0.22 }]),
  );
  scene.tactical.push(tacticalFeature("river-bridge-choke", "chokepoint", crossingX, riverZ, 0.12, 2, "The bridge is the only reliable crossing between banks."), tacticalFeature("river-bank-entrance", "entrance", 1, depth * 0.24, 0, 2, "A trail enters along the north bank."));
  addCover(scene, rng, "river", width * 0.22, depth * 0.24, 0, 3);
}

function buildRiverValleyContinuous(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.floor(width);
  const rows = Math.floor(depth);
  const channel = rows * rng.float(0.46, 0.55);
  const phaseA = rng.float(-Math.PI, Math.PI);
  const phaseB = rng.float(-Math.PI, Math.PI);
  const channelHalfWidth = 1.65 + density * 1.45;
  const riverLineAt = (x: number) => channel + Math.sin(x * (0.12 + density * 0.055) + phaseA) * (2.2 + density * 2.5) + Math.sin(x * 0.041 + phaseB) * (2.2 + density * 1.5);
  const tributaryCount = 1 + Math.floor(density * 2.6);
  const tributaries = Array.from({ length: tributaryCount }, (_, index) => {
    const joinX = cols * (0.3 + (index + 1) / (tributaryCount + 2) * 0.5) + rng.float(-2.5, 2.5);
    const fromNorth = index % 2 === 0;
    const startZ = fromNorth ? rows * rng.float(0.08, 0.18) : rows * rng.float(0.82, 0.92);
    const joinZ = riverLineAt(joinX);
    return { joinX, startZ, joinZ, fromNorth, width: 0.9 + density * 0.75 };
  });
  const heights: Array<number | undefined> = [];
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x]);
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const riverLine = riverLineAt(x);
      const distance = Math.abs(z - riverLine);
      const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
      const inWater = distance <= channelHalfWidth;
      const inTributary = tributaries.some((branch) => {
        const dx = branch.joinX - (branch.fromNorth ? cols * 0.08 : cols * 0.92);
        const startX = branch.fromNorth ? cols * 0.08 : cols * 0.92;
        const t = Math.max(0, Math.min(1, (x - startX) / (Math.abs(dx) < 0.01 ? 1 : dx)));
        const lineZ = branch.startZ + (branch.joinZ - branch.startZ) * t + Math.sin(t * Math.PI * 2 + phaseB) * 1.2;
        return t > 0 && t < 1 && Math.abs(z - lineZ) <= branch.width;
      });
      const erodedPocket = distance > 7 && Math.sin(x * 0.27 + z * 0.19 + phaseA) > 0.94 - density * 0.08 && Math.cos(x * 0.08 - z * 0.12) > 0.15;
      if (edge === 0 || inWater || inTributary || erodedPocket) heights.push(undefined);
      else {
        const distanceBand = distance < 5 ? 0 : distance < 9 ? 1 : distance < 15 ? 2 : 3;
        const ridgeLift = z < riverLine && distance > 13 && Math.sin(x * 0.095) + Math.cos(z * 0.12) > 0.65 ? 1 : 0;
        heights.push(Math.min(4, distanceBand + ridgeLift));
      }
    }
  }
  const yOf = (level: number) => feetToMeters(level * 10) + FLOOR_SLAB_METERS;
  const nearestWalkable = (targetX: number, targetZ: number): { x: number; z: number; level: number } => {
    for (let radius = 0; radius < 8; radius += 1) for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const x = Math.max(1, Math.min(cols - 2, Math.round(targetX + dx))); const z = Math.max(1, Math.min(rows - 2, Math.round(targetZ + dz))); const level = at(x, z);
      if (level !== undefined) return { x: x + 0.5, z: z + 0.5, level };
    }
    return { x: Math.max(1, Math.min(cols - 2, targetX)), z: Math.max(1, Math.min(rows - 2, targetZ)), level: 0 };
  };
  let cliffCount = 0;
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const level = at(x, z);
      if (level === undefined) continue;
      scene.primitives.push(box(`river-grid-cell-${x}-${z}`, 0, x + 0.5, 0, z + 0.5, 0.96, yOf(level), 0.96, level >= 3 ? "moss" : level === 0 ? "earth" : "rock", ["floor", "terrain", "semantic-grid", "macro-region", `river-elevation:${level}`]));
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const neighbour = at(x + dx, z + dz);
        if (neighbour !== undefined && Math.abs(neighbour - level) >= 1) {
          cliffCount += 1;
          scene.primitives.push(box(`river-bank-cliff-${x}-${z}-${dx}-${dz}`, 0, x + 0.5 + dx * 0.49, yOf(Math.min(level, neighbour)) / 2, z + 0.5 + dz * 0.49, dx ? 0.12 : 0.96, yOf(Math.max(level, neighbour)) - yOf(Math.min(level, neighbour)), dz ? 0.12 : 0.96, "rock", ["cliff-face", "vertical-face", "river-bank"]));
        }
      }
    }
  }
  const waterSegments = 14 + Math.round(density * 12);
  const waterfallX = cols * rng.float(0.62, 0.74);
  const upperWaterY = feetToMeters(3);
  const lowerWaterY = feetToMeters(-4);
  for (let index = 0; index < waterSegments; index += 1) {
    const fromX = 1 + ((cols - 2) * index) / waterSegments;
    const toX = 1 + ((cols - 2) * (index + 1)) / waterSegments;
    const fromZ = riverLineAt(fromX);
    const toZ = riverLineAt(toX);
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const waterY = (fromX + toX) / 2 < waterfallX ? upperWaterY : lowerWaterY;
    scene.primitives.push(water(`river-semantic-channel-${index}`, 0, (fromX + toX) / 2, waterY, (fromZ + toZ) / 2, channelHalfWidth * 2, 0.34, Math.hypot(dx, dz) + 0.8, ["river", "watercourse", "terrain", "meandering-channel", waterY === upperWaterY ? "upper-water" : "lower-water"], Math.atan2(dx, dz)));
    reserveLinearTerrain(scene, `river-channel-reservation-${index}`, "water", fromX, fromZ, toX, toZ, channelHalfWidth * 2, 0.65, "The main river owns this channel; ordinary foundations and loose props must remain on supported banks.");
  }
  for (const [branchIndex, branch] of tributaries.entries()) {
    const startX = branch.fromNorth ? cols * 0.08 : cols * 0.92;
    const pieces = 6 + Math.round(density * 4);
    for (let index = 0; index < pieces; index += 1) {
      const t1 = index / pieces; const t2 = (index + 1) / pieces;
      const x1 = startX + (branch.joinX - startX) * t1; const x2 = startX + (branch.joinX - startX) * t2;
      const z1 = branch.startZ + (branch.joinZ - branch.startZ) * t1 + Math.sin(t1 * Math.PI * 2 + phaseB) * 1.2;
      const z2 = branch.startZ + (branch.joinZ - branch.startZ) * t2 + Math.sin(t2 * Math.PI * 2 + phaseB) * 1.2;
      scene.primitives.push(water(`river-tributary-${branchIndex}-${index}`, 0, (x1 + x2) / 2, upperWaterY + feetToMeters(1.5), (z1 + z2) / 2, branch.width * 2, 0.26, Math.hypot(x2 - x1, z2 - z1) + 0.55, ["river", "tributary", "watercourse", "waterflow"], Math.atan2(x2 - x1, z2 - z1)));
      reserveLinearTerrain(scene, `river-tributary-reservation-${branchIndex}-${index}`, "water", x1, z1, x2, z2, branch.width * 2, 0.55, "A tributary owns its wet channel and bank clearance.");
    }
  }
  const fallsZ = riverLineAt(waterfallX);
  const fallsHeight = upperWaterY - lowerWaterY;
  scene.primitives.push(box("river-waterfall-face", 0, waterfallX, lowerWaterY, fallsZ, 0.32, fallsHeight, channelHalfWidth * 2.25, "water", ["river", "waterfall", "vertical-water", "hazard"]));
  scene.primitives.push(water("river-deep-pool", 0, waterfallX + 2.4, lowerWaterY - 0.18, riverLineAt(waterfallX + 2.4), channelHalfWidth * 3.4, 0.62, 5.8, ["river", "deep-pool", "waterfall-basin", "hazard"]));
  reserveRadialTerrain(scene, "river-deep-pool-reservation", "water", waterfallX + 2.4, riverLineAt(waterfallX + 2.4), Math.max(channelHalfWidth * 3.4, 5.8), 0.85, "The waterfall plunge pool is deep water and cannot receive an ordinary building pad.");
  const crossingX = cols * rng.float(0.36, 0.52);
  const crossingZ = riverLineAt(crossingX);
  scene.primitives.push(corridor("river-semantic-old-bridge", 0, crossingX, crossingZ - 4, crossingX, crossingZ + 4, yOf(1), 2.4, "stone", ["bridge", "semantic-grid", "old-bridge"]));
  const fordX = cols * rng.float(0.16, 0.25);
  const fordZ = riverLineAt(fordX);
  scene.primitives.push(corridor("river-semantic-shallow-ford", 0, fordX, fordZ - 3.5, fordX, fordZ + 3.5, yOf(0), 2.2, "earth", ["terrain", "semantic-grid", "shallow-ford"]));
  scene.rooms.push(createRoom("river-upper-ridge", "Upper ridge", "natural", 0, cols * 0.5, rows * 0.2, cols - 6, rows * 0.25, yOf(3)), createRoom("river-floodplain", "River floodplain", "natural", 0, cols * 0.5, channel, cols - 6, 8, yOf(1)), createRoom("river-falls-basin", "Waterfall basin", "combat", 0, waterfallX + 2.4, fallsZ, cols * 0.26, rows * 0.22, lowerWaterY));
  connectRooms(scene.rooms, "river-upper-ridge", "river-floodplain");
  connectRooms(scene.rooms, "river-floodplain", "river-falls-basin");
  const ridgeRoute = [nearestWalkable(2, rows * 0.18), nearestWalkable(cols * 0.32, rows * 0.32), nearestWalkable(crossingX, crossingZ - 4), nearestWalkable(cols - 2, rows * 0.76)];
  scene.routes.push(createRoute("river-ridge-route", "primary", ridgeRoute.map((point) => ({ x: point.x, z: point.z, y: yOf(point.level) }))));
  scene.routes.push(createRoute("river-shallow-ford", "alternate", [{ x: fordX, z: fordZ - 4, y: yOf(1) }, { x: fordX, z: fordZ, y: yOf(0) }, { x: fordX, z: fordZ + 4, y: yOf(1) }]));
  scene.routes.push(createRoute("river-downstream", "waterflow", Array.from({ length: 9 }, (_, index) => { const x = 2 + ((cols - 4) * index) / 8; return { x, z: riverLineAt(x), y: x < waterfallX ? upperWaterY : lowerWaterY }; })));
  scene.tactical.push(tacticalFeature("river-semantic-entrance", "entrance", 2, rows * 0.18, yOf(3), 2, "The high ridge is the main approach into the valley."), tacticalFeature("river-ford", "chokepoint", fordX, fordZ, yOf(0), 2, "A shallow ford is a legal crossing but exposes anyone in the channel."), tacticalFeature("river-falls", "hazard", waterfallX, fallsZ, lowerWaterY, 3, "A seven-foot vertical waterfall drops into a deep pool and divides the water levels."));
  scene.description = `River-valley grammar with ${cliffCount} bank cliff segments, ${tributaryCount} tributaries, a ${Math.round(fallsHeight / 0.3048)}-foot waterfall, deep pool, old bridge, shallow ford, and density-driven channel width.`;
  scene.floorHeightFeet = [Math.ceil((yOf(3) + feetToMeters(12)) / 0.3048)];
}

function buildRift(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(32, Math.floor(width)); const rows = Math.max(28, Math.floor(depth));
  const phase = rng.float(-Math.PI, Math.PI); const halfGap = 3.4 + density * 3.2; const bottomHalf = 1.15 + density * 0.45;
  const riftAt = (z: number) => cols * 0.5 + Math.sin(z * (0.12 + density * 0.035) + phase) * (2.4 + density * 3.2) + Math.sin(z * 0.037 - phase) * 2;
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z); const distance = Math.abs(x - riftAt(z));
    const sideFracture = distance > halfGap + 2 && distance < halfGap + 7 && Math.sin(x * 0.41 + z * 0.27 + phase) > 0.95 - density * 0.08;
    if (edge === 0 || sideFracture || (distance > bottomHalf && distance < halfGap)) heights.push(undefined);
    else if (distance <= bottomHalf) heights.push(0);
    else { const high = x < riftAt(z) ? 5 : 4; heights.push(Math.min(6, high + (Math.sin(z * 0.17 + (x < riftAt(z) ? 0 : 1.4)) > 0.72 ? 1 : 0))); }
  }
  const rendered = renderMorphologyField(scene, { prefix: "rift", cols, rows, heights, stepFeet: 5, materialFor: (level) => level === 0 ? "darkStone" : level >= 5 ? "rock" : "earth", tagsFor: (level) => ["rift", "crevasse", level === 0 ? "rift-bottom" : "rift-bank", level >= 5 ? "high-ground" : "standable"] });
  const reservationSegments = Math.max(8, Math.round(rows / 5));
  for (let index = 0; index < reservationSegments; index += 1) {
    const fromZ = (rows * index) / reservationSegments;
    const toZ = (rows * (index + 1)) / reservationSegments;
    reserveLinearTerrain(
      scene,
      `rift-unstable-reservation-${index}`,
      "unstable",
      riftAt(fromZ),
      fromZ,
      riftAt(toZ),
      toZ,
      halfGap * 2,
      1.1,
      "The fractured rift corridor owns its void, collapsing walls, and immediate setback; only authored crossings may span it.",
    );
  }
  const westEdge = (z: number) => riftAt(z) - halfGap - 0.4; const eastEdge = (z: number) => riftAt(z) + halfGap + 0.4;
  const bridgeRows = [rows * 0.28, rows * 0.72];
  for (const [index, z] of bridgeRows.entries()) scene.primitives.push(corridor(`rift-bridge-${index}`, 0, westEdge(z), z, eastEdge(z), z, rendered.yOf(index === 0 ? 5 : 4), index === 0 ? 1.8 : 1.35, index === 0 ? "rock" : "wood", ["bridge", index === 0 ? "natural-bridge" : "rope-bridge", "supported", "rift-crossing"]));
  const descentZ = rows * 0.5; const bottomX = riftAt(descentZ); const descent = stairConnection("rift-bottom-descent", 0, { xCells: bottomX, zCells: descentZ + 2.2, yMeters: rendered.yOf(0) }, { xCells: westEdge(descentZ) - 1, zCells: descentZ, yMeters: rendered.yOf(5) }, 1.4, "rock", ["vertical-route", "vertical-opening", "cliff-descent", "supported", "rift"]);
  scene.primitives.push(descent.primitive); scene.routes.push(stairRoute("rift-bottom-route", descent));
  const westRoom = createRoom("rift-west-room", "Western broken bank", "natural", 0, cols * 0.23, rows * 0.5, cols * 0.34, rows - 5, rendered.yOf(5));
  const eastRoom = createRoom("rift-east-room", "Eastern high bank", "natural", 0, cols * 0.77, rows * 0.5, cols * 0.34, rows - 5, rendered.yOf(4));
  const bottomRoom = createRoom("rift-bottom-room", "Deep rift floor", "combat", 0, bottomX, rows * 0.5, bottomHalf * 2, rows - 6, rendered.yOf(0));
  const bridgeRoom = createRoom("rift-bridge-room", "Two-bank crossings", "circulation", 0, cols * 0.5, rows * 0.5, halfGap * 2 + 4, rows * 0.52, rendered.yOf(5));
  scene.rooms.push(westRoom, eastRoom, bottomRoom, bridgeRoom); connectRooms(scene.rooms, westRoom.id, bridgeRoom.id); connectRooms(scene.rooms, eastRoom.id, bridgeRoom.id); connectRooms(scene.rooms, westRoom.id, bottomRoom.id);
  scene.routes.push(createRoute("rift-primary-route", "primary", [{ x: 2, z: bridgeRows[0]!, y: rendered.yOf(5) }, { x: westEdge(bridgeRows[0]!), z: bridgeRows[0]!, y: rendered.yOf(5) }, { x: eastEdge(bridgeRows[0]!), z: bridgeRows[0]!, y: rendered.yOf(5) }, { x: cols - 2, z: bridgeRows[0]!, y: rendered.yOf(4) }]), createRoute("rift-alternate-route", "alternate", [{ x: 2, z: bridgeRows[1]!, y: rendered.yOf(5) }, { x: westEdge(bridgeRows[1]!), z: bridgeRows[1]!, y: rendered.yOf(4) }, { x: eastEdge(bridgeRows[1]!), z: bridgeRows[1]!, y: rendered.yOf(4) }, { x: cols - 2, z: bridgeRows[1]!, y: rendered.yOf(4) }]));
  scene.tactical.push(tacticalFeature("rift-entrance", "entrance", 2, bridgeRows[0]!, rendered.yOf(5), 2, "A fractured shelf approaches the upper natural bridge."), tacticalFeature("rift-bridge-choke", "chokepoint", riftAt(bridgeRows[0]!), bridgeRows[0]!, rendered.yOf(5), 2, "The upper bridge is exposed to both banks."), tacticalFeature("rift-void-hazard", "hazard", riftAt(rows * 0.5), rows * 0.5, rendered.yOf(0), Math.ceil(halfGap), "The winding void separates both banks and exposes a deep playable floor."), tacticalFeature("rift-bank-highground", "highGround", cols * 0.24, rows * 0.48, rendered.yOf(6), 3, "The western bank overlooks both crossings and the rift bottom."));
  scene.description = `Rift grammar with a winding ${Math.round(halfGap * 2)}-cell fracture, explicit cliff faces, two distinct bank crossings, a deep floor, and a supported descent route.`;
  scene.floorHeightFeet = [48];
}

/** A semantic underdark map: connected walkable cells are shaped first, then
 * rendered as elevation bands, a continuous ravine, bridges, and biome zones.
 * This is deliberately different from the generic chamber cave generator. */
function buildUnderdark(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(24, Math.floor(width));
  const rows = Math.max(20, Math.floor(depth));
  const levels = 5;
  const heights: Array<number | undefined> = [];
  const ravineX = Math.floor(cols * rng.float(0.43, 0.57));
  const bridgeRows = [Math.floor(rows * 0.28), Math.floor(rows * 0.68)];
  const cellAt = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x]);
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const boundary = Math.min(x, z, cols - 1 - x, rows - 1 - z);
      const caveShape = boundary >= 1 && (Math.sin(x * 0.31) + Math.cos(z * 0.23) > (-1.15 + density * 0.35) || boundary > 3);
      const inRavine = Math.abs(x - (ravineX + Math.sin(z * 0.22) * 2.2)) < 2.1 && !bridgeRows.some((row) => Math.abs(z - row) <= 1);
      const densityCollapse = density > 0.62 && !inRavine && Math.sin(x * 0.48 + z * 0.17) > 0.72 - density * 0.12 && boundary > 3;
      if (!caveShape || inRavine || densityCollapse) heights.push(undefined);
      else {
        const westHighland = x < cols * 0.33 && z > rows * 0.18;
        const northRuin = z < rows * 0.27 && x > cols * 0.58;
        const fungalBasin = x > cols * 0.54 && z > rows * 0.56;
        const level = westHighland ? 3 : northRuin ? 2 : fungalBasin ? 0 : Math.max(0, Math.min(levels - 1, Math.floor((rows - z) / Math.max(1, rows / 4))));
        heights.push(level);
      }
    }
  }
  const yOf = (level: number) => feetToMeters(level * 10) + FLOOR_SLAB_METERS;
  const nearestWalkable = (targetX: number, targetZ: number): { x: number; z: number; level: number } => {
    for (let radius = 0; radius < 8; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        const x = Math.round(targetX + dx);
        const z = Math.round(targetZ + dz);
        const level = cellAt(x, z);
        if (level !== undefined) return { x, z, level };
      }
    }
    return { x: Math.max(1, Math.min(cols - 2, Math.round(targetX))), z: Math.max(1, Math.min(rows - 2, Math.round(targetZ))), level: 0 };
  };
  let walkable = 0;
  let cliffSegments = 0;
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const level = cellAt(x, z);
      if (level === undefined) continue;
      walkable += 1;
      const material = level === 0 ? "moss" : level === 3 ? "darkStone" : "rock";
      scene.primitives.push(box(`underdark-cell-${x}-${z}`, 0, x + 0.5, 0, z + 0.5, 0.96, yOf(level), 0.96, material, ["floor", "terrain", "semantic-grid", `elevation:${level}`, level === 3 ? "highland" : level === 0 ? "fungal-basin" : "shelf"]));
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const neighbour = cellAt(x + dx, z + dz);
        if (neighbour !== undefined && Math.abs(neighbour - level) >= 1) {
          cliffSegments += 1;
          const h = yOf(Math.max(neighbour, level)) - yOf(Math.min(neighbour, level));
          scene.primitives.push(box(`underdark-cliff-${x}-${z}-${dx}-${dz}`, 0, x + 0.5 + dx * 0.49, yOf(Math.min(neighbour, level)) / 2, z + 0.5 + dz * 0.49, dx ? 0.12 : 0.96, Math.max(0.4, h), dz ? 0.12 : 0.96, "darkStone", ["cliff-face", "vertical-face", "terrain"]));
        }
      }
    }
  }
  for (const [index, row] of bridgeRows.entries()) {
    scene.primitives.push(corridor(`underdark-stone-bridge-${index}`, 0, ravineX - 3, row + 0.5, ravineX + 3, row + 0.5, yOf(1), 2.2, "stone", ["bridge", "semantic-grid", "ravine-crossing"]));
  }
  const zones = [
    ["West highland", "combat", cols * 0.18, rows * 0.48, 12, 12, yOf(3)],
    ["North relic shelf", "natural", cols * 0.73, rows * 0.16, 11, 8, yOf(2)],
    ["Fungal basin", "combat", cols * 0.68, rows * 0.74, 13, 10, yOf(0)],
    ["Ravine floor", "natural", ravineX, rows * 0.5, 4, rows - 4, yOf(0)],
  ] as const;
  for (const [index, zone] of zones.entries()) {
    const [name, role, x, z, w, d, y] = zone;
    const id = `underdark-zone-${index}`;
    scene.rooms.push(createRoom(id, name, role, 0, x, z, w, d, y));
    if (index > 0) connectRooms(scene.rooms, `underdark-zone-${index - 1}`, id);
  }
  const routePoints = [{ x: 2, z: rows - 3, y: yOf(1) }, { x: cols * 0.25, z: rows * 0.72, y: yOf(3) }, { x: ravineX, z: bridgeRows[0] ?? rows * 0.28, y: yOf(1) }, { x: cols * 0.75, z: rows * 0.18, y: yOf(2) }];
  const alternateA = nearestWalkable(ravineX - 4, rows * 0.82);
  const alternateB = nearestWalkable(cols - 3, rows * 0.68);
  scene.routes.push(createRoute("underdark-main-route", "primary", routePoints), createRoute("underdark-ravine-route", "alternate", [{ x: 2, z: rows - 3, y: yOf(1) }, { x: alternateA.x, z: alternateA.z, y: yOf(alternateA.level) }, { x: alternateB.x, z: alternateB.z, y: yOf(alternateB.level) }]));
  scene.tactical.push(tacticalFeature("underdark-entrance", "entrance", 2, rows - 3, yOf(1), 2, "A descending tunnel opens into the lower cavern."), tacticalFeature("underdark-ravine", "hazard", ravineX, rows * 0.5, -1, 4, "A continuous ravine divides the cavern and blocks direct movement."), tacticalFeature("underdark-highland", "highGround", cols * 0.18, rows * 0.48, yOf(3), 3, "The western highland overlooks the basin and both bridge approaches."));
  for (let index = 0; index < Math.round(7 + density * 20); index += 1) {
    const x = rng.float(cols * 0.56, cols * 0.86);
    const z = rng.float(rows * 0.58, rows * 0.88);
    scene.primitives.push(primitive(`underdark-fungus-${index}`, "cone", 0, x, yOf(0) + feetToMeters(rng.int(3, 8)), z, feetToMeters(rng.float(1, 2.4)), feetToMeters(rng.int(3, 8)), feetToMeters(rng.float(1, 2.4)), "moss", ["fungal-forest", "underdark", "cover"]));
  }
  for (let index = 0; index < Math.round(3 + density * 10); index += 1) {
    const x = rng.float(cols * 0.6, cols * 0.94);
    const z = rng.float(rows * 0.08, rows * 0.48);
    scene.primitives.push(primitive(`underdark-crystal-${index}`, "cone", 0, x, yOf(1) + feetToMeters(rng.int(2, 6)), z, feetToMeters(0.7), feetToMeters(rng.int(4, 10)), feetToMeters(0.7), "warmLight", ["crystal", "underdark", "landmark"]));
  }
  scene.description = `Underdark semantic grid: ${walkable} connected walkable cells, ${cliffSegments} vertical cliff segments, a bent ravine with two stone bridges, western highland, relic shelf, fungal basin, and alternate routes.`;
  scene.floorHeightFeet = [Math.ceil((yOf(levels - 1) + feetToMeters(12)) / 0.3048)];
}

function buildMountainHeightfield(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const tile = 2;
  const cols = Math.max(10, Math.floor(width / tile));
  const rows = Math.max(10, Math.floor(depth / tile));
  const terraces = rng.int(4, 7);
  const heights: Array<number | undefined> = [];
  const at = (column: number, row: number): number | undefined => (
    column < 0 || row < 0 || column >= cols || row >= rows ? undefined : heights[row * cols + column]
  );
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const edge = column === 0 || row === 0 || column === cols - 1 || row === rows - 1;
      const slope = Math.floor((row / Math.max(1, rows - 1)) * (terraces - 1));
      const hole = !edge && row > 2 && rng.bool(0.11 + (row / rows) * 0.08);
      heights.push(hole ? undefined : Math.max(0, Math.min(terraces - 1, slope + rng.int(-1, 1))));
    }
  }
  const routeCells: Array<{ column: number; row: number }> = [];
  for (let row = 1; row < rows - 1; row += Math.max(1, Math.floor(rows / 6))) {
    const preferred = Math.floor(cols * (0.42 + rng.float(-0.12, 0.12)));
    const column = [preferred, preferred - 1, preferred + 1, Math.floor(cols / 2)].find((candidate) => at(candidate, row) !== undefined);
    if (column !== undefined) routeCells.push({ column, row });
  }
  let previousHeight = 0;
  for (const cell of routeCells) {
    const index = cell.row * cols + cell.column;
    const current = Math.max(previousHeight, heights[index] ?? previousHeight);
    heights[index] = current;
    previousHeight = current;
  }
  if (routeCells.length > 1) {
    const finalCell = routeCells[routeCells.length - 1];
    if (finalCell) heights[finalCell.row * cols + finalCell.column] = terraces - 1;
  }
  const centerOf = (cell: { column: number; row: number }) => {
    const heightLevel = at(cell.column, cell.row) ?? 0;
    return {
      x: (cell.column + 0.5) * tile,
      z: (cell.row + 0.5) * tile,
      y: feetToMeters(heightLevel * 5) + FLOOR_SLAB_METERS,
    };
  };
  const roomIds: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const heightLevel = at(column, row);
      if (heightLevel === undefined) continue;
      const x = (column + 0.5) * tile;
      const z = (row + 0.5) * tile;
      const heightMeters = feetToMeters(heightLevel * 5) + FLOOR_SLAB_METERS;
      scene.primitives.push(box(`mountain-heightfield-${column}-${row}`, 0, x, 0, z, tile * 0.94, heightMeters, tile * 0.94, heightLevel >= terraces - 1 ? "moss" : "rock", ["floor", "terrain", "mountain-heightfield", heightLevel >= terraces - 1 ? "summit" : "slope"]));
      if (heightLevel > (at(column - 1, row) ?? heightLevel)) scene.tactical.push(tacticalFeature(`mountain-cliff-${column}-${row}`, "highGround", x - tile / 2, z, heightMeters, 1, "A stepped vertical face forms a defensible cliff edge."));
    }
  }
  for (let index = 1; index < routeCells.length; index += 1) {
    const fromCell = routeCells[index - 1];
    const toCell = routeCells[index];
    if (!fromCell || !toCell) continue;
    const from = centerOf(fromCell);
    const to = centerOf(toCell);
    if (to.y > from.y + 0.2) {
      const ramp = stairConnection(`mountain-heightfield-ramp-${index}`, 0, { xCells: from.x, zCells: from.z, yMeters: from.y }, { xCells: to.x, zCells: to.z, yMeters: to.y }, 1.8, "rock", ["natural-ramp", "mountain-pass"]);
      scene.primitives.push(ramp.primitive);
      scene.routes.push(stairRoute(`mountain-heightfield-route-${index}`, ramp));
    }
  }
  for (const [index, cell] of routeCells.slice(0, 4).entries()) {
    const center = centerOf(cell);
    const id = `mountain-region-${index}`;
    roomIds.push(id);
    scene.rooms.push(createRoom(id, index === routeCells.length - 1 ? "Summit combat shelf" : `Mountain region ${index + 1}`, index === routeCells.length - 1 ? "combat" : "natural", 0, center.x, center.z, 5, 5, center.y));
    const previous = roomIds[index - 1];
    if (previous) connectRooms(scene.rooms, previous, id);
  }
  const routePoints = routeCells.map(centerOf);
  if (routePoints.length > 1) scene.routes.push(createRoute("mountain-trail", "primary", routePoints));
  const start = routePoints[0] ?? { x: width / 2, z: 2, y: FLOOR_SLAB_METERS };
  const summit = routePoints.at(-1) ?? start;
  scene.tactical.push(tacticalFeature("mountain-entrance", "entrance", start.x, start.z, start.y, 2, "A narrow trail enters the broken heightfield."), tacticalFeature("mountain-summit", "highGround", summit.x, summit.z, summit.y, 3, "The summit dominates the lower fragmented terrain."));
  addCover(scene, rng, "mountain-heightfield", width * 0.28, depth * 0.54, feetToMeters(5), 8);
}

function buildMountainLegacy(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const terraces = rng.int(4, Math.min(6, Math.max(4, Math.floor(width / 6))));
  const rooms: string[] = [];
  let summitX = width / 2;
  let summitZ = depth - 3;
  let summitY = feetToMeters(15);
  let trailStartX = width / 2;
  let trailStartZ = 4;
  for (let index = 0; index < terraces; index += 1) {
    const levelY = feetToMeters(index * 5);
    const terraceW = Math.max(8, width - index * 4.5);
    const terraceD = Math.max(6, depth / terraces + 3);
    const x = width / 2 + rng.float(-2, 2);
    const z = 3 + terraceD / 2 + index * (depth / terraces - 1);
    const coreW = Math.max(5, terraceW * rng.float(0.46, 0.64));
    if (index === terraces - 1) {
      summitX = x;
      summitZ = z;
      summitY = levelY;
    }
    if (index === 0) {
      trailStartX = x;
      trailStartZ = z;
    }
    const id = `mountain-terrace-${index}`;
    rooms.push(id);
    scene.primitives.push(box(`${id}-core`, 0, x, levelY, z, coreW, FLOOR_SLAB_METERS, terraceD, index === terraces - 1 ? "moss" : "rock", ["floor", "terrain", "ledge", "platform", "mountain-core"]));
    const sideWidth = Math.max(2.2, (terraceW - coreW) * 0.44);
    for (const side of [-1, 1] as const) {
      const sideX = x + side * (coreW / 2 + sideWidth * 0.82 + rng.float(-1.4, 1.4));
      const sideZ = z + rng.float(-terraceD * 0.16, terraceD * 0.16);
      scene.primitives.push(box(`${id}-ledge-${side === -1 ? "west" : "east"}`, 0, sideX, levelY, sideZ, sideWidth, FLOOR_SLAB_METERS, terraceD * rng.float(0.52, 0.82), "rock", ["floor", "terrain", "ledge", "platform", "fragmented-plateau"]));
    }
    scene.rooms.push(createRoom(id, index === terraces - 1 ? "Summit shelf" : `Mountain terrace ${index + 1}`, index === terraces - 1 ? "combat" : "natural", 0, x, z, coreW, terraceD, levelY));
    if (index > 0) {
      const previousY = feetToMeters((index - 1) * 5) + FLOOR_SLAB_METERS;
      const bottom = { xCells: x - 3, zCells: z - depth / terraces * 0.5, yMeters: previousY };
      const top = { xCells: x - 3, zCells: z - depth / terraces * 0.15, yMeters: levelY + FLOOR_SLAB_METERS };
      const ramp = stairConnection(`${id}-ramp`, 0, bottom, top, 2, "rock", ["natural-ramp", "mountain-pass"]);
      scene.primitives.push(ramp.primitive);
      scene.routes.push(stairRoute(`${id}-ramp-route`, ramp));
      connectRooms(scene.rooms, rooms[index - 1] as string, id);
    }
    addCover(scene, rng, id, x + terraceW * 0.25, z, levelY, 2);
  }
  scene.routes.push(createRoute("mountain-trail", "primary", [{ x: trailStartX, z: trailStartZ, y: 0 }, { x: width / 2 - 3, z: depth * 0.2, y: feetToMeters(5) }, { x: summitX, z: summitZ, y: summitY }]));
  scene.tactical.push(tacticalFeature("mountain-entrance", "entrance", trailStartX, trailStartZ, 0, 2, "A switchback trail begins on the first fragmented terrace."), tacticalFeature("mountain-summit", "highGround", summitX, summitZ, summitY, 3, "The summit shelf dominates every lower approach."));
}

function buildMountain(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  buildMountainContinuous(scene, width, depth, density, rng);
}

/** Continuous macro-terrain grammar. Heights belong to regions, not isolated
 * cells: large shelves stay flat, boundaries become cliff faces, and voids are
 * carved as coherent cuts. This is the base grammar future outdoor themes can
 * reuse without hard-coding a complete map. */
function buildMountainContinuous(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const tile = 1;
  const cols = Math.max(24, Math.floor(width));
  const rows = Math.max(24, Math.floor(depth));
  const levels = rng.int(5, 7);
  const heights: Array<number | undefined> = [];
  const ridgeX = cols * rng.float(0.42, 0.58);
  const voidX = cols * rng.float(0.35, 0.62);
  const voidZ = rows * rng.float(0.42, 0.6);
  const cellAt = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x]);
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
      const basin = Math.abs(x - cols * 0.24) < cols * 0.2 && z > rows * 0.55;
      const upper = z < rows * 0.32 && Math.abs(x - ridgeX) < cols * 0.27;
      const shelf = z >= rows * 0.28 && z < rows * 0.62;
      const ravine = Math.abs(x - (voidX + Math.sin(z * 0.18) * 3.6)) < 2.3 && z > rows * 0.2 && z < rows * 0.88;
      const collapsed = Math.hypot((x - voidX) / (4.5 + density * 2), (z - voidZ) / (3.2 + density * 2)) < 1 && Math.sin(x * 0.7 + z * 0.33) > (-0.2 - density * 0.35);
      if (edge === 0 || ravine || collapsed) heights.push(undefined);
      else {
        const level = basin ? 0 : upper ? levels - 1 : shelf ? Math.max(2, levels - 3) : Math.max(1, Math.min(levels - 2, Math.floor((rows - z) / Math.max(1, rows / (levels - 1)))));
        heights.push(level);
      }
    }
  }
  const yOf = (level: number) => feetToMeters(level * 10) + FLOOR_SLAB_METERS;
  const routeCells: Array<{ x: number; z: number; level: number }> = [];
  const routeStep = Math.max(2, Math.floor(rows / (6 + Math.round(density * 5))));
  for (let z = rows - 3; z >= 2; z -= routeStep) {
    const desired = Math.round(cols * (0.2 + (rows - z) / rows * 0.58));
    const x = [desired, desired - 1, desired + 1, Math.round(ridgeX)].find((candidate) => cellAt(candidate, z) !== undefined);
    if (x !== undefined) routeCells.push({ x, z, level: cellAt(x, z) ?? 0 });
  }
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const level = cellAt(x, z);
      if (level === undefined) continue;
      const material = level === 0 ? "earth" : level >= levels - 1 ? "moss" : "rock";
      scene.primitives.push(box(`mountain-region-cell-${x}-${z}`, 0, x + 0.5, 0, z + 0.5, 0.96, yOf(level), 0.96, material, ["floor", "terrain", "semantic-grid", "macro-region", `elevation:${level}`]));
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const neighbour = cellAt(x + dx, z + dz);
        if (neighbour !== undefined && Math.abs(neighbour - level) >= 1) {
          scene.primitives.push(box(`mountain-cliff-face-${x}-${z}-${dx}-${dz}`, 0, x + 0.5 + dx * 0.49, yOf(Math.min(level, neighbour)) / 2, z + 0.5 + dz * 0.49, dx ? 0.14 : 0.96, Math.max(0.4, yOf(Math.max(level, neighbour)) - yOf(Math.min(level, neighbour))), dz ? 0.14 : 0.96, "darkStone", ["cliff-face", "vertical-face", "terrain"]));
        }
      }
    }
  }
  for (let index = 1; index < routeCells.length; index += 1) {
    const from = routeCells[index - 1];
    const to = routeCells[index];
    if (!from || !to) continue;
    if (to.level !== from.level) {
      const lower = from.level < to.level ? from : to;
      const upper = from.level < to.level ? to : from;
      const ramp = stairConnection(`mountain-switchback-${index}`, 0, { xCells: lower.x, zCells: lower.z, yMeters: yOf(lower.level) }, { xCells: upper.x, zCells: upper.z, yMeters: yOf(upper.level) }, 1.8, "rock", ["natural-ramp", "switchback", "semantic-grid"]);
      scene.primitives.push(ramp.primitive);
      scene.routes.push(stairRoute(`mountain-switchback-route-${index}`, ramp));
    }
  }
  if (routeCells.length > 1) scene.routes.push(createRoute("mountain-semantic-trail", "primary", routeCells.map((cell) => ({ x: cell.x + 0.5, z: cell.z + 0.5, y: yOf(cell.level) }))));
  const start = routeCells[0] ?? { x: 2, z: rows - 3, level: 0 };
  const summit = routeCells.at(-1) ?? { x: ridgeX, z: 2, level: levels - 1 };
  scene.rooms.push(createRoom("mountain-basin", "Lower basin", "natural", 0, cols * 0.22, rows * 0.72, cols * 0.3, rows * 0.32, yOf(0)), createRoom("mountain-middle-shelf", "Middle shelf", "natural", 0, cols * 0.55, rows * 0.45, cols * 0.4, rows * 0.22, yOf(Math.max(2, levels - 3))), createRoom("mountain-summit-shelf", "Summit high ground", "combat", 0, summit.x, summit.z, 9, 8, yOf(summit.level)));
  connectRooms(scene.rooms, "mountain-basin", "mountain-middle-shelf");
  connectRooms(scene.rooms, "mountain-middle-shelf", "mountain-summit-shelf");
  scene.tactical.push(tacticalFeature("mountain-basin-entrance", "entrance", start.x, start.z, yOf(start.level), 2, "A trail enters the lower basin before climbing through the shelf system."), tacticalFeature("mountain-collapse-zone", "hazard", voidX, voidZ, -1, 3, "A collapsed section opens into a vertical void and breaks the plateau."), tacticalFeature("mountain-summit-highground", "highGround", summit.x, summit.z, yOf(summit.level), 3, "The summit is a coherent high ground, not a random raised tile."));
  scene.description = `Mountain semantic grid with ${levels} elevation bands, continuous shelves, ${routeCells.length} route waypoints, a coherent ravine/collapse zone, and explicit vertical cliff faces.`;
  scene.floorHeightFeet = [Math.ceil((yOf(levels - 1) + feetToMeters(12)) / 0.3048)];
}

interface FieldRenderOptions {
  prefix: string;
  cols: number;
  rows: number;
  heights: readonly (number | undefined)[];
  materialFor(level: number, x: number, z: number): MaterialKey;
  tagsFor?(level: number, x: number, z: number): string[];
  stepFeet?: number;
  slopeFacades?: boolean;
  slopeMaterial?: MaterialKey;
  edgeSkirts?: boolean;
  edgeSkirtMaterial?: MaterialKey;
}

/** Shared terrain realization: morphology operators author an elevation field,
 * while this pass makes all walkable tops and vertical boundaries explicit. */
function renderMorphologyField(scene: GeneratedScene, options: FieldRenderOptions): { yOf(level: number): number; walkable: number; cliffs: number; slopes: number; skirts: number } {
  const { prefix, cols, rows, heights } = options;
  const at = (x: number, z: number) => x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x];
  const yOf = (level: number) => feetToMeters(level * (options.stepFeet ?? 5)) + FLOOR_SLAB_METERS;
  let walkable = 0;
  let cliffs = 0;
  type FacingEdge = { x: number; z: number; dx: number; dz: number; lowY: number; highY: number; rotation: number; material: MaterialKey };
  const slopeEdges: FacingEdge[] = [];
  const skirtEdges: FacingEdge[] = [];
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const level = at(x, z);
      if (level === undefined) continue;
      walkable += 1;
      scene.primitives.push(box(`${prefix}-cell-${x}-${z}`, 0, x + 0.5, 0, z + 0.5, 0.96, yOf(level), 0.96, options.materialFor(level, x, z), ["floor", "terrain", "semantic-grid", "morphology-field", `elevation:${level}`, ...(options.tagsFor?.(level, x, z) ?? [])]));
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const neighbour = at(x + dx, z + dz);
        if (neighbour === level) continue;
        const lowY = neighbour === undefined ? FLOOR_SLAB_METERS * 0.2 : yOf(Math.min(level, neighbour));
        const highY = yOf(neighbour === undefined ? level : Math.max(level, neighbour));
        if (highY - lowY < 0.3) continue;
        cliffs += 1;
        if (options.slopeFacades && neighbour !== undefined && Math.abs(level - neighbour) === 1) {
          const highIsCurrent = level > neighbour;
          const highDirectionX = highIsCurrent ? -dx : dx;
          const highDirectionZ = highIsCurrent ? -dz : dz;
          slopeEdges.push({
            x: x + 0.5 + dx * 0.5,
            z: z + 0.5 + dz * 0.5,
            dx,
            dz,
            lowY,
            highY,
            rotation: Math.atan2(highDirectionX, highDirectionZ),
            material: options.slopeMaterial ?? "rock",
          });
          continue;
        }
        scene.primitives.push(box(`${prefix}-cliff-${x}-${z}-${dx}-${dz}`, 0, x + 0.5 + dx * 0.49, lowY, z + 0.5 + dz * 0.49, dx ? 0.14 : 0.96, highY - lowY, dz ? 0.14 : 0.96, "darkStone", ["cliff-face", "vertical-face", "terrain", `${prefix}-boundary`]));
      }
      if (options.edgeSkirts) for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const perimeter = dx < 0 ? x <= 1 : dx > 0 ? x >= cols - 2 : dz < 0 ? z <= 1 : z >= rows - 2;
        if (!perimeter || at(x + dx, z + dz) !== undefined) continue;
        skirtEdges.push({
          x: x + 0.5 + dx * 1.325,
          z: z + 0.5 + dz * 1.325,
          dx: Math.abs(dx),
          dz: Math.abs(dz),
          lowY: 0,
          highY: yOf(level),
          rotation: Math.atan2(-dx, -dz),
          material: options.edgeSkirtMaterial ?? options.slopeMaterial ?? "rock",
        });
      }
    }
  }
  const emitMergedFacades = (edges: FacingEdge[], kind: "slope" | "skirt", runCells: number) => {
    let emitted = 0;
    const groups = new Map<string, FacingEdge[]>();
    for (const edge of edges) {
      const fixedCoordinate = edge.dx ? edge.x : edge.z;
      const key = `${edge.dx}:${edge.dz}:${fixedCoordinate.toFixed(3)}:${edge.lowY.toFixed(3)}:${edge.highY.toFixed(3)}:${edge.rotation.toFixed(3)}:${edge.material}`;
      const group = groups.get(key);
      if (group) group.push(edge); else groups.set(key, [edge]);
    }
    for (const group of groups.values()) {
      group.sort((left, right) => (left.dx ? left.z - right.z : left.x - right.x));
      let start = 0;
      const flush = (end: number) => {
        const run = group.slice(start, end);
        if (run.length === 0) return;
        const first = run[0]!; const last = run.at(-1)!;
        scene.primitives.push(ramp(
          `${prefix}-${kind}-run-${emitted}`,
          0,
          (first.x + last.x) / 2,
          first.lowY,
          (first.z + last.z) / 2,
          run.length * 0.98,
          first.highY - first.lowY,
          runCells,
          first.material,
          ["terrain", kind === "slope" ? "slope-facade" : "erosion-skirt", "erosion-facing", "non-walkable-facade", `merged-${kind}-run`, `${prefix}-boundary`],
          first.rotation,
        ));
        emitted += 1;
      };
      for (let index = 1; index <= group.length; index += 1) {
        const previous = group[index - 1]; const current = group[index];
        const gap = previous && current ? (previous.dx ? current.z - previous.z : current.x - previous.x) : Number.POSITIVE_INFINITY;
        if (gap <= 1.01) continue;
        flush(index);
        start = index;
      }
    }
    return emitted;
  };
  const slopes = emitMergedFacades(slopeEdges, "slope", 0.92);
  const skirts = emitMergedFacades(skirtEdges, "skirt", 1.65);
  return { yOf, walkable, cliffs, slopes, skirts };
}

function buildDryRiverbed(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(28, Math.floor(width));
  const rows = Math.max(24, Math.floor(depth));
  const phase = rng.float(-Math.PI, Math.PI);
  const channelAt = (x: number) => rows * 0.52 + Math.sin(x * 0.13 + phase) * rows * 0.1 + Math.sin(x * 0.035) * rows * 0.08;
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    const distance = Math.abs(z - channelAt(x));
    const sideCut = edge === 0 || (edge < 3 && Math.sin(x * 0.51 + z * 0.33) > 0.35);
    const erodedPocket = distance > 3.4 && distance < 6.5 && Math.sin(x * 0.37 + z * 0.21) > 0.82 - density * 0.12;
    if (sideCut || erodedPocket) heights.push(undefined);
    else heights.push(distance < 2.3 ? 0 : distance < 4.8 ? 1 : distance < 8 ? 2 : 3);
  }
  const rendered = renderMorphologyField(scene, {
    prefix: "dry-channel",
    cols,
    rows,
    heights,
    materialFor: (level) => level === 0 ? "earth" : level >= 3 ? "darkStone" : "rock",
    tagsFor: (level) => [level === 0 ? "dry-riverbed" : "eroded-bank", level === 1 ? "wash-margin" : "badland-shelf"],
    slopeFacades: true,
    slopeMaterial: "rock",
    edgeSkirts: true,
    edgeSkirtMaterial: "darkStone",
  });
  const crossingXs = [cols * 0.24, cols * 0.62, cols * 0.84];
  for (const [index, x] of crossingXs.entries()) {
    const z = channelAt(x);
    scene.primitives.push(corridor(`dry-channel-crossing-${index}`, 0, x, z - 4, x, z + 4, rendered.yOf(1), 1.8, "earth", ["dry-riverbed", "crossing", "semantic-grid"]));
  }
  const boulderCount = Math.round(7 + density * 15);
  for (let index = 0; index < boulderCount; index += 1) {
    const x = rng.float(3, cols - 3);
    const z = channelAt(x) + rng.float(-2.1, 2.1);
    const size = rng.float(0.8, 2.2);
    scene.primitives.push(primitive(`dry-channel-boulder-${index}`, "sphere", 0, x, rendered.yOf(0), z, size * CELL, feetToMeters(rng.float(2, 7)), size * CELL, "rock", ["dry-riverbed", "scoured-boulder", "cover"]));
  }
  scene.rooms.push(createRoom("dry-channel-upper-bank", "Eroded upper bank", "natural", 0, cols * 0.5, rows * 0.2, cols - 6, rows * 0.2, rendered.yOf(3)), createRoom("dry-channel-bed", "Scoured river bed", "combat", 0, cols * 0.5, rows * 0.52, cols - 5, 5, rendered.yOf(0)), createRoom("dry-channel-lower-bank", "Broken lower bank", "natural", 0, cols * 0.5, rows * 0.82, cols - 6, rows * 0.2, rendered.yOf(3)));
  connectRooms(scene.rooms, "dry-channel-upper-bank", "dry-channel-bed");
  connectRooms(scene.rooms, "dry-channel-bed", "dry-channel-lower-bank");
  scene.routes.push(createRoute("dry-channel-long-route", "primary", [{ x: 2, z: channelAt(2), y: rendered.yOf(0) }, { x: cols * 0.35, z: channelAt(cols * 0.35), y: rendered.yOf(0) }, { x: cols * 0.7, z: channelAt(cols * 0.7), y: rendered.yOf(0) }, { x: cols - 2, z: channelAt(cols - 2), y: rendered.yOf(0) }]), createRoute("dry-channel-bank-crossing", "alternate", [{ x: crossingXs[1] ?? cols / 2, z: 2, y: rendered.yOf(3) }, { x: crossingXs[1] ?? cols / 2, z: channelAt(crossingXs[1] ?? cols / 2), y: rendered.yOf(0) }, { x: crossingXs[1] ?? cols / 2, z: rows - 2, y: rendered.yOf(3) }]));
  scene.tactical.push(tacticalFeature("dry-channel-entrance", "entrance", 2, channelAt(2), rendered.yOf(0), 2, "The dry channel enters through a narrow upstream cut."), tacticalFeature("dry-channel-flash-flood", "hazard", cols * 0.5, channelAt(cols * 0.5), rendered.yOf(0), 3, "The exposed river bed is a fast route but becomes a flash-flood kill zone."), tacticalFeature("dry-channel-overlook", "highGround", cols * 0.62, rows * 0.2, rendered.yOf(3), 3, "An eroded bank overlooks two channel crossings."));
  scene.description = `Dry-channel morphology with ${rendered.walkable} walkable cells, ${rendered.cliffs} eroded boundaries (${rendered.slopes} slope facades, ${rendered.skirts} perimeter skirts), three crossings, scoured boulders, and a continuous low river bed.`;
}

function buildImpactCrater(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(30, Math.floor(width));
  const rows = Math.max(28, Math.floor(depth));
  const cx = cols * rng.float(0.44, 0.56);
  const cz = rows * rng.float(0.43, 0.55);
  const radius = Math.min(cols, rows) * rng.float(0.28, 0.35);
  const rayAngles = Array.from({ length: Math.round(4 + density * 4) }, (_, index) => (Math.PI * 2 * index) / Math.round(4 + density * 4) + rng.float(-0.2, 0.2));
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const dx = x - cx;
    const dz = z - cz;
    const angle = Math.atan2(dz, dx);
    const distance = Math.hypot(dx, dz);
    const warped = distance / (radius * (1 + Math.sin(angle * 5 + 0.4) * 0.08));
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    const angularDistance = Math.min(...rayAngles.map((ray) => Math.abs(Math.atan2(Math.sin(angle - ray), Math.cos(angle - ray)))));
    const fracture = angularDistance < 0.035 + density * 0.016 && warped > 0.28 && warped < 1.45 && Math.sin(distance * 0.8) > -0.35;
    const ejectaGap = warped > 1.05 && warped < 1.45 && Math.sin(x * 0.37 + z * 0.23) > 0.93;
    if (edge === 0 || fracture || ejectaGap) heights.push(undefined);
    else if (warped < 0.2) heights.push(0);
    else if (warped < 0.48) heights.push(1);
    else if (warped < 0.68) heights.push(3);
    else if (warped < 0.92) heights.push(6);
    else if (warped < 1.14) heights.push(4);
    else heights.push(Math.max(1, 4 - Math.floor((warped - 1.1) * 5)));
  }
  const rimPoint = (angle: number): { x: number; z: number; level: number } => {
    const targetX = cx + Math.cos(angle) * radius;
    const targetZ = cz + Math.sin(angle) * radius;
    let best: { x: number; z: number; level: number; score: number } | undefined;
    for (let z = Math.max(1, Math.floor(targetZ) - 4); z <= Math.min(rows - 2, Math.ceil(targetZ) + 4); z += 1) {
      for (let x = Math.max(1, Math.floor(targetX) - 4); x <= Math.min(cols - 2, Math.ceil(targetX) + 4); x += 1) {
        const level = heights[z * cols + x];
        if (level === undefined) continue;
        const radialError = Math.abs(Math.hypot(x - cx, z - cz) - radius);
        const targetError = Math.hypot(x - targetX, z - targetZ);
        const score = radialError + targetError * 0.35 - level * 0.45;
        if (!best || score < best.score) best = { x, z, level, score };
      }
    }
    return best ?? { x: Math.round(targetX), z: Math.round(targetZ), level: 4 };
  };
  const rendered = renderMorphologyField(scene, {
    prefix: "impact",
    cols,
    rows,
    heights,
    materialFor: (level, x, z) => Math.hypot(x - cx, z - cz) < radius * 0.24 ? "metal" : level >= 5 ? "darkStone" : level <= 1 ? "earth" : "rock",
    tagsFor: (level, x, z) => ["impact-crater", level >= 5 ? "crater-rim" : Math.hypot(x - cx, z - cz) < radius * 0.48 ? "crater-basin" : "ejecta-field", level >= 5 ? "impact-rim" : "impact-basin"],
  });
  reserveRadialTerrain(
    scene,
    "impact-core-unstable-reservation",
    "unstable",
    cx,
    cz,
    radius * 0.58,
    1.2,
    "The meteor core and shattered inner basin are unstable ground reserved for the encounter objective rather than ordinary foundations.",
  );
  scene.primitives.push(
    primitive("impact-meteor-core", "sphere", 0, cx, rendered.yOf(0), cz, feetToMeters(9), feetToMeters(7), feetToMeters(9), "metal", ["meteor-core", "impact-landmark", "cover"]),
    corridor("impact-rim-breach", 0, cx - radius * 1.1, cz + radius * 0.2, cx - radius * 0.42, cz + radius * 0.08, rendered.yOf(3), 2.2, "rock", ["impact-route", "rim-breach", "semantic-grid"]),
  );
  for (let index = 0; index < Math.round(8 + density * 18); index += 1) {
    const angle = rng.float(0, Math.PI * 2);
    const distance = radius * rng.float(0.95, 1.5);
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance;
    scene.primitives.push(primitive(`impact-ejecta-${index}`, index % 3 === 0 ? "cone" : "sphere", 0, x, rendered.yOf(2), z, feetToMeters(rng.float(2, 6)), feetToMeters(rng.float(2, 8)), feetToMeters(rng.float(2, 6)), index % 5 === 0 ? "metal" : "rock", ["ejecta", "cover", "impact-crater"]));
  }
  for (const [index, angle] of rayAngles.entries()) {
    const inner = radius * 0.34; const outer = radius * 1.25;
    const fromX = cx + Math.cos(angle) * inner;
    const fromZ = cz + Math.sin(angle) * inner;
    const toX = cx + Math.cos(angle) * outer;
    const toZ = cz + Math.sin(angle) * outer;
    const fractureWidth = 0.45 + density * 0.35;
    scene.primitives.push(corridor(`impact-radial-fracture-marker-${index}`, 0, fromX, fromZ, toX, toZ, rendered.yOf(0) + 0.03, fractureWidth, "darkStone", ["impact-crater", "radial-fracture", "hazard", "morphology-operator"]));
    reserveLinearTerrain(scene, `impact-radial-fracture-reservation-${index}`, "unstable", fromX, fromZ, toX, toZ, fractureWidth, 0.7, "A radial impact fracture owns its collapse seam and foundation setback.");
  }
  scene.rooms.push(createRoom("impact-approach", "Ejecta approach", "natural", 0, cols * 0.16, rows * 0.72, cols * 0.24, rows * 0.28, rendered.yOf(2)), createRoom("impact-rim", "Broken impact rim", "combat", 0, cx, cz, radius * 2, radius * 2, rendered.yOf(6)), createRoom("impact-basin", "Crater basin", "natural", 0, cx, cz, radius * 0.9, radius * 0.9, rendered.yOf(1)), createRoom("impact-core", "Meteor core", "combat", 0, cx, cz, radius * 0.35, radius * 0.35, rendered.yOf(0)));
  connectRooms(scene.rooms, "impact-approach", "impact-rim");
  connectRooms(scene.rooms, "impact-rim", "impact-basin");
  connectRooms(scene.rooms, "impact-basin", "impact-core");
  const westRim = rimPoint(Math.PI);
  const northRim = rimPoint(-Math.PI / 2);
  const eastRim = rimPoint(0);
  scene.routes.push(createRoute("impact-descent", "primary", [{ x: 2, z: rows * 0.72, y: rendered.yOf(2) }, { x: cx - radius * 0.9, z: cz + radius * 0.25, y: rendered.yOf(5) }, { x: cx - radius * 0.42, z: cz + radius * 0.08, y: rendered.yOf(2) }, { x: cx, z: cz, y: rendered.yOf(0) }]), createRoute("impact-rim-route", "alternate", [westRim, northRim, eastRim].map((point) => ({ x: point.x + 0.5, z: point.z + 0.5, y: rendered.yOf(point.level) }))));
  scene.tactical.push(tacticalFeature("impact-entrance", "entrance", 2, rows * 0.72, rendered.yOf(2), 2, "The approach crosses unstable ejecta toward a breached rim."), tacticalFeature("impact-rim-highground", "highGround", northRim.x + 0.5, northRim.z + 0.5, rendered.yOf(northRim.level), 4, "The impact rim overlooks the basin and radial fractures."), tacticalFeature("impact-core-hazard", "hazard", cx, cz, rendered.yOf(0), 3, "The meteor core is the encounter objective and an unknown environmental hazard."));
  scene.description = `Impact-crater program with warped rim, sunken basin, ${rayAngles.length} radial fracture systems, ejecta cover, breached descent, and a central meteor objective.`;
  scene.floorHeightFeet = [44];
}

function addFloatingIslandsOverlay(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const islands = [
    { id: "low", x: width * 0.22, z: depth * 0.28, y: feetToMeters(10), w: 8, d: 7 },
    { id: "mid", x: width * 0.72, z: depth * 0.42, y: feetToMeters(22), w: 10, d: 8 },
    { id: "high", x: width * 0.48, z: depth * 0.76, y: feetToMeters(36), w: 7, d: 6 },
  ];
  for (const [index, island] of islands.entries()) {
    const x = island.x + rng.float(-1.2, 1.2);
    scene.primitives.push(box(`impact-floating-${island.id}-surface`, 0, x, island.y, island.z, island.w, FLOOR_SLAB_METERS, island.d, "darkStone", ["floor", "terrain", "floating-island", "secondary-structure"]), box(`impact-floating-${island.id}-underside`, 0, x, island.y - feetToMeters(5), island.z, island.w * 0.72, feetToMeters(10), island.d * 0.72, "rock", ["vertical-face", "floating-island", "secondary-structure"]));
    scene.rooms.push(createRoom(`impact-floating-${island.id}-room`, `${index + 1}F floating ejecta shelf`, "combat", 0, x, island.z, island.w, island.d, island.y));
    scene.tactical.push(tacticalFeature(`impact-floating-${island.id}-highground`, "highGround", x, island.z, island.y, 3, `A broken floating ejecta shelf hangs ${Math.round(island.y / 0.3048)} ft above the crater floor.`));
  }
  for (let index = 0; index < islands.length - 1; index += 1) {
    const lower = islands[index];
    const upper = islands[index + 1];
    if (!lower || !upper) continue;
    const stair = stairConnection(`impact-floating-route-${index}`, 0, { xCells: lower.x, zCells: lower.z, yMeters: lower.y + FLOOR_SLAB_METERS }, { xCells: upper.x, zCells: upper.z, yMeters: upper.y + FLOOR_SLAB_METERS }, 1.2, "wood", ["vertical-route", "vertical-opening", "floating-island", "secondary-structure"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`impact-floating-route-${index}`, stair));
  }
}

function buildVolcanic(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(30, Math.floor(width));
  const rows = Math.max(28, Math.floor(depth));
  const cx = cols * rng.float(0.43, 0.57);
  const cz = rows * rng.float(0.42, 0.54);
  const radius = Math.min(cols, rows) * rng.float(0.3, 0.36);
  const outletAngle = rng.float(-0.45, 0.45);
  const lavaBranchCount = 2 + Math.round(density * 3);
  const lavaAngles = Array.from({ length: lavaBranchCount }, (_, index) => outletAngle + (index - (lavaBranchCount - 1) / 2) * rng.float(0.32, 0.55));
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const dx = x - cx;
    const dz = z - cz;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const warped = distance / (radius * (1 + Math.sin(angle * 3 + 0.8) * 0.1 + Math.sin(angle * 5) * 0.05));
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    const outlet = Math.abs(angle - outletAngle) < 0.12 + density * 0.04 && dx > 0 && warped < 1.45;
    const lavaBranch = lavaAngles.some((branchAngle) => Math.abs(Math.atan2(Math.sin(angle - branchAngle), Math.cos(angle - branchAngle))) < 0.045 + density * 0.026) && warped > 0.14 && warped < 1.38;
    const brokenRim = warped > 0.72 && warped < 1.06 && Math.sin(x * 0.43 + z * 0.29) > 0.94 - density * 0.08;
    if (edge === 0 || warped < 0.2 || outlet || lavaBranch || brokenRim) heights.push(undefined);
    else if (warped < 0.36) heights.push(1);
    else if (warped < 0.58) heights.push(6);
    else if (warped < 0.8) heights.push(5);
    else if (warped < 1.05) heights.push(4);
    else heights.push(Math.max(1, 4 - Math.floor((warped - 1) * 4)));
  }
  const rendered = renderMorphologyField(scene, {
    prefix: "volcanic",
    cols,
    rows,
    heights,
    materialFor: (level, x, z) => Math.hypot(x - cx, z - cz) < radius * 0.38 ? "hazard" : level >= 5 ? "darkStone" : "rock",
    tagsFor: (level) => ["caldera", "volcanic", level >= 5 ? "caldera-rim" : level <= 1 ? "crater-floor" : "volcanic-slope"],
    stepFeet: 5,
  });
  const levelAt = (x: number, z: number) => heights[Math.max(0, Math.min(rows - 1, Math.round(z))) * cols + Math.max(0, Math.min(cols - 1, Math.round(x)))] ?? 0;
  const outletFromX = cx + radius * 0.15;
  const outletFromZ = cz;
  const outletToX = cols - 1;
  const outletToZ = cz + Math.tan(outletAngle) * (cols - cx);
  const outletWidth = 2.8 + density * 2.2;
  scene.primitives.push(
    primitive("volcanic-crater-lava", "cylinder", 0, cx, -0.35, cz, radius * 0.32 * CELL, 0.45, radius * 0.32 * CELL, "hazard", ["lava", "crater", "hazard", "morphology-operator"]),
    corridor("volcanic-lava-outlet", 0, outletFromX, outletFromZ, outletToX, outletToZ, -0.28, outletWidth, "hazard", ["lava", "lava-flow", "hazard", "morphology-operator"]),
    corridor("volcanic-basalt-bridge", 0, cx + radius * 0.54, cz - 3.5, cx + radius * 0.54, cz + 3.5, rendered.yOf(5), 1.8, "darkStone", ["bridge", "basalt-bridge", "semantic-grid"]),
  );
  reserveRadialTerrain(scene, "volcanic-crater-lava-reservation", "lava", cx, cz, radius * 0.32, 1.2, "The active crater lake owns its heat and collapse zone.");
  reserveLinearTerrain(scene, "volcanic-lava-outlet-reservation", "lava", outletFromX, outletFromZ, outletToX, outletToZ, outletWidth, 1.1, "The main lava outlet is a no-foundation hazard except at authored basalt crossings.");
  for (let index = 0; index < lavaBranchCount; index += 1) {
    const angle = lavaAngles[index]!;
    const inner = radius * rng.float(0.12, 0.24); const outer = radius * rng.float(1.05, 1.45);
    const branchFromX = cx + Math.cos(angle) * inner;
    const branchFromZ = cz + Math.sin(angle) * inner;
    const branchToX = cx + Math.cos(angle) * outer;
    const branchToZ = cz + Math.sin(angle) * outer;
    const branchWidth = 1.6 + density * 1.8;
    scene.primitives.push(corridor(`volcanic-lava-branch-${index}`, 0, branchFromX, branchFromZ, branchToX, branchToZ, -0.24, branchWidth, "hazard", ["lava", "lava-flow", "lava-branch", "hazard", "morphology-operator"]));
    reserveLinearTerrain(scene, `volcanic-lava-branch-reservation-${index}`, "lava", branchFromX, branchFromZ, branchToX, branchToZ, branchWidth, 0.85, "Branching lava owns this dangerous channel and thermal setback.");
  }
  const obsidianRidges = 2 + Math.round(density * 4);
  for (let index = 0; index < obsidianRidges; index += 1) {
    const angle = outletAngle + Math.PI * (0.55 + index / Math.max(1, obsidianRidges - 1) * 0.9) + rng.float(-0.18, 0.18);
    const distance = radius * rng.float(0.72, 1.18); const x = cx + Math.cos(angle) * distance; const z = cz + Math.sin(angle) * distance;
    scene.primitives.push(box(`volcanic-obsidian-ridge-${index}`, 0, x, rendered.yOf(levelAt(x, z)), z, rng.float(1.1, 2.2), feetToMeters(rng.float(6, 14)), rng.float(4, 8), "darkStone", ["volcanic", "obsidian-ridge", "cover", "vertical-face", "supported"], angle));
  }
  const basaltPlatforms = 2 + Math.round(density * 2);
  for (let index = 0; index < basaltPlatforms; index += 1) {
    const angle = outletAngle + Math.PI * (0.85 + index * 0.38); const distance = radius * rng.float(0.48, 0.72); const x = cx + Math.cos(angle) * distance; const z = cz + Math.sin(angle) * distance; const y = rendered.yOf(levelAt(x, z));
    scene.primitives.push(cylinder(`volcanic-basalt-platform-${index}`, 0, x, y, z, rng.float(2.4, 3.8), feetToMeters(rng.float(2, 5)), "darkStone", ["volcanic", "basalt-platform", "platform", "high-ground", "standable"]));
    scene.tactical.push(tacticalFeature(`volcanic-platform-highground-${index}`, "highGround", x, z, y, 2, "A basalt shelf provides a reachable firing position above branching lava."));
  }
  const fumaroles = Math.round(5 + density * 12);
  for (let index = 0; index < fumaroles; index += 1) {
    const angle = rng.float(0, Math.PI * 2);
    const distance = radius * rng.float(0.55, 1.18);
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance;
    scene.primitives.push(primitive(`volcanic-fumarole-${index}`, "cone", 0, x, rendered.yOf(3), z, feetToMeters(rng.float(1, 2.5)), feetToMeters(rng.float(3, 9)), feetToMeters(rng.float(1, 2.5)), index % 3 === 0 ? "warmLight" : "darkStone", ["fumarole", "volcanic", "cover"]));
  }
  scene.rooms.push(createRoom("volcanic-outer-slope", "Ashen outer slope", "natural", 0, cols * 0.2, rows * 0.68, cols * 0.28, rows * 0.3, rendered.yOf(2)), createRoom("volcanic-rim", "Broken caldera rim", "combat", 0, cx, cz, radius * 2, radius * 2, rendered.yOf(5)), createRoom("volcanic-crater", "Lava crater", "natural", 0, cx, cz, radius * 0.5, radius * 0.5, rendered.yOf(1)));
  connectRooms(scene.rooms, "volcanic-outer-slope", "volcanic-rim");
  connectRooms(scene.rooms, "volcanic-rim", "volcanic-crater");
  scene.routes.push(createRoute("volcanic-switchback", "primary", [{ x: 2, z: rows * 0.72, y: rendered.yOf(1) }, { x: cols * 0.28, z: rows * 0.64, y: rendered.yOf(3) }, { x: cx - radius * 0.65, z: cz + radius * 0.35, y: rendered.yOf(5) }, { x: cx + radius * 0.54, z: cz, y: rendered.yOf(5) }]), createRoute("volcanic-rim-escape", "alternate", [{ x: cx - radius * 0.65, z: cz + radius * 0.35, y: rendered.yOf(5) }, { x: cx, z: cz - radius * 0.7, y: rendered.yOf(6) }, { x: cx + radius * 0.62, z: cz - radius * 0.2, y: rendered.yOf(5) }]));
  scene.tactical.push(tacticalFeature("volcanic-entrance", "entrance", 2, rows * 0.72, rendered.yOf(1), 2, "An ash-choked switchback climbs toward the caldera."), tacticalFeature("volcanic-crater-hazard", "hazard", cx, cz, -0.2, Math.ceil(radius * 0.25), "The crater and its lava outlet divide the battlefield."), tacticalFeature("volcanic-rim-highground", "highGround", cx - radius * 0.55, cz, rendered.yOf(6), 4, "The irregular caldera rim dominates the crater floor and basalt crossing."));
  scene.description = `Volcanic grammar with an irregular broken caldera, ${rendered.cliffs} exposed faces, ${lavaBranchCount} lava branches, ${obsidianRidges} obsidian ridges, ${basaltPlatforms} tactical basalt shelves, fumaroles, and a rim combat route.`;
  scene.floorHeightFeet = [48];
}

function buildInfernalWaste(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  buildDryRiverbed(scene, width, depth, density, rng.fork("infernal-base"));
  const riverZ = depth * rng.float(0.42, 0.58);
  const fissureFromX = width * 0.18;
  const fissureFromZ = riverZ;
  const fissureToX = width * 0.86;
  const fissureToZ = riverZ + rng.float(-5, 5);
  const fissureWidth = 3.4;
  scene.primitives.push(
    corridor("infernal-war-road", 0, 2, depth * 0.24, width - 2, depth * 0.31, feetToMeters(12), 3.2, "metal", ["infernal-war-road", "high-ground", "scene-program"]),
    corridor("infernal-lava-fissure", 0, fissureFromX, fissureFromZ, fissureToX, fissureToZ, -0.25, fissureWidth, "hazard", ["lava", "lava-flow", "infernal", "hazard"]),
  );
  reserveLinearTerrain(scene, "infernal-lava-fissure-reservation", "lava", fissureFromX, fissureFromZ, fissureToX, fissureToZ, fissureWidth, 1.1, "The infernal lava fissure owns its thermal setback below the elevated war road.");
  const wreckCount = Math.round(7 + density * 17);
  for (let index = 0; index < wreckCount; index += 1) {
    const x = rng.float(width * 0.15, width * 0.85);
    const z = rng.float(depth * 0.5, depth * 0.86);
    scene.primitives.push(box(`infernal-wreck-${index}`, 0, x, FLOOR_SLAB_METERS, z, rng.float(1.5, 4.2), feetToMeters(rng.int(3, 8)), rng.float(1.2, 3.5), index % 4 === 0 ? "hazard" : "metal", ["wreck-field", "infernal", "cover", "blocks-sight"]));
  }
  scene.routes.push(createRoute("infernal-war-road-route", "alternate", [{ x: 2, z: depth * 0.24, y: feetToMeters(12) }, { x: width * 0.5, z: depth * 0.27, y: feetToMeters(12) }, { x: width - 2, z: depth * 0.31, y: feetToMeters(12) }]));
  scene.tactical.push(tacticalFeature("infernal-road-highground", "highGround", width * 0.5, depth * 0.27, feetToMeters(12), 3, "The iron war road crosses the waste above wreck cover and lava fissures."));
  scene.description = `Infernal-waste composition with eroded ash terrain, an elevated war road, lava fissure, ${wreckCount} war-machine wrecks, crossings, and flanking channels.`;
}

function buildFloatingIslands(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const layoutRng = rng.fork("island-layout");
  const islands = [
    {
      id: "lower",
      x: width * layoutRng.float(0.2, 0.3),
      z: depth * layoutRng.float(0.62, 0.74),
      y: feetToMeters(layoutRng.int(26, 30)),
      w: width * layoutRng.float(0.32, 0.4),
      d: depth * layoutRng.float(0.26, 0.34),
    },
    {
      id: "middle",
      x: width * layoutRng.float(0.5, 0.66),
      z: depth * layoutRng.float(0.4, 0.55),
      y: feetToMeters(layoutRng.int(50, 58)),
      w: width * layoutRng.float(0.3, 0.38),
      d: depth * layoutRng.float(0.24, 0.32),
    },
    {
      id: "upper",
      x: width * layoutRng.float(0.3, 0.46),
      z: depth * layoutRng.float(0.14, 0.27),
      y: feetToMeters(layoutRng.int(76, 88)),
      w: width * layoutRng.float(0.26, 0.34),
      d: depth * layoutRng.float(0.21, 0.28),
    },
  ];
  for (const [level, island] of islands.entries()) {
    const cols = Math.max(8, Math.floor(island.w));
    const rows = Math.max(7, Math.floor(island.d));
    const mask = Array.from({ length: cols * rows }, () => false);
    const phase = rng.float(-Math.PI, Math.PI);
    for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
      const nx = (x - cols / 2) / (cols / 2);
      const nz = (z - rows / 2) / (rows / 2);
      const present = Math.hypot(nx, nz * 1.08) < 0.92 + Math.sin(x * 0.8 + z * 0.31 + level) * 0.08 && !(Math.sin(x * 1.7 + z * 0.43 + level * 2) > 0.88 && (x + z) % 3 === 0);
      mask[z * cols + x] = present;
    }
    const underbellyCount = 3 + Math.round(density * 2);
    for (let massIndex = 0; massIndex < underbellyCount; massIndex += 1) {
      const angle = phase + (Math.PI * 2 * massIndex) / underbellyCount + rng.float(-0.28, 0.28);
      const distance = massIndex === 0 ? 0 : rng.float(0.06, 0.19);
      const massWidthCells = island.w * rng.float(0.32, 0.52);
      const massDepthCells = island.d * rng.float(0.34, 0.56);
      const massHeight = Math.min(
        feetToMeters(rng.float(13, 24) + (massIndex === 0 ? 7 : 0)),
        Math.max(feetToMeters(10), island.y - feetToMeters(3)),
      );
      scene.primitives.push(primitive(
        `floating-${island.id}-underbelly-mass-${massIndex}`,
        "sphere",
        level,
        island.x + Math.cos(angle) * island.w * distance,
        island.y - massHeight,
        island.z + Math.sin(angle) * island.d * distance,
        massWidthCells * CELL,
        massHeight,
        massDepthCells * CELL,
        massIndex % 2 === 0 ? "rock" : "darkStone",
        ["floating-island", "island-underbelly-mass", "island-core", "erosion-mass", `island:${island.id}`],
      ));
    }
    const isPresent = (x: number, z: number) => x >= 0 && z >= 0 && x < cols && z < rows && mask[z * cols + x] === true;
    for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
      if (!isPresent(x, z)) continue;
      const nx = (x - cols / 2) / (cols / 2);
      const nz = (z - rows / 2) / (rows / 2);
      const px = island.x + x - cols / 2;
      const pz = island.z + z - rows / 2;
      const radial = Math.min(1, Math.hypot(nx, nz * 1.08));
      const edgeCell = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !isPresent(x + dx!, z + dz!));
      const thicknessFeet = Math.max(4.5, 5.5 + (1 - radial) * (5 + density * 3) + Math.sin(x * 0.53 + z * 0.41 + phase) * 1.5);
      const thickness = feetToMeters(thicknessFeet);
      scene.primitives.push(box(`floating-${island.id}-surface-${x}-${z}`, level, px, island.y, pz, 1.02, FLOOR_SLAB_METERS, 1.02, level === 0 ? "rock" : "darkStone", ["floor", "terrain", "floating-island", `island:${island.id}`]));
      scene.primitives.push(box(
        `floating-${island.id}-underside-${x}-${z}`,
        level,
        px,
        island.y - thickness,
        pz,
        edgeCell ? 1.05 : 0.98,
        thickness,
        edgeCell ? 1.05 : 0.98,
        "rock",
        ["floating-island", "island-underside", edgeCell ? "vertical-face" : "island-core", edgeCell ? "cliff" : "mass", `island:${island.id}`],
      ));
      if (edgeCell && (x * 3 + z + level) % 5 === 0) {
        const spurHeight = feetToMeters(3 + ((x + z + level) % 4));
        scene.primitives.push(box(
          `floating-${island.id}-hanging-spur-${x}-${z}`,
          level,
          px,
          island.y - thickness - spurHeight,
          pz,
          0.52,
          spurHeight,
          0.52,
          "darkStone",
          ["floating-island", "hanging-rock", "vertical-silhouette", `island:${island.id}`],
        ));
      }
    }
    scene.rooms.push(createRoom(`floating-${island.id}-room`, `${level + 1}F ${island.id} island`, "combat", level, island.x, island.z, island.w * 0.62, island.d * 0.62, island.y));
    scene.tactical.push(tacticalFeature(`floating-${island.id}-highground`, "highGround", island.x, island.z, island.y, Math.ceil(Math.max(island.w, island.d) * 0.25), `${level + 1}层浮空岛屿是有真实垂直边界的战术高地。`));
  }
  for (let index = 0; index < islands.length - 1; index += 1) {
    const lower = islands[index];
    const upper = islands[index + 1];
    if (!lower || !upper) continue;
    const dx = upper.x - lower.x;
    const dz = upper.z - lower.z;
    const distance = Math.max(1, Math.hypot(dx, dz));
    const ux = dx / distance;
    const uz = dz / distance;
    const nx = -uz;
    const nz = ux;
    const bottom = {
      xCells: lower.x + ux * lower.w * 0.3,
      zCells: lower.z + uz * lower.d * 0.3,
      yMeters: lower.y + FLOOR_SLAB_METERS,
    };
    const top = {
      xCells: upper.x - ux * upper.w * 0.3,
      zCells: upper.z - uz * upper.d * 0.3,
      yMeters: upper.y + FLOOR_SLAB_METERS,
    };
    if (index === 1) {
      const liftX = (bottom.xCells + top.xCells) / 2;
      const liftZ = (bottom.zCells + top.zCells) / 2;
      const liftHeight = Math.max(feetToMeters(12), top.yMeters - bottom.yMeters);
      const platformY = bottom.yMeters + liftHeight * 0.42;
      const guideOffset = 0.82;
      scene.primitives.push(
        corridor("floating-chain-lift-lower-gangway", index, bottom.xCells, bottom.zCells, liftX, liftZ, bottom.yMeters, 1.7, "wood", ["chain-lift", "lift-gangway", "bridge", "standable", "supported", "floating-island"]),
        corridor("floating-chain-lift-upper-gangway", index + 1, liftX, liftZ, top.xCells, top.zCells, top.yMeters, 1.7, "wood", ["chain-lift", "lift-gangway", "bridge", "standable", "supported", "floating-island"]),
        box("floating-chain-lift-bottom-landing", index, liftX, bottom.yMeters, liftZ, 3.4, FLOOR_SLAB_METERS, 3.4, "wood", ["chain-lift", "bridge-landing", "standable", "supported", "floating-island"]),
        box("floating-chain-lift-platform", index, liftX, platformY, liftZ, 3, FLOOR_SLAB_METERS * 1.45, 3, "metal", ["floor", "platform", "chain-lift", "lift-platform", "shaft-access", "standable", "vertical-route", "vertical-opening", "floating-island"]),
        box("floating-chain-lift-top-landing", index + 1, liftX, top.yMeters, liftZ, 3.4, FLOOR_SLAB_METERS, 3.4, "wood", ["chain-lift", "bridge-landing", "standable", "supported", "floating-island"]),
        cylinder("floating-chain-lift-guide-north", index, liftX, bottom.yMeters, liftZ - guideOffset, 0.3, liftHeight + feetToMeters(12), "metal", ["chain-lift", "lift-guide", "shaft-access", "vertical-opening", "vertical-support", "floating-island"]),
        cylinder("floating-chain-lift-guide-south", index, liftX, bottom.yMeters, liftZ + guideOffset, 0.3, liftHeight + feetToMeters(12), "metal", ["chain-lift", "lift-guide", "shaft-access", "vertical-opening", "vertical-support", "floating-island"]),
        cylinder("floating-chain-lift-chain-west", index, liftX - guideOffset, bottom.yMeters, liftZ, 0.18, liftHeight + feetToMeters(10), "metal", ["chain-lift", "lift-chain", "vertical-support", "floating-island"]),
        cylinder("floating-chain-lift-chain-east", index, liftX + guideOffset, bottom.yMeters, liftZ, 0.18, liftHeight + feetToMeters(10), "metal", ["chain-lift", "lift-chain", "vertical-support", "floating-island"]),
        box("floating-chain-lift-windlass", index + 1, liftX, top.yMeters + feetToMeters(9), liftZ, 4.2, feetToMeters(2.2), 2.1, "metal", ["chain-lift", "windlass", "vertical-landmark", "floating-island"]),
      );
      scene.routes.push(createRoute("floating-chain-lift-route", "vertical", [
        { x: bottom.xCells, z: bottom.zCells, y: bottom.yMeters },
        { x: liftX, z: liftZ, y: bottom.yMeters },
        { x: liftX, z: liftZ, y: platformY },
        { x: liftX, z: liftZ, y: top.yMeters },
        { x: top.xCells, z: top.zCells, y: top.yMeters },
      ]));
      scene.tactical.push(tacticalFeature("floating-chain-lift-chokepoint", "chokepoint", liftX, liftZ, platformY, 2, "A chained lift cage is the only direct vertical route to the upper observation island."));
      continue;
    }
    const stair = stairConnection(`floating-vertical-${index}`, index, bottom, top, 1.6, "wood", ["vertical-route", "vertical-opening", "floating-island", "suspension-bridge", "supported"]);
    scene.primitives.push(
      stair.primitive,
      box(`floating-vertical-${index}-bottom-landing`, index, bottom.xCells, bottom.yMeters, bottom.zCells, 3.2, FLOOR_SLAB_METERS, 3.2, "wood", ["bridge-landing", "standable", "supported", "floating-island"]),
      box(`floating-vertical-${index}-top-landing`, index + 1, top.xCells, top.yMeters, top.zCells, 3.2, FLOOR_SLAB_METERS, 3.2, "wood", ["bridge-landing", "standable", "supported", "floating-island"]),
      cylinder(`floating-vertical-${index}-bottom-pylon-left`, index, bottom.xCells + nx * 1.15, bottom.yMeters, bottom.zCells + nz * 1.15, 0.34, feetToMeters(13), "metal", ["bridge-pylon", "suspension-bridge", "support"]),
      cylinder(`floating-vertical-${index}-bottom-pylon-right`, index, bottom.xCells - nx * 1.15, bottom.yMeters, bottom.zCells - nz * 1.15, 0.34, feetToMeters(13), "metal", ["bridge-pylon", "suspension-bridge", "support"]),
      cylinder(`floating-vertical-${index}-top-pylon-left`, index + 1, top.xCells + nx * 1.15, top.yMeters, top.zCells + nz * 1.15, 0.34, feetToMeters(13), "metal", ["bridge-pylon", "suspension-bridge", "support"]),
      cylinder(`floating-vertical-${index}-top-pylon-right`, index + 1, top.xCells - nx * 1.15, top.yMeters, top.zCells - nz * 1.15, 0.34, feetToMeters(13), "metal", ["bridge-pylon", "suspension-bridge", "support"]),
    );

    const cablePoints = Array.from({ length: 7 }, (_, pointIndex) => {
      const t = pointIndex / 6;
      const deckY = bottom.yMeters + (top.yMeters - bottom.yMeters) * t;
      const cableLift = feetToMeters(3.4 + Math.pow(Math.abs(t * 2 - 1), 1.65) * 9.6);
      return {
        t,
        x: bottom.xCells + (top.xCells - bottom.xCells) * t,
        z: bottom.zCells + (top.zCells - bottom.zCells) * t,
        deckY,
        cableY: deckY + cableLift,
      };
    });
    for (const side of [-1, 1]) {
      for (let segment = 1; segment < cablePoints.length; segment += 1) {
        const previous = cablePoints[segment - 1]!;
        const current = cablePoints[segment]!;
        scene.primitives.push(
          corridor(
            `floating-vertical-${index}-main-cable-${side < 0 ? "left" : "right"}-${segment}`,
            index,
            previous.x + nx * 0.98 * side,
            previous.z + nz * 0.98 * side,
            current.x + nx * 0.98 * side,
            current.z + nz * 0.98 * side,
            (previous.cableY + current.cableY) / 2,
            0.1,
            "metal",
            ["suspension-cable", "bridge-support", "floating-island", "non-walkable"],
          ),
          corridor(
            `floating-vertical-${index}-guardrail-${side < 0 ? "left" : "right"}-${segment}`,
            index,
            previous.x + nx * 0.9 * side,
            previous.z + nz * 0.9 * side,
            current.x + nx * 0.9 * side,
            current.z + nz * 0.9 * side,
            (previous.deckY + current.deckY) / 2 + feetToMeters(3),
            0.12,
            "metal",
            ["bridge-guardrail", "suspension-bridge", "non-walkable"],
          ),
        );
      }
    }
    for (let support = 1; support < cablePoints.length - 1; support += 1) {
      const point = cablePoints[support]!;
      const hangerBottom = point.deckY + feetToMeters(2.2);
      const chainHeight = Math.max(feetToMeters(1.2), point.cableY - hangerBottom);
      scene.primitives.push(
        cylinder(`floating-vertical-${index}-chain-left-${support}`, index, point.x + nx * 0.92, hangerBottom, point.z + nz * 0.92, 0.16, chainHeight, "metal", ["suspension-chain", "bridge-support", "floating-island"]),
        cylinder(`floating-vertical-${index}-chain-right-${support}`, index, point.x - nx * 0.92, hangerBottom, point.z - nz * 0.92, 0.16, chainHeight, "metal", ["suspension-chain", "bridge-support", "floating-island"]),
      );
    }
    scene.routes.push(stairRoute(`floating-vertical-route-${index}`, stair));
  }
  connectRooms(scene.rooms, "floating-lower-room", "floating-middle-room");
  connectRooms(scene.rooms, "floating-middle-room", "floating-upper-room");
  scene.routes.push(createRoute("floating-crosswind-route", "primary", islands.map((island) => ({ x: island.x, z: island.z, y: island.y }))));
  const lower = islands[0];
  const middle = islands[1];
  if (lower && middle) {
    scene.primitives.push(
      corridor("floating-war-road", 0, lower.x - lower.w * 0.25, lower.z, lower.x + lower.w * 0.25, lower.z + 1.5, lower.y + 0.04, 2.2, "metal", ["infernal-war-road", "floating-island", "combat-route"]),
      corridor("floating-lava-fissure", 1, middle.x - middle.w * 0.28, middle.z - 2, middle.x + middle.w * 0.28, middle.z + 2, middle.y + 0.03, 1.8, "hazard", ["lava", "lava-flow", "floating-island", "hazard"]),
    );
    for (let index = 0; index < Math.round(5 + density * 5); index += 1) {
      const x = lower.x + rng.float(-lower.w * 0.28, lower.w * 0.28);
      const z = lower.z + rng.float(-lower.d * 0.24, lower.d * 0.24);
      scene.primitives.push(box(`floating-war-wreck-${index}`, 0, x, lower.y + FLOOR_SLAB_METERS, z, rng.float(1.2, 2.4), feetToMeters(rng.int(3, 7)), rng.float(1, 2.2), "metal", ["wreck-field", "war-machine", "cover", "floating-island"]));
    }
  }
  scene.tactical.push(tacticalFeature("floating-entry", "entrance", islands[0]?.x ?? 1, islands[0]?.z ?? depth - 2, islands[0]?.y ?? 0, 2, "A chained landing reaches the lowest island."));
  scene.tactical.push(tacticalFeature("floating-void-hazard", "hazard", width * 0.5, depth * 0.5, feetToMeters(8), 6, "岛屿之间是可见的垂直深渊；失足会坠落。"));
  scene.viewProgram = {
    version: 1,
    mode: "scene",
    focusCells: {
      x: islands.reduce((total, island) => total + island.x, 0) / islands.length,
      z: islands.reduce((total, island) => total + island.z, 0) / islands.length,
    },
    radiusCells: Math.max(25, Math.min(30, width * 0.33)),
    includeTags: ["floating-island", "island-underside", "suspension-bridge", "bridge-pylon", "suspension-cable"],
    reason: "Frame all three suspended island masses while keeping their exposed undersides and supported crossings readable from low angles.",
  };
  scene.description = `Three-tier floating-island battlefield with broken footprints, exposed vertical undersides, void gaps, and two vertical routes.`;
  scene.floors = 3;
  scene.floorHeightFeet = [28, 26, 28];
}

function buildBurialGround(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(26, Math.floor(width));
  const rows = Math.max(24, Math.floor(depth));
  const pathX = cols * rng.float(0.42, 0.58);
  const cryptX = cols * rng.float(0.65, 0.78);
  const cryptZ = rows * rng.float(0.58, 0.74);
  const moundCenters = Array.from({ length: Math.round(6 + density * 7) }, () => ({
    x: rng.float(4, cols - 4),
    z: rng.float(4, rows - 4),
    rx: rng.float(2.4, 5.8),
    rz: rng.float(2, 4.6),
  }));
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    const onPath = Math.abs(x - (pathX + Math.sin(z * 0.18) * 1.4)) < 1.7 || Math.abs(z - rows * 0.42) < 1.4;
    const cryptSink = Math.hypot((x - cryptX) / 4.2, (z - cryptZ) / 3.4);
    const brokenBoundary = edge === 0 && Math.sin(x * 0.5 + z * 0.4) > 0.15;
    const moundDistance = Math.min(...moundCenters.map((mound) => Math.hypot((x - mound.x) / mound.rx, (z - mound.z) / mound.rz)));
    if (brokenBoundary || cryptSink < 0.48) heights.push(undefined);
    else if (onPath) heights.push(0);
    else heights.push(moundDistance < 0.38 ? 2 : moundDistance < 0.92 ? 1 : 0);
  }
  const rendered = renderMorphologyField(scene, {
    prefix: "burial",
    cols,
    rows,
    heights,
    materialFor: () => "earth",
    tagsFor: (level) => [level >= 1 ? "burial-mound" : "cemetery-ground"],
  });
  scene.primitives.push(corridor("burial-processional-path", 0, pathX, 1, pathX, rows - 2, rendered.yOf(0), 2.4, "stone", ["cemetery-path", "semantic-grid"]), corridor("burial-cross-path", 0, 2, rows * 0.42, cols - 2, rows * 0.42, rendered.yOf(0), 1.8, "stone", ["cemetery-path", "semantic-grid"]));
  const graveCount = Math.round(18 + density * 58);
  const burialLevelAt = (x: number, z: number) => heights[Math.max(0, Math.min(rows - 1, Math.round(z))) * cols + Math.max(0, Math.min(cols - 1, Math.round(x)))] ?? 0;
  for (let index = 0; index < graveCount; index += 1) {
    const quadrant = index % 4;
    const left = quadrant % 2 === 0;
    const upper = quadrant < 2;
    const x = rng.float(left ? 3 : pathX + 3, left ? pathX - 3 : cols - 3);
    const z = rng.float(upper ? 3 : rows * 0.47, upper ? rows * 0.37 : rows - 3);
    const y = rendered.yOf(burialLevelAt(x, z));
    scene.primitives.push(box(`burial-grave-${index}`, 0, x, y, z, rng.float(0.45, 0.8), feetToMeters(rng.float(2.2, 4.5)), rng.float(0.18, 0.35), "stone", ["grave", "tombstone", "burial-cluster", index % 6 === 0 ? "cover" : "detail"]));
  }
  const mausoleumY = rendered.yOf(1);
  scene.primitives.push(box("burial-mausoleum", 0, cols * 0.22, mausoleumY, rows * 0.2, 7, feetToMeters(11), 6, "stone", ["mausoleum", "landmark", "cover", "blocks-sight"]), box("burial-crypt-bridge", 0, cryptX, rendered.yOf(0), cryptZ - 2.8, 2.2, FLOOR_SLAB_METERS, 5.5, "stone", ["crypt-entry", "bridge", "semantic-grid"]));
  const deadTrees = Math.round(3 + density * 7);
  for (let index = 0; index < deadTrees; index += 1) {
    const x = rng.float(3, cols - 3);
    const z = rng.float(3, rows - 3);
    scene.primitives.push(cylinder(`burial-dead-tree-${index}`, 0, x, rendered.yOf(0), z, rng.float(0.35, 0.7), feetToMeters(rng.int(9, 20)), "wood", ["dead-tree", "cover", "blocks-sight"]));
  }
  scene.rooms.push(createRoom("burial-gate", "Broken cemetery gate", "natural", 0, pathX, 3, 8, 6, rendered.yOf(0)), createRoom("burial-mausoleum-room", "Mausoleum court", "combat", 0, cols * 0.22, rows * 0.2, 12, 10, mausoleumY), createRoom("burial-crypt-room", "Sunken crypt", "natural", 0, cryptX, cryptZ, 8, 7, 0));
  connectRooms(scene.rooms, "burial-gate", "burial-mausoleum-room");
  connectRooms(scene.rooms, "burial-mausoleum-room", "burial-crypt-room");
  scene.routes.push(createRoute("burial-processional-route", "primary", [{ x: pathX, z: 1, y: rendered.yOf(0) }, { x: pathX, z: rows * 0.42, y: rendered.yOf(0) }, { x: cryptX, z: cryptZ - 2.8, y: rendered.yOf(0) }]), createRoute("burial-mound-route", "alternate", [{ x: 2, z: rows * 0.42, y: rendered.yOf(0) }, { x: cols * 0.22, z: rows * 0.2, y: mausoleumY }, { x: cols - 2, z: rows * 0.42, y: rendered.yOf(0) }]));
  scene.tactical.push(tacticalFeature("burial-entrance", "entrance", pathX, 1, rendered.yOf(0), 2, "A broken gate opens onto the processional path."), tacticalFeature("burial-crypt-hazard", "hazard", cryptX, cryptZ, -0.5, 3, "A collapsed crypt creates a sunken fighting pocket and hidden approach."), tacticalFeature("burial-mausoleum-cover", "cover", cols * 0.22, rows * 0.2, mausoleumY, 3, "The mausoleum blocks sight and anchors the cemetery's upper flank."));
  scene.description = `Burial-field morphology with rolling grave mounds, branching paths, ${graveCount} grouped graves, a mausoleum, a sunken crypt, and broken perimeter gaps.`;
}

function buildIce(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"], prompt: string): void {
  const macro = rng.fork("macro");
  const meso = rng.fork("meso");
  const tactical = rng.fork("tactical");
  const normalizedPrompt = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const crevasseWanted = includesAny(normalizedPrompt, ["crevasse", "fissure", "ice crack", "冰缝", "冰隙", "冰裂", "裂缝", "裂隙"]);
  const phase = macro.float(-Math.PI, Math.PI);
  const lakeX = width * macro.float(0.42, 0.58);
  const lakeZ = depth * macro.float(0.48, 0.64);
  const lakeWidth = width * macro.float(0.42, 0.62);
  const lakeDepth = depth * macro.float(0.2, 0.34);
  const basePlateRows = 7 + Math.round(density * 5);
  const basePlateDepth = (depth - 2) / basePlateRows;
  const crevasseBottomY = -feetToMeters(28 + density * 32);
  const crevasseAt = (z: number) => width * (0.5 + Math.sin(z / depth * Math.PI * 2.15 + phase) * (0.075 + density * 0.055) + Math.sin(z / depth * Math.PI * 5.4 - phase) * 0.025);
  const crevasseWidthAt = (z: number) => 4.2 + density * 3.8 + Math.sin(z / depth * Math.PI * 4.6 + phase) * 1.1;
  let crevasseSegments = 0;
  for (let row = 0; row < basePlateRows; row += 1) {
    const t = (row + 0.5) / basePlateRows;
    const edgeNoise = Math.sin(t * Math.PI * 3.2 + phase) * 0.5 + Math.sin(t * Math.PI * 7.4 - phase * 0.6) * 0.5;
    const leftInset = 1 + Math.max(0, edgeNoise) * (2.2 + density * 3.4) + (row % 4 === 0 ? 1.1 + density * 1.4 : 0);
    const rightInset = 1 + Math.max(0, -edgeNoise) * (2.5 + density * 3.8) + (row % 5 === 2 ? 1.4 + density * 1.2 : 0);
    const plateWidth = Math.max(width * 0.58, width - leftInset - rightInset);
    const plateX = leftInset + plateWidth / 2;
    const plateZ = 1 + basePlateDepth * (row + 0.5);
    const plateRise = feetToMeters(macro.float(0.15, 1.25 + density * 0.8));
    const plateTags = ["floor", "terrain", "ice", "ice-base-plate", "eroded-ice-edge", "standable"];
    if (!crevasseWanted) scene.primitives.push(box(`ice-base-plate-${row}`, 0, plateX, 0, plateZ, plateWidth, FLOOR_SLAB_METERS + plateRise, basePlateDepth + 0.24, "ice", plateTags));
    else {
      const fissureX = crevasseAt(plateZ);
      const halfGap = crevasseWidthAt(plateZ) / 2;
      const leftEdge = leftInset; const rightEdge = width - rightInset;
      const leftWidth = Math.max(0, fissureX - halfGap - leftEdge);
      const rightWidth = Math.max(0, rightEdge - fissureX - halfGap);
      if (leftWidth > 1.4) scene.primitives.push(box(`ice-base-plate-${row}-west`, 0, leftEdge + leftWidth / 2, 0, plateZ, leftWidth, FLOOR_SLAB_METERS + plateRise, basePlateDepth + 0.24, "ice", [...plateTags, "crevasse-west-bank"]));
      if (rightWidth > 1.4) scene.primitives.push(box(`ice-base-plate-${row}-east`, 0, fissureX + halfGap + rightWidth / 2, 0, plateZ, rightWidth, FLOOR_SLAB_METERS + plateRise, basePlateDepth + 0.24, "ice", [...plateTags, "crevasse-east-bank"]));
      scene.primitives.push(
        box(`ice-main-crevasse-shadow-${row}`, 0, fissureX, crevasseBottomY, plateZ, halfGap * 2, feetToMeters(0.8), basePlateDepth + 0.32, "darkStone", ["ice", "ice-meso", "main-crevasse", "crevasse-bottom", "void", "hazard"]),
        box(`ice-main-crevasse-wall-west-${row}`, 0, fissureX - halfGap, crevasseBottomY, plateZ, 0.38, plateRise + FLOOR_SLAB_METERS - crevasseBottomY, basePlateDepth + 0.28, "ice", ["ice", "ice-meso", "main-crevasse", "crevasse-wall", "vertical-face", "crevasse-west-bank"]),
        box(`ice-main-crevasse-wall-east-${row}`, 0, fissureX + halfGap, crevasseBottomY, plateZ, 0.38, plateRise + FLOOR_SLAB_METERS - crevasseBottomY, basePlateDepth + 0.28, "ice", ["ice", "ice-meso", "main-crevasse", "crevasse-wall", "vertical-face", "crevasse-east-bank"]),
      );
      scene.terrainReservations ??= [];
      scene.terrainReservations.push({
        id: `ice-main-crevasse-reservation-${row}`,
        kind: "void",
        centerCells: { x: fissureX, z: plateZ },
        sizeCells: { x: halfGap * 2, z: basePlateDepth + 0.32 },
        clearanceCells: 0.75,
        reason: "The glacier-spanning crevasse owns this volume; only authored crossing atoms may span it.",
      });
      crevasseSegments += 1;
    }
    if (row % 3 === 1) {
      const spurOnLeft = edgeNoise < 0;
      const spurWidth = macro.float(2.2, 4.8 + density * 2.2);
      const spurX = spurOnLeft ? Math.max(1.2, leftInset - spurWidth * 0.38) : Math.min(width - 1.2, width - rightInset + spurWidth * 0.38);
      scene.primitives.push(box(
        `ice-base-spur-${row}`,
        0,
        spurX,
        0,
        plateZ + basePlateDepth * macro.float(-0.18, 0.18),
        spurWidth,
        FLOOR_SLAB_METERS + plateRise * 0.72,
        basePlateDepth * macro.float(0.46, 0.78),
        "ice",
        ["floor", "terrain", "ice", "ice-base-spur", "broken-floe-edge", "standable"],
      ));
    }
  }
  for (const [segment, dx, dz, widthRatio, depthRatio, rotation] of [
    [0, -0.12, -0.02, 0.62, 0.78, -0.12],
    [1, 0.05, 0.02, 0.58, 0.92, 0.08],
    [2, 0.18, -0.06, 0.42, 0.68, -0.22],
  ] as const) {
    scene.primitives.push(water(
      `ice-frozen-lake-${segment}`,
      0,
      lakeX + lakeWidth * dx,
      -0.08,
      lakeZ + lakeDepth * dz,
      lakeWidth * widthRatio,
      0.14,
      lakeDepth * depthRatio,
      ["ice", "hazard", "thaw-basin", "ice-meso"],
      rotation,
    ));
  }
  const ridgeCount = 2 + Math.round(density * 5);
  let ridgeSegments = 0;
  let ridgeFocus = { x: width * 0.5, z: depth * 0.5 };
  for (let index = 0; index < ridgeCount; index += 1) {
    const baseZ = depth * (0.14 + (index + 0.5) / (ridgeCount + 1) * 0.7) + Math.sin(index * 1.7 + phase) * depth * 0.06;
    let startX: number;
    let endX: number;
    if (!crevasseWanted) {
      startX = meso.float(3, width * 0.42);
      endX = meso.float(width * 0.58, width - 3);
    } else {
      const fissureX = crevasseAt(baseZ);
      const bankMargin = crevasseWidthAt(baseZ) / 2 + 2.5;
      if (index % 2 === 0) {
        const westLimit = Math.max(9, fissureX - bankMargin);
        startX = meso.float(3, Math.max(4.5, westLimit * 0.42));
        endX = meso.float(Math.max(startX + 3, westLimit * 0.58), westLimit);
      } else {
        const eastLimit = Math.min(width - 9, fissureX + bankMargin);
        startX = meso.float(eastLimit, Math.min(width - 6, eastLimit + (width - eastLimit) * 0.38));
        endX = meso.float(Math.max(startX + 3, eastLimit + (width - eastLimit) * 0.62), width - 3);
      }
    }
    const rise = feetToMeters(meso.float(2.5, 6.5 + density * 4));
    const segmentCount = 4 + Math.round(density * 3) + meso.int(0, 2);
    const ridgePhase = meso.float(-Math.PI, Math.PI);
    const waveCount = meso.float(1.1, 1.8);
    const waveAmplitude = meso.float(1.4, 3.6);
    const detailAmplitude = meso.float(0.25, 0.9);
    const points = Array.from({ length: segmentCount + 1 }, (_, segment) => {
      const t = segment / segmentCount;
      return {
        x: startX + (endX - startX) * t,
        z: baseZ
          + Math.sin(t * Math.PI * waveCount + ridgePhase) * waveAmplitude
          + Math.sin(t * Math.PI * 4 + phase) * detailAmplitude,
      };
    });
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const from = points[segment]!;
      const to = points[segment + 1]!;
      const taper = 1 - Math.abs(segment / Math.max(1, segmentCount - 1) - 0.5) * 0.45;
      const crestWidth = meso.float(1.55, 2.8 + density * 1.2) * taper;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.max(0.1, Math.hypot(dx, dz));
      const leewardSign = Math.sin(phase + index * 1.37) >= 0 ? 1 : -1;
      const leewardOffset = crestWidth * (0.55 + density * 0.18);
      const offsetX = (-dz / length) * leewardOffset * leewardSign;
      const offsetZ = (dx / length) * leewardOffset * leewardSign;
      scene.primitives.push(corridor(
        `ice-snow-ridge-${index}-segment-${segment}`,
        0,
        from.x,
        from.z,
        to.x,
        to.z,
        rise,
        crestWidth,
        "ice",
        ["ice", "ice-meso", "snow-ridge", "snow-ridge-segment", `snow-ridge-system:${index}`, "terrain", "standable", "high-ground"],
      ));
      scene.primitives.push(corridor(
        `ice-snow-ridge-${index}-leeward-${segment}`,
        0,
        from.x + offsetX,
        from.z + offsetZ,
        to.x + offsetX,
        to.z + offsetZ,
        rise * 0.46,
        crestWidth * (1.45 + density * 0.28),
        "ice",
        ["ice", "ice-meso", "snow-ridge", "snow-ridge-leeward", `snow-ridge-system:${index}`, "terrain", "standable", "asymmetric-slope"],
      ));
      ridgeSegments += 1;
    }
    const crest = points[Math.floor(points.length / 2)]!;
    if (index === 0) ridgeFocus = { x: crest.x, z: crest.z };
    scene.tactical.push(tacticalFeature(`ice-ridge-high-${index}`, "highGround", (startX + endX) / 2, baseZ, rise, 2, "A wind-packed snow ridge provides elevated cover and a long sight line."));
    scene.routes.push(createRoute(`ice-snow-ridge-route-${index}`, "alternate", points.map((point) => ({ ...point, y: rise })), { purpose: "movement", traffic: 0.18 + density * 0.22, schedule: "all" }));
    scene.tactical.push(tacticalFeature(`ice-ridge-crest-${index}`, "cover", crest.x, crest.z, rise, 1.5, "The sinuous crest creates a continuous windbreak instead of an isolated snow bar."));
  }
  const thawPoolCount = 1 + Math.round(density * 5);
  for (let index = 0; index < thawPoolCount; index += 1) {
    const z = meso.float(depth * 0.18, depth * 0.86);
    const poolWidth = meso.float(2.5, 5.5 + density * 3);
    const poolDepth = meso.float(2.2, 4.8 + density * 2.5);
    let x = meso.float(5, width - 5);
    if (crevasseWanted) for (let attempt = 0; attempt < 12 && Math.abs(x - crevasseAt(z)) < crevasseWidthAt(z) / 2 + poolWidth / 2 + 1.5; attempt += 1) x = meso.float(5, width - 5);
    for (const [fragment, dx, dz, scaleX, scaleZ, rotation] of [
      [0, -0.16, 0.02, 0.7, 0.78, -0.18],
      [1, 0.1, -0.08, 0.72, 0.62, 0.15],
      [2, 0.2, 0.12, 0.45, 0.52, -0.3],
    ] as const) {
      scene.primitives.push(water(
        `ice-thaw-pool-${index}-${fragment}`,
        0,
        x + poolWidth * dx,
        -0.14,
        z + poolDepth * dz,
        poolWidth * scaleX,
        0.18,
        poolDepth * scaleZ,
        ["ice", "ice-meso", "thaw-pool", "hazard", "thin-ice"],
        rotation,
      ));
    }
    scene.tactical.push(tacticalFeature(`ice-thaw-hazard-${index}`, "hazard", x, z, -0.14, Math.max(1, Math.min(poolWidth, poolDepth) / 2), "A dark thaw pool weakens the surrounding ice and interrupts direct movement."));
  }
  const islands = 4 + Math.round(density * 9);
  for (let index = 0; index < islands; index += 1) {
    const z = tactical.float(4, depth - 4);
    const rise = feetToMeters(tactical.float(1.5, 5.5));
    const shelfWidth = tactical.int(3, 7);
    const shelfDepth = tactical.int(3, 6);
    let x = tactical.float(4, width - 4);
    if (crevasseWanted) for (let attempt = 0; attempt < 12 && Math.abs(x - crevasseAt(z)) < crevasseWidthAt(z) / 2 + shelfWidth / 2 + 1.5; attempt += 1) x = tactical.float(4, width - 4);
    scene.primitives.push(
      box(`ice-island-${index}-core`, 0, x, rise, z, shelfWidth * 0.72, FLOOR_SLAB_METERS + rise, shelfDepth, "ice", ["floor", "terrain", "ice", "ice-meso", "ice-island", "ice-shelf", "standable", "cover"], tactical.float(-0.16, 0.16)),
      box(`ice-island-${index}-spur`, 0, x + shelfWidth * tactical.float(-0.22, 0.22), rise * 0.82, z + shelfDepth * tactical.float(-0.22, 0.22), shelfWidth * 0.58, FLOOR_SLAB_METERS + rise * 0.82, shelfDepth * 0.58, "ice", ["floor", "terrain", "ice", "ice-meso", "ice-island", "ice-shelf", "standable", "cover"], tactical.float(-0.3, 0.3)),
    );
    scene.tactical.push(tacticalFeature(`ice-island-cover-${index}`, "cover", x, z, rise, 2, "A raised ice shelf provides stable cover above the fractured surface."));
  }
  const crackCount = Math.round(density * 4);
  for (let index = 0; index < crackCount; index += 1) {
    const startX = tactical.float(3, width * 0.35);
    const endX = tactical.float(width * 0.65, width - 3);
    const z = tactical.float(depth * 0.18, depth * 0.84);
    scene.primitives.push(
      corridor(`ice-secondary-crack-shadow-${index}`, 0, startX, z, endX, z + tactical.float(-5, 5), -feetToMeters(3.5), tactical.float(0.55, 1.05), "darkStone", ["ice", "ice-meso", "secondary-crevasse", "void", "hazard", "vertical-face"]),
      corridor(`ice-secondary-crack-water-${index}`, 0, startX, z, endX, z + tactical.float(-5, 5), -feetToMeters(1.8), tactical.float(0.35, 0.72), "water", ["ice", "ice-meso", "secondary-crevasse", "water", "hazard"]),
    );
  }
  if (crevasseWanted) {
    for (const [index, zRatio] of [0.31, 0.72].entries()) {
      const z = depth * zRatio;
      const x = crevasseAt(z);
      const halfGap = crevasseWidthAt(z) / 2;
      const bridgeY = FLOOR_SLAB_METERS + feetToMeters(0.45 + index * 0.35);
      scene.primitives.push(
        corridor(`ice-main-crevasse-bridge-${index}`, 0, x - halfGap - 1.2, z, x + halfGap + 1.2, z, bridgeY, 1.45, "ice", ["ice", "main-crevasse", "crevasse-bridge", "natural-ice-bridge", "bridge", "standable", "supported", "surface-grid"]),
        box(`ice-main-crevasse-bridge-anchor-west-${index}`, 0, x - halfGap - 0.55, 0, z, 1.5, bridgeY + FLOOR_SLAB_METERS, 2.1, "ice", ["ice", "main-crevasse", "bridge-anchor", "supported"]),
        box(`ice-main-crevasse-bridge-anchor-east-${index}`, 0, x + halfGap + 0.55, 0, z, 1.5, bridgeY + FLOOR_SLAB_METERS, 2.1, "ice", ["ice", "main-crevasse", "bridge-anchor", "supported"]),
      );
      scene.routes.push(createRoute(`ice-main-crevasse-crossing-route-${index}`, index === 0 ? "primary" : "alternate", [
        { x: x - halfGap - 2, z, y: bridgeY },
        { x, z, y: bridgeY },
        { x: x + halfGap + 2, z, y: bridgeY },
      ]));
      scene.tactical.push(tacticalFeature(`ice-main-crevasse-bridge-choke-${index}`, "chokepoint", x, z, bridgeY, 1.5, "A narrow supported bridge is one of only two crossings over the glacier-spanning crevasse."));
    }
    scene.tactical.push(tacticalFeature("ice-main-crevasse-hazard", "hazard", crevasseAt(depth * 0.52), depth * 0.52, crevasseBottomY, 4, "A deep glacier-spanning void completely separates the east and west ice banks outside the two authored crossings."));
  }
  scene.rooms.push(createRoom("ice-north-field", "Wind-scoured ice", "natural", 0, width / 2, depth * 0.2, width - 4, 8), createRoom("ice-lake-room", "Frozen underground lake", "natural", 0, width / 2, depth * 0.56, width * 0.7, depth * 0.35), createRoom("ice-south-field", "Broken floe field", "natural", 0, width / 2, depth * 0.84, width - 4, 6));
  connectRooms(scene.rooms, "ice-north-field", "ice-lake-room");
  connectRooms(scene.rooms, "ice-lake-room", "ice-south-field");
  if (!crevasseWanted) scene.routes.push(createRoute("ice-primary-route", "primary", [{ x: 1, z: depth * 0.2 }, { x: width * 0.28, z: depth * 0.4 }, { x: width * 0.72, z: depth * 0.7 }, { x: width - 1, z: depth * 0.84 }]));
  if (density >= 0.45 && !crevasseWanted) scene.routes.push(createRoute("ice-ridge-route", "alternate", [{ x: 2, z: depth * 0.72, y: feetToMeters(2) }, { x: width * 0.38, z: depth * 0.64, y: feetToMeters(4) }, { x: width * 0.66, z: depth * 0.35, y: feetToMeters(3) }, { x: width - 2, z: depth * 0.28, y: feetToMeters(2) }]));
  scene.tactical.push(tacticalFeature("ice-thin-surface", "hazard", width * 0.5, depth * 0.56, -0.02, 3, "Thin ice turns the lake into a moving hazard zone."), tacticalFeature("ice-entrance", "entrance", 1, depth * 0.2, 0, 2, "A whiteout trail enters from the north."));
  scene.viewProgram = {
    version: 1,
    mode: "scene",
    focusCells: crevasseWanted ? { x: crevasseAt(depth * 0.52), z: depth * 0.52 } : ridgeFocus,
    radiusCells: Math.max(9, Math.min(12, 9 + density * 3)),
    includeTags: ["snow-ridge", "snow-ridge-leeward", "secondary-crevasse", "main-crevasse", "crevasse-bridge", "thaw-pool"],
    reason: crevasseWanted ? "Keep both separated glacier banks and their two authored crossings visible while the low-angle audit exposes the full crevasse depth." : "Keep the overview on the complete ice field while the low-angle audit focuses an authored asymmetric ridge and nearby fracture system.",
  };
  scene.description = `Layered ice terrain with ${basePlateRows} eroded base plate rows${crevasseWanted ? ` split by ${crevasseSegments} deep main-crevasse segments and two supported crossings` : ""}, ${ridgeCount} continuous asymmetric ridge systems (${ridgeSegments} linked crest segments), ${thawPoolCount} thaw pools, ${islands} raised shelves, ${crackCount} secondary crevasses, and ${scene.routes.length} authored tactical routes.`;
}

function buildRuin(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box("ruin-ground", 0, width / 2, 0, depth / 2, width - 2, FLOOR_SLAB_METERS, depth - 2, "earth", ["floor", "terrain", "ruin"]));
  const columns = 8;
  for (let index = 0; index < columns; index += 1) {
    const x = 4 + (index % 4) * ((width - 8) / 3);
    const z = index < 4 ? 5 : depth - 5;
    scene.primitives.push(cylinder(`ruin-column-${index}`, 0, x, FLOOR_SLAB_METERS, z, rng.float(0.8, 1.2), feetToMeters(rng.int(5, 12)), "stone", ["ruin-column", "cover"]));
    scene.tactical.push(tacticalFeature(`ruin-column-cover-${index}`, "cover", x, z, 0, 1, "A broken column interrupts line of sight."));
  }
  scene.primitives.push(box("ruin-altar", 0, width / 2, FLOOR_SLAB_METERS, depth / 2, 3, 1.4, 2, "stone", ["landmark", "altar", "cover"]));
  scene.rooms.push(createRoom("ruin-forecourt", "Overgrown forecourt", "natural", 0, width / 2, 6, width - 4, 8), createRoom("ruin-sanctum", "Collapsed sanctum", "combat", 0, width / 2, depth / 2, width * 0.55, depth * 0.48), createRoom("ruin-rear", "Broken rear court", "natural", 0, width / 2, depth - 6, width - 4, 8));
  connectRooms(scene.rooms, "ruin-forecourt", "ruin-sanctum");
  connectRooms(scene.rooms, "ruin-sanctum", "ruin-rear");
  scene.routes.push(createRoute("ruin-primary-route", "primary", [{ x: 1, z: 6 }, { x: width / 2, z: depth / 2 }, { x: width - 1, z: depth - 6 }]));
  scene.routes.push(createRoute("ruin-alternate-route", "alternate", [{ x: 3, z: depth - 4 }, { x: width * 0.25, z: depth * 0.5 }, { x: width - 3, z: 4 }]));
  scene.tactical.push(tacticalFeature("ruin-entrance", "entrance", 1, 6, 0, 2, "A weed-choked processional path enters the ruin."), tacticalFeature("ruin-altar-objective", "chokepoint", width / 2, depth / 2, 0, 2, "The broken altar is the obvious encounter objective."));
}

function buildUndergroundLake(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box("lake-west-ledge", 0, width * 0.2, 0, depth / 2, width * 0.3, FLOOR_SLAB_METERS, depth - 4, "rock", ["floor", "ledge", "terrain"]), box("lake-east-ledge", 0, width * 0.8, feetToMeters(4), depth / 2, width * 0.3, FLOOR_SLAB_METERS, depth - 4, "rock", ["floor", "ledge", "terrain"]), water("underground-lake-water", 0, width / 2, -0.18, depth / 2, width * 0.54, 0.42, depth - 8, ["lake", "hazard"]));
  const bridgeZ = depth * 0.38;
  scene.primitives.push(corridor("lake-bridge", 0, width * 0.2, bridgeZ, width * 0.8, bridgeZ, feetToMeters(4), 2, "stone", ["bridge"]));
  scene.rooms.push(createRoom("lake-west-room", "West cavern ledge", "natural", 0, width * 0.2, depth / 2, width * 0.24, depth - 6), createRoom("lake-water-room", "Black underground lake", "natural", 0, width / 2, depth / 2, width * 0.5, depth - 8), createRoom("lake-east-room", "East crystal ledge", "combat", 0, width * 0.8, depth / 2, width * 0.24, depth - 6));
  connectRooms(scene.rooms, "lake-west-room", "lake-water-room");
  connectRooms(scene.rooms, "lake-water-room", "lake-east-room");
  scene.routes.push(createRoute("lake-primary-route", "primary", [{ x: 1, z: bridgeZ, y: 0 }, { x: width * 0.2, z: bridgeZ, y: 0 }, { x: width * 0.8, z: bridgeZ, y: feetToMeters(4) }, { x: width - 1, z: bridgeZ, y: feetToMeters(4) }]));
  scene.routes.push(createRoute("lake-waterflow", "waterflow", [{ x: width * 0.3, z: depth / 2, y: -0.18 }, { x: width / 2, z: depth / 2, y: -0.18 }, { x: width * 0.7, z: depth / 2, y: -0.18 }]));
  scene.tactical.push(tacticalFeature("lake-bridge-choke", "chokepoint", width / 2, bridgeZ, feetToMeters(2), 2, "The bridge is the only stable crossing over deep water."), tacticalFeature("lake-entrance", "entrance", 1, bridgeZ, 0, 2, "A damp tunnel opens onto the west ledge."));
  addCover(scene, rng, "lake", width * 0.2, depth * 0.3, 0, 3);
}

function buildForest(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"], prompt: string): void {
  const cols = Math.max(30, Math.floor(width));
  const rows = Math.max(26, Math.floor(depth));
  const promptText = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const coldForest = ["寒冷", "冰雪", "雪线", "冻原", "冷杉", "cold", "snow", "frozen", "alpine"].some((term) => promptText.includes(term));
  const macro = rng.fork("macro-terrain");
  const ecology = rng.fork("ecology");
  const micro = rng.fork("micro");
  const forestEdge = rng.fork("forest-edge-transition");
  const phaseA = macro.float(-Math.PI, Math.PI);
  const phaseB = macro.float(-Math.PI, Math.PI);
  const maximumTerrainLevel = density < 0.34 ? 3 : density < 0.7 ? 4 : 5;
  const ridgeAAt = (x: number) => rows * (0.3 + Math.sin(x * 0.075 + phaseA) * 0.09);
  const ridgeBAt = (x: number) => rows * (0.72 + Math.sin(x * 0.058 - phaseB) * 0.075);
  const clearingScale = 1.18 - density * 0.42;
  const clearings = [
    { x: cols * macro.float(0.27, 0.35), z: rows * macro.float(0.27, 0.36), rx: cols * 0.105 * clearingScale, rz: rows * 0.11 * clearingScale },
    { x: cols * macro.float(0.58, 0.68), z: rows * macro.float(0.43, 0.54), rx: cols * 0.12 * clearingScale, rz: rows * 0.1 * clearingScale },
    { x: cols * macro.float(0.32, 0.44), z: rows * macro.float(0.7, 0.8), rx: cols * 0.1 * clearingScale, rz: rows * 0.09 * clearingScale },
  ];
  const streamWanted = ["浅溪", "溪流", "小溪", "stream", "creek"].some((term) => prompt.normalize("NFKC").toLocaleLowerCase("en-US").includes(term));
  const streamAt = (x: number) => rows * 0.61 + Math.sin(x * 0.14 + phaseB) * rows * 0.055 + Math.sin(x * 0.043 - phaseA) * rows * 0.04;
  const clearingAt = (x: number, z: number) => clearings.findIndex((clearing, index) => {
    const warp = Math.sin(x * (0.36 + index * 0.04) + z * 0.21 + phaseA) * 0.16;
    return ((x - clearing.x) / clearing.rx) ** 2 + ((z - clearing.z) / clearing.rz) ** 2 < 1 + warp;
  });
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    if (edge === 0 || (streamWanted && Math.abs(z - streamAt(x)) < 1.25)) { heights.push(undefined); continue; }
    const elevationWarp = 0.72 + density * 0.76;
    const broad = (Math.sin(x * 0.105 + phaseA) * 0.78 + Math.cos(z * 0.12 + phaseB) * 0.68 + Math.sin((x + z) * 0.055) * 0.4) * elevationWarp
      + Math.sin(x * 0.047 - z * 0.032 + phaseB) * (0.22 + density * 0.34);
    const ridgeA = Math.exp(-1 * (((z - ridgeAAt(x)) / (rows * 0.105)) ** 2)) * (0.9 + density * 1.05);
    const ridgeB = Math.exp(-1 * (((z - ridgeBAt(x)) / (rows * 0.12)) ** 2)) * (0.7 + density * 0.85);
    const centralBasin = Math.exp(-1 * (((x - cols * 0.52) / (cols * 0.19)) ** 2 + ((z - rows * 0.52) / (rows * 0.2)) ** 2)) * (0.85 + density * 0.45);
    const relief = broad + ridgeA + ridgeB - centralBasin;
    const level = Math.max(0, Math.min(maximumTerrainLevel, Math.round((relief + 1.15) * (1.05 + density * 0.18))));
    const clearing = clearingAt(x, z);
    heights.push(clearing >= 0 ? Math.max(0, Math.min(maximumTerrainLevel - 2, level)) : level);
  }
  const rendered = renderMorphologyField(scene, {
    prefix: "forest-morphology", cols, rows, heights, stepFeet: 5 + density * 1.5,
    materialFor: (_level, x, z) => clearingAt(x, z) >= 0 ? "earth" : "moss",
    tagsFor: (_level, x, z) => clearingAt(x, z) >= 0
      ? ["forest", "clearing", `clearing:${clearingAt(x, z) + 1}`, "standable", ...(coldForest ? ["cold-forest-floor"] : [])]
      : ["forest", "woodland-floor", "standable", ...(coldForest ? ["cold-forest-floor"] : [])],
    slopeFacades: true,
    slopeMaterial: "earth",
  });
  const levelAt = (x: number, z: number) => heights[Math.max(0, Math.min(rows - 1, Math.floor(z))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(x)))] ?? 0;
  const surfaceY = (x: number, z: number) => rendered.yOf(levelAt(x, z));
  const edgeClusterTarget = Math.round(5 + density * 8);
  let edgeRootCount = 0;
  let edgeShrubCount = 0;
  let edgeLogCount = 0;
  for (let cluster = 0; cluster < edgeClusterTarget; cluster += 1) {
    const side = forestEdge.int(0, 3);
    const along = forestEdge.float(0.12, 0.88);
    const anchor = side === 0 ? { x: 1.05, z: rows * along, dx: -1, dz: 0 }
      : side === 1 ? { x: cols - 1.05, z: rows * along, dx: 1, dz: 0 }
        : side === 2 ? { x: cols * along, z: 1.05, dx: 0, dz: -1 }
          : { x: cols * along, z: rows - 1.05, dx: 0, dz: 1 };
    const tangentX = Math.abs(anchor.dz); const tangentZ = Math.abs(anchor.dx);
    const y = surfaceY(anchor.x, anchor.z);
    const anchorHeight = feetToMeters(forestEdge.float(10, 18));
    const anchorRadius = forestEdge.float(0.48, 0.82);
    scene.primitives.push(
      cylinder(`forest-edge-anchor-${cluster}`, 0, anchor.x, y, anchor.z, anchorRadius, anchorHeight, "wood", ["forest", "forest-edge-transition", "edge-anchor-tree", "root-buttress", "cover"]),
      primitive(`forest-edge-anchor-crown-${cluster}`, "sphere", 0, anchor.x, y + anchorHeight * 0.78, anchor.z, feetToMeters(forestEdge.float(7, 12)), anchorHeight * 0.42, feetToMeters(forestEdge.float(6, 10)), "moss", ["forest", "forest-edge-transition", "edge-canopy", "cover"]),
    );
    const rootCount = forestEdge.int(2, 3);
    const outwardAngle = Math.atan2(anchor.dx, anchor.dz);
    for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
      const rootAngle = outwardAngle + (rootIndex - (rootCount - 1) / 2) * forestEdge.float(0.42, 0.72) + forestEdge.float(-0.14, 0.14);
      const rootDx = Math.sin(rootAngle); const rootDz = Math.cos(rootAngle);
      const rootLength = forestEdge.float(1.35, 2.45);
      const lowY = Math.max(0, y - feetToMeters(forestEdge.float(1.2, 2.8)));
      const highY = y + feetToMeters(forestEdge.float(0.45, 1.15));
      scene.primitives.push(ramp(
        `forest-edge-root-${cluster}-${rootIndex}`,
        0,
        anchor.x + rootDx * rootLength * 0.46,
        lowY,
        anchor.z + rootDz * rootLength * 0.46,
        forestEdge.float(0.28, 0.48),
        highY - lowY,
        rootLength,
        "wood",
        ["forest", "forest-edge-transition", "root-apron", "root-buttress", "cover", "non-walkable-facade"],
        Math.atan2(-rootDx, -rootDz),
      ));
      edgeRootCount += 1;
    }
    const shrubCount = forestEdge.int(2, 5);
    for (let shrubIndex = 0; shrubIndex < shrubCount; shrubIndex += 1) {
      const inward = forestEdge.float(0.15, 1.55);
      const tangentOffset = forestEdge.float(-1.8, 1.8);
      const x = anchor.x - anchor.dx * inward + tangentX * tangentOffset;
      const z = anchor.z - anchor.dz * inward + tangentZ * tangentOffset;
      const radius = forestEdge.float(0.38, 0.78);
      scene.primitives.push(primitive(
        `forest-edge-shrub-${cluster}-${shrubIndex}`,
        "sphere",
        0,
        x,
        surfaceY(x, z) + feetToMeters(0.45),
        z,
        radius * CELL,
        feetToMeters(forestEdge.float(1.4, 3.2)),
        radius * CELL,
        "moss",
        ["forest", "forest-edge-transition", "edge-thicket", "undergrowth", "cover", "natural-detail"],
      ));
      edgeShrubCount += 1;
    }
    if (cluster % 3 === 1) {
      const tangentAngle = Math.atan2(tangentZ, tangentX) + forestEdge.float(-0.28, 0.28);
      scene.primitives.push(box(
        `forest-edge-log-${cluster}`,
        0,
        anchor.x - anchor.dx * 0.5,
        y + feetToMeters(0.7),
        anchor.z - anchor.dz * 0.5,
        0.7,
        feetToMeters(1.4),
        forestEdge.float(2.8, 5.4),
        "wood",
        ["forest", "forest-edge-transition", "edge-fallen-log", "fallen-log", "cover", "climbable"],
        tangentAngle,
      ));
      edgeLogCount += 1;
    }
  }
  let snowPatchCount = 0;
  if (coldForest) {
    const snowTarget = Math.round(7 + density * 13);
    for (let attempt = 0; attempt < snowTarget * 5 && snowPatchCount < snowTarget; attempt += 1) {
      const x = micro.float(2, cols - 2); const z = micro.float(2, rows - 2);
      if (heights[Math.floor(z) * cols + Math.floor(x)] === undefined || levelAt(x, z) < maximumTerrainLevel - 1 || clearingAt(x, z) >= 0) continue;
      scene.primitives.push(primitive(
        `forest-snow-patch-${snowPatchCount}`,
        "sphere",
        0,
        x,
        surfaceY(x, z) + feetToMeters(0.12),
        z,
        feetToMeters(micro.float(4, 9)),
        feetToMeters(micro.float(0.18, 0.38)),
        feetToMeters(micro.float(3, 7)),
        "ice",
        ["forest", "cold-forest", "snow-patch", "terrain-state"],
      ));
      snowPatchCount += 1;
    }
  }
  const primaryPoints = [{ x: 1.5, z: rows * 0.18 }, ...clearings.map((entry) => ({ x: entry.x, z: entry.z })), { x: cols - 2, z: rows * 0.84 }];
  const alternatePoints = [{ x: 2, z: rows * 0.82 }, { x: cols * 0.2, z: rows * 0.55 }, clearings[1]!, { x: cols * 0.8, z: rows * 0.25 }, { x: cols - 2, z: rows * 0.17 }];
  const nearestWalkableCell = (target: { x: number; z: number }) => {
    const originX = Math.max(1, Math.min(cols - 2, Math.round(target.x)));
    const originZ = Math.max(1, Math.min(rows - 2, Math.round(target.z)));
    for (let radius = 0; radius < 8; radius += 1) for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      const x = originX + dx; const z = originZ + dz;
      if (x > 0 && x < cols - 1 && z > 0 && z < rows - 1 && heights[z * cols + x] !== undefined) return { x, z };
    }
    return { x: originX, z: originZ };
  };
  const terrainPath = (startTarget: { x: number; z: number }, endTarget: { x: number; z: number }) => {
    const start = nearestWalkableCell(startTarget); const end = nearestWalkableCell(endTarget);
    const startKey = start.z * cols + start.x; const endKey = end.z * cols + end.x;
    const frontier: Array<{ key: number; priority: number }> = [{ key: startKey, priority: 0 }];
    const costs = new Map<number, number>([[startKey, 0]]); const cameFrom = new Map<number, number>();
    const push = (entry: { key: number; priority: number }) => {
      frontier.push(entry); let index = frontier.length - 1;
      while (index > 0) { const parent = Math.floor((index - 1) / 2); if (frontier[parent]!.priority <= entry.priority) break; frontier[index] = frontier[parent]!; index = parent; }
      frontier[index] = entry;
    };
    const pop = () => {
      const root = frontier[0]!; const tail = frontier.pop()!;
      if (frontier.length > 0) { let index = 0; frontier[0] = tail; while (true) { const left = index * 2 + 1; const right = left + 1; if (left >= frontier.length) break; const child = right < frontier.length && frontier[right]!.priority < frontier[left]!.priority ? right : left; if (frontier[child]!.priority >= frontier[index]!.priority) break; [frontier[index], frontier[child]] = [frontier[child]!, frontier[index]!]; index = child; } }
      return root;
    };
    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    while (frontier.length > 0) {
      const current = pop().key; if (current === endKey) break;
      const cx = current % cols; const cz = Math.floor(current / cols); const currentLevel = heights[current] ?? 0;
      for (const [dx, dz] of neighbours) {
        const nx = cx + dx; const nz = cz + dz; if (nx <= 0 || nx >= cols - 1 || nz <= 0 || nz >= rows - 1) continue;
        const nextKey = nz * cols + nx; const nextLevel = heights[nextKey]; if (nextLevel === undefined) continue;
        const climb = Math.abs(nextLevel - currentLevel); const diagonal = dx !== 0 && dz !== 0 ? 1.42 : 1;
        const edgeCost = diagonal + climb * climb * 6.5 + (climb > 1 ? 18 : 0);
        const nextCost = (costs.get(current) ?? Number.POSITIVE_INFINITY) + edgeCost;
        if (nextCost >= (costs.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        costs.set(nextKey, nextCost); cameFrom.set(nextKey, current);
        const heuristic = Math.hypot(end.x - nx, end.z - nz) * 0.9;
        push({ key: nextKey, priority: nextCost + heuristic });
      }
    }
    const keys = [endKey]; let cursor = endKey; let guard = cols * rows;
    while (cursor !== startKey && guard-- > 0) { const previous = cameFrom.get(cursor); if (previous === undefined) break; keys.push(previous); cursor = previous; }
    if (cursor !== startKey) return [start, end].map((point) => ({ ...point, y: surfaceY(point.x, point.z) }));
    return keys.reverse().map((key) => { const x = key % cols; const z = Math.floor(key / cols); return { x, z, y: surfaceY(x, z) }; });
  };
  const pathThroughAnchors = (points: Array<{ x: number; z: number }>) => points.flatMap((from, index) => {
    const to = points[index + 1]; if (!to) return [];
    const segment = terrainPath(from, to); return index === 0 ? segment : segment.slice(1);
  });
  const simplifyTerrainPath = (sampled: Array<{ x: number; z: number; y: number }>) => {
    if (sampled.length <= 2) return sampled;
    const simplified = [sampled[0]!];
    let lastDirection = "";
    for (let index = 1; index < sampled.length - 1; index += 1) {
      const previous = sampled[index - 1]!; const point = sampled[index]!; const next = sampled[index + 1]!;
      const direction = `${Math.sign(point.x - previous.x)},${Math.sign(point.z - previous.z)}`;
      const nextDirection = `${Math.sign(next.x - point.x)},${Math.sign(next.z - point.z)}`;
      const elevationBoundary = Math.abs(point.y - previous.y) > 0.08 || Math.abs(next.y - point.y) > 0.08;
      const last = simplified.at(-1)!;
      if (elevationBoundary || direction !== nextDirection || direction !== lastDirection || Math.hypot(point.x - last.x, point.z - last.z) >= 6) simplified.push(point);
      lastDirection = direction;
    }
    simplified.push(sampled.at(-1)!); return simplified;
  };
  const addTrail = (id: string, kind: "primary" | "alternate", points: Array<{ x: number; z: number }>, widthCells: number) => {
    const sampled = pathThroughAnchors(points);
    const simplified = simplifyTerrainPath(sampled);
    scene.routes.push(createRoute(id, kind, simplified));
    for (let index = 1; index < simplified.length; index += 1) {
      const from = simplified[index - 1]!; const to = simplified[index]!;
      const common = ["forest", "route", "trail", "surface-grid", "terrain-following"];
      if (Math.abs(to.y - from.y) <= feetToMeters(1.25)) {
        scene.primitives.push(corridor(`${id}-segment-${index}`, 0, from.x, from.z, to.x, to.z, (from.y + to.y) / 2 + 0.02, widthCells, "earth", common));
      } else {
        const low = from.y <= to.y ? { xCells: from.x, zCells: from.z, yMeters: from.y } : { xCells: to.x, zCells: to.z, yMeters: to.y };
        const high = from.y <= to.y ? { xCells: to.x, zCells: to.z, yMeters: to.y } : { xCells: from.x, zCells: from.z, yMeters: from.y };
        scene.primitives.push(stairConnection(`${id}-rise-${index}`, 0, low, high, widthCells, "earth", [...common, "vertical-route", "supported"]).primitive);
      }
    }
  };
  addTrail("forest-primary-route", "primary", primaryPoints, 1.25);
  addTrail("forest-hunter-trail", "alternate", alternatePoints, 0.85);
  if (streamWanted) {
    const segments = 18;
    for (let index = 0; index < segments; index += 1) {
      const x1 = 1 + (cols - 2) * index / segments; const x2 = 1 + (cols - 2) * (index + 1) / segments;
      const z1 = streamAt(x1); const z2 = streamAt(x2); const dx = x2 - x1; const dz = z2 - z1;
      scene.primitives.push(water(`forest-stream-${index}`, 0, (x1 + x2) / 2, feetToMeters(1), (z1 + z2) / 2, 2.3, 0.22, Math.hypot(dx, dz) + 0.45, ["forest", "stream", "watercourse", "shallow-water"], Math.atan2(dx, dz)));
    }
    scene.routes.push(createRoute("forest-stream-flow", "waterflow", Array.from({ length: 8 }, (_, index) => { const x = 1 + (cols - 2) * index / 7; return { x, z: streamAt(x), y: feetToMeters(1 - index * 0.08) }; })));
  }
  const routeDistance = (x: number, z: number, points: Array<{ x: number; z: number }>) => Math.min(...points.map((point) => Math.hypot(x - point.x, z - point.z)));
  const clearingDistance = (x: number, z: number) => Math.min(...clearings.map((clearing) => Math.sqrt(((x - clearing.x) / clearing.rx) ** 2 + ((z - clearing.z) / clearing.rz) ** 2)));
  const treeTarget = Math.round(48 + density * 205);
  const coniferBias = ["针叶", "松林", "冷杉", "conifer", "pine", "fir"].some((term) => promptText.includes(term));
  const broadleafBias = ["阔叶", "橡树", "榕树", "broadleaf", "oak", "banyan"].some((term) => promptText.includes(term));
  const speciesCounts = { broadleaf: 0, conifer: 0, snag: 0, understory: 0 };
  let trees = 0;
  for (let attempt = 0; attempt < treeTarget * 6 && trees < treeTarget; attempt += 1) {
    const clusterX = ecology.float(2, cols - 2); const clusterZ = ecology.float(2, rows - 2);
    const x = Math.max(1.5, Math.min(cols - 1.5, clusterX + ecology.float(-3.2, 3.2)));
    const z = Math.max(1.5, Math.min(rows - 1.5, clusterZ + ecology.float(-3.2, 3.2)));
    const clearingBand = clearingDistance(x, z);
    if (clearingBand < 1 || clearingBand < 1.38 && ecology.next() > 0.34 || routeDistance(x, z, [...primaryPoints, ...alternatePoints]) < 1.1 || (streamWanted && Math.abs(z - streamAt(x)) < 2.2)) continue;
    const roll = ecology.next();
    const species = clearingBand < 1.38 ? (roll < 0.62 ? "understory" : roll < 0.82 ? "snag" : "broadleaf")
      : coniferBias ? (roll < 0.66 ? "conifer" : roll < 0.82 ? "broadleaf" : roll < 0.92 ? "snag" : "understory")
      : broadleafBias ? (roll < 0.66 ? "broadleaf" : roll < 0.78 ? "conifer" : roll < 0.9 ? "understory" : "snag")
        : roll < 0.42 ? "broadleaf" : roll < 0.72 ? "conifer" : roll < 0.86 ? "understory" : "snag";
    speciesCounts[species] += 1;
    const trunk = ecology.float(species === "understory" ? 0.2 : 0.34, species === "broadleaf" ? 0.82 : 0.66) * (density > 0.75 ? 1.08 : 1);
    const heightFeet = species === "understory" ? ecology.int(10, 20) : species === "snag" ? ecology.int(18, 34) : species === "conifer" ? ecology.int(28, 52) : ecology.int(24, 48);
    const height = feetToMeters(heightFeet); const y = surfaceY(x, z);
    const treeTags = ["forest", "tree", "tree-cluster", "natural-cover", "cover", `tree-species:${species}`];
    scene.primitives.push(cylinder(`forest-tree-${trees}`, 0, x, y, z, trunk, height, "wood", [...treeTags, ...(species === "snag" ? ["deadwood", "snag"] : [])]));
    if (species === "broadleaf") {
      const crown = trunk * CELL * ecology.float(4.1, 5.8);
      scene.primitives.push(
        primitive(`forest-canopy-${trees}-a`, "sphere", 0, x - 0.45, y + height * 0.78, z + 0.2, crown, height * ecology.float(0.28, 0.4), crown * 0.9, "moss", ["forest", "canopy", "closed-canopy", "cover", "broadleaf-crown"]),
        primitive(`forest-canopy-${trees}-b`, "sphere", 0, x + 0.5, y + height * 0.83, z - 0.28, crown * 0.82, height * ecology.float(0.22, 0.34), crown, "moss", ["forest", "canopy", "closed-canopy", "cover", "broadleaf-crown"]),
      );
      if (trees % 7 === 0) for (const angle of [0.3, 2.4, 4.5]) scene.primitives.push(box(`forest-root-flare-${trees}-${angle}`, 0, x + Math.cos(angle) * 0.7, y + feetToMeters(0.7), z + Math.sin(angle) * 0.7, 0.42, feetToMeters(1.4), 1.8, "wood", ["forest", "root-flare", "cover"], angle));
    } else if (species === "conifer") {
      const crown = trunk * CELL * ecology.float(4.2, 5.2);
      scene.primitives.push(
        primitive(`forest-canopy-${trees}-lower`, "cone", 0, x, y + height * 0.6, z, crown, height * 0.5, crown, "moss", ["forest", "canopy", "closed-canopy", "conifer-crown"]),
        primitive(`forest-canopy-${trees}-upper`, "cone", 0, x, y + height * 0.82, z, crown * 0.68, height * 0.34, crown * 0.68, "moss", ["forest", "canopy", "closed-canopy", "conifer-crown"]),
      );
    } else if (species === "understory") {
      const crown = trunk * CELL * ecology.float(3.8, 4.8);
      scene.primitives.push(primitive(`forest-canopy-${trees}`, "sphere", 0, x, y + height * 0.74, z, crown, height * 0.38, crown, "moss", ["forest", "canopy", "understory-tree", "young-tree"]));
    } else {
      for (const [branchIndex, angle] of [0.25, 2.3].entries()) scene.primitives.push(box(`forest-snag-branch-${trees}-${branchIndex}`, 0, x + Math.cos(angle) * 0.38, y + height * (0.5 + branchIndex * 0.16), z + Math.sin(angle) * 0.38, 1.15, feetToMeters(0.36), 0.16, "wood", ["forest", "snag", "deadwood", "cover"], angle));
    }
    if (trees % 13 === 0) scene.tactical.push(tacticalFeature(`forest-tree-cover-${trees}`, "cover", x, z, y, 1, "A mature tree and its roots break lines of sight."));
    trees += 1;
  }
  const undergrowthCount = Math.round(18 + density * 135);
  for (let index = 0; index < undergrowthCount; index += 1) {
    const x = micro.float(2, cols - 2); const z = micro.float(2, rows - 2);
    if (clearingAt(x, z) >= 0 || routeDistance(x, z, primaryPoints) < 1.4) continue;
    const radius = micro.float(0.35, 0.85);
    scene.primitives.push(primitive(`forest-undergrowth-${index}`, "sphere", 0, x, surfaceY(x, z), z, radius * CELL, feetToMeters(micro.float(1.2, 3.5)), radius * CELL, "moss", ["forest", "undergrowth", "difficult-terrain", "natural-detail"]));
  }
  const logCount = Math.round(4 + density * 10);
  for (let index = 0; index < logCount; index += 1) {
    const x = micro.float(3, cols - 3); const z = micro.float(3, rows - 3); const length = micro.float(3.5, 7.5); const angle = micro.float(-Math.PI, Math.PI);
    scene.primitives.push(box(`forest-fallen-log-${index}`, 0, x, surfaceY(x, z) + feetToMeters(0.8), z, 0.75, feetToMeters(1.5), length, "wood", ["forest", "fallen-log", "cover", "climbable", "standable"], angle));
  }
  const ancientCount = 2 + Math.round(density * 2);
  const ancientPlatforms: Array<{ x: number; z: number; y: number; platformY: number }> = [];
  for (let index = 0; index < ancientCount; index += 1) {
    const anchor = clearings[index % clearings.length]!; const x = anchor.x + anchor.rx * 0.72; const z = anchor.z - anchor.rz * 0.46; const y = surfaceY(x, z); const height = feetToMeters(45 + index * 4); const platformY = y + feetToMeters(15 + index * 3);
    ancientPlatforms.push({ x, z, y, platformY });
    scene.primitives.push(cylinder(`forest-ancient-tree-${index}`, 0, x, y, z, 2.2 + index * 0.15, height, "wood", ["forest", "tree", "giant-tree", "landmark", "support"]));
    for (const [lobe, dx, dz, scale] of [[0, -1.8, 0.8, 1], [1, 1.5, -0.5, 0.88], [2, 0.4, 1.8, 0.72]] as const) scene.primitives.push(primitive(`forest-ancient-canopy-${index}-${lobe}`, "sphere", 0, x + dx, y + height * (0.73 + lobe * 0.035), z + dz, feetToMeters(30) * scale, feetToMeters(18) * (0.72 + scale * 0.24), feetToMeters(30) * scale, "moss", ["forest", "canopy", "closed-canopy", "landmark", "ancient-crown-lobe"]));
    scene.primitives.push(cylinder(`forest-canopy-platform-${index}`, 0, x, platformY, z, 3.3, feetToMeters(1), "wood", ["forest", "canopy-platform", "platform", "high-ground", "standable", "supported"]));
    for (const [rootIndex, angle] of [0.2, 2.25, 4.3].entries()) {
      scene.primitives.push(box(`forest-ancient-root-${index}-${rootIndex}`, 0, x + Math.cos(angle) * 2.1, y + feetToMeters(1.2), z + Math.sin(angle) * 2.1, 1.05, feetToMeters(2.4), 4.8, "wood", ["forest", "giant-tree", "root-buttress", "cover", "climbable"], angle));
    }
    const outwardX = x - anchor.x; const outwardZ = z - anchor.z; const outwardLength = Math.max(0.1, Math.hypot(outwardX, outwardZ));
    const nx = outwardX / outwardLength; const nz = outwardZ / outwardLength;
    const stairStartX = x + nx * 4.2; const stairStartZ = z + nz * 4.2;
    const stairEndX = x + nx * 1.2; const stairEndZ = z + nz * 1.2;
    const stair = stairConnection(`forest-tree-ascent-${index}`, 0, { xCells: stairStartX, zCells: stairStartZ, yMeters: surfaceY(stairStartX, stairStartZ) }, { xCells: stairEndX, zCells: stairEndZ, yMeters: platformY + FLOOR_SLAB_METERS }, 1.15, "wood", ["forest", "vertical-route", "vertical-opening", "tree-ascent", "supported"]);
    scene.primitives.push(stair.primitive); scene.routes.push(stairRoute(`forest-canopy-route-${index}`, stair));
    scene.tactical.push(tacticalFeature(`forest-canopy-highground-${index}`, "highGround", x, z, platformY, 2, "A reachable platform in an ancient tree overlooks the clearing."));
  }
  for (let index = 1; index < ancientPlatforms.length; index += 1) {
    const from = ancientPlatforms[index - 1]!;
    const to = ancientPlatforms[index]!;
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span > 30) continue;
    const bridgeY = Math.min(from.platformY, to.platformY) + Math.abs(from.platformY - to.platformY) * 0.35;
    scene.primitives.push(
      corridor(`forest-canopy-bridge-${index}`, 0, from.x, from.z, to.x, to.z, bridgeY, 1.25, "wood", ["forest", "canopy-bridge", "high-ground", "standable", "supported", "surface-grid"]),
      box(`forest-canopy-bridge-rail-${index}`, 0, (from.x + to.x) / 2, bridgeY + feetToMeters(2.2), (from.z + to.z) / 2, span, 0.18, 0.18, "wood", ["forest", "canopy-bridge", "railing", "cover"], Math.atan2(to.z - from.z, to.x - from.x)),
    );
    scene.routes.push(createRoute(`forest-canopy-bridge-route-${index}`, "alternate", [
      { x: from.x, z: from.z, y: bridgeY },
      { x: to.x, z: to.z, y: bridgeY },
    ], { purpose: "movement", traffic: 0.48, schedule: "all" }));
    scene.tactical.push(tacticalFeature(`forest-canopy-bridge-choke-${index}`, "chokepoint", (from.x + to.x) / 2, (from.z + to.z) / 2, bridgeY, 1, "A narrow supported canopy bridge creates an elevated alternate route."));
  }
  scene.rooms.push(
    createRoom("forest-edge", "Forest edge", "natural", 0, cols * 0.5, rows * 0.12, cols - 4, 6, surfaceY(cols * 0.5, rows * 0.12)),
    ...clearings.map((entry, index) => createRoom(`forest-clearing-${index + 1}`, `Irregular clearing ${index + 1}`, index === 1 ? "combat" : "natural", 0, entry.x, entry.z, entry.rx * 1.5, entry.rz * 1.5, surfaceY(entry.x, entry.z))),
    createRoom("forest-deep", "Closed-canopy woodland", "natural", 0, cols * 0.74, rows * 0.76, cols * 0.38, rows * 0.34, surfaceY(cols * 0.74, rows * 0.76)),
  );
  connectRooms(scene.rooms, "forest-edge", "forest-clearing-1"); connectRooms(scene.rooms, "forest-clearing-1", "forest-clearing-2"); connectRooms(scene.rooms, "forest-clearing-2", "forest-clearing-3"); connectRooms(scene.rooms, "forest-clearing-3", "forest-deep");
  scene.tactical.push(tacticalFeature("forest-entrance", "entrance", 1.5, rows * 0.18, surfaceY(1.5, rows * 0.18), 2, "A narrow game trail enters beneath a layered canopy."), tacticalFeature("forest-clearing-choke", "chokepoint", clearings[1]!.x, clearings[1]!.z, surfaceY(clearings[1]!.x, clearings[1]!.z), 3, "The middle clearing exposes movement between two dense tree walls."));
  scene.description = `Layered forest composition with ${rendered.walkable} terrain cells, ${rendered.cliffs} elevation boundaries (${rendered.slopes} natural slope facades), ${maximumTerrainLevel + 1} elevation bands, ${edgeClusterTarget} discontinuous forest-edge clusters (${edgeRootCount} root aprons, ${edgeShrubCount} shrubs, ${edgeLogCount} fallen logs), three irregular clearings, ${trees} clustered trees (${speciesCounts.broadleaf} broadleaf, ${speciesCounts.conifer} conifer, ${speciesCounts.snag} snags, ${speciesCounts.understory} understory), ${undergrowthCount} undergrowth attempts, ${logCount} fallen logs, ${ancientCount} reachable canopy platforms${coldForest ? `, ${snowPatchCount} high-ground snow patches` : ""}${streamWanted ? ", and a shallow stream" : ""}.`;
  scene.floorHeightFeet = [Math.ceil((rendered.yOf(maximumTerrainLevel) + feetToMeters(54)) / 0.3048)];
}

function terrainSurfaceY(scene: GeneratedScene, xCells: number, zCells: number, fallback: number): number {
  const worldX = xCells * CELL;
  const worldZ = zCells * CELL;
  const surface = scene.primitives
    .filter((item) => item.tags?.includes("floor") && item.tags?.includes("terrain"))
    .sort((left, right) => Math.hypot(worldX - left.position.x, worldZ - left.position.z) - Math.hypot(worldX - right.position.x, worldZ - right.position.z))[0];
  return surface ? surface.position.y + surface.size.y + 0.04 : fallback;
}

function streamAtForForest(scene: GeneratedScene, xCells: number, depth: number): number {
  const streamPieces = scene.primitives
    .filter((item) => item.tags?.includes("forest") && item.tags?.includes("stream"))
    .map((item) => ({ x: item.position.x / CELL, z: item.position.z / CELL }))
    .sort((left, right) => Math.abs(left.x - xCells) - Math.abs(right.x - xCells));
  return streamPieces[0]?.z ?? depth * 0.61;
}

function ancientPlatformsNear(scene: GeneratedScene, xCells: number, zCells: number): Array<{ x: number; z: number; platformY: number }> {
  return scene.primitives
    .filter((item) => item.tags?.includes("canopy-platform"))
    .map((item) => ({ x: item.position.x / CELL, z: item.position.z / CELL, platformY: item.position.y + item.size.y }))
    .sort((left, right) => Math.hypot(left.x - xCells, left.z - zCells) - Math.hypot(right.x - xCells, right.z - zCells));
}

function addWildernessBuildingSite(scene: GeneratedScene, context: GeneratorContext, width: number, depth: number, archetype: WildernessArchetype): void {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const facilityProfile = embeddedFacilityProfile(text);
  const facilityCapabilities = embeddedFacilityCapabilities(text);
  const wantsBuilding = facilityProfile !== undefined || [
    "木屋", "小屋", "猎人屋", "炼金师小屋", "林间屋", "林务站", "林务所", "巡护站", "护林站",
    "检疫站", "气象站", "科研站", "研究站", "观测站", "通信站", "雷达站", "边防站",
    "cabin", "lodge", "hut", "cottage", "outpost", "ranger station", "forestry station", "驿站",
    "quarantine station", "weather station", "meteorological station", "research station", "field station", "radio station",
  ].some((term) => text.includes(term));
  if (!wantsBuilding || !["forest", "river-valley", "mountain", "swamp", "ice", "volcanic", "infernal-waste", "rift", "impact-crater"].includes(archetype)) return;
  const alchemical = ["炼金", "alchemy", "alchemist"].some((term) => text.includes(term));
  const hunter = ["猎人", "hunter"].some((term) => text.includes(term));
  const quarantine = facilityProfile === "quarantine";
  const weatherStation = facilityProfile === "weather";
  const researchStation = facilityProfile === "research";
  const borderOutpost = facilityProfile === "border";
  const rangerStation = facilityProfile === "ranger";
  const mangrove = ["红树林", "mangrove"].some((term) => text.includes(term));
  const coldWetland = archetype === "ice"
    && ["冻土", "冰原", "tundra", "permafrost"].some((term) => text.includes(term))
    && ["湿地", "水沢", "wetland", "marsh"].some((term) => text.includes(term));
  const wantsTrapLine = ["陷阱线", "陷阱", "绊索", "trap line", "trapline", "snare"].some((term) => text.includes(term));
  const wantsFootbridge = ["木桥", "溪边木桥", "footbridge", "foot bridge"].some((term) => text.includes(term));
  const wantsCanopyObservatory = ["树冠观察台", "树冠平台", "瞭望台", "观察台", "canopy observatory", "lookout"].some((term) => text.includes(term));
  const wantsLookoutTower = ["瞭望塔", "巡逻塔", "观察塔", "lookout tower", "watchtower"].some((term) => text.includes(term));
  const wantsTrench = ["陷阱沟", "壕沟", "沟渠", "trench", "ditch"].some((term) => text.includes(term));
  const wantsLogDefense = ["倒木防线", "倒木", "木桩防线", "fallen-log defense", "log barricade"].some((term) => text.includes(term));
  const wantsIsolationShed = ["隔离棚", "隔离区", "quarantine shed", "isolation shed"].some((term) => text.includes(term));
  const wantsTidalDock = ["潮汐码头", "潮汐栈桥", "码头", "tidal dock", "tidal pier"].some((term) => text.includes(term));
  const wantsCommunicationsTower = facilityCapabilities.communications;
  const wantsGeneratorShed = facilityCapabilities.generator;
  const wantsIceFissure = ["冰水裂沟", "冰裂沟", "冰隙", "冰川裂缝", "冰川裂隙", "巨大裂缝", "ice-water fissure", "ice fissure", "crevasse"].some((term) => text.includes(term));
  const wantsReserveVault = facilityCapabilities.undergroundStore;
  if (coldWetland) {
    for (const primitiveEntry of scene.primitives) {
      if (!primitiveEntry.tags?.some((tag) => tag === "water" || tag === "thaw-basin" || tag === "thaw-pool")) continue;
      primitiveEntry.tags = [...new Set([...(primitiveEntry.tags ?? []), "wetland", "cold-wetland"] )];
    }
  }
  const streamWanted = ["溪", "溪流", "小溪", "stream", "creek"].some((term) => text.includes(term));
  const riverAnchor = archetype === "river-valley"
    ? scene.primitives
      .filter((item) => item.tags?.includes("watercourse") && !item.tags?.includes("tributary"))
      .sort((left, right) => Math.abs(left.position.x / CELL - width * 0.3) - Math.abs(right.position.x / CELL - width * 0.3))[0]
    : undefined;
  const riverX = riverAnchor?.position.x ? riverAnchor.position.x / CELL : width * 0.28;
  const riverZ = riverAnchor?.position.z ? riverAnchor.position.z / CELL : depth * 0.5;
  const shoreDirection = riverZ < depth * 0.5 ? 1 : -1;
  const requestedX = archetype === "forest" ? width * 0.52 : Math.max(12, Math.min(width - 12, riverX));
  const requestedZ = archetype === "river-valley"
    ? Math.max(8, Math.min(depth - 8, riverZ + shoreDirection * 7.5))
    : archetype === "forest" ? depth * 0.5 : depth * 0.28;
  const engineeredFoundation = ["volcanic", "infernal-waste", "rift", "impact-crater"].includes(archetype);
  const safePlacement = findReservedSafePlacement(scene, requestedX, requestedZ, 13, 12, engineeredFoundation ? "engineered" : "full");
  if (!safePlacement) return;
  const x = safePlacement.x;
  const z = safePlacement.z;
  const supportSurface = scene.primitives
    .filter((item) => item.tags?.includes("floor") && item.tags?.includes("terrain"))
    .map((item) => ({ item, distance: Math.hypot(item.position.x / CELL - x, item.position.z / CELL - z) }))
    .filter((entry) => entry.distance < 3)
    .sort((left, right) => left.distance - right.distance)[0]?.item;
  const terrainBaseY = supportSurface
    ? supportSurface.position.y + supportSurface.size.y
    : archetype === "river-valley" || archetype === "mountain" ? feetToMeters(10) : FLOOR_SLAB_METERS * 2;
  const raisedFoundationFeet = quarantine || weatherStation || archetype === "swamp" ? (archetype === "ice" ? 4 : 6) : 0;
  const baseY = terrainBaseY + feetToMeters(raisedFoundationFeet);
  // Clear only procedural clutter in the building pad. Authored terrain,
  // rivers, cliffs and routes remain the owner of the surrounding site.
  scene.primitives = scene.primitives.filter((item) => {
    if (item.tags?.includes("floor") || item.tags?.includes("terrain")) return true;
    // Tactical tree structures own their support and route geometry. A cabin
    // pad may clear brush and ordinary trees, but must not orphan a retained
    // canopy route by deleting its stair or platform primitive.
    if (item.tags?.some((tag) => tag === "vertical-route" || tag === "canopy-platform" || tag === "giant-tree")) return true;
    if (!item.tags?.some((tag) => tag === "natural-detail" || tag === "natural-prop" || tag === "cover" || tag === "forest" || tag === "woodland-cover" || tag === "tree" || tag === "canopy" || tag === "fallen-log")) return true;
    const px = item.position.x / CELL; const pz = item.position.z / CELL;
    const halfWidth = Math.max(0.4, item.size.x / CELL / 2);
    const halfDepth = Math.max(0.4, item.size.z / CELL / 2);
    const clearanceX = archetype === "river-valley" ? 12 : 10.5;
    const clearanceZ = archetype === "river-valley" ? 10 : 9.5;
    // Clear by footprint intersection. Centre-only tests left huge crowns
    // hanging over a station even though their trunks were outside the pad.
    return Math.abs(px - x) - halfWidth > clearanceX
      || Math.abs(pz - z) - halfDepth > clearanceZ;
  });
  // A child building invalidates any optional parent-terrain crest route that
  // ran through its footprint. Keeping the route after clearing its supporting
  // ridge produced a formally connected but physically impossible composite.
  scene.routes = scene.routes.filter((route) => !route.id.startsWith("ice-snow-ridge-route-")
    || route.points.every((point) => Math.hypot(point.x / CELL - x, point.z / CELL - z) > 8.5));
  scene.primitives.push(box(
    "wilderness-building-pad",
    0,
    x,
    baseY - FLOOR_SLAB_METERS,
    z,
    13,
    FLOOR_SLAB_METERS,
    12,
    quarantine || weatherStation || archetype === "swamp" ? "wood" : archetype === "forest" ? "earth" : "rock",
    ["floor", "terrain", "building-pad", "site-program", "standable", ...(raisedFoundationFeet > 0 ? ["stilt-platform", "raised-foundation"] : [])],
  ));
  for (const [index, dx, dz] of [[0, -4.8, -3.8], [1, 4.8, -3.8], [2, -4.8, 3.8], [3, 4.8, 3.8]] as const) {
    scene.primitives.push(cylinder(
      `wilderness-foundation-pier-${index}`,
      0,
      x + dx,
      Math.min(terrainBaseY, 0),
      z + dz,
      0.7,
      Math.max(FLOOR_SLAB_METERS, baseY - Math.min(terrainBaseY, 0)),
      quarantine || weatherStation || archetype === "swamp" ? "wood" : "darkStone",
      ["foundation", "terrain-adapter", "site-program", ...(raisedFoundationFeet > 0 ? ["stilt-foundation", "structural-support"] : [])],
    ));
  }
  const nearestReservation = scene.terrainReservations
    ?.slice()
    .sort((left, right) => Math.hypot(left.centerCells.x - x, left.centerCells.z - z) - Math.hypot(right.centerCells.x - x, right.centerCells.z - z))[0];
  const entranceDirection = nearestReservation && nearestReservation.centerCells.x > x ? -1 : 1;
  const entrance = { x: x + entranceDirection * 8.5, z: z + 5.5 };
  const functionalModules: BuildingFunctionalModuleProgram[] = quarantine ? [
    { id: "quarantine-observation", kind: "observation", label: "Roof quarantine watch", levelRole: "roof", requiresVerticalLandmark: true, minimumFootprintCells: 16, tags: ["quarantine-watch", "restricted"] },
    { id: "quarantine-medical-vault", kind: "archive", label: "Secret medicine vault", levelRole: "basement", minimumFootprintCells: 14, tags: ["medical-vault", "medicine-store", "secret"] },
  ] : weatherStation ? [
    { id: "weather-observation", kind: "observation", label: "Meteorological instrument deck", levelRole: "roof", requiresVerticalLandmark: true, minimumFootprintCells: 16, tags: ["weather-instruments", "communications-tower"] },
    { id: "weather-generator", kind: "workshop", label: "Generator service room", levelRole: "ground", requiresExteriorAccess: true, minimumFootprintCells: 15, tags: ["generator-shed", "power-service"] },
    { id: "weather-reserve", kind: "archive", label: "Underground reserve store", levelRole: "basement", minimumFootprintCells: 16, tags: ["reserve-vault", "underground-reserve"] },
  ] : researchStation ? [
    { id: "field-laboratory", kind: "laboratory", label: "Field laboratory", levelRole: "ground", requiresExteriorAccess: true, minimumFootprintCells: 18, tags: ["field-laboratory", "sample-processing"] },
    { id: "field-observation", kind: "observation", label: "Observation and radio deck", levelRole: "roof", requiresVerticalLandmark: true, minimumFootprintCells: 14, tags: ["field-observation", "radio-deck"] },
    { id: "field-archive", kind: "archive", label: "Underground specimen archive", levelRole: "basement", minimumFootprintCells: 15, tags: ["specimen-archive", "reserve-vault"] },
  ] : [];
  instantiateBuildingModule(scene, {
    id: "wilderness-core-building",
    kind: quarantine ? "clinic" : weatherStation || researchStation ? "guild" : alchemical ? "guild" : "home",
    x,
    z,
    width: alchemical ? 11 : 9,
    depth: alchemical ? 10 : 8,
    rotation: context.rng.fork("wilderness-building-facing").float(-0.18, 0.18),
    district: `${archetype}-clearing`,
    seed: `${context.request.seed}/wilderness-building/1`,
    lod: "full-interior",
    parcelId: "wilderness-parcel-1",
    frontageRoadId: "wilderness-access-trail",
    entrance,
    baseY,
    functionalModules,
    siteProfile: quarantine ? "quarantine-station" : weatherStation ? "weather-station" : researchStation ? "field-station" : borderOutpost ? "border-outpost" : rangerStation ? "ranger-station" : undefined,
    climateProfile: archetype === "ice" ? "polar" : archetype === "swamp" ? "wetland" : archetype === "volcanic" || archetype === "infernal-waste" ? "volcanic" : archetype === "mountain" || archetype === "rift" || archetype === "impact-crater" ? "alpine" : archetype === "forest" ? "forest" : archetype === "river-valley" ? "coastal" : "temperate",
  }, context.rng.fork("wilderness-building"));
  scene.viewProgram = {
    version: 1,
    mode: "site",
    focusCells: { x, z },
    radiusCells: Math.max(18, Math.min(28, 18 + context.request.density * 8)),
    includeTags: ["site-program", "building-pad", "settlement-building", "communications-tower", "generator-shed"],
    reason: "Keep the single authored wilderness compound readable while retaining its immediate parent-terrain context.",
  };
  const wildernessRoot = scene.rooms.find((room) => room.id === "wilderness-core-building-room");

  if (archetype === "volcanic" && (researchStation || weatherStation)) {
    const craterZone = scene.terrainReservations?.find((zone) => zone.id === "volcanic-crater-lava-reservation");
    if (craterZone) {
      const craterDx = craterZone.centerCells.x - x;
      const craterDz = craterZone.centerCells.z - z;
      const craterDistance = Math.max(0.1, Math.hypot(craterDx, craterDz));
      const directionX = craterDx / craterDistance;
      const directionZ = craterDz / craterDistance;
      const requestedTargetX = x + directionX * Math.min(13.5, craterDistance * 0.42);
      const requestedTargetZ = z + directionZ * Math.min(13.5, craterDistance * 0.42);
      const targetPlacement = findReservedSafePlacement(scene, requestedTargetX, requestedTargetZ, 4.8, 4.8, "engineered");
      if (targetPlacement) {
      const targetX = targetPlacement.x;
      const targetZ = targetPlacement.z;
      const targetSurfaceY = terrainSurfaceY(scene, targetX, targetZ, terrainBaseY);
      const targetY = targetSurfaceY + feetToMeters(2.2);
      const startX = x + directionX * 6.1;
      const startZ = z + directionZ * 5.5;
      const startY = baseY + FLOOR_SLAB_METERS;
      const span = Math.hypot(targetX - startX, targetZ - startZ);
      scene.primitives.push(cylinder("volcanic-station-inspection-platform", 0, targetX, targetSurfaceY, targetZ, 4.8, feetToMeters(2.2), "darkStone", ["site-program", "volcanic-inspection-platform", "basalt-platform", "platform", "supported", "standable", "high-ground"]));
      if (Math.abs(targetY - startY) < 0.35) {
        scene.primitives.push(corridor("volcanic-station-inspection-bridge", 0, startX, startZ, targetX, targetZ, Math.min(startY, targetY), 1.45, "darkStone", ["site-program", "volcanic-maintenance-bridge", "bridge", "supported", "standable", "authorized-hazard-crossing"]));
      } else {
        const lower = targetY < startY ? { xCells: targetX, zCells: targetZ, yMeters: targetY } : { xCells: startX, zCells: startZ, yMeters: startY };
        const upper = targetY < startY ? { xCells: startX, zCells: startZ, yMeters: startY } : { xCells: targetX, zCells: targetZ, yMeters: targetY };
        const inspectionBridge = stairConnection("volcanic-station-inspection-bridge", 0, lower, upper, 1.45, "darkStone", ["site-program", "volcanic-maintenance-bridge", "bridge", "supported", "standable", "authorized-hazard-crossing"]);
        scene.primitives.push(inspectionBridge.primitive);
      }
      const supportCount = Math.max(2, Math.min(4, Math.round(span / 3.5)));
      for (let supportIndex = 1; supportIndex <= supportCount; supportIndex += 1) {
        const ratio = supportIndex / (supportCount + 1);
        const supportX = startX + (targetX - startX) * ratio;
        const supportZ = startZ + (targetZ - startZ) * ratio;
        const supportTop = startY + (targetY - startY) * ratio;
        const supportBottom = -0.45;
        scene.primitives.push(cylinder(`volcanic-station-bridge-support-${supportIndex}`, 0, supportX, supportBottom, supportZ, 0.42, Math.max(FLOOR_SLAB_METERS, supportTop - supportBottom), "darkStone", ["site-program", "volcanic-maintenance-bridge", "bridge-support", "structural-support", "authorized-hazard-crossing"]));
      }
      scene.routes.push(createRoute("volcanic-station-inspection-route", "alternate", [
        { x: startX, z: startZ, y: startY },
        { x: targetX, z: targetZ, y: targetY },
      ], { purpose: "service", traffic: 0.18, schedule: "all" }));
      const inspectionRoom = createRoom("volcanic-station-inspection-room", "Basalt caldera observation platform", "combat", 0, targetX, targetZ, 4.8, 4.8, targetY);
      scene.rooms.push(inspectionRoom);
      if (wildernessRoot) connectRooms(scene.rooms, wildernessRoot.id, inspectionRoom.id);
      scene.tactical.push(tacticalFeature("volcanic-station-bridge-choke", "chokepoint", (startX + targetX) / 2, (startZ + targetZ) / 2, (startY + targetY) / 2, 1, "A supported basalt inspection bridge is the exposed service route between the station and the caldera instruments."));
      scene.tactical.push(tacticalFeature("volcanic-station-inspection-high", "highGround", targetX, targetZ, targetY, 2, "A cooled basalt instrument platform overlooks the active lava network without occupying it."));
      }
    }
  }

  if (archetype === "swamp") {
    const reedRoute = scene.routes.find((route) => route.id === "swamp-reed-route");
    if (reedRoute) {
      const buildingPieces = scene.primitives.filter((primitiveEntry) => primitiveEntry.tags?.includes("building-instance:wilderness-core-building"));
      const footprint = buildingPieces.reduce((bounds, primitiveEntry) => {
        const rotation = primitiveEntry.rotationY ?? 0;
        const cosine = Math.abs(Math.cos(rotation));
        const sine = Math.abs(Math.sin(rotation));
        const halfX = (primitiveEntry.size.x * cosine + primitiveEntry.size.z * sine) / CELL / 2;
        const halfZ = (primitiveEntry.size.x * sine + primitiveEntry.size.z * cosine) / CELL / 2;
        const px = primitiveEntry.position.x / CELL;
        const pz = primitiveEntry.position.z / CELL;
        return {
          minX: Math.min(bounds.minX, px - halfX), maxX: Math.max(bounds.maxX, px + halfX),
          minZ: Math.min(bounds.minZ, pz - halfZ), maxZ: Math.max(bounds.maxZ, pz + halfZ),
        };
      }, { minX: x - 7, maxX: x + 7, minZ: z - 6, maxZ: z + 6 });
      const routeClearance = 2.2;
      const westX = Math.max(2, footprint.minX - routeClearance);
      const eastX = Math.min(width - 2, footprint.maxX + routeClearance);
      const northZ = Math.max(2, footprint.minZ - routeClearance);
      const southZ = Math.min(depth - 2, footprint.maxZ + routeClearance);
      const routeStartX = 1.5;
      const routeEndX = width - 1.5;
      const routePoint = (pointX: number, pointZ: number) => ({
        x: pointX * CELL,
        z: pointZ * CELL,
        y: terrainSurfaceY(scene, pointX, pointZ, terrainBaseY),
      });
      reedRoute.points = [
        routePoint(routeStartX, northZ),
        routePoint(westX, northZ),
        routePoint(westX, southZ),
        routePoint(eastX, southZ),
        routePoint(routeEndX, southZ),
      ];
    }
  }

  if (mangrove) {
    for (const primitiveEntry of scene.primitives) {
      if (primitiveEntry.tags?.includes("watercourse") || primitiveEntry.tags?.includes("pool")) {
        primitiveEntry.tags = [...new Set([...(primitiveEntry.tags ?? []), "mangrove", "tidal-channel"])];
      }
    }
    const rootRng = context.rng.fork("mangrove-station-roots");
    const rootCount = Math.round(7 + context.request.density * 8);
    for (let index = 0; index < rootCount; index += 1) {
      const angle = index / rootCount * Math.PI * 2 + rootRng.float(-0.18, 0.18);
      const radius = rootRng.float(12.5, 18);
      const rootX = Math.max(2, Math.min(width - 2, x + Math.cos(angle) * radius));
      const rootZ = Math.max(2, Math.min(depth - 2, z + Math.sin(angle) * radius));
      if (Math.hypot(rootX - x, rootZ - z) < 11.5) continue;
      const rootBase = terrainSurfaceY(scene, rootX, rootZ, terrainBaseY);
      scene.primitives.push(
        cylinder(`wilderness-mangrove-root-${index}`, 0, rootX, rootBase, rootZ, rootRng.float(0.55, 0.95), feetToMeters(rootRng.int(8, 14)), "wood", ["site-program", "mangrove", "prop-root", "root-buttress", "cover"]),
        primitive(`wilderness-mangrove-canopy-${index}`, "sphere", 1, rootX, rootBase + feetToMeters(rootRng.int(9, 14)), rootZ, rootRng.float(2.8, 4.2), rootRng.float(1.4, 2.2), rootRng.float(2.6, 4), "moss", ["site-program", "mangrove", "canopy", "blocks-sight"]),
      );
    }
  }

  if (quarantine && wantsIsolationShed) {
    const shedX = Math.max(5, Math.min(width - 5, x + 9.5));
    // Keep the detached ward on the opposite side of the authored reed route;
    // a quarantine shed is a destination, not an obstacle placed over an
    // existing wetland traversal line.
    const shedZ = Math.max(5, Math.min(depth - 5, z - 7.5));
    const shedY = baseY;
    const shedApproachX = x + 6.2;
    const shedApproachZ = z + 5.6;
    scene.primitives.push(
      box("wilderness-quarantine-shed-floor", 0, shedX, shedY, shedZ, 6.4, FLOOR_SLAB_METERS, 5.2, "wood", ["site-program", "quarantine-shed", "floor", "standable", "restricted"]),
      box("wilderness-quarantine-shed-north", 0, shedX, shedY, shedZ - 2.6, 6.4, feetToMeters(8), 0.2, "plaster", ["site-program", "quarantine-shed", "wall", "restricted"]),
      box("wilderness-quarantine-shed-west", 0, shedX - 3.2, shedY, shedZ, 0.2, feetToMeters(8), 5.2, "plaster", ["site-program", "quarantine-shed", "wall", "restricted"]),
      box("wilderness-quarantine-shed-east", 0, shedX + 3.2, shedY, shedZ, 0.2, feetToMeters(8), 5.2, "plaster", ["site-program", "quarantine-shed", "wall", "restricted", "focus-cutaway"]),
      box("wilderness-quarantine-shed-south-left", 0, shedX - 2.1, shedY, shedZ + 2.6, 2.2, feetToMeters(8), 0.2, "plaster", ["site-program", "quarantine-shed", "wall", "door-frame"]),
      box("wilderness-quarantine-shed-south-right", 0, shedX + 2.1, shedY, shedZ + 2.6, 2.2, feetToMeters(8), 0.2, "plaster", ["site-program", "quarantine-shed", "wall", "door-frame", "focus-cutaway"]),
      primitive("wilderness-quarantine-shed-roof", "gable", 1, shedX, shedY + feetToMeters(8), shedZ, 5.8 * CELL, feetToMeters(3.8), 7 * CELL, "roof", ["site-program", "quarantine-shed", "roof", "pitched-roof"]),
      box("wilderness-quarantine-cot-a", 0, shedX - 1.5, shedY + FLOOR_SLAB_METERS, shedZ - 0.8, 1.1, feetToMeters(2.1), 2.5, "wood", ["site-program", "quarantine-shed", "cot", "cover"]),
      box("wilderness-quarantine-cot-b", 0, shedX + 1.5, shedY + FLOOR_SLAB_METERS, shedZ - 0.8, 1.1, feetToMeters(2.1), 2.5, "wood", ["site-program", "quarantine-shed", "cot", "cover"]),
      corridor("wilderness-quarantine-boardwalk", 0, shedApproachX, shedApproachZ, shedX - 3.2, shedZ + 2.1, shedY + FLOOR_SLAB_METERS, 1.35, "wood", ["site-program", "quarantine-shed", "boardwalk", "bridge", "standable", "supported"]),
    );
    const shedRoom = createRoom("wilderness-quarantine-shed-room", "Detached quarantine ward", "service", 0, shedX, shedZ, 6.4, 5.2, shedY);
    scene.rooms.push(shedRoom);
    if (wildernessRoot) connectRooms(scene.rooms, wildernessRoot.id, shedRoom.id);
    scene.routes.push(createRoute("wilderness-quarantine-shed-route", "alternate", [
      { x: shedApproachX, z: shedApproachZ, y: shedY + FLOOR_SLAB_METERS },
      { x: shedX - 3.2, z: shedZ + 2.1, y: shedY + FLOOR_SLAB_METERS },
      { x: shedX, z: shedZ, y: shedY + FLOOR_SLAB_METERS },
    ], { purpose: "service", traffic: 0.22, schedule: "all" }));
    scene.tactical.push(tacticalFeature("wilderness-quarantine-shed-choke", "chokepoint", shedX - 3.2, shedZ + 2.1, shedY, 1, "The narrow isolation boardwalk controls entry to the detached quarantine ward."));
  }

  if (quarantine) {
    const interiorTags = ["site-program", "quarantine-interior", "building-instance:wilderness-core-building", "full-interior", "focus-interior"];
    scene.primitives.push(
      box("wilderness-quarantine-reception-desk", 0, x - 1.8, baseY + FLOOR_SLAB_METERS, z + 1.4, 3.2, feetToMeters(3.2), 0.9, "wood", [...interiorTags, "reception", "cover"]),
      box("wilderness-quarantine-screen", 0, x + 0.8, baseY + FLOOR_SLAB_METERS, z - 0.4, 0.2, feetToMeters(7), 4.2, "metal", [...interiorTags, "partition", "restricted", "cover"]),
      cylinder("wilderness-quarantine-wash-a", 0, x + 2.3, baseY + FLOOR_SLAB_METERS, z - 1.4, 0.75, feetToMeters(6), "metal", [...interiorTags, "decontamination", "wash-station"]),
      cylinder("wilderness-quarantine-wash-b", 0, x + 2.3, baseY + FLOOR_SLAB_METERS, z + 1.1, 0.75, feetToMeters(6), "metal", [...interiorTags, "decontamination", "wash-station"]),
      box("wilderness-quarantine-exam-cot", 0, x - 0.2, baseY + FLOOR_SLAB_METERS, z - 2.1, 1.2, feetToMeters(2.4), 2.8, "wood", [...interiorTags, "exam-cot", "cover"]),
    );
    scene.tactical.push(tacticalFeature("wilderness-quarantine-interior-choke", "chokepoint", x + 0.8, z, baseY, 1, "A decontamination screen divides public reception from the restricted treatment side."));
  }

  if (wantsReserveVault) {
    const vaultY = Math.min(baseY - feetToMeters(14), FLOOR_SLAB_METERS - feetToMeters(10));
    const vaultTags = quarantine
      ? ["site-program", "medical-vault", "reserve-vault", "medicine-store", "underground", "restricted", "cover"]
      : ["site-program", "reserve-vault", "underground-reserve", "storage", "underground", "restricted", "cover"];
    scene.primitives.push(
      box("wilderness-reserve-vault-locker-a", 3, x - 1.7, vaultY + FLOOR_SLAB_METERS, z, 0.8, feetToMeters(5.5), 3.2, "metal", vaultTags),
      box("wilderness-reserve-vault-locker-b", 3, x + 1.7, vaultY + FLOOR_SLAB_METERS, z, 0.8, feetToMeters(5.5), 3.2, "metal", vaultTags),
      box("wilderness-reserve-vault-cache", 3, x, vaultY + FLOOR_SLAB_METERS, z - 1.5, 2.4, feetToMeters(3), 1.1, "wood", [...vaultTags, ...(quarantine ? ["secret", "objective"] : ["supply-cache"])]),
    );
    if (quarantine) scene.tactical.push(tacticalFeature("wilderness-medical-vault-secret", "secret", x, z - 1.5, vaultY, 1, "A locked medicine cache is concealed behind the basement shelving."));
  }

  if ((weatherStation || researchStation) && wantsGeneratorShed) {
    const generatorRequestedX = Math.max(5, Math.min(width - 5, x + entranceDirection * 9));
    const generatorRequestedZ = Math.max(5, Math.min(depth - 5, z + 4));
    const generatorPlacement = findReservedSafePlacement(scene, generatorRequestedX, generatorRequestedZ, 5.4, 4.6);
    if (generatorPlacement) {
      const generatorX = generatorPlacement.x;
      const generatorZ = generatorPlacement.z;
      const generatorApproachX = x + entranceDirection * 6.1;
      const generatorApproachZ = z + 5.8;
      scene.primitives.push(
        box("wilderness-generator-shed-floor", 0, generatorX, baseY, generatorZ, 5.4, FLOOR_SLAB_METERS, 4.6, "stone", ["site-program", "generator-shed", "floor", "standable", "service"]),
        box("wilderness-generator-shed-shell", 0, generatorX, baseY, generatorZ, 5.2, feetToMeters(7.5), 4.4, "metal", ["site-program", "generator-shed", "service-building", "building-shell"]),
        box("wilderness-generator-unit", 0, generatorX, baseY + FLOOR_SLAB_METERS, generatorZ, 3.2, feetToMeters(4.2), 1.8, "darkStone", ["site-program", "generator-shed", "generator", "machinery", "cover"]),
        cylinder("wilderness-generator-exhaust", 1, generatorX + entranceDirection * 1.6, baseY + feetToMeters(6), generatorZ - 1.2, 0.38, feetToMeters(7), "metal", ["site-program", "generator-shed", "exhaust", "vertical-landmark"]),
        corridor("wilderness-generator-service-walk", 0, generatorApproachX, generatorApproachZ, generatorX - entranceDirection * 2.5, generatorZ, baseY + FLOOR_SLAB_METERS, 1.25, "wood", ["site-program", "generator-shed", "boardwalk", "bridge", "standable", "supported"]),
      );
      const generatorRoom = createRoom("wilderness-generator-shed-room", "Detached generator shed", "service", 0, generatorX, generatorZ, 5.4, 4.6, baseY);
      scene.rooms.push(generatorRoom);
      if (wildernessRoot) connectRooms(scene.rooms, wildernessRoot.id, generatorRoom.id);
      scene.routes.push(createRoute("wilderness-generator-service-route", "alternate", [
        { x: generatorApproachX, z: generatorApproachZ, y: baseY + FLOOR_SLAB_METERS },
        { x: generatorX - entranceDirection * 2.5, z: generatorZ, y: baseY + FLOOR_SLAB_METERS },
        { x: generatorX, z: generatorZ, y: baseY + FLOOR_SLAB_METERS },
      ], { purpose: "service", traffic: 0.2, schedule: "all" }));
    }
  }

  if (weatherStation) {
    const interiorTags = ["site-program", "weather-station-interior", "building-instance:wilderness-core-building", "full-interior", "focus-interior"];
    scene.primitives.push(
      box("wilderness-weather-map-table", 0, x - 1.6, baseY + FLOOR_SLAB_METERS, z + 0.8, 3.2, feetToMeters(3.1), 1.6, "wood", [...interiorTags, "map-table", "cover"]),
      box("wilderness-weather-radio-rack-a", 0, x + 2.5, baseY + FLOOR_SLAB_METERS, z - 1.4, 0.8, feetToMeters(6.2), 2.2, "metal", [...interiorTags, "radio-rack", "communications", "cover"]),
      box("wilderness-weather-radio-rack-b", 0, x + 2.5, baseY + FLOOR_SLAB_METERS, z + 1.4, 0.8, feetToMeters(6.2), 2.2, "metal", [...interiorTags, "instrument-rack", "weather-instruments", "cover"]),
      cylinder("wilderness-weather-barometer", 0, x - 0.1, baseY + FLOOR_SLAB_METERS, z - 2.2, 0.7, feetToMeters(5.5), "metal", [...interiorTags, "weather-instruments", "barometer"]),
    );
  }

  if ((weatherStation || researchStation) && wantsCommunicationsTower) {
    const towerRequestedX = Math.max(5, Math.min(width - 5, x - entranceDirection * 8.5));
    const towerRequestedZ = Math.max(5, Math.min(depth - 5, z - 5));
    const towerPlacement = findReservedSafePlacement(scene, towerRequestedX, towerRequestedZ, 5.6, 5.6);
    if (towerPlacement) {
      const towerX = towerPlacement.x;
      const towerZ = towerPlacement.z;
      const towerBase = terrainSurfaceY(scene, towerX, towerZ, terrainBaseY);
      const towerHeight = feetToMeters(32);
      scene.primitives.push(
        cylinder("wilderness-communications-tower-mast", 0, towerX, towerBase, towerZ, 0.52, towerHeight, "metal", ["site-program", "communications-tower", "antenna", "vertical-landmark", "climbable"]),
        box("wilderness-communications-tower-yard", 0, towerX, towerBase, towerZ, 5.6, FLOOR_SLAB_METERS, 5.6, "rock", ["site-program", "communications-tower", "floor", "standable", "supported"]),
        box("wilderness-communications-tower-ladder", 0, towerX, towerBase + towerHeight / 2, towerZ + 0.7, 0.45, towerHeight, 0.16, "metal", ["site-program", "communications-tower", "ladder", "vertical-route", "shaft-access", "climbable"]),
      );
      for (const [index, heightRatio] of [0.36, 0.62, 0.86].entries()) {
        scene.primitives.push(box(`wilderness-communications-array-${index + 1}`, 1, towerX, towerBase + towerHeight * heightRatio, towerZ, 4.5 - index * 0.6, 0.18, 0.25, "metal", ["site-program", "communications-tower", "antenna-array", "vertical-landmark"]));
      }
      scene.routes.push(createRoute("wilderness-communications-tower-route", "vertical", [
        { x: towerX, z: towerZ + 0.7, y: towerBase },
        { x: towerX, z: towerZ + 0.7, y: towerBase + towerHeight },
      ], { purpose: "service", traffic: 0.08, schedule: "all" }));
      scene.tactical.push(tacticalFeature("wilderness-communications-tower-high", "highGround", towerX, towerZ, towerBase + towerHeight, 2, "The communications mast is a climbable but exposed observation landmark."));
    }
  }

  if (archetype === "ice" && wantsIceFissure && !scene.terrainReservations?.some((zone) => zone.kind === "void")) {
    const fissureZ = Math.max(7, Math.min(depth - 7, z + 10));
    const fissureY = terrainBaseY - feetToMeters(9);
    const bend = context.rng.fork("ice-fissure").float(-2.5, 2.5);
    const gapHalf = 3.2;
    const northDepth = Math.max(3, fissureZ - gapHalf - 1);
    const southDepth = Math.max(3, depth - (fissureZ + gapHalf) - 1);
    // Replace the single ice slab with two real banks. The deep fissure must
    // remain legible even with materials disabled, so the gap and its vertical
    // faces are geometry rather than a dark decal over a continuous floor.
    scene.primitives = scene.primitives.filter((primitiveEntry) => {
      if (primitiveEntry.id === "ice-field") return false;
      if (!primitiveEntry.tags?.includes("ice-meso")) return true;
      const primitiveZ = primitiveEntry.position.z / CELL;
      return Math.abs(primitiveZ - fissureZ) > gapHalf + 2.5;
    });
    scene.routes = scene.routes.filter((route) => !route.id.startsWith("ice-snow-ridge-route-")
      || route.points.every((point) => Math.abs(point.z / CELL - fissureZ) > gapHalf + 2.5));
    scene.primitives.push(
      box("wilderness-ice-bank-north", 0, width / 2, terrainBaseY - FLOOR_SLAB_METERS, northDepth / 2 + 1, width - 2, FLOOR_SLAB_METERS, northDepth, "ice", ["floor", "terrain", "ice", "rift-bank", "standable"]),
      box("wilderness-ice-bank-south", 0, width / 2, terrainBaseY - FLOOR_SLAB_METERS, fissureZ + gapHalf + southDepth / 2, width - 2, FLOOR_SLAB_METERS, southDepth, "ice", ["floor", "terrain", "ice", "rift-bank", "standable"]),
      box("wilderness-ice-cliff-north", 0, width / 2, fissureY, fissureZ - gapHalf, width - 2, terrainBaseY - fissureY, 0.45, "rock", ["site-program", "ice-fissure", "vertical-face", "cliff", "rift-bank"]),
      box("wilderness-ice-cliff-south", 0, width / 2, fissureY, fissureZ + gapHalf, width - 2, terrainBaseY - fissureY, 0.45, "rock", ["site-program", "ice-fissure", "vertical-face", "cliff", "rift-bank"]),
    );
    const fissurePoints = [
      { x: 2, z: fissureZ - 2.8 },
      { x: width * 0.34, z: fissureZ + bend },
      { x: width * 0.68, z: fissureZ - bend * 0.65 },
      { x: width - 2, z: fissureZ + 2.2 },
    ];
    for (let index = 0; index < fissurePoints.length - 1; index += 1) {
      const from = fissurePoints[index]!;
      const to = fissurePoints[index + 1]!;
      scene.primitives.push(
        corridor(`wilderness-ice-fissure-water-${index}`, 0, from.x, from.z, to.x, to.z, fissureY, 3.5, "water", ["site-program", "ice-fissure", "wetland", "water", "hazard", "deep-water", "vertical-face"]),
        corridor(`wilderness-ice-fissure-shadow-${index}`, 0, from.x, from.z, to.x, to.z, fissureY - feetToMeters(5), 4.3, "darkStone", ["site-program", "ice-fissure", "void", "hazard", "vertical-face"]),
      );
    }
    const bridgeX = Math.max(6, Math.min(width - 6, x - 5));
    const bridgeY = terrainBaseY + FLOOR_SLAB_METERS + 0.08;
    scene.primitives.push(
      corridor("wilderness-ice-fissure-bridge", 0, bridgeX, fissureZ - 3.3, bridgeX, fissureZ + 3.3, bridgeY, 1.55, "wood", ["site-program", "ice-fissure", "bridge", "boardwalk", "standable", "supported"]),
      cylinder("wilderness-ice-fissure-bridge-support-a", 0, bridgeX - 0.55, fissureY, fissureZ - 2.6, 0.2, bridgeY - fissureY, "wood", ["site-program", "ice-fissure", "bridge", "support"]),
      cylinder("wilderness-ice-fissure-bridge-support-b", 0, bridgeX + 0.55, fissureY, fissureZ + 2.6, 0.2, bridgeY - fissureY, "wood", ["site-program", "ice-fissure", "bridge", "support"]),
    );
    scene.routes.push(createRoute("wilderness-ice-fissure-crossing-route", "alternate", [
      { x: bridgeX, z: fissureZ - 3.3, y: bridgeY },
      { x: bridgeX, z: fissureZ + 3.3, y: bridgeY },
    ], { purpose: "movement", traffic: 0.32, schedule: "all" }));
    const primaryIceRoute = scene.routes.find((route) => route.id === "ice-primary-route");
    if (primaryIceRoute) {
      primaryIceRoute.points = [
        { x: 1 * CELL, z: Math.max(2, fissureZ - 8) * CELL, y: terrainBaseY },
        { x: bridgeX * CELL, z: (fissureZ - 3.3) * CELL, y: bridgeY },
        { x: bridgeX * CELL, z: (fissureZ + 3.3) * CELL, y: bridgeY },
        { x: (width - 1) * CELL, z: Math.min(depth - 2, fissureZ + 8) * CELL, y: terrainBaseY },
      ];
    }
    scene.tactical.push(tacticalFeature("wilderness-ice-fissure-hazard", "hazard", width * 0.5, fissureZ, fissureY, 4, "A deep water-filled ice fissure cuts across the site and forces movement onto a supported bridge."));
  }

  if (mangrove && wantsTidalDock) {
    const nearestWater = scene.primitives
      .filter((item) => item.tags?.includes("watercourse") || item.tags?.includes("pool") || item.tags?.includes("water"))
      .sort((left, right) => Math.hypot(left.position.x / CELL - x, left.position.z / CELL - z) - Math.hypot(right.position.x / CELL - x, right.position.z / CELL - z))[0];
    const dockX = nearestWater ? nearestWater.position.x / CELL : Math.max(4, x - 10);
    const dockZ = nearestWater ? nearestWater.position.z / CELL : Math.min(depth - 4, z + 10);
    const dockY = baseY + FLOOR_SLAB_METERS;
    // Join the dock at the authored parcel entrance, not at an arbitrary
    // point near the building envelope. Site-profile wings can occupy that
    // former point and turn an otherwise valid dock into a route through a
    // solid treatment/airlock wall.
    const dockApproachX = entrance.x;
    const dockApproachZ = entrance.z;
    scene.primitives.push(
      corridor("wilderness-tidal-dock", 0, dockApproachX, dockApproachZ, dockX, dockZ, dockY, 2, "wood", ["site-program", "tidal-dock", "water-access", "boardwalk", "bridge", "standable", "supported"]),
      box("wilderness-tidal-dock-head", 0, dockX, dockY, dockZ, 5.2, FLOOR_SLAB_METERS, 3.6, "wood", ["site-program", "tidal-dock", "water-access", "standable", "supported"]),
      cylinder("wilderness-tidal-dock-pile-a", 0, dockX - 1.6, terrainBaseY - feetToMeters(4), dockZ, 0.22, dockY - terrainBaseY + feetToMeters(8), "wood", ["site-program", "tidal-dock", "support"]),
      cylinder("wilderness-tidal-dock-pile-b", 0, dockX + 1.6, terrainBaseY - feetToMeters(4), dockZ, 0.22, dockY - terrainBaseY + feetToMeters(8), "wood", ["site-program", "tidal-dock", "support"]),
    );
    scene.routes.push(createRoute("wilderness-tidal-dock-route", "alternate", [
      { x: dockApproachX, z: dockApproachZ, y: dockY },
      { x: dockX, z: dockZ, y: dockY },
    ], { purpose: "movement", traffic: 0.3, schedule: "all" }));
    scene.tactical.push(tacticalFeature("wilderness-tidal-dock-choke", "chokepoint", dockX, dockZ, dockY, 2, "The tidal dock is a narrow exposed water-access point."));
  }
  if (archetype === "forest") {
    const hunterTrail = scene.routes.find((route) => route.id === "forest-hunter-trail");
    if (hunterTrail && hunterTrail.points.length >= 2) {
      const surfacePointAtCells = (px: number, pz: number): { x: number; y: number; z: number } => {
        const worldX = px * CELL;
        const worldZ = pz * CELL;
        const surface = scene.primitives
          .filter((item) => item.tags?.includes("floor") && item.tags?.includes("terrain"))
          .sort((left, right) => Math.hypot(worldX - left.position.x, worldZ - left.position.z) - Math.hypot(worldX - right.position.x, worldZ - right.position.z))[0];
        return surface
          ? { x: surface.position.x, y: surface.position.y + surface.size.y + 0.04, z: surface.position.z }
          : { x: worldX, y: baseY, z: worldZ };
      };
      const first = hunterTrail.points[0]!;
      const last = hunterTrail.points.at(-1)!;
      const skirtWest = x - 10.5;
      const skirtNorth = z - 9.5;
      const skirtSouth = z + 9.5;
      hunterTrail.points = [
        first,
        surfacePointAtCells(skirtWest, skirtNorth),
        surfacePointAtCells(skirtWest, skirtSouth),
        surfacePointAtCells(x + 10.5, skirtSouth),
        last,
      ];
    }
  }
  // Forest rooms are numbered forest-clearing-1..3. The old singular
  // forest-clearing-room fallback silently broke the building/biome graph,
  // so choose the nearest authored clearing instead of a generic room.
  const siteAnchor = scene.rooms
    .filter((room) => room.level === 0
      && room.id !== wildernessRoot?.id
      && room.id !== "volcanic-station-inspection-room"
      && !room.id.startsWith("core-wilderness-core-building-")
      && !room.id.startsWith("wilderness-")
      && (archetype !== "forest" || room.id.startsWith("forest-clearing-")))
    .sort((left, right) => Math.hypot(left.center.x - x, left.center.z - z) - Math.hypot(right.center.x - x, right.center.z - z))[0]
    ?? scene.rooms.find((room) => room.level === 0 && !room.id.startsWith("core-wilderness"));
  if (wildernessRoot && siteAnchor) connectRooms(scene.rooms, siteAnchor.id, wildernessRoot.id);
  const accessStart = {
    x: Math.max(1.25, Math.min(width - 1.25, entrance.x - 7)),
    z: Math.max(1.25, Math.min(depth - 1.25, entrance.z + 5)),
  };
  const accessTerrainY = Math.min(terrainBaseY, terrainSurfaceY(scene, accessStart.x, accessStart.z, terrainBaseY));
  if (raisedFoundationFeet > 0) {
    const stairEnd = {
      xCells: accessStart.x + Math.sign(entrance.x - accessStart.x) * 2.8,
      zCells: accessStart.z + Math.sign(entrance.z - accessStart.z) * 2,
      yMeters: baseY,
    };
    const accessStair = stairConnection(
      "wilderness-raised-access-stair",
      0,
      { xCells: accessStart.x, zCells: accessStart.z, yMeters: accessTerrainY },
      stairEnd,
      1.6,
      "wood",
      ["parcel-access", "site-program", "raised-foundation", "vertical-route", "supported"],
    );
    scene.primitives.push(
      accessStair.primitive,
      corridor("wilderness-access-path", 0, stairEnd.xCells, stairEnd.zCells, entrance.x, entrance.z, baseY, 1.6, "wood", ["road", "boardwalk", "bridge", "parcel-access", "site-program", "standable", "supported"]),
    );
    for (const [index, ratio] of [0.28, 0.56, 0.84].entries()) {
      const supportX = stairEnd.xCells + (entrance.x - stairEnd.xCells) * ratio;
      const supportZ = stairEnd.zCells + (entrance.z - stairEnd.zCells) * ratio;
      scene.primitives.push(cylinder(`wilderness-access-support-${index + 1}`, 0, supportX, terrainBaseY - feetToMeters(2), supportZ, 0.18, baseY - terrainBaseY + feetToMeters(4), "wood", ["site-program", "boardwalk", "support", "structural-support"]));
    }
    scene.routes.push(createRoute("wilderness-building-access", "primary", [
      { x: accessStart.x, z: accessStart.z, y: accessTerrainY },
      { x: stairEnd.xCells, z: stairEnd.zCells, y: baseY },
      { x: entrance.x, z: entrance.z, y: baseY },
    ], { purpose: "movement", traffic: 0.45, schedule: "all" }));
  } else {
    scene.primitives.push(corridor("wilderness-access-path", 0, accessStart.x, accessStart.z, entrance.x, entrance.z, baseY, 1.6, archetype === "forest" ? "earth" : "rock", ["road", "trail", "parcel-access", "site-program"]));
    scene.routes.push(createRoute("wilderness-building-access", "primary", [{ x: accessStart.x, z: accessStart.z, y: baseY }, { x: entrance.x, z: entrance.z, y: baseY }], { purpose: "movement", traffic: 0.45, schedule: "all" }));
  }
  let siteRoadCount = 1;
  let siteRoadLength = Math.hypot(7, 5);
  if (context.request.density >= 0.5) {
    const serviceTurn = { x: x + 8, z: z + 7 };
    scene.primitives.push(
      corridor("wilderness-service-path-a", 0, entrance.x, entrance.z, serviceTurn.x, serviceTurn.z, baseY, 1.15, archetype === "forest" ? "earth" : "rock", ["road", "trail", "service-route", "site-program"]),
      corridor("wilderness-service-path-b", 0, serviceTurn.x, serviceTurn.z, x + 9, z - 5, baseY, 1.15, archetype === "forest" ? "earth" : "rock", ["road", "trail", "service-route", "site-program"]),
    );
    scene.routes.push(createRoute("wilderness-service-loop", "alternate", [
      { x: entrance.x, z: entrance.z, y: baseY },
      { x: serviceTurn.x, z: serviceTurn.z, y: baseY },
      { x: x + 9, z: z - 5, y: baseY },
    ], { purpose: "service", traffic: 0.25, schedule: "all" }));
    siteRoadCount += 1;
    siteRoadLength += Math.hypot(serviceTurn.x - entrance.x, serviceTurn.z - entrance.z) + Math.hypot(1, 12);
  }
  if (context.request.density >= 0.8) {
    const escapeEnd = { x: Math.min(width - 2, x + width * 0.32), z: Math.max(2, z - depth * 0.34) };
    scene.primitives.push(corridor("wilderness-escape-path", 0, x + 9, z - 5, escapeEnd.x, escapeEnd.z, baseY, 0.9, archetype === "forest" ? "earth" : "rock", ["road", "trail", "escape-route", "site-program"]));
    scene.routes.push(createRoute("wilderness-escape-route", "alternate", [
      { x: x + 2, z: z - 4, y: baseY },
      { x: x + 9, z: z - 5, y: baseY },
      { x: escapeEnd.x, z: escapeEnd.z, y: baseY },
    ], { purpose: "escape", traffic: 0.12, schedule: "night" }));
    siteRoadCount += 1;
    siteRoadLength += Math.hypot(7, 1) + Math.hypot(escapeEnd.x - (x + 9), escapeEnd.z - (z - 5));
  }
  const waterfrontDirection = archetype === "river-valley" ? -shoreDirection : 1;
  const inlandDirection = -waterfrontDirection;
  scene.primitives.push(
    box("wilderness-porch", 0, x, baseY + FLOOR_SLAB_METERS, z + waterfrontDirection * 5, 5, feetToMeters(2), 2.2, "wood", ["porch", "standable", "building-exterior", "site-program"]),
    cylinder("wilderness-well", 0, x - 6, baseY, z + inlandDirection * 3.5, 2, feetToMeters(3), "stone", ["well", "cover", "building-exterior", "site-program"]),
    box("wilderness-woodpile", 0, x + 5.5, baseY, z + inlandDirection * 3, 3.5, feetToMeters(3), 1.8, "wood", ["woodpile", "cover", "building-exterior"]),
  );
  if (archetype === "river-valley" && riverAnchor) {
    const waterY = riverAnchor.position.y + riverAnchor.size.y;
    const dockY = waterY + 0.22;
    const dockStartZ = z - shoreDirection * 5.4;
    const dockEndZ = riverZ + shoreDirection * 0.45;
    scene.primitives.push(
      corridor("wilderness-river-dock", 0, x, dockStartZ, x, dockEndZ, dockY, 2.2, "wood", ["dock", "river-access", "standable", "site-program"]),
      cylinder("wilderness-dock-pile-a", 0, x - 0.75, waterY - feetToMeters(5), dockEndZ, 0.24, feetToMeters(7), "wood", ["dock", "support", "site-program"]),
      cylinder("wilderness-dock-pile-b", 0, x + 0.75, waterY - feetToMeters(5), dockEndZ, 0.24, feetToMeters(7), "wood", ["dock", "support", "site-program"]),
    );
    const bankPortal = { xCells: x, zCells: dockStartZ - shoreDirection * 1.2, yMeters: baseY };
    const dockPortal = { xCells: x, zCells: dockStartZ + shoreDirection * 1.1, yMeters: dockY };
    const bankConnection = stairConnection(
      "wilderness-river-bank-descent",
      0,
      baseY <= dockY ? bankPortal : dockPortal,
      baseY <= dockY ? dockPortal : bankPortal,
      1.5,
      "wood",
      ["river-access", "vertical-route", "supported", "site-program"],
    );
    scene.primitives.push(bankConnection.primitive);
    scene.routes.push(
      stairRoute("wilderness-river-bank-route", bankConnection),
      createRoute("wilderness-dock-route", "alternate", [
        { x, z: dockStartZ, y: dockY },
        { x, z: dockEndZ, y: dockY },
      ], { purpose: "movement", traffic: 0.3, schedule: "all" }),
    );
    scene.tactical.push(
      tacticalFeature("wilderness-river-dock-choke", "chokepoint", x, dockEndZ, dockY, 2, "The narrow cabin dock is a supported river access point and exposed tactical bottleneck."),
    );
  }
  if (archetype === "forest" && (wantsFootbridge || streamWanted)) {
    // A footbridge crosses the actual stream corridor and lands on terrain
    // surfaces; it is not a floating decorative slab.
    const crossingX = Math.max(6, Math.min(width - 6, x + 6.5));
    const crossingZ = streamAtForForest(scene, crossingX, depth);
    const bankNorth = { xCells: crossingX, zCells: crossingZ - 2.1, yMeters: terrainSurfaceY(scene, crossingX, crossingZ - 2.1, baseY) };
    const bankSouth = { xCells: crossingX, zCells: crossingZ + 2.1, yMeters: terrainSurfaceY(scene, crossingX, crossingZ + 2.1, baseY) };
    const bridgeTags = ["forest", "footbridge", "stream-crossing", "standable", "surface-grid", "supported"];
    const delta = bankNorth.yMeters - bankSouth.yMeters;
    if (Math.abs(delta) < 0.14) {
      scene.primitives.push(
        corridor("wilderness-forest-footbridge", 0, bankNorth.xCells, bankNorth.zCells, bankSouth.xCells, bankSouth.zCells, (bankNorth.yMeters + bankSouth.yMeters) / 2, 1.7, "wood", bridgeTags),
        cylinder("wilderness-forest-footbridge-pier-n", 0, bankNorth.xCells - 0.7, Math.min(bankNorth.yMeters, bankSouth.yMeters) - feetToMeters(2.5), bankNorth.zCells, 0.18, feetToMeters(5), "wood", ["forest", "footbridge", "support"]),
        cylinder("wilderness-forest-footbridge-pier-s", 0, bankSouth.xCells + 0.7, Math.min(bankNorth.yMeters, bankSouth.yMeters) - feetToMeters(2.5), bankSouth.zCells, 0.18, feetToMeters(5), "wood", ["forest", "footbridge", "support"]),
      );
      scene.routes.push(createRoute("wilderness-forest-footbridge-route", "alternate", [
        { x: bankNorth.xCells, z: bankNorth.zCells, y: bankNorth.yMeters },
        { x: bankSouth.xCells, z: bankSouth.zCells, y: bankSouth.yMeters },
      ], { purpose: "movement", traffic: 0.32, schedule: "all" }));
    } else {
      const high = delta > 0 ? bankNorth : bankSouth;
      const low = delta > 0 ? bankSouth : bankNorth;
      const bridge = stairConnection("wilderness-forest-footbridge", 0, low, high, 1.7, "wood", [...bridgeTags, "vertical-route"]);
      scene.primitives.push(bridge.primitive);
      scene.routes.push(stairRoute("wilderness-forest-footbridge-route", bridge));
    }
    scene.tactical.push(tacticalFeature("wilderness-forest-footbridge-choke", "chokepoint", crossingX, crossingZ, Math.min(bankNorth.yMeters, bankSouth.yMeters), 1, "A narrow timber bridge crosses the stream and exposes the approach."));
  }
  if (archetype === "forest" && wantsTrapLine) {
    const trapZ = z + inlandDirection * 7.5;
    for (let index = 0; index < 5; index += 1) {
      const trapX = x - 7 + index * 3.5;
      scene.primitives.push(
        cylinder(`wilderness-trap-post-${index}`, 0, trapX, baseY, trapZ, 0.12, feetToMeters(3.5), "wood", ["forest", "trap-line", "snare", "cover"]),
      );
      if (index > 0) {
        scene.primitives.push(
          corridor(`wilderness-trap-wire-${index}`, 0, trapX - 3.5, trapZ, trapX, trapZ, baseY + feetToMeters(1.3), 0.12, "metal", ["forest", "trap-line", "snare", "hazard"]),
        );
      }
    }
    scene.tactical.push(tacticalFeature("wilderness-trap-line", "hazard", x, trapZ, baseY + feetToMeters(1.2), 2, "A visible line of low snares and trigger posts creates a hazardous approach."));
  }
  if (archetype === "forest" && wantsCanopyObservatory) {
    const platform = ancientPlatformsNear(scene, x, z)[0];
    if (platform) {
      scene.primitives.push(
        box("wilderness-canopy-observatory", 0, platform.x, platform.platformY + FLOOR_SLAB_METERS, platform.z, 5.4, FLOOR_SLAB_METERS, 4.8, "wood", ["forest", "canopy-observatory", "observation", "high-ground", "standable", "surface-grid"]),
        box("wilderness-canopy-observatory-roof", 0, platform.x, platform.platformY + feetToMeters(9.5), platform.z, 5.9, 0.18, 5.3, "wood", ["forest", "canopy-observatory", "roof", "cover"]),
      );
      for (const [index, side] of [-1, 1].entries()) {
        scene.primitives.push(box(`wilderness-canopy-observatory-rail-${index}`, 0, platform.x + side * 2.35, platform.platformY + feetToMeters(3.2), platform.z, 0.16, feetToMeters(2.8), 4.8, "wood", ["forest", "canopy-observatory", "railing", "cover"]));
      }
      scene.tactical.push(tacticalFeature("wilderness-canopy-observatory-highground", "highGround", platform.x, platform.z, platform.platformY, 2, "A roofed observation post overlooks the clearing from the tree canopy."));
    }
  }
  if (wantsLookoutTower) {
    const towerX = Math.max(5, Math.min(width - 5, x + 7.5));
    const towerZ = Math.max(5, Math.min(depth - 5, z - 6.5));
    const towerBase = terrainSurfaceY(scene, towerX, towerZ, baseY);
    const towerHeight = feetToMeters(archetype === "swamp" ? 18 : 24);
    scene.primitives.push(
      cylinder("wilderness-site-lookout-tower", 0, towerX, towerBase + towerHeight / 2, towerZ, 1.35, towerHeight, "wood", ["site-program", "lookout-tower", "vertical-landmark", "cover"]),
      box("wilderness-site-lookout-platform", 1, towerX, towerBase + towerHeight, towerZ, 4.8, FLOOR_SLAB_METERS, 4.8, "wood", ["site-program", "lookout-tower", "platform", "high-ground", "standable", "surface-grid"]),
      box("wilderness-site-lookout-ladder", 0, towerX, towerBase + towerHeight / 2, towerZ + 1.2, 0.55, towerHeight, 0.18, "wood", ["site-program", "lookout-tower", "ladder", "climbable", "vertical-route", "shaft-access"]),
    );
    scene.routes.push(createRoute("wilderness-site-lookout-route", "vertical", [
      { x: towerX, z: towerZ + 1.2, y: towerBase },
      { x: towerX, z: towerZ + 1.2, y: towerBase + towerHeight },
    ], { purpose: "movement", traffic: 0.2, schedule: "all" }));
    scene.tactical.push(tacticalFeature("wilderness-site-lookout-highground", "highGround", towerX, towerZ, towerBase + towerHeight, 2, "A dedicated lookout tower creates a visible elevated firing position."));
  }
  if (wantsTrench) {
    const trenchX = x - 5.5;
    const trenchZ = z + 7.5;
    scene.primitives.push(
      box("wilderness-site-trench", 0, trenchX, baseY - feetToMeters(1.3), trenchZ, 9.5, feetToMeters(2.6), 1.4, "darkStone", ["site-program", "trench", "hazard", "vertical-face"]),
    );
    scene.tactical.push(tacticalFeature("wilderness-site-trench-hazard", "hazard", trenchX, trenchZ, baseY - feetToMeters(1.3), 2, "A narrow defensive ditch breaks the approach to the station."));
  }
  if (wantsLogDefense) {
    const defenseZ = z + inlandDirection * 8.5;
    for (let index = 0; index < 4; index += 1) {
      const logX = x - 6 + index * 4;
      scene.primitives.push(box(`wilderness-site-log-defense-${index}`, 0, logX, baseY + feetToMeters(1.1), defenseZ, 3.6, feetToMeters(2.2), 0.7, "wood", ["site-program", "fallen-log-defense", "barricade", "cover", "climbable"]));
    }
    scene.tactical.push(tacticalFeature("wilderness-site-log-defense", "cover", x, defenseZ, baseY, 2, "A staggered fallen-log barricade creates cover and a broken approach line."));
  }
  if (archetype === "river-valley") {
    const inlandFenceZ = z + inlandDirection * 5;
    scene.primitives.push(
      box("wilderness-fence-inland-west", 0, x - 4.25, baseY, inlandFenceZ, 3.5, feetToMeters(4), 0.25, "wood", ["fence", "cover", "building-exterior", "river-aware"]),
      box("wilderness-fence-inland-east", 0, x + 4.25, baseY, inlandFenceZ, 3.5, feetToMeters(4), 0.25, "wood", ["fence", "cover", "building-exterior", "river-aware"]),
    );
  } else {
    for (const [index, fx, fz] of [[0, -6, -5], [1, 6, -5], [2, -6, 5], [3, 6, 5]] as const) scene.primitives.push(box(`wilderness-fence-${index}`, 0, x + fx, baseY, z + fz, index < 2 ? 0.25 : 12, feetToMeters(4), index < 2 ? 10 : 0.25, "wood", ["fence", "cover", "building-exterior"]));
  }
  if (alchemical) {
    scene.primitives.push(
      cylinder("alchemy-giant-tree", 0, x + 6, baseY, z - 5, 3.8, feetToMeters(32), "wood", ["giant-tree", "vertical-landmark", "cover"]),
      box("alchemy-roof-observation", 2, x + 2, baseY + feetToMeters(22), z - 1, 6, FLOOR_SLAB_METERS, 5, "wood", ["floor", "roof-platform", "high-ground", "observation"]),
      box("alchemy-underground-greenhouse", 3, x + 3, baseY - feetToMeters(10), z + 1, 6, FLOOR_SLAB_METERS, 5, "moss", ["floor", "underground", "greenhouse", "alchemy"]),
    );
    const basement = scene.rooms.find((room) => room.id === "core-wilderness-core-building-basement");
    if (basement) basement.name = "Underground greenhouse and root laboratory";
  }
  if (hunter) scene.tactical.push(tacticalFeature("hunter-ambush-line", "cover", x + 5.5, z + 3, baseY, 2, "The woodpile, fence and tree line form a prepared hunter ambush position."));
  scene.siteProgram = { version: 1, siteType: "wilderness-site", districtCount: 1, roadCount: siteRoadCount, junctionCount: 1, blockCount: 1, parcelCount: 1, fullInteriorCount: 1, facadeCount: 0, massCount: 0, roadLengthCells: siteRoadLength, parcelCoverage: (13 * 12) / (width * depth), buildingCoverage: (9 * 8) / (width * depth), averageParcelArea: 13 * 12, openSpaceRatio: 1 - (13 * 12) / (width * depth), roadPattern: "anchor-web", curvedRoadRatio: siteRoadCount > 0 ? 1 : 0, nonRectangularBlockRatio: 1, terrainKind: archetype === "forest" ? "forest-clearing" : archetype === "mountain" ? "valley" : "rolling" };
  scene.floors = Math.max(scene.floors, 4);
  scene.floorHeightFeet = [12, 10, 8, 10];
  scene.floorLabels = ["地形/1F", "阁楼", "屋顶", "B1"];
}

function buildSwamp(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.max(30, Math.floor(width));
  const rows = Math.max(26, Math.floor(depth));
  const macro = rng.fork("wetland-macro");
  const phase = macro.float(-Math.PI, Math.PI);
  const channelAt = (x: number) => rows * 0.5 + Math.sin(x * 0.13 + phase) * rows * (0.07 + density * 0.035);
  const pools = Array.from({ length: 3 + Math.round(density * 4) }, () => ({
    x: macro.float(cols * 0.16, cols * 0.84),
    z: macro.float(rows * 0.14, rows * 0.86),
    rx: macro.float(2.4, 4.8 + density * 2.2),
    rz: macro.float(2.1, 4.2 + density * 1.8),
  }));
  const isWaterCell = (x: number, z: number) => Math.abs(z - channelAt(x)) < 1.2 + density * 0.65
    || pools.some((pool, index) => ((x - pool.x) / pool.rx) ** 2 + ((z - pool.z) / pool.rz) ** 2 < 0.82 + Math.sin(x * 0.46 + z * 0.23 + index) * 0.14);
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    if (edge === 0 || isWaterCell(x, z)) { heights.push(undefined); continue; }
    const hummock = Math.sin(x * 0.19 + phase) * 0.7 + Math.cos(z * 0.17 - phase) * 0.65 + Math.sin((x + z) * 0.07) * 0.35;
    heights.push(hummock > 1.05 ? 2 : hummock > 0.18 ? 1 : 0);
  }
  const rendered = renderMorphologyField(scene, {
    prefix: "swamp-morphology",
    cols,
    rows,
    heights,
    stepFeet: 3,
    materialFor: (level) => level > 0 ? "moss" : "earth",
    tagsFor: (level) => ["swamp", "wetland", "dry-island", "standable", level > 0 ? "hummock" : "mud-flat"],
  });
  const waterY = -0.08;
  const segments = 18;
  for (let index = 0; index < segments; index += 1) {
    const x1 = 1 + (cols - 2) * index / segments;
    const x2 = 1 + (cols - 2) * (index + 1) / segments;
    const z1 = channelAt(x1);
    const z2 = channelAt(x2);
    scene.primitives.push(water(`swamp-channel-${index}`, 0, (x1 + x2) / 2, waterY, (z1 + z2) / 2, 2.6 + density * 1.3, 0.22, Math.hypot(x2 - x1, z2 - z1) + 0.6, ["swamp", "wetland", "watercourse", "deep-water", "hazard"], Math.atan2(x2 - x1, z2 - z1)));
  }
  for (const [index, pool] of pools.entries()) {
    scene.primitives.push(water(`swamp-pool-${index}`, 0, pool.x, waterY - 0.04, pool.z, pool.rx * 1.8, 0.2, pool.rz * 1.8, ["swamp", "wetland", "pool", "hazard"]));
    scene.tactical.push(tacticalFeature(`swamp-pool-hazard-${index}`, "hazard", pool.x, pool.z, waterY, Math.max(2, Math.ceil(pool.rx * 0.5)), "A deep wetland pool divides dry ground and conceals difficult footing."));
  }
  const boardwalkZ = rows * 0.48;
  const boardwalkY = rendered.yOf(1) + feetToMeters(1.8);
  scene.primitives.push(corridor("swamp-boardwalk", 0, 1.5, boardwalkZ, cols - 1.5, boardwalkZ, boardwalkY, 2, "wood", ["bridge", "boardwalk", "swamp", "wetland", "standable", "surface-grid", "supported"]));
  for (let index = 0; index < 9; index += 1) {
    const supportX = 2 + (cols - 4) * index / 8;
    scene.primitives.push(cylinder(`swamp-boardwalk-support-${index}`, 0, supportX, waterY - feetToMeters(1.5), boardwalkZ, 0.18, boardwalkY - waterY + feetToMeters(3), "wood", ["swamp", "boardwalk", "support"]));
  }
  const dryCells = scene.primitives
    .filter((item) => item.tags?.includes("swamp") && item.tags?.includes("dry-island") && item.tags?.includes("floor"))
    .map((item) => ({ x: item.position.x / CELL, z: item.position.z / CELL, y: item.position.y + item.size.y }));
  const snapDry = (targetX: number, targetZ: number) => dryCells
    .slice()
    .sort((left, right) => Math.hypot(left.x - targetX, left.z - targetZ) - Math.hypot(right.x - targetX, right.z - targetZ))[0]
    ?? { x: targetX, z: targetZ, y: rendered.yOf(0) };
  const dryAnchors = [
    snapDry(cols * 0.18, rows * 0.22),
    snapDry(cols * 0.52, rows * 0.36),
    snapDry(cols * 0.77, rows * 0.72),
  ];
  scene.rooms.push(
    createRoom("swamp-edge", "Dry reed edge", "natural", 0, dryAnchors[0]!.x, dryAnchors[0]!.z, 8, 7, dryAnchors[0]!.y),
    createRoom("swamp-boardwalk-room", "Raised boardwalk", "circulation", 0, cols / 2, boardwalkZ, cols - 4, 2, boardwalkY),
    createRoom("swamp-deep", "Deep marsh and hummocks", "combat", 0, dryAnchors[2]!.x, dryAnchors[2]!.z, 10, 8, dryAnchors[2]!.y),
  );
  connectRooms(scene.rooms, "swamp-edge", "swamp-boardwalk-room");
  connectRooms(scene.rooms, "swamp-boardwalk-room", "swamp-deep");
  scene.routes.push(
    createRoute("swamp-boardwalk-route", "primary", [{ x: 1.5, z: boardwalkZ, y: boardwalkY }, { x: cols / 2, z: boardwalkZ, y: boardwalkY }, { x: cols - 1.5, z: boardwalkZ, y: boardwalkY }]),
    createRoute("swamp-reed-route", "alternate", dryAnchors),
  );
  const reedCount = Math.round(16 + density * 52);
  for (let index = 0; index < reedCount; index += 1) {
    const x = rng.float(2, cols - 2);
    const z = rng.float(2, rows - 2);
    if (Math.abs(z - channelAt(x)) > 4.2 && !isWaterCell(x, z)) continue;
    scene.primitives.push(cylinder(`swamp-reed-${index}`, 0, x, waterY, z, 0.08, feetToMeters(rng.float(2.8, 5.8)), "moss", ["swamp", "wetland", "reed", "natural-detail", "difficult-terrain"]));
  }
  addCover(scene, rng, "swamp", width * 0.25, depth * 0.72, rendered.yOf(0), 5, "moss");
  scene.tactical.push(
    tacticalFeature("swamp-entrance", "entrance", 1.5, boardwalkZ, boardwalkY, 2, "A supported timber boardwalk enters above the wetland channel."),
    tacticalFeature("swamp-boardwalk-choke", "chokepoint", cols / 2, boardwalkZ, boardwalkY, 2, "The narrow raised boardwalk forces movement above open water."),
  );
  scene.description = `Wetland basin with ${rendered.walkable} dry-ground cells, ${rendered.cliffs} hummock faces, ${pools.length} irregular pools, a continuous channel, and a supported raised boardwalk.`;
}

function overlapsReservedTerrainVoid(scene: GeneratedScene, xCells: number, zCells: number, paddingCells = 1): boolean {
  if (scene.terrainReservations?.some((zone) => {
    const dx = xCells - zone.centerCells.x;
    const dz = zCells - zone.centerCells.z;
    const cosine = Math.cos(zone.rotationY ?? 0);
    const sine = Math.sin(zone.rotationY ?? 0);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    return Math.abs(localX) <= zone.sizeCells.x / 2 + zone.clearanceCells + paddingCells
      && Math.abs(localZ) <= zone.sizeCells.z / 2 + zone.clearanceCells + paddingCells;
  })) return true;
  return scene.primitives.some((primitiveEntry) => {
    if (!primitiveEntry.tags?.includes("crevasse-bottom")) return false;
    const centerX = primitiveEntry.position.x / CELL;
    const centerZ = primitiveEntry.position.z / CELL;
    const halfWidth = primitiveEntry.size.x / CELL / 2 + paddingCells;
    const halfDepth = primitiveEntry.size.z / CELL / 2 + paddingCells;
    return Math.abs(xCells - centerX) <= halfWidth && Math.abs(zCells - centerZ) <= halfDepth;
  });
}

function overlapsReservedTerrainFootprint(
  scene: GeneratedScene,
  xCells: number,
  zCells: number,
  halfWidthCells: number,
  halfDepthCells: number,
  paddingCells = 0,
): boolean {
  return scene.terrainReservations?.some((zone) => {
    const dx = xCells - zone.centerCells.x;
    const dz = zCells - zone.centerCells.z;
    const cosine = Math.cos(zone.rotationY ?? 0);
    const sine = Math.sin(zone.rotationY ?? 0);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    // Project the axis-aligned building footprint onto both axes of the
    // rotated reservation. This is materially less wasteful than treating a
    // 13×12-cell building as a 13-cell-radius circle beside a narrow river.
    const projectedHalfX = halfWidthCells * Math.abs(cosine) + halfDepthCells * Math.abs(sine);
    const projectedHalfZ = halfWidthCells * Math.abs(sine) + halfDepthCells * Math.abs(cosine);
    return Math.abs(localX) <= zone.sizeCells.x / 2 + zone.clearanceCells + projectedHalfX + paddingCells
      && Math.abs(localZ) <= zone.sizeCells.z / 2 + zone.clearanceCells + projectedHalfZ + paddingCells;
  }) ?? false;
}

const terrainSupportIndexCache = new WeakMap<GeneratedScene, Map<string, ScenePrimitive[]>>();

function terrainSupportIndex(scene: GeneratedScene): Map<string, ScenePrimitive[]> {
  const cached = terrainSupportIndexCache.get(scene);
  if (cached) return cached;
  const index = new Map<string, ScenePrimitive[]>();
  for (const primitiveEntry of scene.primitives) {
    if (!primitiveEntry.tags?.includes("floor") || !primitiveEntry.tags?.includes("terrain") || primitiveEntry.tags?.includes("hazard")) continue;
    const centerX = primitiveEntry.position.x / CELL;
    const centerZ = primitiveEntry.position.z / CELL;
    const halfWidth = primitiveEntry.size.x / CELL / 2;
    const halfDepth = primitiveEntry.size.z / CELL / 2;
    const minX = Math.floor(centerX - halfWidth + 0.02);
    const maxX = Math.floor(centerX + halfWidth - 0.02);
    const minZ = Math.floor(centerZ - halfDepth + 0.02);
    const maxZ = Math.floor(centerZ + halfDepth - 0.02);
    for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
      const key = `${x}:${z}`;
      const bucket = index.get(key);
      if (bucket) bucket.push(primitiveEntry);
      else index.set(key, [primitiveEntry]);
    }
  }
  terrainSupportIndexCache.set(scene, index);
  return index;
}

function terrainSupportsPoint(scene: GeneratedScene, xCells: number, zCells: number): boolean {
  const candidates = terrainSupportIndex(scene).get(`${Math.floor(xCells)}:${Math.floor(zCells)}`) ?? [];
  return candidates.some((primitiveEntry) => {
    const centerX = primitiveEntry.position.x / CELL;
    const centerZ = primitiveEntry.position.z / CELL;
    // Height fields are tiled from adjacent 1-cell slabs. A footprint sample
    // near a shared cell edge is still supported; subtracting 0.15 cells here
    // created artificial unsupported seams and made every large river-bank
    // building fail placement despite a continuous bank.
    return Math.abs(xCells - centerX) <= Math.max(0.05, primitiveEntry.size.x / CELL / 2 - 0.02)
      && Math.abs(zCells - centerZ) <= Math.max(0.05, primitiveEntry.size.z / CELL / 2 - 0.02);
  });
}

function findReservedSafePlacement(scene: GeneratedScene, requestedX: number, requestedZ: number, widthCells: number, depthCells: number, supportPolicy: "full" | "engineered" = "full"): { x: number; z: number } | undefined {
  if (!scene.terrainReservations?.length) return { x: requestedX, z: requestedZ };
  const halfX = widthCells / 2; const halfZ = depthCells / 2;
  const supportInsetX = Math.max(0.4, halfX - 0.55);
  const supportInsetZ = Math.max(0.4, halfZ - 0.55);
  const withinBounds = (x: number, z: number) => x >= halfX + 1 && x <= scene.boundsCells.x - halfX - 1 && z >= halfZ + 1 && z <= scene.boundsCells.z - halfZ - 1;
  const supported = (x: number, z: number) => {
    const sampleX = supportPolicy === "engineered" ? Math.min(2.2, supportInsetX * 0.38) : supportInsetX;
    const sampleZ = supportPolicy === "engineered" ? Math.min(2.2, supportInsetZ * 0.38) : supportInsetZ;
    return [
      [x, z],
      [x - sampleX, z - sampleZ], [x + sampleX, z - sampleZ],
      [x - sampleX, z + sampleZ], [x + sampleX, z + sampleZ],
    ].every(([px, pz]) => terrainSupportsPoint(scene, px!, pz!));
  };
  const valid = (x: number, z: number) => withinBounds(x, z)
    && !overlapsReservedTerrainFootprint(scene, x, z, halfX, halfZ, 0.75)
    && supported(x, z);
  if (valid(requestedX, requestedZ)) return { x: requestedX, z: requestedZ };
  const candidates: Array<{ x: number; z: number; score: number }> = [];
  // Morphology fields are authored on half-cell centres. Search that same
  // lattice; integer-only candidates can sit exactly between four otherwise
  // valid terrain cells and falsely report that no support exists.
  const firstX = Math.ceil(halfX + 1) + 0.5;
  const firstZ = Math.ceil(halfZ + 1) + 0.5;
  for (let z = firstZ; z <= scene.boundsCells.z - halfZ - 1; z += 2) for (let x = firstX; x <= scene.boundsCells.x - halfX - 1; x += 2) {
    if (!valid(x, z)) continue;
    candidates.push({ x, z, score: Math.hypot(x - requestedX, z - requestedZ) });
  }
  return candidates.sort((left, right) => left.score - right.score)[0];
}

/** Adds a second layer of authored natural structure instead of leaving large
 * wilderness maps as a few empty slabs. These pieces intentionally remain
 * generic terrain vocabulary so new biomes can reuse the same composition pass. */
function addTerrainComplexity(scene: GeneratedScene, archetype: WildernessArchetype, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const obstacleCount = rng.int(Math.round(3 + density * 16), Math.round(6 + density * 26));
  for (let index = 0; index < obstacleCount; index += 1) {
    let x = rng.float(2.5, width - 2.5);
    let z = rng.float(2.5, depth - 2.5);
    const widthCells = rng.float(0.8, 2.8);
    const depthCells = rng.float(0.8, 2.8);
    for (let attempt = 0; attempt < 12 && overlapsReservedTerrainVoid(scene, x, z, Math.max(widthCells, depthCells)); attempt += 1) {
      x = rng.float(2.5, width - 2.5);
      z = rng.float(2.5, depth - 2.5);
    }
    const height = archetype === "rift" || archetype === "mountain" ? feetToMeters(rng.int(4, 12)) : feetToMeters(rng.int(2, 7));
    const shape: "box" | "cone" | "sphere" = archetype === "ice" ? "box" : index % 3 === 0 ? "cone" : "sphere";
    scene.primitives.push(primitive(`natural-detail-${index}`, shape, 0, x, FLOOR_SLAB_METERS, z, widthCells * 1.524, height, depthCells * 1.524, archetype === "ice" ? "rock" : "rock", ["natural-detail", "natural-cover", index % 4 === 0 ? "terrain" : "cover"]));
    scene.tactical.push(tacticalFeature(`natural-detail-cover-${index}`, "cover", x, z, 0, Math.max(1, Math.ceil(Math.max(widthCells, depthCells) / 1.4)), "Irregular natural structure breaks sight lines and creates a tactical pocket."));
  }
  const hazardCount = density > 0.72 ? 2 : 1;
  for (let index = 0; index < hazardCount; index += 1) {
    const hazardX = width * rng.float(0.32, 0.68);
    const hazardZ = depth * rng.float(0.34, 0.66);
    scene.tactical.push(tacticalFeature(`natural-complex-hazard-${index}`, "hazard", hazardX, hazardZ, archetype === "rift" ? -1 : 0, 2, archetype === "ice" ? "Thin ice or a snow-covered void gives way under pressure." : "Unstable ground, loose rock, or deep growth turns this area into a danger zone."));
  }
}

/** Theme pass for outdoor grammars. These are structural features (banks,
 * fissures, terraces, hummocks), not a bag of decorative props. */
function addSemanticThemeStructure(scene: GeneratedScene, archetype: WildernessArchetype, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  if (archetype === "river-valley") {
    const fallX = width * rng.float(0.28, 0.72);
    scene.primitives.push(box("river-west-cliff-face", 0, fallX, feetToMeters(5), depth * 0.32, 0.22, feetToMeters(10), depth * 0.42, "darkStone", ["cliff-face", "river-bank", "vertical-face"]), water("river-waterfall", 0, fallX + 0.2, feetToMeters(1), depth * 0.32, 0.5, feetToMeters(4), 2.4, ["waterfall", "hazard", "terrain"]));
    scene.tactical.push(tacticalFeature("river-waterfall-hazard", "hazard", fallX, depth * 0.32, feetToMeters(1), 2, "A waterfall drops from the upper bank into a turbulent basin."));
  } else if (archetype === "ice") {
    for (let index = 0; index < 4; index += 1) {
      let x = width * (0.18 + index * 0.2) + rng.float(-2, 2);
      const z = depth * (0.3 + (index % 2) * 0.38);
      for (let attempt = 0; attempt < 12 && overlapsReservedTerrainVoid(scene, x, z, 5); attempt += 1) x = rng.float(4, width - 4);
      scene.primitives.push(box(`ice-shelf-${index}`, 0, x, feetToMeters(5 + (index % 3) * 5), z, rng.int(5, 10), FLOOR_SLAB_METERS, rng.int(4, 8), "rock", ["floor", "terrain", "ice-shelf", "high-ground"]));
      scene.tactical.push(tacticalFeature(`ice-shelf-feature-${index}`, "highGround", x, z, feetToMeters(5 + (index % 3) * 5), 2, "A raised ice shelf creates a clean elevation break and exposed crossing."));
    }
  } else if (archetype === "ruin") {
    scene.primitives.push(box("ruin-collapsed-court", 0, width * 0.28, -0.5, depth * 0.58, width * 0.28, 0.16, depth * 0.22, "hazard", ["terrain", "collapse", "void-edge"]));
    scene.tactical.push(tacticalFeature("ruin-collapse-hazard", "hazard", width * 0.28, depth * 0.58, -0.5, 3, "The collapsed court interrupts the processional route and exposes a drop."));
  } else if (archetype === "underground-lake") {
    scene.primitives.push(box("lake-north-cliff-face", 0, width * 0.5, feetToMeters(4), depth * 0.18, width * 0.58, feetToMeters(8), 0.2, "darkStone", ["cliff-face", "lake-ledge", "vertical-face"]), box("lake-south-cliff-face", 0, width * 0.5, feetToMeters(2), depth * 0.82, width * 0.58, feetToMeters(4), 0.2, "darkStone", ["cliff-face", "lake-ledge", "vertical-face"]));
  } else if (archetype === "forest") {
    scene.primitives.push(box("forest-ravine-bank", 0, width * 0.7, feetToMeters(3), depth * 0.62, width * 0.2, feetToMeters(6), depth * 0.28, "earth", ["terrain", "forest-slope", "cliff-face"]));
    scene.tactical.push(tacticalFeature("forest-ravine-bank", "highGround", width * 0.7, depth * 0.62, feetToMeters(3), 2, "A raised forest bank overlooks the clearing and splits the trails."));
  } else if (archetype === "swamp") {
    for (let index = 0; index < 5; index += 1) {
      const x = width * (0.14 + index * 0.18) + rng.float(-1.5, 1.5);
      const z = depth * (0.28 + (index % 2) * 0.42);
      scene.primitives.push(box(`swamp-hummock-${index}`, 0, x, feetToMeters(2), z, rng.int(3, 6), FLOOR_SLAB_METERS, rng.int(2, 5), "earth", ["floor", "terrain", "swamp-hummock", "high-ground"]));
    }
  }
}

/** Biome coverage composes over structural terrain. In particular, woodland
 * never replaces a requested river/channel; it grows in coherent bank groves. */
function addWoodlandCoverage(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"], riverBanks: boolean): void {
  const groveCount = Math.round(5 + density * 6);
  const treesPerGrove = Math.round(7 + density * 12);
  const channelZ = depth * 0.52;
  const riverSurfaceY = (x: number, z: number) => {
    if (!riverBanks) return FLOOR_SLAB_METERS;
    const riverLine = channelZ + Math.sin(x * 0.16) * 2.8 + Math.sin(x * 0.045) * 3;
    const distance = Math.abs(z - riverLine);
    const level = distance < 5 ? 0 : distance < 9 ? 1 : distance < 15 ? 2 : 3;
    return feetToMeters(level * 10) + FLOOR_SLAB_METERS;
  };
  for (let grove = 0; grove < groveCount; grove += 1) {
    const north = grove % 2 === 0;
    const centerX = width * rng.float(0.12, 0.88);
    const centerZ = riverBanks
      ? north ? depth * rng.float(0.12, 0.34) : depth * rng.float(0.7, 0.9)
      : depth * rng.float(0.12, 0.88);
    for (let index = 0; index < treesPerGrove; index += 1) {
      const x = Math.max(2, Math.min(width - 2, centerX + rng.float(-5, 5)));
      const z = Math.max(2, Math.min(depth - 2, centerZ + rng.float(-4, 4)));
      if (riverBanks && Math.abs(z - (channelZ + Math.sin(x * 0.16) * 2.8 + Math.sin(x * 0.045) * 3)) < 5.2) continue;
      const trunkRadius = rng.float(0.34, 0.74);
      const height = feetToMeters(rng.int(16, 34));
      const baseY = riverSurfaceY(x, z);
      scene.primitives.push(
        cylinder(`woodland-grove-${grove}-tree-${index}`, 0, x, baseY, z, trunkRadius, height, "wood", ["woodland-cover", "tree", "cover", "blocks-sight", `grove:${grove}`]),
        primitive(`woodland-grove-${grove}-canopy-${index}`, "cone", 0, x, baseY + height * 0.76, z, feetToMeters(rng.float(7, 13)), height * 0.42, feetToMeters(rng.float(7, 13)), "moss", ["woodland-cover", "canopy", `grove:${grove}`]),
      );
      if (index === 0) scene.tactical.push(tacticalFeature(`woodland-grove-cover-${grove}`, "cover", x, z, 0, 3, "A coherent tree grove blocks sight and creates a flanking pocket beside open terrain."));
    }
  }
  const logCount = Math.round(2 + density * 5);
  for (let index = 0; index < logCount; index += 1) {
    const x = rng.float(4, width - 4);
    const z = riverBanks
      ? index % 2 === 0 ? rng.float(4, depth * 0.34) : rng.float(depth * 0.7, depth - 4)
      : rng.float(4, depth - 4);
    scene.primitives.push(box(`woodland-fallen-log-${index}`, 0, x, FLOOR_SLAB_METERS, z, rng.float(3.5, 7), feetToMeters(3), rng.float(0.8, 1.4), "wood", ["fallen-log", "woodland-cover", "cover", "jumpable:5ft"]));
  }
  const ancientCount = Math.round(2 + density * 3);
  for (let index = 0; index < ancientCount; index += 1) {
    const north = index % 2 === 0;
    const x = width * rng.float(0.16, 0.84);
    const z = riverBanks ? north ? depth * rng.float(0.14, 0.3) : depth * rng.float(0.74, 0.88) : depth * rng.float(0.18, 0.82);
    const height = feetToMeters(rng.int(28, 48));
    const crown = rng.float(4.5, 7.5);
    const baseY = riverSurfaceY(x, z);
    scene.primitives.push(
      cylinder(`woodland-ancient-tree-${index}`, 0, x, baseY, z, rng.float(1.2, 1.8), height, "wood", ["ancient-tree", "woodland-cover", "cover", "blocks-sight", "landmark"]),
      primitive(`woodland-ancient-crown-${index}`, "sphere", 0, x, baseY + height * 0.72, z, crown * CELL, height * 0.42, crown * CELL, "moss", ["ancient-tree", "canopy", "landmark"]),
      box(`woodland-ancient-platform-${index}`, 0, x, baseY + feetToMeters(15), z, 3.2, FLOOR_SLAB_METERS, 3.2, "wood", ["floor", "terrain", "standable", "ancient-tree-platform", "high-ground"]),
    );
    scene.tactical.push(tacticalFeature(`woodland-ancient-highground-${index}`, "highGround", x, z, baseY + feetToMeters(15), 2, "A broad ancient-tree fork forms a standable 15-ft tactical platform."));
  }
}

/** Composable prompt traits. These modify the selected terrain grammar instead
 * of selecting a one-off prebuilt scene, so "冰原 + 龙骨" and "裂谷 + 龙骨"
 * share a skeletal vocabulary while retaining different terrain topology. */
function addPromptDrivenTheme(scene: GeneratedScene, prompt: string, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const hasBone = ["dragonbone", "dragon bone", "bone", "skeleton", "龙骨", "骸骨", "骨骼"].some((term) => normalized.includes(term));
  const hasFalls = ["waterfall", "cascade", "瀑布", "银瀑"].some((term) => normalized.includes(term));
  const hasCrystal = ["crystal", "晶体", "水晶", "晶簇"].some((term) => normalized.includes(term));
  const hasLava = ["lava", "magma", "熔岩", "岩浆"].some((term) => normalized.includes(term));
  const hasFungal = ["mushroom", "fungus", "fungal", "蘑菇", "菌类", "菌林"].some((term) => normalized.includes(term));
  if (hasBone) {
    const spineZ = depth * rng.float(0.42, 0.58);
    scene.primitives.push(corridor("prompt-bone-spine", 0, width * 0.18, spineZ, width * 0.82, spineZ + rng.float(-3, 3), feetToMeters(8), 2.4, "stone", ["bridge", "dragon-spine", "prompt-trait", "combat-route"]));
    for (let index = 0; index < 10; index += 1) {
      const x = width * (0.23 + index * 0.055);
      const z = spineZ + (index % 2 === 0 ? -1 : 1) * rng.float(2.5, 5.5);
      scene.primitives.push(cylinder(`prompt-rib-${index}`, 0, x, feetToMeters(4), z, rng.float(0.35, 0.6), feetToMeters(rng.int(7, 14)), "stone", ["dragon-rib", "cover", "prompt-trait"]));
      if (index % 2 === 0) scene.tactical.push(tacticalFeature(`prompt-rib-cover-${index}`, "cover", x, z, feetToMeters(4), 1, "A dragon rib is structural cover beside the elevated spine route."));
    }
    scene.routes.push(createRoute("prompt-spine-route", "alternate", [{ x: width * 0.18, z: spineZ, y: feetToMeters(8) }, { x: width * 0.5, z: spineZ, y: feetToMeters(8) }, { x: width * 0.82, z: spineZ, y: feetToMeters(8) }]));
  }
  if (hasFalls) {
    const x = width * rng.float(0.6, 0.82);
    scene.primitives.push(water("prompt-waterfall", 0, x, feetToMeters(9), depth * 0.22, 1.2, feetToMeters(18), 4, ["waterfall", "prompt-trait", "landmark"]), primitive("prompt-waterfall-cave", "sphere", 0, x + 3, feetToMeters(6), depth * 0.2, feetToMeters(8), feetToMeters(10), feetToMeters(6), "darkStone", ["cave-mouth", "prompt-trait", "landmark"]));
    reserveRadialTerrain(scene, "prompt-waterfall-basin-reservation", "water", x, depth * 0.28, 5.5, 0.75, "The waterfall basin owns its plunge and spray zone.");
    scene.tactical.push(tacticalFeature("prompt-waterfall-basin", "hazard", x, depth * 0.28, 0, 3, "The waterfall basin is hazardous, but conceals a route toward the cave mouth."));
  }
  if (hasCrystal) {
    for (let index = 0; index < 8; index += 1) {
      const x = rng.float(width * 0.2, width * 0.8);
      const z = rng.float(depth * 0.2, depth * 0.8);
      scene.primitives.push(primitive(`prompt-crystal-${index}`, "cone", 0, x, feetToMeters(rng.int(3, 8)), z, feetToMeters(rng.float(0.6, 1.4)), feetToMeters(rng.int(5, 13)), feetToMeters(rng.float(0.6, 1.4)), "warmLight", ["crystal", "prompt-trait", index % 3 === 0 ? "cover" : "landmark"]));
    }
  }
  // A volcanic/infernal parent already owns a coherent lava network. Do not
  // lay a second generic cross-map channel over it merely because the prompt
  // repeats the word "lava"; that duplicate used to erase all safe sites.
  if (hasLava && !scene.primitives.some((primitiveEntry) => primitiveEntry.tags?.includes("lava-flow") && primitiveEntry.tags?.includes("morphology-operator"))) {
    const z = depth * rng.float(0.42, 0.62);
    const lavaEndZ = z + rng.float(-4, 4);
    scene.primitives.push(corridor("prompt-lava-channel", 0, 2, z, width - 2, lavaEndZ, -0.3, 3.2, "hazard", ["lava", "hazard", "prompt-trait"]));
    reserveLinearTerrain(scene, "prompt-lava-channel-reservation", "lava", 2, z, width - 2, lavaEndZ, 3.2, 0.9, "A prompt-authored lava channel owns a thermal no-build setback.");
    scene.tactical.push(tacticalFeature("prompt-lava-hazard", "hazard", width * 0.5, z, -0.3, 3, "A lava channel cuts across the terrain grammar and forces a crossing decision."));
    if (hasFungal) {
      for (let index = 0; index < 4; index += 1) {
        const px = width * (0.18 + index * 0.2) + rng.float(-2, 2);
        const pz = z + rng.float(-8, 8);
        scene.primitives.push(primitive(`prompt-magma-vent-${index}`, "cylinder", 0, px, feetToMeters(0.4), pz, feetToMeters(rng.float(2.5, 4.5)), feetToMeters(rng.float(1, 3)), feetToMeters(rng.float(2.5, 4.5)), "warmLight", ["lava-vent", "magma", "hazard", "landmark"]));
        scene.tactical.push(tacticalFeature(`prompt-magma-vent-feature-${index}`, "hazard", px, pz, 0, 2, "熔岩喷口在菌林之间形成持续危险区。"));
      }
      scene.primitives.push(corridor("prompt-basalt-crossing", 0, width * 0.5, feetToMeters(0.28), z - 5, width * 0.5, feetToMeters(0.28), 1.2, "darkStone", ["bridge", "basalt", "combat-route"]));
    }
  }
}

function semanticHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function addGiantFungalLandmarks(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const count = Math.round(5 + density * 11);
  for (let index = 0; index < count; index += 1) {
    const x = rng.float(4, width - 4);
    const z = rng.float(4, depth - 4);
    const heightFeet = rng.int(12, 32);
    const height = feetToMeters(heightFeet);
    const capWidth = rng.float(3.2, 6.5);
    const stemWidth = rng.float(0.7, 1.35);
    scene.primitives.push(
      cylinder(`giant-fungus-stem-${index}`, 0, x, FLOOR_SLAB_METERS, z, stemWidth, height, "plaster", ["giant-fungus", "stem", "cover", "blocks-sight"]),
      primitive(`giant-fungus-cap-${index}`, "sphere", 0, x, height, z, capWidth * 1.524, feetToMeters(rng.float(2.2, 4.5)), capWidth * 1.524, index % 3 === 0 ? "warmLight" : "moss", ["giant-fungus", "cap", "landmark"]),
      box(`giant-fungus-platform-${index}`, 0, x, height + feetToMeters(0.8), z, capWidth * 0.72, FLOOR_SLAB_METERS, capWidth * 0.72, index % 3 === 0 ? "warmLight" : "moss", ["floor", "terrain", "standable", "fungus-cap-platform", "high-ground"]),
    );
    scene.tactical.push(tacticalFeature(`giant-fungus-highground-${index}`, "highGround", x, z, height, Math.max(2, Math.ceil(capWidth / 2)), `A ${heightFeet}-ft giant mushroom cap is a standable tactical platform with a sight-blocking stem.`));
    if (index < 2) {
      const ramp = stairConnection(`giant-fungus-access-${index}`, 0, { xCells: x - 3, zCells: z, yMeters: FLOOR_SLAB_METERS }, { xCells: x, zCells: z, yMeters: height + FLOOR_SLAB_METERS }, 1.3, "wood", ["fungus-access", "climbable"]);
      scene.primitives.push(ramp.primitive);
      scene.routes.push(stairRoute(`giant-fungus-access-route-${index}`, ramp));
    }
  }
}

/** Ollama may return arbitrary short anchor concepts. Every anchor receives a
 * deterministic landmark cluster even when no hand-authored visual vocabulary
 * exists, so novel themes degrade into distinct geometry instead of silence. */
function addSemanticAnchorLandmarks(scene: GeneratedScene, hints: SemanticGenerationHints | undefined, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  if (!hints || hints.anchors.length === 0) return;
  for (const [anchorIndex, anchor] of hints.anchors.slice(0, 5).entries()) {
    const hash = semanticHash(anchor);
    const requestedX = width * (0.18 + ((hash % 57) / 100));
    const requestedZ = depth * (0.18 + (((hash >>> 7) % 57) / 100));
    const anchorPlacement = findReservedSafePlacement(scene, requestedX, requestedZ, 6, 6);
    if (!anchorPlacement) continue;
    const { x, z } = anchorPlacement;
    const count = 2 + (hash % 3);
    const material: MaterialKey = hints.theme === "mystic" ? "warmLight" : hints.environment === "ruin" ? "stone" : hints.environment === "underground" ? "darkStone" : "rock";
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + rng.float(-0.35, 0.35);
      const requestedPx = x + Math.cos(angle) * rng.float(1.5, 4);
      const requestedPz = z + Math.sin(angle) * rng.float(1.5, 4);
      const landmarkPlacement = findReservedSafePlacement(scene, requestedPx, requestedPz, 2.5, 2.5);
      if (!landmarkPlacement) continue;
      const px = landmarkPlacement.x;
      const pz = landmarkPlacement.z;
      const height = feetToMeters(5 + ((hash >>> (index + 3)) % 16));
      const shape = (["cylinder", "cone", "sphere"] as const)[(hash + index) % 3] ?? "cylinder";
      scene.primitives.push(primitive(`semantic-anchor-${anchorIndex}-${index}`, shape, 0, px, FLOOR_SLAB_METERS, pz, feetToMeters(rng.float(2.5, 5)), height, feetToMeters(rng.float(2.5, 5)), material, ["semantic-anchor", `concept:${anchor.slice(0, 24)}`, "landmark", index === 0 ? "cover" : "detail"]));
    }
    scene.tactical.push(tacticalFeature(`semantic-anchor-feature-${anchorIndex}`, anchorIndex === 0 ? "highGround" : "cover", x, z, 0, 2, `Prompt-derived landmark cluster: ${anchor}.`));
  }
}

interface StandablePropSpec {
  material: MaterialKey;
  label: string;
  width: number;
  depth: number;
  heightFeet: number;
  count: number;
  yFeet?: number;
}

/** Adds a natural object as a real tactical surface instead of a decorative
 * mesh. The top cap receives the same 5-ft surface grid as terrain, and tags
 * expose stand/jump/cover semantics to future pathfinding and AI. */
function addStandableProps(scene: GeneratedScene, archetype: WildernessArchetype, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const specs: Partial<Record<WildernessArchetype, StandablePropSpec>> = {
    "river-valley": { material: "rock", label: "river boulder", width: 2.6, depth: 2.2, heightFeet: 5, count: 8 },
    "dry-riverbed": { material: "rock", label: "scoured boulder", width: 2.5, depth: 2.1, heightFeet: 5, count: 8 },
    "impact-crater": { material: "rock", label: "ejecta block", width: 2.7, depth: 2.3, heightFeet: 7, count: 9 },
    volcanic: { material: "darkStone", label: "basalt block", width: 2.5, depth: 2.2, heightFeet: 7, count: 9 },
    "infernal-waste": { material: "metal", label: "war wreck", width: 2.8, depth: 2.1, heightFeet: 6, count: 9 },
    "floating-islands": { material: "rock", label: "floating basalt shelf", width: 2.4, depth: 2.1, heightFeet: 7, count: 7 },
    "burial-ground": { material: "stone", label: "broken grave slab", width: 2.3, depth: 1.5, heightFeet: 5, count: 5 },
    rift: { material: "rock", label: "rift pillar", width: 1.8, depth: 1.8, heightFeet: 10, count: 7 },
    mountain: { material: "rock", label: "summit boulder", width: 2.4, depth: 2.1, heightFeet: 5, count: 10 },
    ice: { material: "rock", label: "ice block", width: 2.5, depth: 2.2, heightFeet: 5, count: 7 },
    ruin: { material: "stone", label: "fallen masonry", width: 2.8, depth: 1.6, heightFeet: 5, count: 6 },
    "underground-lake": { material: "rock", label: "lake rock", width: 2.2, depth: 2, heightFeet: 5, count: 8 },
    underdark: { material: "darkStone", label: "cavern shelf", width: 2.4, depth: 2, heightFeet: 5, count: 9 },
    forest: { material: "wood", label: "ancient tree root", width: 2.8, depth: 2.2, heightFeet: 5, count: 10 },
    swamp: { material: "wood", label: "deadwood hummock", width: 2.6, depth: 1.8, heightFeet: 5, count: 8 },
    "industrial-ruin": { material: "metal", label: "industrial platform", width: 2.8, depth: 2.2, heightFeet: 8, count: 8, yFeet: 0 },
    "coral-tide": { material: "stone", label: "reef shelf", width: 2.5, depth: 2.1, heightFeet: 6, count: 9 },
  };
  const spec = specs[archetype];
  if (!spec) return;
  const distanceToSegment = (x: number, z: number, ax: number, az: number, bx: number, bz: number): number => {
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
    return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
  };
  const nearAuthoredRoute = (x: number, z: number): boolean => scene.routes.some((route) => route.points.some((point, pointIndex) => {
    const next = route.points[pointIndex + 1];
    const pointX = point.x / CELL;
    const pointZ = point.z / CELL;
    const nextX = next ? next.x / CELL : pointX;
    const nextZ = next ? next.z / CELL : pointZ;
    return distanceToSegment(x, z, pointX, pointZ, nextX, nextZ) < 3.4;
  }));
  const count = Math.max(2, Math.round(spec.count * (0.15 + density * 1.55)));
  for (let index = 0; index < count; index += 1) {
    let x = rng.float(3, width - 3);
    let z = rng.float(3, depth - 3);
    // Keep standable props out of authored route portals and switchbacks. A
    // boulder can block a route visually, but it must not make a vertical
    // connection fail validation or become an accidental floor collision.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!nearAuthoredRoute(x, z) && !overlapsReservedTerrainVoid(scene, x, z, Math.max(spec.width, spec.depth))) break;
      x = rng.float(3, width - 3);
      z = rng.float(3, depth - 3);
    }
    const baseY = feetToMeters(spec.yFeet ?? 0);
    const height = feetToMeters(spec.heightFeet + rng.int(-1, 2));
    const w = spec.width * rng.float(0.78, 1.3);
    const d = spec.depth * rng.float(0.78, 1.25);
    scene.primitives.push(
      box(`standable-prop-body-${archetype}-${index}`, 0, x, baseY, z, w, height, d, spec.material, ["natural-prop", "cover", "blocks-sight", spec.label.replaceAll(" ", "-")]),
      box(`standable-prop-top-${archetype}-${index}`, 0, x, baseY + height, z, w * 0.72, FLOOR_SLAB_METERS, d * 0.72, spec.material, ["floor", "terrain", "standable", "jumpable:5ft", "high-ground", "natural-prop"]),
    );
    scene.tactical.push(tacticalFeature(`standable-prop-feature-${archetype}-${index}`, "highGround", x, z, baseY + height, Math.max(1, Math.ceil(Math.max(w, d) / 2)), `${spec.label} can be occupied as a 5-ft jumpable high point and provides hard cover.`));
  }
}

function buildIndustrialRuin(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const floorY = 0;
  const factoryW = width * 0.32;
  const factoryD = depth * 0.36;
  const factories = [[width * 0.24, depth * 0.3], [width * 0.7, depth * 0.28], [width * 0.68, depth * 0.72]] as const;
  const factoryHeightBands = [[18, 22], [27, 33], [13, 17]] as const;
  scene.primitives.push(box("industrial-yard-floor", 0, width * 0.5, 0, depth * 0.5, width - 4, FLOOR_SLAB_METERS, depth - 4, "earth", ["industrial", "yard", "floor", "terrain"]));
  factories.forEach(([x, z], index) => {
    const w = Math.round(factoryW * rng.float(0.82, 1.15) * 2) / 2;
    const d = Math.round(factoryD * rng.float(0.78, 1.12) * 2) / 2;
    const heightBand = factoryHeightBands[index] ?? factoryHeightBands[0];
    const shellOpenings = index === 1 ? { west: { widthCells: 3 }, north: { widthCells: 3 } } : { [index === 0 ? "south" : "north"]: { widthCells: 3 } };
    scene.primitives.push(...rectangularShell(`industrial-factory-${index}`, 0, x, z, floorY, w, d, feetToMeters(rng.int(heightBand[0], heightBand[1])), "metal", "darkStone", ["industrial", "factory", index === 2 ? "collapsed" : "warehouse"], shellOpenings));
    scene.rooms.push(createRoom(`industrial-factory-room-${index}`, index === 0 ? "Boiler hall" : index === 1 ? "Assembly floor" : "Collapsed loading shed", index === 2 ? "combat" : "service", 0, x, z, w - 2, d - 2));
  });
  connectRooms(scene.rooms, "industrial-factory-room-0", "industrial-factory-room-1");
  connectRooms(scene.rooms, "industrial-factory-room-1", "industrial-factory-room-2");
  const bridgeY = feetToMeters(12);
  scene.primitives.push(corridor("industrial-conveyor-bridge", 0, width * 0.32, depth * 0.3, width * 0.66, depth * 0.28, bridgeY, 2.2, "metal", ["industrial", "conveyor-bridge", "high-ground", "vertical-route"]));
  scene.primitives.push(corridor("industrial-pipe-rack", 0, width * 0.14, depth * 0.58, width * 0.84, depth * 0.58, feetToMeters(9), 1.1, "metal", ["industrial", "rust-pipe", "catwalk"]));
  scene.primitives.push(water("industrial-flooded-pit", 0, width * 0.47, -0.18, depth * 0.56, 7, 0.22, 8, ["industrial", "hazard", "flooded-pit"]));
  const catwalkStair = stairConnection("industrial-catwalk-stair", 0, { xCells: width * 0.24, zCells: depth * 0.34, yMeters: FLOOR_SLAB_METERS }, { xCells: width * 0.32, zCells: depth * 0.3, yMeters: bridgeY + FLOOR_SLAB_METERS }, 1.6, "metal", ["industrial", "catwalk-access", "vertical-opening"]);
  scene.primitives.push(catwalkStair.primitive);
  scene.routes.push(stairRoute("industrial-catwalk-route", catwalkStair));
  for (let index = 0; index < 3 + Math.round(density * 4); index += 1) scene.primitives.push(cylinder(`industrial-tank-${index}`, 0, width * (0.18 + index * 0.1), FLOOR_SLAB_METERS, depth * 0.78, 2.4, feetToMeters(7 + index % 3 * 3), "metal", ["industrial", "tank", "cover"]));
  scene.routes.push(createRoute("industrial-primary-route", "primary", [{ x: 4, z: depth * 0.5, y: 0 }, { x: width * 0.5, z: depth * 0.5, y: 0 }, { x: width - 4, z: depth * 0.5, y: 0 }]));
  scene.tactical.push(tacticalFeature("industrial-entrance", "entrance", 1, depth * 0.5, 0, 2, "A broken service road enters between flooded machinery and the boiler hall."), tacticalFeature("industrial-catwalk-highground", "highGround", width * 0.5, depth * 0.3, bridgeY, 3, "The conveyor bridge crosses the factory floor twelve feet above the yard."));
}

function buildCoralTide(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const poolZ = depth * 0.52;
  scene.primitives.push(box("coral-dry-court", 0, width * 0.5, feetToMeters(5), depth * 0.2, width - 6, FLOOR_SLAB_METERS, depth * 0.26, "earth", ["coral", "dry-reef", "high-ground", "floor", "terrain"]));
  scene.primitives.push(water("coral-tidal-channel", 0, width * 0.5, -0.25, poolZ, 10, 0.32, width - 6, ["coral", "tidal-water", "water-level-0"]));
  scene.primitives.push(water("coral-deep-tide-pool", 0, width * 0.22, -0.6, depth * 0.72, 8, 0.6, 9, ["coral", "tide-pool", "water-level-2", "hazard"]));
  const bridgeY = feetToMeters(10);
  scene.primitives.push(corridor("coral-high-wood-bridge", 0, width * 0.22, poolZ, width * 0.78, poolZ, bridgeY, 1.6, "wood", ["coral", "wood-bridge", "high-ground", "tidal-route"]));
  for (let index = 0; index < 12; index += 1) {
    const x = rng.float(4, width - 4); const z = rng.float(5, depth - 5);
    if (Math.abs(z - poolZ) < 5) continue;
    scene.primitives.push(cylinder(`coral-reef-cover-${index}`, 0, x, FLOOR_SLAB_METERS, z, rng.float(1.3, 2.8), feetToMeters(rng.int(3, 8)), "stone", ["coral", "reef-rock", "cover", "standable"]));
  }
  scene.rooms.push(createRoom("coral-dry-court-room", "Dry coral courtyard", "natural", 0, width * 0.5, depth * 0.2, width - 8, depth * 0.22), createRoom("coral-tidal-room", "Tidal channel", "combat", 0, width * 0.5, poolZ, width - 8, 8), createRoom("coral-bridge-room", "Raised bridge route", "circulation", 0, width * 0.5, poolZ, width - 8, 2));
  connectRooms(scene.rooms, "coral-dry-court-room", "coral-bridge-room"); connectRooms(scene.rooms, "coral-tidal-room", "coral-bridge-room");
  scene.routes.push(createRoute("coral-low-tide-route", "primary", [{ x: 4, z: depth * 0.2, y: feetToMeters(5) }, { x: width * 0.22, z: poolZ, y: bridgeY }, { x: width * 0.78, z: poolZ, y: bridgeY }, { x: width - 4, z: depth * 0.2, y: feetToMeters(5) }]));
  scene.routes.push(createRoute("coral-high-tide-route", "alternate", [{ x: width * 0.22, z: poolZ, y: bridgeY }, { x: width * 0.78, z: poolZ, y: bridgeY }]));
  scene.tactical.push(tacticalFeature("coral-entrance", "entrance", 2, depth * 0.2, feetToMeters(5), 2, "The dry reef court is reachable only before the tide rises."), tacticalFeature("coral-bridge-highground", "highGround", width * 0.5, poolZ, bridgeY, 2, "A ten-foot wooden bridge remains passable at high tide."));
}

export function generateWilderness(context: GeneratorContext): GeneratedScene {
  const archetype = classifyWildernessArchetype(context.request.prompt, context.semanticHints, context.compositionProgram?.capabilityIds);
  const profile = bounds(context, archetype);
  const titlePool: Record<WildernessArchetype, readonly string[]> = {
    "river-valley": ["Silverfall Valley", "The Two-Bank Reach"],
    "dry-riverbed": ["The Thirsting Wash", "Deadwater Channel"],
    "impact-crater": ["The Fallen Star", "Glass-Rim Impact"],
    volcanic: ["The Cinder Caldera", "Ashmouth Crater"],
    "infernal-waste": ["The Iron Wastes", "War Road of Ash"],
    "floating-islands": ["The Three Falling Isles", "Ashwind Skybreak"],
    "burial-ground": ["The Crooked Rest", "Graves of the Old Road"],
    rift: ["Dragonbone Rift", "The Split Earth"],
    mountain: ["The Broken Heights", "Ridge of Seven Shelves"],
    ice: ["Whiteglass Expanse", "The Blue Fracture"],
    ruin: ["The Overgrown Reliquary", "Ruins at the Last Ridge"],
    "underground-lake": ["The Blackwater Hollow", "Lake Beneath Stone"],
    underdark: ["The Fungal Deep", "The Five-Shelf Underdark"],
    forest: ["The Canopy Run", "Mosswood Crossing"],
    swamp: ["The Sinking Fen", "Reedwater Marsh"],
    "industrial-ruin": ["The Rustworks District", "The Flooded Foundry Quarter"],
    "coral-tide": ["The Tidal Coral Court", "Reef of the Changing Path"],
  };
  const scene = baseScene("wilderness", choose(context.rng, titlePool[archetype]), `${archetype} terrain with elevation bands, route choices, tactical cover, and explicit hazards.`, context.request.seed, { x: profile.width, z: profile.depth }, 1, [Math.ceil(profile.height + 11)]);
  scene.archetype = archetype;
  if (archetype === "industrial-ruin") buildIndustrialRuin(scene, profile.width, profile.depth, profile.density, context.rng.fork("industrial"));
  else if (archetype === "coral-tide") buildCoralTide(scene, profile.width, profile.depth, context.rng.fork("coral"));
  else if (archetype === "river-valley") buildRiverValleyContinuous(scene, profile.width, profile.depth, profile.density, context.rng.fork("river"));
  else if (archetype === "dry-riverbed") buildDryRiverbed(scene, profile.width, profile.depth, profile.density, context.rng.fork("dry-riverbed"));
  else if (archetype === "impact-crater") buildImpactCrater(scene, profile.width, profile.depth, profile.density, context.rng.fork("impact-crater"));
  else if (archetype === "volcanic") buildVolcanic(scene, profile.width, profile.depth, profile.density, context.rng.fork("volcanic"));
  else if (archetype === "infernal-waste") buildInfernalWaste(scene, profile.width, profile.depth, profile.density, context.rng.fork("infernal-waste"));
  else if (archetype === "floating-islands") buildFloatingIslands(scene, profile.width, profile.depth, profile.density, context.rng.fork("floating-islands"));
  else if (archetype === "burial-ground") buildBurialGround(scene, profile.width, profile.depth, profile.density, context.rng.fork("burial-ground"));
  else if (archetype === "rift") buildRift(scene, profile.width, profile.depth, profile.density, context.rng.fork("rift"));
  else if (archetype === "mountain") buildMountain(scene, profile.width, profile.depth, profile.density, context.rng.fork("mountain"));
  else if (archetype === "ice") buildIce(scene, profile.width, profile.depth, profile.density, context.rng.fork("ice"), context.request.prompt);
  else if (archetype === "ruin") buildRuin(scene, profile.width, profile.depth, context.rng.fork("ruin"));
  else if (archetype === "forest") buildForest(scene, profile.width, profile.depth, profile.density, context.rng.fork("forest"), context.request.prompt);
  else if (archetype === "swamp") buildSwamp(scene, profile.width, profile.depth, profile.density, context.rng.fork("swamp"));
  else if (archetype === "underdark") buildUnderdark(scene, profile.width, profile.depth, profile.density, context.rng.fork("underdark"));
  else buildUndergroundLake(scene, profile.width, profile.depth, context.rng.fork("lake"));
  const morphology = analyzeTerrainMorphology(context.request.prompt, context.semanticHints);
  const floatingText = [context.request.prompt, ...(context.semanticHints?.anchors ?? []), ...(context.semanticHints?.tags ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  if (archetype !== "floating-islands" && ["浮空岛", "浮空岩岛", "浮岛", "空岛", "悬空石盘", "漂浮岩岛", "floating island", "sky island", "levitating"].some((term) => floatingText.includes(term))) {
    addFloatingIslandsOverlay(scene, profile.width, profile.depth, context.rng.fork("floating-overlay"));
  }
  const infernalText = [context.request.prompt, ...(context.semanticHints?.anchors ?? []), ...(context.semanticHints?.tags ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  const infernalTheme = archetype === "infernal-waste" || ["阿弗纳斯", "avernus", "地狱", "hell", "infernal", "灰烬荒原", "ash waste"].some((term) => infernalText.includes(term));
  if (morphology.woodland && archetype !== "forest" && !infernalTheme) {
    addWoodlandCoverage(scene, profile.width, profile.depth, profile.density, context.rng.fork("woodland-coverage"), archetype === "river-valley");
  }
  addSemanticThemeStructure(scene, archetype, profile.width, profile.depth, context.rng.fork("theme-structure"));
  addPromptDrivenTheme(scene, context.request.prompt, profile.width, profile.depth, context.rng.fork("prompt-theme"));
  addSemanticAnchorLandmarks(scene, context.semanticHints, profile.width, profile.depth, context.rng.fork("semantic-anchors"));
  const fungalText = [context.request.prompt, ...(context.semanticHints?.anchors ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  if (["mushroom", "fungus", "fungal", "蘑菇", "菌类", "菌林"].some((term) => fungalText.includes(term))) {
    addGiantFungalLandmarks(scene, profile.width, profile.depth, profile.density, context.rng.fork("giant-fungi"));
  }
  const ownsTacticalComplexity = ["forest", "river-valley", "volcanic", "impact-crater", "rift"].includes(archetype);
  if (archetype !== "floating-islands" && !ownsTacticalComplexity) {
    addStandableProps(scene, archetype, profile.width, profile.depth, profile.density, context.rng.fork("standable-props"));
    addTerrainComplexity(scene, archetype, profile.width, profile.depth, profile.density, context.rng.fork("terrain-complexity"));
  }
  addWildernessBuildingSite(scene, context, profile.width, profile.depth, archetype);
  return scene;
}
