import type { GeneratedScene, GeneratorContext, MaterialKey, SemanticGenerationHints } from "../schema";
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
  "river-valley": ["river", "valley", "riverbank", "河谷", "河流", "河川", "溪谷", "峡谷河"],
  "dry-riverbed": ["dry riverbed", "dry wash", "wadi", "干河床", "枯河床", "河床"],
  "impact-crater": ["impact crater", "meteor crater", "陨石坑", "撞击坑", "流星坑"],
  volcanic: ["volcano", "volcanic", "caldera", "火山", "火山口", "破火山口"],
  "infernal-waste": ["avernus", "hellscape", "infernal waste", "阿弗纳斯", "地狱荒原", "地狱"],
  "burial-ground": ["cemetery", "graveyard", "burial ground", "墓地", "墓园", "坟场", "陵园"],
  rift: ["rift", "chasm", "ravine", "裂谷", "裂隙", "深坑", "断崖"],
  mountain: ["mountain", "cliff", "ridge", "山地", "山脊", "高山", "峭壁"],
  ice: ["ice", "glacier", "tundra", "冰原", "冰川", "冻土", "雪原"],
  ruin: ["ruin", "ruined", "wilderness ruin", "遗迹", "废墟", "残垣", "荒野遗迹"],
  "underground-lake": ["underground lake", "dark lake", "subterranean lake", "地下湖", "地底湖"],
  underdark: ["underdark", "幽暗地域", "地底世界", "地下洞窟", "菌林", "发光水晶", "mushroom", "fungal", "蘑菇", "菌类"],
  forest: ["forest", "woodland", "林地", "森林", "树林", "林间", "巨树", "树冠"],
  swamp: ["swamp", "marsh", "bog", "沼泽", "湿地"],
  "floating-islands": ["floating island", "sky island", "levitating island", "浮空岛", "浮岛", "空岛", "悬浮岛"],
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

export function classifyWildernessArchetype(prompt: string, hints?: SemanticGenerationHints): WildernessArchetype {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const morphology = analyzeTerrainMorphology(prompt, hints);
  if (WILDERNESS_TERMS["industrial-ruin"].some((term) => normalized.includes(term))) return "industrial-ruin";
  if (WILDERNESS_TERMS["coral-tide"].some((term) => normalized.includes(term))) return "coral-tide";
  if (morphology.impactCrater) return "impact-crater";
  if (WILDERNESS_TERMS["floating-islands"].some((term) => normalized.includes(term))) return "floating-islands";
  if (morphology.infernal) return "infernal-waste";
  if (morphology.crater) return "volcanic";
  if (morphology.burial) return "burial-ground";
  if (morphology.dryChannel) return "dry-riverbed";
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

function buildRiverValleyContinuous(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const cols = Math.floor(width);
  const rows = Math.floor(depth);
  const channel = rows * rng.float(0.46, 0.55);
  const heights: Array<number | undefined> = [];
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x]);
  for (let z = 0; z < rows; z += 1) {
    for (let x = 0; x < cols; x += 1) {
      const riverLine = channel + Math.sin(x * 0.16) * 2.8 + Math.sin(x * 0.045) * 3;
      const distance = Math.abs(z - riverLine);
      const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
      const inWater = distance <= 2.1;
      const tributary = x > cols * 0.62 && x < cols * 0.69 && z < riverLine - 3 && Math.abs(z - (rows * 0.12 + (x - cols * 0.62) * 2.2)) < 1.5;
      const erodedPocket = distance > 7 && Math.sin(x * 0.27 + z * 0.19) > 0.91 && Math.cos(x * 0.08 - z * 0.12) > 0.15;
      if (edge === 0 || inWater || tributary || erodedPocket) heights.push(undefined);
      else {
        const distanceBand = distance < 5 ? 0 : distance < 9 ? 1 : distance < 15 ? 2 : 3;
        const ridgeLift = z < riverLine && distance > 13 && Math.sin(x * 0.095) + Math.cos(z * 0.12) > 0.65 ? 1 : 0;
        heights.push(Math.min(4, distanceBand + ridgeLift));
      }
    }
  }
  const yOf = (level: number) => feetToMeters(level * 10) + FLOOR_SLAB_METERS;
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
  const riverLineAt = (x: number) => channel + Math.sin(x * 0.16) * 2.8 + Math.sin(x * 0.045) * 3;
  const waterSegments = 14;
  for (let index = 0; index < waterSegments; index += 1) {
    const fromX = 1 + ((cols - 2) * index) / waterSegments;
    const toX = 1 + ((cols - 2) * (index + 1)) / waterSegments;
    const fromZ = riverLineAt(fromX);
    const toZ = riverLineAt(toX);
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    scene.primitives.push(water(`river-semantic-channel-${index}`, 0, (fromX + toX) / 2, feetToMeters(1), (fromZ + toZ) / 2, 4.1, 0.34, Math.hypot(dx, dz) + 0.8, ["river", "watercourse", "terrain", "meandering-channel"], Math.atan2(dx, dz)));
  }
  const crossingX = cols * rng.float(0.42, 0.62);
  const crossingZ = riverLineAt(crossingX);
  scene.primitives.push(corridor("river-semantic-old-bridge", 0, crossingX, crossingZ - 4, crossingX, crossingZ + 4, yOf(1), 2.4, "stone", ["bridge", "semantic-grid", "old-bridge"]));
  const fordX = cols * 0.2;
  const fordZ = riverLineAt(fordX);
  scene.primitives.push(corridor("river-semantic-shallow-ford", 0, fordX, fordZ - 3.5, fordX, fordZ + 3.5, yOf(0), 2.2, "earth", ["terrain", "semantic-grid", "shallow-ford"]));
  scene.rooms.push(createRoom("river-upper-ridge", "Upper ridge", "natural", 0, cols * 0.5, rows * 0.2, cols - 6, rows * 0.25, yOf(3)), createRoom("river-floodplain", "River floodplain", "natural", 0, cols * 0.5, channel, cols - 6, 8, yOf(1)), createRoom("river-falls-basin", "Waterfall basin", "combat", 0, cols * 0.7, rows * 0.76, cols * 0.3, rows * 0.22, yOf(1)));
  connectRooms(scene.rooms, "river-upper-ridge", "river-floodplain");
  connectRooms(scene.rooms, "river-floodplain", "river-falls-basin");
  scene.routes.push(createRoute("river-ridge-route", "primary", [{ x: 2, z: rows * 0.18, y: yOf(3) }, { x: cols * 0.32, z: rows * 0.32, y: yOf(2) }, { x: crossingX, z: crossingZ - 4, y: yOf(1) }, { x: cols - 2, z: rows * 0.76, y: yOf(2) }]));
  scene.routes.push(createRoute("river-shallow-ford", "alternate", [{ x: fordX, z: fordZ - 4, y: yOf(1) }, { x: fordX, z: fordZ, y: yOf(0) }, { x: fordX, z: fordZ + 4, y: yOf(1) }]));
  scene.routes.push(createRoute("river-downstream", "waterflow", Array.from({ length: 7 }, (_, index) => { const x = 2 + ((cols - 4) * index) / 6; return { x, z: riverLineAt(x), y: feetToMeters(1 - index * 0.12) }; })));
  scene.tactical.push(tacticalFeature("river-semantic-entrance", "entrance", 2, rows * 0.18, yOf(3), 2, "The high ridge is the main approach into the valley."), tacticalFeature("river-ford", "chokepoint", fordX, fordZ, yOf(0), 2, "A shallow ford is a legal crossing but exposes anyone in the channel."), tacticalFeature("river-falls", "hazard", cols * 0.7, rows * 0.76, yOf(1), 3, "The waterfall basin drops below the floodplain and hides a side route."));
  scene.description = `River-valley semantic grid with ${cliffCount} bank cliff segments, continuous high ridge, floodplain, waterfall basin, old bridge, shallow ford, and downhill waterflow.`;
  scene.floorHeightFeet = [Math.ceil((yOf(3) + feetToMeters(12)) / 0.3048)];
}

function buildRift(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const gap = Math.max(7, Math.round(width * 0.24));
  const left = (width - gap) / 2;
  const right = width - left;
  scene.primitives.push(box("rift-west-shelf", 0, left / 2, 0, depth / 2, left, FLOOR_SLAB_METERS, depth - 2, "rock", ["floor", "terrain", "rift-shelf"]), box("rift-east-shelf", 0, right + left / 2, feetToMeters(3), depth / 2, left, FLOOR_SLAB_METERS, depth - 2, "rock", ["floor", "terrain", "rift-shelf"]));
  const bridgeZ = depth * 0.46;
  scene.primitives.push(corridor("rift-bridge", 0, left - 1, bridgeZ, right + 1, bridgeZ, feetToMeters(3.15), 2.2, "wood", ["bridge"]));
  const rampBottom = { xCells: 3, zCells: depth * 0.78, yMeters: FLOOR_SLAB_METERS };
  const rampTop = { xCells: 7, zCells: depth * 0.78, yMeters: feetToMeters(3) + FLOOR_SLAB_METERS };
  const ramp = stairConnection("rift-east-ramp", 0, rampBottom, rampTop, 2, "rock", ["natural-ramp", "rift-access"]);
  scene.primitives.push(ramp.primitive);
  scene.rooms.push(createRoom("rift-west-room", "West shelf", "natural", 0, left / 2, depth / 2, left - 2, depth - 4), createRoom("rift-east-room", "East shelf", "natural", 0, right + left / 2, depth / 2, left - 2, depth - 4), createRoom("rift-bridge-room", "Rift bridge", "circulation", 0, width / 2, bridgeZ, gap + 2, 3));
  connectRooms(scene.rooms, "rift-west-room", "rift-bridge-room");
  connectRooms(scene.rooms, "rift-east-room", "rift-bridge-room");
  scene.routes.push(createRoute("rift-primary-route", "primary", [{ x: 1, z: bridgeZ }, { x: left, z: bridgeZ, y: 0 }, { x: right, z: bridgeZ, y: feetToMeters(3.15) }, { x: width - 1, z: bridgeZ, y: feetToMeters(3.15) }]), stairRoute("rift-ramp-route", ramp));
  scene.tactical.push(tacticalFeature("rift-entrance", "entrance", 1, bridgeZ, 0, 2, "A broken trail enters the west shelf."), tacticalFeature("rift-bridge-choke", "chokepoint", width / 2, bridgeZ, feetToMeters(3.15), 2, "The narrow bridge concentrates every attack across the gap."), tacticalFeature("rift-void-hazard", "hazard", width / 2, depth / 2, -1, 3, "Falling into the rift removes a combatant from the fight."));
  addCover(scene, rng, "rift", left * 0.55, depth * 0.28, 0, 4);
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
}

/** Shared terrain realization: morphology operators author an elevation field,
 * while this pass makes all walkable tops and vertical boundaries explicit. */
function renderMorphologyField(scene: GeneratedScene, options: FieldRenderOptions): { yOf(level: number): number; walkable: number; cliffs: number } {
  const { prefix, cols, rows, heights } = options;
  const at = (x: number, z: number) => x < 0 || z < 0 || x >= cols || z >= rows ? undefined : heights[z * cols + x];
  const yOf = (level: number) => feetToMeters(level * (options.stepFeet ?? 5)) + FLOOR_SLAB_METERS;
  let walkable = 0;
  let cliffs = 0;
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
        scene.primitives.push(box(`${prefix}-cliff-${x}-${z}-${dx}-${dz}`, 0, x + 0.5 + dx * 0.49, lowY, z + 0.5 + dz * 0.49, dx ? 0.14 : 0.96, highY - lowY, dz ? 0.14 : 0.96, "darkStone", ["cliff-face", "vertical-face", "terrain", `${prefix}-boundary`]));
      }
    }
  }
  return { yOf, walkable, cliffs };
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
  scene.description = `Dry-channel morphology with ${rendered.walkable} walkable cells, ${rendered.cliffs} eroded vertical faces, three crossings, scoured boulders, and a continuous low river bed.`;
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
    tagsFor: (level, x, z) => [level >= 5 ? "impact-rim" : Math.hypot(x - cx, z - cz) < radius * 0.48 ? "crater-basin" : "ejecta-field"],
  });
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
  const heights: Array<number | undefined> = [];
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
    const dx = x - cx;
    const dz = z - cz;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const warped = distance / (radius * (1 + Math.sin(angle * 3 + 0.8) * 0.1 + Math.sin(angle * 5) * 0.05));
    const edge = Math.min(x, z, cols - 1 - x, rows - 1 - z);
    const outlet = Math.abs(angle - outletAngle) < 0.12 + density * 0.04 && dx > 0 && warped < 1.45;
    const brokenRim = warped > 0.72 && warped < 1.06 && Math.sin(x * 0.43 + z * 0.29) > 0.94 - density * 0.08;
    if (edge === 0 || warped < 0.2 || outlet || brokenRim) heights.push(undefined);
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
    tagsFor: (level) => [level >= 5 ? "caldera-rim" : level <= 1 ? "crater-floor" : "volcanic-slope"],
    stepFeet: 5,
  });
  scene.primitives.push(
    primitive("volcanic-crater-lava", "cylinder", 0, cx, -0.35, cz, radius * 0.32 * CELL, 0.45, radius * 0.32 * CELL, "hazard", ["lava", "crater", "hazard", "morphology-operator"]),
    corridor("volcanic-lava-outlet", 0, cx + radius * 0.15, cz, cols - 1, cz + Math.tan(outletAngle) * (cols - cx), -0.28, 2.8 + density * 2.2, "hazard", ["lava", "lava-flow", "hazard", "morphology-operator"]),
    corridor("volcanic-basalt-bridge", 0, cx + radius * 0.54, cz - 3.5, cx + radius * 0.54, cz + 3.5, rendered.yOf(5), 1.8, "darkStone", ["bridge", "basalt-bridge", "semantic-grid"]),
  );
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
  scene.description = `Volcanic morphology with an irregular caldera, ${rendered.cliffs} exposed basalt faces, crater lava, a downhill outlet, fumarole cover, and a rim combat route.`;
  scene.floorHeightFeet = [48];
}

function buildInfernalWaste(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  buildDryRiverbed(scene, width, depth, density, rng.fork("infernal-base"));
  const riverZ = depth * rng.float(0.42, 0.58);
  scene.primitives.push(
    corridor("infernal-war-road", 0, 2, depth * 0.24, width - 2, depth * 0.31, feetToMeters(12), 3.2, "metal", ["infernal-war-road", "high-ground", "scene-program"]),
    corridor("infernal-lava-fissure", 0, width * 0.18, riverZ, width * 0.86, riverZ + rng.float(-5, 5), -0.25, 3.4, "hazard", ["lava", "lava-flow", "infernal", "hazard"]),
  );
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
  const islands = [
    { id: "lower", x: width * 0.25, z: depth * 0.68, y: 0, w: width * 0.36, d: depth * 0.3 },
    { id: "middle", x: width * 0.58, z: depth * 0.48, y: feetToMeters(20), w: width * 0.34, d: depth * 0.28 },
    { id: "upper", x: width * 0.38, z: depth * 0.2, y: feetToMeters(40), w: width * 0.3, d: depth * 0.24 },
  ];
  for (const [level, island] of islands.entries()) {
    const cols = Math.max(8, Math.floor(island.w));
    const rows = Math.max(7, Math.floor(island.d));
    for (let z = 0; z < rows; z += 1) for (let x = 0; x < cols; x += 1) {
      const nx = (x - cols / 2) / (cols / 2);
      const nz = (z - rows / 2) / (rows / 2);
      const present = Math.hypot(nx, nz * 1.08) < 0.92 + Math.sin(x * 0.8 + z * 0.31 + level) * 0.08 && !(Math.sin(x * 1.7 + z * 0.43 + level * 2) > 0.88 && (x + z) % 3 === 0);
      if (!present) continue;
      const px = island.x + x - cols / 2;
      const pz = island.z + z - rows / 2;
      const thickness = feetToMeters(rng.int(7, 13));
      scene.primitives.push(box(`floating-${island.id}-surface-${x}-${z}`, level, px, island.y, pz, 1.02, FLOOR_SLAB_METERS, 1.02, level === 0 ? "rock" : "darkStone", ["floor", "terrain", "floating-island", `island:${island.id}`]));
      if ((x + z) % 4 === 0) scene.primitives.push(box(`floating-${island.id}-cliff-${x}-${z}`, level, px, island.y - thickness / 2, pz, 1.03, thickness, 1.03, "rock", ["vertical-face", "floating-island", "cliff"]));
    }
    scene.rooms.push(createRoom(`floating-${island.id}-room`, `${level + 1}F ${island.id} island`, "combat", level, island.x, island.z, island.w * 0.62, island.d * 0.62, island.y));
    scene.tactical.push(tacticalFeature(`floating-${island.id}-highground`, "highGround", island.x, island.z, island.y, Math.ceil(Math.max(island.w, island.d) * 0.25), `${level + 1}层浮空岛屿是有真实垂直边界的战术高地。`));
  }
  for (let index = 0; index < islands.length - 1; index += 1) {
    const lower = islands[index];
    const upper = islands[index + 1];
    if (!lower || !upper) continue;
    const stair = stairConnection(`floating-vertical-${index}`, index, { xCells: lower.x, zCells: lower.z, yMeters: lower.y + FLOOR_SLAB_METERS }, { xCells: upper.x, zCells: upper.z, yMeters: upper.y + FLOOR_SLAB_METERS }, 1.4, "metal", ["vertical-route", "vertical-opening", "floating-island", "rope-bridge"]);
    scene.primitives.push(stair.primitive);
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
  scene.description = `Three-tier floating-island battlefield with broken footprints, exposed vertical undersides, void gaps, and two vertical routes.`;
  scene.floors = 3;
  scene.floorHeightFeet = [20, 20, 20];
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

function buildIce(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box("ice-field", 0, width / 2, 0, depth / 2, width - 2, FLOOR_SLAB_METERS, depth - 2, "earth", ["floor", "terrain", "ice"]), water("ice-frozen-lake", 0, width / 2, -0.02, depth * 0.56, width * 0.68, 0.08, depth * 0.34, ["ice", "hazard"]));
  const islands = 4;
  for (let index = 0; index < islands; index += 1) {
    const x = width * (0.22 + index * 0.18) + rng.float(-2, 2);
    const z = depth * (0.28 + (index % 2) * 0.42) + rng.float(-2, 2);
    scene.primitives.push(box(`ice-island-${index}`, 0, x, FLOOR_SLAB_METERS * 0.8, z, rng.int(4, 7), FLOOR_SLAB_METERS, rng.int(3, 6), "rock", ["floor", "ice-island", "cover"]));
    scene.tactical.push(tacticalFeature(`ice-island-cover-${index}`, "cover", x, z, 0, 2, "A low ice shelf provides the only stable cover over the frozen lake."));
  }
  scene.rooms.push(createRoom("ice-north-field", "Wind-scoured ice", "natural", 0, width / 2, depth * 0.2, width - 4, 8), createRoom("ice-lake-room", "Frozen underground lake", "natural", 0, width / 2, depth * 0.56, width * 0.7, depth * 0.35), createRoom("ice-south-field", "Broken floe field", "natural", 0, width / 2, depth * 0.84, width - 4, 6));
  connectRooms(scene.rooms, "ice-north-field", "ice-lake-room");
  connectRooms(scene.rooms, "ice-lake-room", "ice-south-field");
  scene.routes.push(createRoute("ice-primary-route", "primary", [{ x: 1, z: depth * 0.2 }, { x: width * 0.28, z: depth * 0.4 }, { x: width * 0.72, z: depth * 0.7 }, { x: width - 1, z: depth * 0.84 }]));
  scene.tactical.push(tacticalFeature("ice-thin-surface", "hazard", width * 0.5, depth * 0.56, -0.02, 3, "Thin ice turns the lake into a moving hazard zone."), tacticalFeature("ice-entrance", "entrance", 1, depth * 0.2, 0, 2, "A whiteout trail enters from the north."));
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

function buildForest(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box("forest-floor", 0, width / 2, 0, depth / 2, width - 2, FLOOR_SLAB_METERS, depth - 2, "moss", ["floor", "terrain", "forest"]));
  const clearX = width * 0.52;
  const clearZ = depth * 0.5;
  scene.primitives.push(box("forest-clearing", 0, clearX, FLOOR_SLAB_METERS, clearZ, width * 0.3, FLOOR_SLAB_METERS, depth * 0.24, "earth", ["floor", "platform", "clearing"]));
  for (let index = 0; index < 28; index += 1) {
    const x = rng.float(2, width - 2);
    const z = rng.float(2, depth - 2);
    if (Math.abs(x - clearX) < width * 0.2 && Math.abs(z - clearZ) < depth * 0.16) continue;
    const trunk = rng.float(0.35, 0.8);
    const height = feetToMeters(rng.int(8, 18));
    scene.primitives.push(cylinder(`forest-tree-${index}`, 0, x, FLOOR_SLAB_METERS, z, trunk, height, "darkStone", ["forest", "natural-cover", "cover"]));
    scene.primitives.push(primitive(`forest-canopy-${index}`, "cone", 0, x, FLOOR_SLAB_METERS + height, z, trunk * 3.4 * 1.524, height * 0.42, trunk * 3.4 * 1.524, "moss", ["forest", "canopy", "cover"]));
    if (index % 4 === 0) scene.tactical.push(tacticalFeature(`forest-tree-cover-${index}`, "cover", x, z, 0, 1, "Dense trunks create alternating sight-line breaks."));
  }
  scene.rooms.push(createRoom("forest-edge", "Forest edge", "natural", 0, width / 2, 4, width - 4, 6), createRoom("forest-clearing-room", "Hunter clearing", "combat", 0, clearX, clearZ, width * 0.3, depth * 0.24), createRoom("forest-deep", "Deep woodland", "natural", 0, width / 2, depth - 5, width - 4, 7));
  connectRooms(scene.rooms, "forest-edge", "forest-clearing-room");
  connectRooms(scene.rooms, "forest-clearing-room", "forest-deep");
  scene.routes.push(createRoute("forest-primary-route", "primary", [{ x: 1, z: 4 }, { x: width * 0.28, z: depth * 0.32 }, { x: clearX, z: clearZ }, { x: width - 2, z: depth - 5 }]));
  scene.routes.push(createRoute("forest-hunter-trail", "alternate", [{ x: 3, z: depth - 4 }, { x: width * 0.25, z: depth * 0.7 }, { x: clearX, z: clearZ }, { x: width - 3, z: 4 }]));
  scene.tactical.push(tacticalFeature("forest-entrance", "entrance", 1, 4, 0, 2, "A narrow game trail enters beneath the canopy."), tacticalFeature("forest-clearing-choke", "chokepoint", clearX, clearZ, 0, 3, "The clearing is exposed but controls both forest trails."));
}

function addWildernessBuildingSite(scene: GeneratedScene, context: GeneratorContext, width: number, depth: number, archetype: WildernessArchetype): void {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const wantsBuilding = ["木屋", "小屋", "猎人屋", "炼金师小屋", "林间屋", "cabin", "lodge", "hut", "cottage", "outpost", "驿站"].some((term) => text.includes(term));
  if (!wantsBuilding || (archetype !== "forest" && archetype !== "river-valley" && archetype !== "mountain" && archetype !== "swamp")) return;
  const alchemical = ["炼金", "alchemy", "alchemist"].some((term) => text.includes(term));
  const hunter = ["猎人", "hunter"].some((term) => text.includes(term));
  const x = archetype === "forest" ? width * 0.52 : width * 0.28;
  const z = archetype === "forest" ? depth * 0.5 : depth * 0.28;
  const baseY = archetype === "river-valley" || archetype === "mountain" ? feetToMeters(10) : FLOOR_SLAB_METERS * 2;
  // Clear only procedural clutter in the building pad. Authored terrain,
  // rivers, cliffs and routes remain the owner of the surrounding site.
  scene.primitives = scene.primitives.filter((item) => {
    if (item.tags?.includes("floor") || item.tags?.includes("terrain")) return true;
    if (!item.tags?.some((tag) => tag === "natural-detail" || tag === "natural-prop" || tag === "cover" || tag === "forest")) return true;
    const px = item.position.x / CELL; const pz = item.position.z / CELL;
    return Math.hypot(px - x, pz - z) > 8;
  });
  scene.primitives.push(box("wilderness-building-pad", 0, x, baseY - FLOOR_SLAB_METERS, z, 13, FLOOR_SLAB_METERS, 12, archetype === "forest" ? "earth" : "rock", ["floor", "terrain", "building-pad", "site-program", "standable"]));
  for (const [index, dx, dz] of [[0, -4.8, -3.8], [1, 4.8, -3.8], [2, -4.8, 3.8], [3, 4.8, 3.8]] as const) scene.primitives.push(cylinder(`wilderness-foundation-pier-${index}`, 0, x + dx, 0, z + dz, 0.7, Math.max(FLOOR_SLAB_METERS, baseY), "darkStone", ["foundation", "terrain-adapter", "site-program"]));
  const entrance = { x: x - 8.5, z: z + 5.5 };
  instantiateBuildingModule(scene, {
    id: "wilderness-core-building",
    kind: alchemical ? "guild" : "home",
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
  }, context.rng.fork("wilderness-building"));
  const wildernessRoot = scene.rooms.find((room) => room.id === "wilderness-core-building-room");
  const siteAnchor = scene.rooms.find((room) => room.id === "forest-clearing-room") ?? scene.rooms.find((room) => room.level === 0 && !room.id.startsWith("core-wilderness"));
  if (wildernessRoot && siteAnchor) connectRooms(scene.rooms, siteAnchor.id, wildernessRoot.id);
  if (archetype === "forest") {
    scene.routes = scene.routes.filter((route) => route.id !== "forest-primary-route" && route.id !== "forest-hunter-trail");
    scene.routes.push(
      createRoute("forest-primary-route", "primary", [{ x: 1, z: 4 }, { x: x - 9, z: z - 7 }, { x: x - 9, z: z + 7 }, { x: width - 2, z: depth - 5 }]),
      createRoute("forest-hunter-trail", "alternate", [{ x: 3, z: depth - 4 }, { x: x + 9, z: z + 7 }, { x: x + 9, z: z - 7 }, { x: width - 3, z: 4 }]),
    );
  }
  scene.primitives.push(corridor("wilderness-access-path", 0, entrance.x - 7, entrance.z + 5, entrance.x, entrance.z, baseY, 1.6, archetype === "forest" ? "earth" : "rock", ["road", "trail", "parcel-access", "site-program"]));
  scene.routes.push(createRoute("wilderness-building-access", "primary", [{ x: entrance.x - 7, z: entrance.z + 5, y: baseY }, { x: entrance.x, z: entrance.z, y: baseY }, { x, z, y: baseY }], { purpose: "movement", traffic: 0.45, schedule: "all" }));
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
  scene.primitives.push(
    box("wilderness-porch", 0, x, baseY + FLOOR_SLAB_METERS, z + 5, 5, feetToMeters(2), 2.2, "wood", ["porch", "standable", "building-exterior", "site-program"]),
    cylinder("wilderness-well", 0, x - 6, baseY, z + 3.5, 2, feetToMeters(3), "stone", ["well", "cover", "building-exterior", "site-program"]),
    box("wilderness-woodpile", 0, x + 5.5, baseY, z + 3, 3.5, feetToMeters(3), 1.8, "wood", ["woodpile", "cover", "building-exterior"]),
  );
  for (const [index, fx, fz] of [[0, -6, -5], [1, 6, -5], [2, -6, 5], [3, 6, 5]] as const) scene.primitives.push(box(`wilderness-fence-${index}`, 0, x + fx, baseY, z + fz, index < 2 ? 0.25 : 12, feetToMeters(4), index < 2 ? 10 : 0.25, "wood", ["fence", "cover", "building-exterior"]));
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
  scene.siteProgram = { version: 1, siteType: "wilderness-site", districtCount: 1, roadCount: siteRoadCount, parcelCount: 1, fullInteriorCount: 1, facadeCount: 0, massCount: 0, roadLengthCells: siteRoadLength, parcelCoverage: (13 * 12) / (width * depth) };
  scene.floors = Math.max(scene.floors, 4);
  scene.floorHeightFeet = [12, 10, 8, 10];
  scene.floorLabels = ["地形/1F", "阁楼", "屋顶", "B1"];
}

function buildSwamp(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box("swamp-ground", 0, width / 2, -0.12, depth / 2, width - 2, FLOOR_SLAB_METERS, depth - 2, "moss", ["floor", "terrain", "swamp"]));
  const pools = 5;
  for (let index = 0; index < pools; index += 1) {
    const x = rng.float(5, width - 5);
    const z = rng.float(5, depth - 5);
    const poolW = rng.int(4, 9);
    const poolD = rng.int(3, 7);
    scene.primitives.push(water(`swamp-pool-${index}`, 0, x, -0.24, z, poolW, 0.18, poolD, ["swamp", "water", "hazard"]));
    scene.tactical.push(tacticalFeature(`swamp-pool-hazard-${index}`, "hazard", x, z, -0.24, 2, "Deep stagnant water slows movement and conceals a drop."));
  }
  const boardwalkZ = depth * 0.48;
  scene.primitives.push(corridor("swamp-boardwalk", 0, 2, boardwalkZ, width - 2, boardwalkZ, FLOOR_SLAB_METERS + 0.2, 2, "wood", ["bridge", "boardwalk", "swamp"]));
  scene.rooms.push(createRoom("swamp-edge", "Dry reed edge", "natural", 0, width / 2, 4, width - 4, 6), createRoom("swamp-boardwalk-room", "Raised boardwalk", "circulation", 0, width / 2, boardwalkZ, width - 4, 2), createRoom("swamp-deep", "Deep marsh", "combat", 0, width / 2, depth - 5, width - 4, 7));
  connectRooms(scene.rooms, "swamp-edge", "swamp-boardwalk-room");
  connectRooms(scene.rooms, "swamp-boardwalk-room", "swamp-deep");
  scene.routes.push(createRoute("swamp-boardwalk-route", "primary", [{ x: 1, z: boardwalkZ }, { x: width / 2, z: boardwalkZ }, { x: width - 1, z: boardwalkZ }]), createRoute("swamp-reed-route", "alternate", [{ x: 3, z: 4 }, { x: width * 0.28, z: depth * 0.35 }, { x: width * 0.72, z: depth * 0.7 }, { x: width - 3, z: depth - 4 }]));
  addCover(scene, rng, "swamp", width * 0.25, depth * 0.72, 0, 5, "moss");
  scene.tactical.push(tacticalFeature("swamp-entrance", "entrance", 1, boardwalkZ, 0, 2, "A half-sunken path reaches the raised boardwalk."), tacticalFeature("swamp-boardwalk-choke", "chokepoint", width / 2, boardwalkZ, 0.2, 2, "The narrow boardwalk forces movement above the pools."));
}

/** Adds a second layer of authored natural structure instead of leaving large
 * wilderness maps as a few empty slabs. These pieces intentionally remain
 * generic terrain vocabulary so new biomes can reuse the same composition pass. */
function addTerrainComplexity(scene: GeneratedScene, archetype: WildernessArchetype, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  const obstacleCount = rng.int(Math.round(3 + density * 16), Math.round(6 + density * 26));
  for (let index = 0; index < obstacleCount; index += 1) {
    const x = rng.float(2.5, width - 2.5);
    const z = rng.float(2.5, depth - 2.5);
    const widthCells = rng.float(0.8, 2.8);
    const depthCells = rng.float(0.8, 2.8);
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
      const x = width * (0.18 + index * 0.2) + rng.float(-2, 2);
      const z = depth * (0.3 + (index % 2) * 0.38);
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
    scene.tactical.push(tacticalFeature("prompt-waterfall-basin", "hazard", x, depth * 0.28, 0, 3, "The waterfall basin is hazardous, but conceals a route toward the cave mouth."));
  }
  if (hasCrystal) {
    for (let index = 0; index < 8; index += 1) {
      const x = rng.float(width * 0.2, width * 0.8);
      const z = rng.float(depth * 0.2, depth * 0.8);
      scene.primitives.push(primitive(`prompt-crystal-${index}`, "cone", 0, x, feetToMeters(rng.int(3, 8)), z, feetToMeters(rng.float(0.6, 1.4)), feetToMeters(rng.int(5, 13)), feetToMeters(rng.float(0.6, 1.4)), "warmLight", ["crystal", "prompt-trait", index % 3 === 0 ? "cover" : "landmark"]));
    }
  }
  if (hasLava) {
    const z = depth * rng.float(0.42, 0.62);
    scene.primitives.push(corridor("prompt-lava-channel", 0, 2, z, width - 2, z + rng.float(-4, 4), -0.3, 3.2, "hazard", ["lava", "hazard", "prompt-trait"]));
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
    const x = width * (0.18 + ((hash % 57) / 100));
    const z = depth * (0.18 + (((hash >>> 7) % 57) / 100));
    const count = 2 + (hash % 3);
    const material: MaterialKey = hints.theme === "mystic" ? "warmLight" : hints.environment === "ruin" ? "stone" : hints.environment === "underground" ? "darkStone" : "rock";
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + rng.float(-0.35, 0.35);
      const px = x + Math.cos(angle) * rng.float(1.5, 4);
      const pz = z + Math.sin(angle) * rng.float(1.5, 4);
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
      if (!nearAuthoredRoute(x, z)) break;
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
  const archetype = classifyWildernessArchetype(context.request.prompt, context.semanticHints);
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
  else if (archetype === "river-valley") buildRiverValleyContinuous(scene, profile.width, profile.depth, context.rng.fork("river"));
  else if (archetype === "dry-riverbed") buildDryRiverbed(scene, profile.width, profile.depth, profile.density, context.rng.fork("dry-riverbed"));
  else if (archetype === "impact-crater") buildImpactCrater(scene, profile.width, profile.depth, profile.density, context.rng.fork("impact-crater"));
  else if (archetype === "volcanic") buildVolcanic(scene, profile.width, profile.depth, profile.density, context.rng.fork("volcanic"));
  else if (archetype === "infernal-waste") buildInfernalWaste(scene, profile.width, profile.depth, profile.density, context.rng.fork("infernal-waste"));
  else if (archetype === "floating-islands") buildFloatingIslands(scene, profile.width, profile.depth, profile.density, context.rng.fork("floating-islands"));
  else if (archetype === "burial-ground") buildBurialGround(scene, profile.width, profile.depth, profile.density, context.rng.fork("burial-ground"));
  else if (archetype === "rift") buildRift(scene, profile.width, profile.depth, context.rng.fork("rift"));
  else if (archetype === "mountain") buildMountain(scene, profile.width, profile.depth, profile.density, context.rng.fork("mountain"));
  else if (archetype === "ice") buildIce(scene, profile.width, profile.depth, context.rng.fork("ice"));
  else if (archetype === "ruin") buildRuin(scene, profile.width, profile.depth, context.rng.fork("ruin"));
  else if (archetype === "forest") buildForest(scene, profile.width, profile.depth, context.rng.fork("forest"));
  else if (archetype === "swamp") buildSwamp(scene, profile.width, profile.depth, context.rng.fork("swamp"));
  else if (archetype === "underdark") buildUnderdark(scene, profile.width, profile.depth, profile.density, context.rng.fork("underdark"));
  else buildUndergroundLake(scene, profile.width, profile.depth, context.rng.fork("lake"));
  const morphology = analyzeTerrainMorphology(context.request.prompt, context.semanticHints);
  const floatingText = [context.request.prompt, ...(context.semanticHints?.anchors ?? []), ...(context.semanticHints?.tags ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  if (archetype !== "floating-islands" && ["浮空岛", "浮岛", "空岛", "floating island", "sky island", "levitating"].some((term) => floatingText.includes(term))) {
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
  if (archetype !== "floating-islands") {
    addStandableProps(scene, archetype, profile.width, profile.depth, profile.density, context.rng.fork("standable-props"));
    addTerrainComplexity(scene, archetype, profile.width, profile.depth, profile.density, context.rng.fork("terrain-complexity"));
  }
  addWildernessBuildingSite(scene, context, profile.width, profile.depth, archetype);
  return scene;
}
