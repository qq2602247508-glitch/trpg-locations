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

export type BuildingArchetype = "church" | "temple" | "manor" | "barracks" | "library" | "workshop" | "warehouse" | "fortress" | "mine";

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
  fortress: { archetype: "fortress", title: ["The Blackstone Hold", "Westreach Bastion", "The Four Towers"], wall: "darkStone", floor: "stone", width: [30, 44], depth: [26, 40], floors: [1, 1], floorHeight: [18, 24] },
  mine: { archetype: "mine", title: ["The Red Seam Mine", "Deepdelve Works", "The Abandoned Silver Levels"], wall: "rock", floor: "rock", width: [32, 48], depth: [28, 42], floors: [2, 2], floorHeight: [11, 14] },
};

const ARCHETYPE_TERMS: Readonly<Record<BuildingArchetype, readonly string[]>> = {
  church: ["church", "chapel", "cathedral", "教堂", "礼拜堂", "大教堂"],
  temple: ["temple", "shrine", "sanctuary", "神殿", "神庙", "寺庙", "圣所", "祠堂"],
  manor: ["manor", "estate", "mansion", "villa", "庄园", "宅邸", "府邸", "别墅"],
  barracks: ["barracks", "garrison", "guardhouse", "兵营", "军营", "卫所", "营房"],
  library: ["library", "archive", "scriptorium", "图书馆", "档案馆", "藏书楼", "抄经室"],
  workshop: ["workshop", "smithy", "forge", "foundry", "工坊", "铁匠铺", "锻炉", "铸造厂"],
  warehouse: ["warehouse", "depot", "storehouse", "granary", "仓库", "货栈", "粮仓", "堆栈"],
  fortress: ["fortress", "fort", "bastion", "citadel", "堡垒", "要塞", "堡寨", "城塞"],
  mine: ["mine", "mineshaft", "colliery", "矿井", "矿场", "矿坑", "矿山"],
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

function buildFortress(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, floorHeightFeet: number[], rng: GeneratorContext["rng"]): void {
  const centerX = 2 + width / 2;
  const centerZ = 2 + depth / 2;
  const wallHeight = feetToMeters(Math.min(16, floorHeightFeet[0] ?? 20));
  const wallWalkY = feetToMeters(10);
  scene.primitives.push(
    box("fortress-courtyard-floor", 0, centerX, 0, centerZ, width - 2, FLOOR_SLAB_METERS, depth - 2, "stone", ["floor", "courtyard", "fortress"]),
    ...wallWithOpenings("fortress-north-curtain", 0, centerX, 2, FLOOR_SLAB_METERS, width, wallHeight, "x", profile.wall, ["curtain-wall", "fortress"], { widthCells: 3.2 }),
    ...wallWithOpenings("fortress-south-curtain", 0, centerX, 2 + depth, FLOOR_SLAB_METERS, width, wallHeight, "x", profile.wall, ["curtain-wall", "fortress"], { widthCells: 1.8, offsetCells: width * 0.28 }),
    ...wallWithOpenings("fortress-west-curtain", 0, 2, centerZ, FLOOR_SLAB_METERS, depth, wallHeight, "z", profile.wall, ["curtain-wall", "fortress"], []),
    ...wallWithOpenings("fortress-east-curtain", 0, 2 + width, centerZ, FLOOR_SLAB_METERS, depth, wallHeight, "z", profile.wall, ["curtain-wall", "fortress"], []),
  );
  for (const [index, x, z] of [[0, 2.8, 2.8], [1, 1.2 + width, 2.8], [2, 2.8, 1.2 + depth], [3, 1.2 + width, 1.2 + depth]] as const) {
    scene.primitives.push(cylinder(`fortress-corner-tower-${index}`, 0, x, 0, z, 4.2, wallHeight + feetToMeters(7), "darkStone", ["corner-tower", "fortress", "high-ground"]));
  }
  const keepWidth = Math.max(9, width * 0.28);
  const keepDepth = Math.max(8, depth * 0.28);
  const keepX = centerX;
  const keepZ = centerZ + depth * 0.18;
  scene.primitives.push(...rectangularShell("fortress-keep", 0, keepX, keepZ, 0, keepWidth, keepDepth, wallHeight * 0.85, "stone", "darkStone", ["keep", "fortress"], { north: { widthCells: 2 } }));
  scene.primitives.push(
    corridor("fortress-north-wall-walk", 0, 4, 3, width, 3, wallWalkY, 1.5, "stone", ["wall-walk", "platform", "high-ground", "vertical-opening"]),
    corridor("fortress-east-wall-walk", 0, width + 1, 4, width + 1, depth, wallWalkY, 1.5, "stone", ["wall-walk", "platform", "high-ground"]),
  );
  const bottom = { xCells: 5.5, zCells: 7.2, yMeters: FLOOR_SLAB_METERS };
  const top = { xCells: 5.5, zCells: 3.2, yMeters: wallWalkY + FLOOR_SLAB_METERS };
  const wallStair = stairConnection("fortress-wall-stair", 0, bottom, top, 1.8, "stone", ["wall-walk-access"]);
  scene.primitives.push(wallStair.primitive);
  scene.rooms.push(
    createRoom("fortress-courtyard-room", "Fortress courtyard", "circulation", 0, centerX, centerZ, width - 5, depth - 5),
    createRoom("fortress-gatehouse", "Gatehouse kill zone", "combat", 0, centerX, 4.5, 8, 5),
    createRoom("fortress-keep-room", "Inner keep", "private", 0, keepX, keepZ, keepWidth - 1, keepDepth - 1),
    createRoom("fortress-wall-room", "Curtain wall walk", "combat", 0, centerX, 3, width - 6, 2, wallWalkY),
  );
  connectRooms(scene.rooms, "fortress-courtyard-room", "fortress-gatehouse");
  connectRooms(scene.rooms, "fortress-courtyard-room", "fortress-keep-room");
  connectRooms(scene.rooms, "fortress-courtyard-room", "fortress-wall-room");
  scene.routes.push(createRoute("fortress-primary-route", "primary", [{ x: centerX, z: 1 }, { x: centerX, z: 5 }, { x: centerX, z: centerZ }, { x: keepX, z: keepZ - keepDepth / 2 + 1 }]));
  scene.routes.push(createRoute("fortress-sally-route", "alternate", [{ x: keepX, z: keepZ }, { x: keepX, z: keepZ - keepDepth / 2 - 1 }, { x: centerX, z: centerZ }, { x: keepX + keepWidth / 2 + 2, z: centerZ }, { x: keepX + keepWidth / 2 + 2, z: depth - 1 }, { x: 2 + width * 0.78, z: depth + 2 }, { x: 2 + width * 0.78, z: depth + 3 }]));
  scene.routes.push(stairRoute("fortress-wall-route", wallStair));
  scene.tactical.push(
    tacticalFeature("fortress-gate", "entrance", centerX, 2, 0, 2, "The gatehouse funnels attackers between curtain walls."),
    tacticalFeature("fortress-gate-choke", "chokepoint", centerX, 4.5, 0, 3, "Crossfire from the gatehouse dominates the entry lane."),
    tacticalFeature("fortress-wall-high-ground", "highGround", centerX, 3, wallWalkY, 3, "The wall walk controls the courtyard and exterior approach."),
  );
  addCover(scene, "fortress-crate-cover-a", centerX - 4, centerZ - 2, rng);
  addCover(scene, "fortress-crate-cover-b", centerX + 5, centerZ + 2, rng);
}

function addCover(scene: GeneratedScene, id: string, x: number, z: number, rng: GeneratorContext["rng"]): void {
  scene.primitives.push(box(id, 0, x, FLOOR_SLAB_METERS, z, rng.float(1.2, 2), rng.float(0.9, 1.5), rng.float(1.2, 2), "wood", ["cover", "supply"]));
  scene.tactical.push(tacticalFeature(`${id}-feature`, "cover", x, z, 0, 1, "Supplies create cover in an otherwise exposed yard."));
}

function buildMine(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, floorHeightFeet: number[], rng: GeneratorContext["rng"]): void {
  const lowerY = 0;
  const upperY = feetToMeters(floorHeightFeet[0] ?? 12);
  const hubX = width * 0.46;
  const hubZ = depth * 0.48;
  const upperEntryX = 2;
  const upperEntryZ = depth * 0.3;
  scene.primitives.push(
    corridor("mine-upper-adit", 1, upperEntryX, upperEntryZ, hubX, hubZ, upperY, 2.5, "rock", ["mine-tunnel", "adit", "cart-track"]),
    corridor("mine-lower-main", 0, 3, depth * 0.72, width - 4, depth * 0.72, lowerY, 2.7, "rock", ["mine-tunnel", "main-level", "cart-track"]),
    corridor("mine-lower-branch-a", 0, hubX, depth * 0.72, width * 0.2, depth * 0.9, lowerY, 2, "rock", ["mine-tunnel", "branch"]),
    corridor("mine-lower-branch-b", 0, hubX, depth * 0.72, width * 0.78, depth * 0.9, lowerY, 2, "rock", ["mine-tunnel", "branch"]),
    box("mine-upper-platform", 1, hubX, upperY, hubZ, 7, FLOOR_SLAB_METERS, 6, "wood", ["floor", "shaft-platform", "platform"]),
    box("mine-lower-hub", 0, hubX, lowerY, depth * 0.72, 9, FLOOR_SLAB_METERS, 7, "rock", ["floor", "mine-hub", "platform"]),
  );
  const bottom = { xCells: hubX + 2.4, zCells: depth * 0.72, yMeters: lowerY + FLOOR_SLAB_METERS };
  const top = { xCells: hubX + 2.4, zCells: hubZ, yMeters: upperY + FLOOR_SLAB_METERS };
  const shaftStair = stairConnection("mine-incline", 0, bottom, top, 2, "wood", ["mine-incline", "shaft-access"]);
  scene.primitives.push(shaftStair.primitive);
  scene.rooms.push(
    createRoom("mine-upper-entry", "Upper adit and hoist", "circulation", 1, hubX, hubZ, 8, 7, upperY),
    createRoom("mine-lower-hub-room", "Lower cart junction", "circulation", 0, hubX, depth * 0.72, 9, 7, lowerY),
    createRoom("mine-ore-chamber-a", "Flooded ore chamber", "natural", 0, width * 0.2, depth * 0.9, 7, 5, lowerY),
    createRoom("mine-ore-chamber-b", "Timbered stope", "combat", 0, width * 0.78, depth * 0.9, 8, 6, lowerY),
  );
  connectRooms(scene.rooms, "mine-upper-entry", "mine-lower-hub-room");
  connectRooms(scene.rooms, "mine-lower-hub-room", "mine-ore-chamber-a");
  connectRooms(scene.rooms, "mine-lower-hub-room", "mine-ore-chamber-b");
  for (let index = 0; index < 5; index += 1) {
    const x = width * 0.18 + index * width * 0.15;
    scene.primitives.push(box(`mine-timber-${index}`, 0, x, FLOOR_SLAB_METERS, depth * 0.72, 0.35, feetToMeters(rng.int(5, 8)), 2.8, "wood", ["timber-support", "cover"]));
  }
  scene.primitives.push(box("mine-collapse", 0, width * 0.78, FLOOR_SLAB_METERS, depth * 0.9, 4, 0.18, 3, "hazard", ["hazard", "collapse"]));
  scene.routes.push(createRoute("mine-entry-route", "primary", [{ x: 0, z: upperEntryZ, y: upperY }, { x: upperEntryX, z: upperEntryZ, y: upperY }, { x: hubX, z: hubZ, y: upperY }]));
  scene.routes.push(stairRoute("mine-vertical-route", shaftStair));
  scene.routes.push(createRoute("mine-cart-loop", "alternate", [{ x: hubX, z: depth * 0.72, y: lowerY }, { x: width * 0.2, z: depth * 0.9, y: lowerY }, { x: hubX, z: depth * 0.72, y: lowerY }, { x: width * 0.78, z: depth * 0.9, y: lowerY }]));
  scene.tactical.push(
    tacticalFeature("mine-entrance", "entrance", 1, upperEntryZ, upperY, 2, "A timbered adit enters the upper mine level."),
    tacticalFeature("mine-incline-choke", "chokepoint", hubX + 2.4, (hubZ + depth * 0.72) / 2, lowerY, 2, "The incline is the only reliable route between working levels."),
    tacticalFeature("mine-collapse-hazard", "hazard", width * 0.78, depth * 0.9, lowerY, 2, "A failed timber set threatens another collapse."),
  );
  void profile;
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
  else if (archetype === "fortress") buildFortress(scene, profile, width, depth, floorHeightFeet, context.rng.fork("fortress"));
  else if (archetype === "mine") buildMine(scene, profile, width, depth, floorHeightFeet, context.rng.fork("mine"));
  else buildHall(scene, profile, width, depth, floorHeightFeet, context.rng.fork("hall"));
  return scene;
}
