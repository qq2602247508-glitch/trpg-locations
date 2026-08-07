import type { GeneratedScene, GeneratorContext, MaterialKey } from "../schema";
import {
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
  stairConnection,
  stairRoute,
  tacticalFeature,
  water,
} from "./shared";

export type WildernessArchetype = "river-valley" | "rift" | "mountain" | "ice" | "ruin" | "underground-lake" | "forest" | "swamp";

const WILDERNESS_TERMS: Readonly<Record<WildernessArchetype, readonly string[]>> = {
  "river-valley": ["river", "valley", "riverbank", "河谷", "河流", "溪谷", "峡谷河"],
  rift: ["rift", "chasm", "ravine", "裂谷", "裂隙", "深坑", "断崖"],
  mountain: ["mountain", "cliff", "ridge", "山地", "山脊", "高山", "峭壁"],
  ice: ["ice", "glacier", "tundra", "冰原", "冰川", "冻土", "雪原"],
  ruin: ["ruin", "ruined", "wilderness ruin", "遗迹", "废墟", "残垣", "荒野遗迹"],
  "underground-lake": ["underground lake", "dark lake", "subterranean lake", "地下湖", "幽暗地域", "地底湖"],
  forest: ["forest", "woodland", "林地", "森林", "树林"],
  swamp: ["swamp", "marsh", "bog", "沼泽", "湿地"],
};

export function classifyWildernessArchetype(prompt: string): WildernessArchetype {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  for (const archetype of Object.keys(WILDERNESS_TERMS) as WildernessArchetype[]) {
    if (WILDERNESS_TERMS[archetype].some((term) => normalized.includes(term))) return archetype;
  }
  return "mountain";
}

function bounds(context: GeneratorContext, archetype: WildernessArchetype): { width: number; depth: number; height: number } {
  const { rng, request } = context;
  const base: readonly [number, number, number] = archetype === "rift" ? [42, 34, 5] : archetype === "mountain" ? [38, 38, 7] : archetype === "ice" ? [46, 36, 4] : archetype === "ruin" ? [34, 30, 4] : archetype === "underground-lake" ? [44, 36, 6] : archetype === "forest" ? [52, 44, 3] : archetype === "swamp" ? [48, 40, 3] : [48, 34, 4];
  const scale = request.size === "small" ? 0.75 : request.size === "large" ? 1.3 : 1;
  return { width: Math.round(base[0] * scale) + rng.int(-2, 3), depth: Math.round(base[1] * scale) + rng.int(-2, 3), height: base[2] };
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

function buildMountain(scene: GeneratedScene, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const terraces = rng.int(4, Math.min(6, Math.max(4, Math.floor(width / 6))));
  const rooms: string[] = [];
  let summitX = width / 2;
  let summitZ = depth - 3;
  let summitY = feetToMeters(15);
  for (let index = 0; index < terraces; index += 1) {
    const levelY = feetToMeters(index * 5);
    const terraceW = Math.max(6, width - index * 4.5);
    const terraceD = Math.max(6, depth / terraces + 3);
    const x = width / 2 + rng.float(-2, 2);
    const z = 3 + terraceD / 2 + index * (depth / terraces - 1);
    if (index === terraces - 1) {
      summitX = x;
      summitZ = z;
      summitY = levelY;
    }
    const id = `mountain-terrace-${index}`;
    rooms.push(id);
    scene.primitives.push(box(`${id}-floor`, 0, x, levelY, z, terraceW, FLOOR_SLAB_METERS, terraceD, index === terraces - 1 ? "moss" : "rock", ["floor", "terrain", "ledge", "platform"]));
    scene.rooms.push(createRoom(id, index === terraces - 1 ? "Summit shelf" : `Mountain terrace ${index + 1}`, index === terraces - 1 ? "combat" : "natural", 0, x, z, terraceW, terraceD, levelY));
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
  scene.routes.push(createRoute("mountain-trail", "primary", [{ x: 1, z: 2, y: 0 }, { x: width / 2 - 3, z: depth * 0.2, y: feetToMeters(5) }, { x: summitX, z: summitZ, y: summitY }]));
  scene.tactical.push(tacticalFeature("mountain-entrance", "entrance", 1, 2, 0, 2, "A switchback trail begins below the first terrace."), tacticalFeature("mountain-summit", "highGround", summitX, summitZ, summitY, 3, "The summit shelf dominates every lower approach."));
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
function addTerrainComplexity(scene: GeneratedScene, archetype: WildernessArchetype, width: number, depth: number, rng: GeneratorContext["rng"]): void {
  const obstacleCount = rng.int(10, 16);
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
  const hazardX = width * rng.float(0.32, 0.68);
  const hazardZ = depth * rng.float(0.34, 0.66);
  scene.tactical.push(tacticalFeature("natural-complex-hazard", "hazard", hazardX, hazardZ, archetype === "rift" ? -1 : 0, 2, archetype === "ice" ? "Thin ice or a snow-covered void gives way under pressure." : "Unstable ground, loose rock, or deep growth turns this area into a danger zone."));
}

export function generateWilderness(context: GeneratorContext): GeneratedScene {
  const archetype = classifyWildernessArchetype(context.request.prompt);
  const profile = bounds(context, archetype);
  const scene = baseScene("wilderness", choose(context.rng, ["The Broken Wilds", "A Tactical Reach", "The Unmapped Boundary"]), `${archetype} terrain with elevation, route choices, tactical cover, and explicit hazards.`, context.request.seed, { x: profile.width, z: profile.depth }, 1, [Math.ceil(profile.height + 11)]);
  scene.archetype = archetype;
  if (archetype === "river-valley") buildRiverValley(scene, profile.width, profile.depth, context.rng.fork("river"));
  else if (archetype === "rift") buildRift(scene, profile.width, profile.depth, context.rng.fork("rift"));
  else if (archetype === "mountain") buildMountain(scene, profile.width, profile.depth, context.rng.fork("mountain"));
  else if (archetype === "ice") buildIce(scene, profile.width, profile.depth, context.rng.fork("ice"));
  else if (archetype === "ruin") buildRuin(scene, profile.width, profile.depth, context.rng.fork("ruin"));
  else if (archetype === "forest") buildForest(scene, profile.width, profile.depth, context.rng.fork("forest"));
  else if (archetype === "swamp") buildSwamp(scene, profile.width, profile.depth, context.rng.fork("swamp"));
  else buildUndergroundLake(scene, profile.width, profile.depth, context.rng.fork("lake"));
  addTerrainComplexity(scene, archetype, profile.width, profile.depth, context.rng.fork("terrain-complexity"));
  return scene;
}
