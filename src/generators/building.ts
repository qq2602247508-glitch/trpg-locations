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
  floorSlabWithOpenings,
  primitive,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  wallWithOpenings,
} from "./shared";

export type BuildingArchetype = "church" | "temple" | "manor" | "barracks" | "library" | "workshop" | "warehouse";

interface BuildingProfile {
  archetype: BuildingArchetype;
  title: readonly string[];
  wall: MaterialKey;
  floor: MaterialKey;
  width: readonly [number, number];
  depth: readonly [number, number];
  floors: readonly [number, number];
  floorHeight: readonly [number, number];
}

const PROFILES: Readonly<Record<BuildingArchetype, BuildingProfile>> = {
  church: { archetype: "church", title: ["The Pilgrim's Bell", "Saint Orra's Nave", "The Rainward Chapel"], wall: "plaster", floor: "stone", width: [15, 21], depth: [22, 31], floors: [1, 2], floorHeight: [16, 22] },
  temple: { archetype: "temple", title: ["The Sevenfold Shrine", "Temple of the Veiled Star", "The River Oath Sanctuary"], wall: "darkStone", floor: "stone", width: [17, 23], depth: [22, 32], floors: [1, 2], floorHeight: [17, 24] },
  manor: { archetype: "manor", title: ["Ashgrove Manor", "The Vellum House", "Rookwater Estate"], wall: "plaster", floor: "wood", width: [25, 35], depth: [21, 29], floors: [2, 3], floorHeight: [10, 13] },
  barracks: { archetype: "barracks", title: ["The North Gate Barracks", "Grey Pike Quarters", "The Marshal's Yard"], wall: "stone", floor: "wood", width: [22, 32], depth: [16, 23], floors: [1, 2], floorHeight: [10, 13] },
  library: { archetype: "library", title: ["The Lantern Archive", "Library of Quiet Chains", "The Cartographer's Athenaeum"], wall: "plaster", floor: "wood", width: [18, 27], depth: [20, 29], floors: [2, 3], floorHeight: [12, 16] },
  workshop: { archetype: "workshop", title: ["The Brasswheel Works", "Ember Row Foundry", "The Three Hammers"], wall: "stone", floor: "stone", width: [18, 29], depth: [15, 23], floors: [1, 2], floorHeight: [12, 17] },
  warehouse: { archetype: "warehouse", title: ["Warehouse Nine", "The Salt and Rope Depot", "East Quay Stores"], wall: "darkStone", floor: "stone", width: [21, 34], depth: [18, 29], floors: [1, 2], floorHeight: [14, 19] },
};

const ARCHETYPE_TERMS: Readonly<Record<BuildingArchetype, readonly string[]>> = {
  church: ["church", "chapel", "cathedral", "教堂", "礼拜堂", "大教堂"],
  temple: ["temple", "shrine", "sanctuary", "神殿", "神庙", "寺庙", "圣所", "祠堂"],
  manor: ["manor", "estate", "mansion", "villa", "庄园", "宅邸", "府邸", "别墅"],
  barracks: ["barracks", "garrison", "guardhouse", "兵营", "军营", "卫所", "营房"],
  library: ["library", "archive", "scriptorium", "图书馆", "档案馆", "藏书楼", "抄经室"],
  workshop: ["workshop", "smithy", "forge", "foundry", "工坊", "铁匠铺", "锻炉", "铸造厂"],
  warehouse: ["warehouse", "depot", "storehouse", "granary", "仓库", "货栈", "粮仓", "堆栈"],
};

export function classifyBuildingArchetype(prompt: string): BuildingArchetype {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  for (const archetype of Object.keys(ARCHETYPE_TERMS) as BuildingArchetype[]) {
    if (ARCHETYPE_TERMS[archetype].some((term) => normalized.includes(term))) return archetype;
  }
  const values = Object.keys(PROFILES) as BuildingArchetype[];
  let hash = 2166136261;
  for (const character of normalized) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return values[(hash >>> 0) % values.length] ?? "warehouse";
}

function scaledRange(range: readonly [number, number], size: GeneratorContext["request"]["size"]): readonly [number, number] {
  const scale = size === "small" ? 0.78 : size === "large" ? 1.14 : 1;
  return [Math.max(10, Math.round(range[0] * scale)), Math.max(12, Math.round(range[1] * scale))];
}

function addRoof(scene: GeneratedScene, id: string, level: number, x: number, y: number, z: number, width: number, depth: number, material: MaterialKey = "roof"): void {
  scene.primitives.push(
    primitive(`${id}-roof-left`, "box", level, x, y, z - depth * 0.24, width * 1.03 * 1.524, 0.3, depth * 0.55 * 1.524, material, ["roof"], -0.14),
    primitive(`${id}-roof-right`, "box", level, x, y, z + depth * 0.24, width * 1.03 * 1.524, 0.3, depth * 0.55 * 1.524, material, ["roof"], 0.14),
  );
}

function buildSacred(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, floorHeightFeet: number[], rng: GeneratorContext["rng"]): void {
  const x0 = 2;
  const z0 = 2;
  const centerX = x0 + width / 2;
  const centerZ = z0 + depth / 2;
  const wallHeight = feetToMeters(floorHeightFeet[0] ?? 18) - FLOOR_SLAB_METERS;
  const sanctuaryDepth = Math.max(5, Math.round(depth * 0.25));
  const sanctuaryStart = z0 + depth - sanctuaryDepth;
  const isTemple = profile.archetype === "temple";

  scene.rooms.push(
    createRoom("sacred-nave", isTemple ? "Processional hall" : "Nave", "public", 0, centerX, z0 + (depth - sanctuaryDepth) / 2, width - 2, depth - sanctuaryDepth - 1),
    createRoom("sacred-sanctuary", isTemple ? "Inner sanctuary" : "Chancel and altar", "private", 0, centerX, sanctuaryStart + sanctuaryDepth / 2, width - 4, sanctuaryDepth - 1),
    createRoom("sacred-vestry", isTemple ? "Offering treasury" : "Vestry", "service", 0, x0 + width - 3, sanctuaryStart + sanctuaryDepth / 2, 4, sanctuaryDepth - 2),
  );
  connectRooms(scene.rooms, "sacred-nave", "sacred-sanctuary");
  connectRooms(scene.rooms, "sacred-sanctuary", "sacred-vestry");

  scene.primitives.push(
    ...rectangularShell("sacred-shell", 0, centerX, centerZ, 0, width, depth, wallHeight, profile.floor, profile.wall, [profile.archetype, "sacred"], { north: { widthCells: 2.2 } }),
    ...wallWithOpenings("sacred-screen", 0, centerX, sanctuaryStart, FLOOR_SLAB_METERS, width - 1, wallHeight * 0.75, "x", profile.wall, ["sanctuary-screen"], { widthCells: 2.4 }),
    box("sacred-altar", 0, centerX, FLOOR_SLAB_METERS, z0 + depth - 2.2, isTemple ? 3.2 : 2.5, 1.15, 1.3, isTemple ? "darkStone" : "stone", ["altar", "cover"]),
  );
  const columnPairs = Math.max(3, Math.floor((depth - sanctuaryDepth) / 5));
  for (let index = 0; index < columnPairs; index += 1) {
    const z = z0 + 3 + index * ((depth - sanctuaryDepth - 5) / Math.max(1, columnPairs - 1));
    for (const side of [-1, 1]) {
      scene.primitives.push(cylinder(`sacred-column-${index}-${side}`, 0, centerX + side * width * 0.28, FLOOR_SLAB_METERS, z, 0.7, wallHeight * 0.82, "stone", ["column", "cover"]));
    }
  }
  if (scene.floors > 1) {
    const upperY = feetToMeters(floorHeightFeet[0] ?? 18);
    const bottom = { xCells: x0 + 2.4, zCells: z0 + 4.5, yMeters: FLOOR_SLAB_METERS };
    const top = { xCells: x0 + 2.4, zCells: z0 + 8.5, yMeters: upperY + FLOOR_SLAB_METERS };
    const stair = stairConnection("sacred-gallery-stair", 0, bottom, top, 1.5, "wood", ["gallery-access"]);
    scene.primitives.push(
      stair.primitive,
      ...floorSlabWithOpenings("sacred-gallery", 1, centerX, upperY, z0 + 4, width - 2, 5, "wood", ["gallery", "platform"], [{ id: "gallery-stair", centerXCells: top.xCells, centerZCells: top.zCells, widthCells: 2.2, depthCells: 2.4 }]),
    );
    scene.rooms.push(createRoom("sacred-gallery-room", "Choir gallery", "combat", 1, centerX, z0 + 4, width - 3, 4, upperY));
    connectRooms(scene.rooms, "sacred-nave", "sacred-gallery-room");
    scene.routes.push(stairRoute("sacred-gallery-route", stair));
    scene.tactical.push(tacticalFeature("sacred-gallery-high-ground", "highGround", centerX, z0 + 4, upperY, 2, "The gallery commands the central processional aisle."));
  }
  scene.routes.push(createRoute("sacred-primary-route", "primary", [{ x: centerX, z: z0 - 1 }, { x: centerX, z: z0 + 3 }, { x: centerX, z: sanctuaryStart + 1 }, { x: centerX, z: z0 + depth - 2 }]));
  scene.tactical.push(
    tacticalFeature("sacred-entrance", "entrance", centerX, z0, 0, 2, "Broad ceremonial doors open onto the central aisle."),
    tacticalFeature("sacred-altar-objective", "chokepoint", centerX, sanctuaryStart, 0, 2, "The sanctuary screen narrows access to the ritual objective."),
  );
  addRoof(scene, "sacred", scene.floors - 1, centerX, feetToMeters(floorHeightFeet.reduce((sum, value) => sum + value, 0)), centerZ, width, depth);
  void rng;
}

function wingShell(scene: GeneratedScene, id: string, x: number, z: number, width: number, depth: number, height: number, floor: MaterialKey, wall: MaterialKey, opening: "north" | "south" | "west" | "east", externalGate?: "north" | "south" | "west" | "east"): void {
  const openings = {
    [opening]: { widthCells: 1.8 },
    ...(externalGate ? { [externalGate]: { widthCells: 2.2 } } : {}),
  };
  scene.primitives.push(...rectangularShell(id, 0, x, z, 0, width, depth, height, floor, wall, ["manor", "wing"], openings));
}

function buildManor(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, floorHeightFeet: number[]): void {
  const centerX = 2 + width / 2;
  const centerZ = 2 + depth / 2;
  const courtyardW = Math.max(7, Math.round(width * 0.3));
  const courtyardD = Math.max(7, Math.round(depth * 0.32));
  const wingD = Math.max(5, (depth - courtyardD) / 2);
  const wingW = Math.max(6, (width - courtyardW) / 2);
  const height = feetToMeters(floorHeightFeet[0] ?? 12) - FLOOR_SLAB_METERS;

  scene.primitives.push(box("manor-courtyard", 0, centerX, 0, centerZ, courtyardW, FLOOR_SLAB_METERS, courtyardD, "stone", ["floor", "courtyard"]));
  wingShell(scene, "manor-north-wing", centerX, 2 + wingD / 2, width, wingD, height, profile.floor, profile.wall, "south");
  wingShell(scene, "manor-south-wing", centerX, 2 + depth - wingD / 2, width, wingD, height, profile.floor, profile.wall, "north");
  wingShell(scene, "manor-west-wing", 2 + wingW / 2, centerZ, wingW, courtyardD, height, profile.floor, profile.wall, "east", "west");
  wingShell(scene, "manor-east-wing", 2 + width - wingW / 2, centerZ, wingW, courtyardD, height, profile.floor, profile.wall, "west", "east");

  scene.rooms.push(
    createRoom("manor-courtyard-room", "Inner courtyard", "circulation", 0, centerX, centerZ, courtyardW, courtyardD),
    createRoom("manor-great-hall", "Great hall", "public", 0, centerX, 2 + wingD / 2, width - 2, wingD - 1),
    createRoom("manor-family-wing", "Family apartments", "private", 0, centerX, 2 + depth - wingD / 2, width - 2, wingD - 1),
    createRoom("manor-service-wing", "Kitchen and servants' wing", "service", 0, 2 + wingW / 2, centerZ, wingW - 1, courtyardD - 1),
    createRoom("manor-guard-wing", "Gate office and armoury", "combat", 0, 2 + width - wingW / 2, centerZ, wingW - 1, courtyardD - 1),
  );
  for (const id of ["manor-great-hall", "manor-family-wing", "manor-service-wing", "manor-guard-wing"]) connectRooms(scene.rooms, "manor-courtyard-room", id);

  let baseY = feetToMeters(floorHeightFeet[0] ?? 12);
  for (let level = 1; level < scene.floors; level += 1) {
    const top = { xCells: centerX - courtyardW / 2 + 1.5, zCells: centerZ - courtyardD / 2 + 1.4, yMeters: baseY + FLOOR_SLAB_METERS };
    const bottom = { xCells: top.xCells, zCells: top.zCells + 4, yMeters: baseY - feetToMeters(floorHeightFeet[level - 1] ?? 12) + FLOOR_SLAB_METERS };
    const stair = stairConnection(`manor-stair-${level}`, level - 1, bottom, top, 1.6, "wood", ["manor-stair"]);
    scene.primitives.push(
      stair.primitive,
      ...rectangularShell(`manor-upper-${level}`, level, centerX, 2 + wingD / 2, baseY, width, wingD, feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["manor", "upper-wing"], {}, [{ id: `manor-stair-${level}`, centerXCells: top.xCells, centerZCells: top.zCells, widthCells: 2.4, depthCells: 2.6 }]),
      corridor(`manor-balcony-${level}`, level, centerX - courtyardW / 2, centerZ - courtyardD / 2, centerX + courtyardW / 2, centerZ - courtyardD / 2, baseY, 1.4, "wood", ["balcony", "high-ground"]),
    );
    const roomId = `manor-upper-room-${level}`;
    scene.rooms.push(createRoom(roomId, level === 1 ? "State rooms" : "Private solar", "private", level, centerX, 2 + wingD / 2, width - 2, wingD - 1, baseY));
    connectRooms(scene.rooms, level === 1 ? "manor-great-hall" : `manor-upper-room-${level - 1}`, roomId);
    scene.routes.push(stairRoute(`manor-vertical-${level}`, stair));
    baseY += feetToMeters(floorHeightFeet[level] ?? 11);
  }
  scene.routes.push(createRoute("manor-primary-route", "primary", [{ x: 0, z: centerZ }, { x: 2 + wingW, z: centerZ }, { x: centerX, z: centerZ }, { x: centerX, z: 2 + wingD / 2 }]));
  scene.routes.push(createRoute("manor-service-route", "alternate", [{ x: centerX, z: centerZ }, { x: 2 + wingW / 2, z: centerZ }, { x: 1, z: centerZ }]));
  scene.tactical.push(
    tacticalFeature("manor-gate", "entrance", 2, centerZ, 0, 2, "A side gate feeds directly into the defensible courtyard."),
    tacticalFeature("manor-courtyard-crossfire", "chokepoint", centerX, centerZ, 0, 3, "Every occupied wing overlooks the central court."),
  );
}

function buildHall(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, floorHeightFeet: number[], rng: GeneratorContext["rng"]): void {
  const centerX = 2 + width / 2;
  const centerZ = 2 + depth / 2;
  const height = feetToMeters(floorHeightFeet[0] ?? 14) - FLOOR_SLAB_METERS;
  const sideDepth = Math.max(4, Math.round(depth * (profile.archetype === "barracks" ? 0.28 : 0.22)));
  const centralDepth = depth - sideDepth * 2;
  const mainName = profile.archetype === "library" ? "Reading hall" : profile.archetype === "workshop" ? "Assembly floor" : profile.archetype === "warehouse" ? "Loading hall" : "Drill hall";
  scene.rooms.push(
    createRoom("hall-central", mainName, "public", 0, centerX, centerZ, width - 2, centralDepth),
    createRoom("hall-north", profile.archetype === "barracks" ? "North dormitory" : profile.archetype === "library" ? "Closed stacks" : profile.archetype === "warehouse" ? "Bulk storage" : "Forge and tool bay", "service", 0, centerX, 2 + sideDepth / 2, width - 2, sideDepth - 1),
    createRoom("hall-south", profile.archetype === "barracks" ? "South dormitory and armoury" : profile.archetype === "library" ? "Archivists' workroom" : profile.archetype === "warehouse" ? "Dispatch and tally office" : "Finishing benches", "private", 0, centerX, 2 + depth - sideDepth / 2, width - 2, sideDepth - 1),
  );
  connectRooms(scene.rooms, "hall-central", "hall-north");
  connectRooms(scene.rooms, "hall-central", "hall-south");
  scene.primitives.push(
    ...rectangularShell("hall-shell", 0, centerX, centerZ, 0, width, depth, height, profile.floor, profile.wall, [profile.archetype, "long-hall"], { west: { widthCells: profile.archetype === "warehouse" ? 3.5 : 2.2 } }),
    ...wallWithOpenings("hall-north-partition", 0, centerX, 2 + sideDepth, FLOOR_SLAB_METERS, width - 1, height, "x", profile.wall, ["functional-partition"], [{ offsetCells: -width * 0.24, widthCells: 1.5 }, { offsetCells: width * 0.24, widthCells: 1.5 }]),
    ...wallWithOpenings("hall-south-partition", 0, centerX, 2 + depth - sideDepth, FLOOR_SLAB_METERS, width - 1, height, "x", profile.wall, ["functional-partition"], [{ offsetCells: -width * 0.24, widthCells: 1.5 }, { offsetCells: width * 0.24, widthCells: 1.5 }]),
  );

  const rowCount = profile.archetype === "library" ? 5 : profile.archetype === "warehouse" ? 4 : profile.archetype === "barracks" ? 6 : 3;
  for (let index = 0; index < rowCount; index += 1) {
    const x = 4 + index * ((width - 4) / Math.max(1, rowCount - 1));
    const material: MaterialKey = profile.archetype === "workshop" ? "metal" : "wood";
    const tags = profile.archetype === "library" ? ["book-stack", "cover"] : profile.archetype === "barracks" ? ["bunk", "cover"] : profile.archetype === "warehouse" ? ["cargo-stack", "cover"] : ["workbench", "cover"];
    scene.primitives.push(box(`hall-row-${index}`, 0, x, FLOOR_SLAB_METERS, centerZ, profile.archetype === "warehouse" ? 2 : 0.9, profile.archetype === "library" ? 2.4 : 1.3, Math.max(2, centralDepth * 0.58), material, tags));
  }
  if (profile.archetype === "workshop") {
    scene.primitives.push(primitive("workshop-forge", "cylinder", 0, centerX + width * 0.28, FLOOR_SLAB_METERS, centerZ, 2.5, 1.6, 2.5, "hazard", ["forge", "hazard"]));
    scene.tactical.push(tacticalFeature("workshop-forge-hazard", "hazard", centerX + width * 0.28, centerZ, 0, 2, "The live forge radiates heat and blocks the widest lane."));
  }
  if (scene.floors > 1) {
    const upperY = feetToMeters(floorHeightFeet[0] ?? 14);
    const bottom = { xCells: 3.5, zCells: centerZ + 2, yMeters: FLOOR_SLAB_METERS };
    const top = { xCells: 7.5, zCells: centerZ + 2, yMeters: upperY + FLOOR_SLAB_METERS };
    const stair = stairConnection("hall-upper-stair", 0, bottom, top, 1.6, profile.archetype === "warehouse" ? "metal" : "wood", ["catwalk-access"]);
    scene.primitives.push(
      stair.primitive,
      ...floorSlabWithOpenings("hall-upper-platform", 1, centerX, upperY, centerZ, width - 2, Math.max(4, centralDepth * 0.38), profile.archetype === "warehouse" ? "metal" : "wood", ["platform", "catwalk"], [{ id: "hall-upper-stair", centerXCells: top.xCells, centerZCells: top.zCells, widthCells: 2.4, depthCells: 2.4 }]),
    );
    scene.rooms.push(createRoom("hall-upper-room", profile.archetype === "library" ? "Gallery stacks" : "Overhead catwalk", "combat", 1, centerX, centerZ, width - 3, Math.max(3, centralDepth * 0.34), upperY));
    connectRooms(scene.rooms, "hall-central", "hall-upper-room");
    scene.routes.push(stairRoute("hall-upper-route", stair));
    scene.tactical.push(tacticalFeature("hall-upper-high-ground", "highGround", centerX, centerZ, upperY, 2, "The upper gallery controls the long central lanes."));
  }
  scene.routes.push(createRoute("hall-primary-route", "primary", [{ x: 0, z: centerZ }, { x: 2, z: centerZ }, { x: centerX, z: centerZ }, { x: 2 + width - 2, z: centerZ }]));
  scene.routes.push(createRoute("hall-alternate-route", "alternate", [{ x: 2, z: centerZ }, { x: centerX - width * 0.28, z: centerZ - centralDepth * 0.38 }, { x: 2 + width - 2, z: centerZ - centralDepth * 0.38 }]));
  scene.tactical.push(
    tacticalFeature("hall-entrance", "entrance", 2, centerZ, 0, 2, "The main doors open into a long contested lane."),
    tacticalFeature("hall-row-cover", "cover", centerX, centerZ, 0, 2, "Repeated functional rows break sight lines without blocking circulation."),
  );
  addRoof(scene, "hall", scene.floors - 1, centerX, feetToMeters(floorHeightFeet.reduce((sum, value) => sum + value, 0)), centerZ, width, depth);
  void rng;
}

export function generateBuilding(context: GeneratorContext): GeneratedScene {
  const archetype = classifyBuildingArchetype(context.request.prompt);
  const profile = PROFILES[archetype];
  const widthRange = scaledRange(profile.width, context.request.size);
  const depthRange = scaledRange(profile.depth, context.request.size);
  const width = context.rng.int(widthRange[0], widthRange[1]);
  const depth = context.rng.int(depthRange[0], depthRange[1]);
  const floors = context.rng.int(profile.floors[0], profile.floors[1]);
  const floorHeightFeet = Array.from({ length: floors }, () => context.rng.int(profile.floorHeight[0], profile.floorHeight[1]));
  const scene = baseScene(
    "building",
    choose(context.rng, profile.title),
    `${archetype} grammar with purpose-specific massing, circulation, room organisation, and combat lanes.`,
    context.request.seed,
    { x: width + 4, z: depth + 4 },
    floors,
    floorHeightFeet,
  );
  scene.archetype = archetype;

  if (archetype === "church" || archetype === "temple") buildSacred(scene, profile, width, depth, floorHeightFeet, context.rng.fork("sacred"));
  else if (archetype === "manor") buildManor(scene, profile, width, depth, floorHeightFeet);
  else buildHall(scene, profile, width, depth, floorHeightFeet, context.rng.fork("hall"));
  return scene;
}
