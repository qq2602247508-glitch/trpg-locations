import type { GeneratedScene, GeneratorContext, MaterialKey } from "../schema";
import type { SceneProgramRegion } from "../scene-program/schema";
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

export type BuildingArchetype = "church" | "temple" | "manor" | "barracks" | "library" | "workshop" | "warehouse" | "fortress" | "mine" | "hospital" | "planetarium" | "museum" | "police" | "school" | "hotel";

function addProgramRegionFixtures(scene: GeneratedScene, region: SceneProgramRegion, level: number, x: number, z: number, baseY: number, width: number, depth: number): void {
  const features = new Set(region.features);
  const y = baseY + FLOOR_SLAB_METERS;
  const addRows = (prefix: string, count: number, material: MaterialKey, tags: string[]) => {
    for (let index = 0; index < count; index += 1) {
      const lane = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      scene.primitives.push(box(`${region.id}-${prefix}-${index}`, level, x + lane * width * 0.22, y, z - depth * 0.24 + row * Math.max(1.15, depth * 0.18), Math.max(1.2, width * 0.22), feetToMeters(prefix === "cabinet" ? 6 : 2.4), prefix === "bed" ? 2.1 : 0.7, material, ["program-building", `program-region:${region.id}`, ...tags]));
    }
  };
  if (features.has("beds") || features.has("rooms")) addRows("bed", Math.max(4, Math.min(8, Math.round(depth / 2))), "wood", ["bed", "medical", "cover"]);
  if (features.has("operating-room")) {
    scene.primitives.push(box(`${region.id}-operating-table`, level, x, y, z, 1.3, feetToMeters(3), 2.5, "metal", ["operating-table", "medical", "investigation"]), cylinder(`${region.id}-surgical-lamp`, level, x, y + feetToMeters(6), z, 0.45, feetToMeters(2), "warmLight", ["surgical-lamp", "landmark"]));
  }
  if (features.has("archives") || features.has("star-charts")) addRows("cabinet", 6, "wood", ["archive", "evidence", "blocks-sight"]);
  if (features.has("boiler") || features.has("gear-train")) {
    for (let index = 0; index < 3; index += 1) scene.primitives.push(cylinder(`${region.id}-machine-${index}`, level, x - width * 0.22 + index * width * 0.22, y, z, 0.85, feetToMeters(7), "metal", ["machinery", "industrial-equipment", "cover", index === 1 ? "hazard" : "service"]));
  }
  if (features.has("cold-room") || features.has("autopsy")) {
    scene.primitives.push(box(`${region.id}-autopsy-table`, level, x, y, z, 1.3, feetToMeters(3), 2.7, "metal", ["autopsy", "evidence", "morgue"]));
    addRows("cabinet", 4, "metal", ["cold-storage", "morgue", "blocks-sight"]);
  }
  if (features.has("reception") || features.has("desk")) scene.primitives.push(box(`${region.id}-reception-desk`, level, x, y, z - depth * 0.18, Math.max(3, width * 0.52), feetToMeters(3.5), 1.1, "wood", ["reception", "public-control", "cover"]));
  if (features.has("mirror-pool")) scene.primitives.push(primitive(`${region.id}-mirror-pool`, "water", level, x, y + 0.02, z, Math.max(3, width * 0.55) * 1.524, 0.18, Math.max(3, depth * 0.48) * 1.524, "water", ["mirror-pool", "hazard", "landmark"]));
  if (features.has("telescope")) scene.primitives.push(primitive(`${region.id}-telescope`, "cylinder", level, x, y + feetToMeters(2), z, feetToMeters(5), feetToMeters(14), feetToMeters(5), "metal", ["telescope", "brass-instrument", "landmark"], Math.PI * 0.18));
}

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
  hospital: { archetype: "hospital", title: ["St. Orra Infirmary", "North Ward Hospital", "The Quiet Sanatorium"], wall: "plaster", floor: "stone", width: [28, 38], depth: [24, 34], floors: [3, 4], floorHeight: [11, 14] },
  planetarium: { archetype: "planetarium", title: ["The Meridian Dome", "Asterion Observatory", "The Black Lens"], wall: "stone", floor: "stone", width: [24, 34], depth: [24, 34], floors: [2, 3], floorHeight: [13, 18] },
  museum: { archetype: "museum", title: ["The Grand Cabinet", "Museum of Unquiet Things", "The Civic Collection"], wall: "plaster", floor: "stone", width: [30, 42], depth: [22, 32], floors: [2, 3], floorHeight: [12, 16] },
  police: { archetype: "police", title: ["Central Police Station", "Precinct Thirteen", "The Old Watch House"], wall: "plaster", floor: "stone", width: [25, 36], depth: [21, 30], floors: [2, 3], floorHeight: [11, 14] },
  school: { archetype: "school", title: ["Miskatonic Preparatory School", "The Redbrick Academy", "Riverside School"], wall: "plaster", floor: "wood", width: [32, 44], depth: [24, 34], floors: [2, 3], floorHeight: [11, 14] },
  hotel: { archetype: "hotel", title: ["The Grand Meridian Hotel", "Hotel Orpheum", "The Harbor View"], wall: "plaster", floor: "wood", width: [24, 36], depth: [22, 32], floors: [3, 5], floorHeight: [10, 13] },
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
  hospital: ["hospital", "infirmary", "sanatorium", "医院", "医馆", "疗养院", "精神病院"],
  planetarium: ["planetarium", "天文馆", "天文台"],
  museum: ["museum", "博物馆", "展馆", "陈列馆"],
  police: ["police station", "precinct", "警察局", "警局", "巡捕房"],
  school: ["school", "academy", "学校", "学院", "中学", "小学"],
  hotel: ["hotel", "inn hotel", "酒店", "旅馆", "宾馆", "公寓"],
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

function hasKnownBuildingArchetype(prompt: string): boolean {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  return (Object.keys(ARCHETYPE_TERMS) as BuildingArchetype[]).some((archetype) => ARCHETYPE_TERMS[archetype].some((term) => normalized.includes(term)));
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

/** Compiles an open-ended SceneProgram region graph into a plausible civic or
 * real-world building. Domain-specific generators still handle known churches,
 * mines, and fortresses; this grammar prevents hospitals, hotels, schools, and
 * other institutions from hashing into an unrelated fantasy archetype. */
function generateProgramBuilding(context: GeneratorContext): GeneratedScene {
  const program = context.sceneProgram;
  if (!program) throw new Error("Program building generation requires SceneProgram input.");
  const scale = context.request.size === "small" ? 0.78 : context.request.size === "large" ? 1.28 : 1;
  const width = Math.round((28 + program.regions.length * 2.2) * scale);
  const depth = Math.round((22 + program.regions.length * 2.5) * scale);
  const hasBasement = program.regions.some((region) => region.elevation === "sunken" || region.elevation === "low");
  const needsUpper = program.regions.some((region) => region.elevation === "raised" || region.elevation === "high" || region.elevation === "vertical") || program.morphology.includes("vertical-stack");
  const floors = 1 + (hasBasement ? 1 : 0) + (needsUpper ? 1 : 0);
  const groundLevel = hasBasement ? 1 : 0;
  const upperLevel = needsUpper ? groundLevel + 1 : groundLevel;
  const floorHeightFeet = Array.from({ length: floors }, (_, index) => index === groundLevel ? context.rng.int(11, 14) : context.rng.int(10, 13));
  const scene = baseScene("building", program.title, `${program.era} ${program.ruleset} building compiled from ${program.regions.length} functional regions and explicit circulation relations.`, context.request.seed, { x: width + 4, z: depth + 4 }, floors, floorHeightFeet);
  scene.archetype = `program-building:${program.era}`;
  const centerX = 2 + width / 2;
  const centerZ = 2 + depth / 2;
  const stairX = centerX;
  const stairZ = 5.5;
  const baseYs = floorHeightFeet.map((_, level) => feetToMeters(floorHeightFeet.slice(0, level).reduce((sum, feet) => sum + feet, 0)));
  const stairOpening = [{ id: "program-main-stair", centerXCells: stairX, centerZCells: stairZ, widthCells: 2.8, depthCells: 4.2 }];
  for (let level = 0; level < floors; level += 1) {
    const baseY = baseYs[level] ?? 0;
    const wallHeight = feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS;
    scene.primitives.push(
      ...rectangularShell(`program-building-shell-${level}`, level, centerX, centerZ, baseY, width, depth, wallHeight, program.era === "modern" ? "stone" : "wood", program.era === "modern" ? "plaster" : "stone", ["program-building", "realistic-function", level < groundLevel ? "basement" : level > groundLevel ? "upper-floor" : "ground-floor"], level === groundLevel ? {
        north: { widthCells: 3 },
        west: { widthCells: 1.6, offsetCells: depth * 0.34 },
        east: { widthCells: 1.6, offsetCells: depth * 0.34 },
      } : {}, level > 0 ? stairOpening : []),
      corridor(`program-building-corridor-${level}`, level, centerX, 3, centerX, 1 + depth, baseY + FLOOR_SLAB_METERS, 2.4, program.era === "modern" ? "stone" : "wood", ["program-building", "main-corridor"]),
      ...wallWithOpenings(`program-building-spine-${level}`, level, centerX, centerZ, baseY + FLOOR_SLAB_METERS, depth - 3, wallHeight, "z", "plaster", ["program-building", "corridor-wall"], Array.from({ length: 5 }, (_, index) => ({ offsetCells: -depth * 0.36 + index * depth * 0.18, widthCells: 1.3 }))),
    );
  }
  for (let level = 0; level < floors - 1; level += 1) {
    const stair = stairConnection(`program-building-main-stair-${level}`, level, { xCells: stairX - 2.4, zCells: stairZ, yMeters: (baseYs[level] ?? 0) + FLOOR_SLAB_METERS }, { xCells: stairX, zCells: stairZ, yMeters: (baseYs[level + 1] ?? 0) + FLOOR_SLAB_METERS }, 1.7, "stone", ["program-building", "vertical-circulation"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`program-building-vertical-route-${level}`, stair));
  }
  const totalScale = program.regions.reduce((sum, item) => sum + Math.max(0.05, item.scale), 0);
  let depthCursor = 0;
  for (const [index, region] of program.regions.entries()) {
    const band = Math.max(0.08, region.scale) / totalScale;
    const side = index % 2 === 0 ? -1 : 1;
    const segmentDepth = Math.max(4.5, (depth - 6) * band * 1.18);
    const roomWidth = Math.max(5, width * (0.22 + Math.min(0.2, region.scale * 0.2)));
    const level = region.elevation === "sunken" || region.elevation === "low"
      ? 0
      : needsUpper && (region.elevation === "raised" || region.elevation === "high" || region.elevation === "vertical")
        ? upperLevel
        : groundLevel;
    const baseY = baseYs[level] ?? 0;
    const x = centerX + side * (width * (0.22 + (index % 3) * 0.035)) + (index % 2 === 0 ? -1.2 : 1.1);
    const z = 4 + (depth - 6) * (depthCursor + band * 0.5);
    const role = region.function === "public" || region.function === "commercial" || region.function === "civic" ? "public" : region.function === "service" || region.function === "industrial" ? "service" : region.function === "combat" || region.function === "hazard" ? "combat" : "private";
    scene.rooms.push(createRoom(`program-room-${region.id}`, region.label, role, level, x, z, roomWidth, Math.max(4, segmentDepth - 0.6), baseY));
    scene.primitives.push(
      ...wallWithOpenings(`program-room-${region.id}-front`, level, x, z - segmentDepth / 2, baseY + FLOOR_SLAB_METERS, roomWidth, feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS, "x", "plaster", ["program-building", `program-region:${region.id}`], { widthCells: 1.25 }),
      ...wallWithOpenings(`program-room-${region.id}-back`, level, x, z + segmentDepth / 2, baseY + FLOOR_SLAB_METERS, roomWidth, feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS, "x", "plaster", ["program-building", `program-region:${region.id}`, "room-boundary"], { widthCells: 1.1 }),
      ...wallWithOpenings(`program-room-${region.id}-west`, level, x - roomWidth / 2, z, baseY + FLOOR_SLAB_METERS, segmentDepth, feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS, "z", "plaster", ["program-building", `program-region:${region.id}`, "room-boundary"], { widthCells: 1.1 }),
      ...wallWithOpenings(`program-room-${region.id}-east`, level, x + roomWidth / 2, z, baseY + FLOOR_SLAB_METERS, segmentDepth, feetToMeters(floorHeightFeet[level] ?? 11) - FLOOR_SLAB_METERS, "z", "plaster", ["program-building", `program-region:${region.id}`, "room-boundary"], { widthCells: 1.1 }),
      box(`program-room-${region.id}-fixture`, level, x + side * roomWidth * 0.2, baseY + FLOOR_SLAB_METERS, z, Math.max(0.8, roomWidth * 0.16), feetToMeters(region.function === "service" ? 4 : 3), Math.max(1.2, segmentDepth * 0.28), region.function === "hazard" ? "hazard" : "wood", ["program-building", `program-region:${region.id}`, "functional-fixture", region.function === "investigation" ? "evidence" : "cover"]),
    );
    addProgramRegionFixtures(scene, region, level, x, z, baseY, roomWidth, segmentDepth);
    depthCursor += band;
  }
  for (const relation of program.relations) {
    const from = `program-room-${relation.from}`;
    const to = `program-room-${relation.to}`;
    if (scene.rooms.some((room) => room.id === from) && scene.rooms.some((room) => room.id === to)) connectRooms(scene.rooms, from, to);
  }
  const groundY = baseYs[groundLevel] ?? 0;
  const groundRouteY = groundY + FLOOR_SLAB_METERS;
  const groundRooms = scene.rooms.filter((room) => room.level === groundLevel);
  if (groundRooms.length >= 1) scene.routes.push(createRoute("program-building-primary-route", "primary", [{ x: centerX, z: 1, y: groundRouteY }, ...groundRooms.map((room) => ({ x: room.center.x / 1.524, z: room.center.z / 1.524, y: groundRouteY }))]));
  scene.routes.push(createRoute("program-building-service-route", "alternate", [{ x: 3, z: depth - 2, y: groundRouteY }, { x: centerX, z: centerZ, y: groundRouteY }, { x: width + 1, z: depth - 2, y: groundRouteY }]));
  scene.tactical.push(tacticalFeature("program-building-entrance", "entrance", centerX, 2, groundY, 2, "The public entrance feeds the primary institutional circulation spine."));
  addRoof(scene, "program-building", floors - 1, centerX, feetToMeters(floorHeightFeet.reduce((sum, value) => sum + value, 0)), centerZ, width, depth, program.era === "modern" ? "stone" : "roof");
  return scene;
}

/** Cross-wing hospital: public front, sterile clinical spine, ward wings and a
 * service/basement route.  It deliberately avoids the generic corridor band
 * grammar so medical prompts have a recognisable operational layout. */
function buildHospital(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2;
  const cz = 2 + depth / 2;
  const wing = Math.max(6, Math.round(width * 0.28));
  const spine = Math.max(5, Math.round(depth * 0.22));
  const wallHeight = feetToMeters(heights[0] ?? 12) - FLOOR_SLAB_METERS;
  const shell = (id: string, x: number, z: number, w: number, d: number, level: number, y: number, tags: string[]) => scene.primitives.push(...rectangularShell(id, level, x, z, y, w, d, wallHeight, profile.floor, profile.wall, ["hospital", "opening-frame", ...tags], level === 0 ? { north: { widthCells: 3 } } : {}));
  shell("hospital-front", cx, 2 + depth * 0.16, width, Math.max(5, Math.round(depth * 0.24)), 0, 0, ["public-wing"]);
  shell("hospital-west-ward", 2 + wing / 2, cz, wing, depth * 0.68, 0, 0, ["ward-wing", "patient-flow"]);
  shell("hospital-east-ward", 2 + width - wing / 2, cz, wing, depth * 0.68, 0, 0, ["ward-wing", "patient-flow"]);
  shell("hospital-clinical-spine", cx, cz, width - wing * 2 + 2, spine, 0, 0, ["sterile-spine", "surgery"]);
  scene.rooms.push(
    createRoom("hospital-reception", "Reception and waiting", "public", 0, cx, 2 + depth * 0.16, width - 2, 4),
    createRoom("hospital-west-ward", "West patient wing", "private", 0, 2 + wing / 2, cz, wing - 1, depth * 0.62),
    createRoom("hospital-east-ward", "East patient wing", "private", 0, 2 + width - wing / 2, cz, wing - 1, depth * 0.62),
    createRoom("hospital-surgery", "Operating theatre", "combat", 0, cx, cz, width - wing * 2, spine - 1),
    createRoom("hospital-morgue-and-plant", "hospital morgue and plant", "service", 0, cx, 2 + depth * 0.84, Math.max(6, width * 0.32), 5),
  );
  connectRooms(scene.rooms, "hospital-reception", "hospital-west-ward");
  connectRooms(scene.rooms, "hospital-reception", "hospital-east-ward");
  connectRooms(scene.rooms, "hospital-west-ward", "hospital-surgery");
  connectRooms(scene.rooms, "hospital-east-ward", "hospital-surgery");
  connectRooms(scene.rooms, "hospital-surgery", "hospital-morgue-and-plant");
  scene.primitives.push(
    box("hospital-clinical-floor", 0, cx, FLOOR_SLAB_METERS, cz, width - 2, FLOOR_SLAB_METERS, depth - 2, "stone", ["hospital", "floor", "corridor"]),
    box("hospital-morgue-floor", 0, cx, FLOOR_SLAB_METERS, 2 + depth * 0.84, Math.max(6, width * 0.32), FLOOR_SLAB_METERS, 5, "stone", ["hospital", "floor", "morgue", "evidence"]),
    box("hospital-operating-table", 0, cx, FLOOR_SLAB_METERS, cz, 2, feetToMeters(3), 3, "metal", ["hospital", "operating-room", "investigation", "evidence"]),
    cylinder("hospital-surgical-lamp", 0, cx, feetToMeters(10), cz, 0.45, feetToMeters(2), "warmLight", ["hospital", "landmark"]),
  );
  const bedsPerWing = 4 + Math.round(density * 8);
  for (let index = 0; index < bedsPerWing; index += 1) {
    const t = bedsPerWing === 1 ? 0.5 : index / (bedsPerWing - 1);
    const z = cz - depth * 0.25 + t * depth * 0.5;
    scene.primitives.push(
      box(`hospital-west-bed-${index}`, 0, 2 + wing * 0.48, FLOOR_SLAB_METERS, z, 1.1, feetToMeters(2.4), 2.2, "wood", ["hospital", "bed", "patient", "cover"]),
      box(`hospital-east-bed-${index}`, 0, 2 + width - wing * 0.48, FLOOR_SLAB_METERS, z, 1.1, feetToMeters(2.4), 2.2, "wood", ["hospital", "bed", "patient", "cover"]),
    );
  }
  const floorY = [0];
  for (let level = 1; level < scene.floors; level += 1) floorY[level] = floorY[level - 1]! + feetToMeters(heights[level - 1] ?? 12);
  for (let level = 1; level < scene.floors; level += 1) {
    const y = floorY[level] ?? 0;
    const upper = level === scene.floors - 1 && scene.floors > 2;
    const id = upper ? "hospital-research-floor" : level === 1 ? "hospital-upper-wards" : "hospital-service-basement";
    const w = upper ? width * 0.62 : width - 2;
    const d = upper ? depth * 0.58 : depth * 0.7;
    scene.primitives.push(...rectangularShell(id, level, cx, cz, y, w, d, feetToMeters(heights[level] ?? 12) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["hospital", upper ? "research" : level === 1 ? "ward-floor" : "service-floor"], {}, [{ id: `hospital-stair-${level}`, centerXCells: cx - width * 0.28, centerZCells: cz, widthCells: 2.4, depthCells: 3 }]));
    const roomId = upper ? `hospital-research-${level}` : level === 1 ? "hospital-upper-ward" : `hospital-service-${level}`;
    scene.rooms.push(createRoom(roomId, upper ? "Restricted research ward" : level === 1 ? "Upper patient ward" : "hospital morgue and plant", level === 1 ? "private" : "service", level, cx, cz, w - 2, d - 2, y));
    const stair = stairConnection(`hospital-stair-${level}`, level - 1, { xCells: cx - width * 0.28, zCells: cz, yMeters: (floorY[level - 1] ?? 0) + FLOOR_SLAB_METERS }, { xCells: cx - width * 0.28, zCells: cz, yMeters: y + FLOOR_SLAB_METERS }, 1.7, "metal", ["hospital", "vertical-circulation", upper ? "restricted" : "public-stair"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`hospital-vertical-${level}`, stair));
    const previousId = level === 1 ? "hospital-surgery" : level === 2 ? "hospital-morgue-and-plant" : `hospital-service-${level - 1}`;
    const previousExists = scene.rooms.some((room) => room.id === previousId);
    if (previousExists && previousId !== roomId) connectRooms(scene.rooms, previousId, roomId);
  }
  scene.routes.push(createRoute("hospital-public-route", "primary", [{ x: cx, z: 1, y: FLOOR_SLAB_METERS }, { x: cx, z: cz, y: FLOOR_SLAB_METERS }, { x: 2 + wing, z: cz, y: FLOOR_SLAB_METERS }]));
  scene.routes.push(createRoute("hospital-service-route", "alternate", [{ x: 2, z: depth - 1, y: FLOOR_SLAB_METERS }, { x: cx, z: cz + 2, y: FLOOR_SLAB_METERS }, { x: width + 2, z: depth - 1, y: FLOOR_SLAB_METERS }]));
  scene.tactical.push(tacticalFeature("hospital-entrance", "entrance", cx, 2, 0, 2, "Public entrance opens into triage and a split ward route."), tacticalFeature("hospital-surgery-choke", "chokepoint", cx, cz, 0, 2, "The sterile theatre controls both ward approaches."));
  addRoof(scene, "hospital", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "stone");
  void rng;
}

/** Radial observatory/planetarium: a central dome and ring galleries produce
 * sight-line breaks and a very different silhouette from rectilinear rooms. */
function buildPlanetarium(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2;
  const cz = 2 + depth / 2;
  const radius = Math.min(width, depth) * 0.29;
  const floorY = [0];
  for (let level = 1; level < scene.floors; level += 1) floorY[level] = floorY[level - 1]! + feetToMeters(heights[level - 1] ?? 14);
  scene.primitives.push(box("planetarium-foundation", 0, cx, 0, cz, width - 2, FLOOR_SLAB_METERS, depth - 2, "stone", ["planetarium", "foundation", "floor", "corridor"]));
  scene.primitives.push(cylinder("planetarium-dome", 0, cx, feetToMeters(heights[0] ?? 15), cz, radius * 1.08, feetToMeters(14), "roof", ["planetarium", "dome", "landmark"]));
  scene.rooms.push(createRoom("planetarium-dome-room", "Rotating star dome", "combat", 0, cx, cz, radius * 1.55, radius * 1.55));
  const galleryCount = 6 + Math.round(density * 4);
  for (let index = 0; index < galleryCount; index += 1) {
    const angle = (Math.PI * 2 * index) / galleryCount;
    const x = cx + Math.cos(angle) * radius * 1.42;
    const z = cz + Math.sin(angle) * radius * 1.42;
    const id = `planetarium-gallery-${index}`;
    scene.rooms.push(createRoom(id, index % 2 === 0 ? "Exhibit gallery" : "Instrument gallery", "public", 0, x, z, 5, 5));
    scene.primitives.push(...rectangularShell(`${id}-shell`, 0, x, z, 0, 5.8, 5.8, feetToMeters(heights[0] ?? 15) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["planetarium", "radial-gallery", "opening-frame"], {}));
    scene.primitives.push(box(`${id}-floor`, 0, x, FLOOR_SLAB_METERS, z, 5.1, FLOOR_SLAB_METERS, 5.1, "stone", ["planetarium", "floor", "corridor"]));
    scene.primitives.push(cylinder(`${id}-instrument`, 0, x, FLOOR_SLAB_METERS, z, 0.5, feetToMeters(4 + (index % 3) * 2), index % 2 ? "metal" : "warmLight", ["planetarium", "instrument", "cover"]));
    connectRooms(scene.rooms, "planetarium-dome-room", id);
    scene.routes.push(createRoute(`${id}-radial-route`, index === 0 ? "primary" : "alternate", [{ x: cx, z: cz, y: FLOOR_SLAB_METERS }, { x, z, y: FLOOR_SLAB_METERS }]));
  }
  for (let level = 1; level < scene.floors; level += 1) {
    const y = floorY[level] ?? 0;
    const upper = level === scene.floors - 1;
    scene.primitives.push(...rectangularShell(`planetarium-ring-${level}`, level, cx, cz, y, width * 0.76, depth * 0.76, feetToMeters(heights[level] ?? 14) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["planetarium", "opening-frame", upper ? "roof-ring" : "archive-ring"], {}, [{ id: `planetarium-stair-${level}`, centerXCells: cx - radius, centerZCells: cz, widthCells: 2.4, depthCells: 2.4 }]));
    scene.primitives.push(box(`planetarium-ring-floor-${level}`, level, cx, y, cz, width * 0.72, FLOOR_SLAB_METERS, depth * 0.72, "stone", ["planetarium", "floor", "platform"]));
    const roomId = upper ? "planetarium-roof-platform" : "planetarium-archive";
    scene.rooms.push(createRoom(roomId, upper ? "Open rooftop observation deck" : "Restricted star archive", upper ? "combat" : "private", level, cx, cz, width * 0.7, depth * 0.7, y));
    const previousRoomId = level === 1 ? "planetarium-dome-room" : "planetarium-archive";
    connectRooms(scene.rooms, previousRoomId, roomId);
    const stair = stairConnection(`planetarium-stair-${level}`, level - 1, { xCells: cx - radius, zCells: cz, yMeters: (floorY[level - 1] ?? 0) + FLOOR_SLAB_METERS }, { xCells: cx - radius, zCells: cz, yMeters: y + FLOOR_SLAB_METERS }, 1.6, "metal", ["planetarium", "vertical-circulation"]);
    scene.primitives.push(stair.primitive); scene.routes.push(stairRoute(`planetarium-vertical-${level}`, stair));
  }
  scene.tactical.push(tacticalFeature("planetarium-entrance", "entrance", cx, 2, 0, 2, "Visitors enter a radial gallery before reaching the dome."), tacticalFeature("planetarium-dome-objective", "highGround", cx, cz, feetToMeters(heights[0] ?? 15), 3, "The dome mechanism is an exposed central objective."));
  addRoof(scene, "planetarium", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "roof");
  void rng;
}

function buildMuseum(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2; const cz = 2 + depth / 2;
  const courtyard = Math.max(6, Math.round(Math.min(width, depth) * 0.22));
  const wallHeight = feetToMeters(heights[0] ?? 14) - FLOOR_SLAB_METERS;
  scene.primitives.push(box("museum-courtyard", 0, cx, FLOOR_SLAB_METERS, cz, courtyard, 0.2, courtyard, "stone", ["museum", "courtyard", "open-sightline", "floor", "corridor"]));
  const wings: Array<[string, number, number, number, number]> = [["north", cx, 2 + (depth - courtyard) * 0.25, width, Math.max(5, (depth - courtyard) * 0.42)], ["south", cx, 2 + depth - (depth - courtyard) * 0.25, width, Math.max(5, (depth - courtyard) * 0.42)], ["west", 2 + (width - courtyard) * 0.25, cz, Math.max(5, (width - courtyard) * 0.42), courtyard], ["east", 2 + width - (width - courtyard) * 0.25, cz, Math.max(5, (width - courtyard) * 0.42), courtyard]];
  for (const [name, x, z, w, d] of wings) scene.primitives.push(...rectangularShell(`museum-${name}-wing`, 0, x, z, 0, w, d, wallHeight, profile.floor, profile.wall, ["museum", "gallery-wing"], { [name === "north" ? "south" : name === "south" ? "north" : name === "west" ? "east" : "west"]: { widthCells: 2.5 } }));
  scene.primitives.push(corridor("museum-courtyard-walk-north", 0, cx - courtyard / 2, cz, cx + courtyard / 2, cz, FLOOR_SLAB_METERS, 1.2, "stone", ["museum"]));
  scene.rooms.push(createRoom("museum-courtyard-room", "Museum courtyard", "circulation", 0, cx, cz, courtyard, courtyard));
  for (const [name, x, z, w, d] of wings) {
    const id = `museum-${name}-gallery`;
    scene.rooms.push(createRoom(id, `${name[0]?.toUpperCase() ?? ""}${name.slice(1)} gallery`, "public", 0, x, z, w - 1, d - 1));
    connectRooms(scene.rooms, "museum-courtyard-room", id);
    const displays = 1 + Math.round(density * 3);
    for (let index = 0; index < displays; index += 1) {
      const offset = (index - (displays - 1) / 2) * Math.min(2.2, Math.max(1.2, w / (displays + 1)));
      scene.primitives.push(box(`${id}-display-${index}`, 0, x + (name === "north" || name === "south" ? offset : 0), FLOOR_SLAB_METERS, z + (name === "west" || name === "east" ? offset : 0), Math.max(1.2, w * 0.12), feetToMeters(3 + (index % 2)), Math.max(1.2, d * 0.26), "wood", ["museum", "display", "cover", "evidence"]));
    }
  }
  scene.primitives.push(
    corridor("museum-walk-north", 0, cx, cz, cx, 2 + (depth - courtyard) * 0.25, FLOOR_SLAB_METERS, 1.4, "stone", ["museum"]),
    corridor("museum-walk-south", 0, cx, cz, cx, 2 + depth - (depth - courtyard) * 0.25, FLOOR_SLAB_METERS, 1.4, "stone", ["museum"]),
    corridor("museum-walk-west", 0, cx, cz, 2 + (width - courtyard) * 0.25, cz, FLOOR_SLAB_METERS, 1.4, "stone", ["museum"]),
    corridor("museum-walk-east", 0, cx, cz, 2 + width - (width - courtyard) * 0.25, cz, FLOOR_SLAB_METERS, 1.4, "stone", ["museum"]),
  );
  for (let level = 1; level < scene.floors; level += 1) { const y = feetToMeters(heights.slice(0, level).reduce((a, b) => a + b, 0)); scene.primitives.push(...rectangularShell(`museum-upper-${level}`, level, cx, cz, y, width * 0.76, depth * 0.76, feetToMeters(heights[level] ?? 13) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["museum", "upper-gallery"], {}, [{ id: `museum-stair-${level}`, centerXCells: cx, centerZCells: 3.5, widthCells: 2.4, depthCells: 2.4 }])); scene.primitives.push(box(`museum-upper-floor-${level}`, level, cx, y, cz, width * 0.72, FLOOR_SLAB_METERS, depth * 0.72, "stone", ["museum", "floor", "corridor"])); const id = `museum-upper-room-${level}`; scene.rooms.push(createRoom(id, level === scene.floors - 1 ? "Restricted archive" : "Upper exhibition loop", level === scene.floors - 1 ? "private" : "public", level, cx, cz, width * 0.7, depth * 0.7, y)); connectRooms(scene.rooms, level === 1 ? "museum-courtyard-room" : `museum-upper-room-${level - 1}`, id); const stair = stairConnection(`museum-stair-${level}`, level - 1, { xCells: cx, zCells: 3.5, yMeters: y - feetToMeters(heights[level - 1] ?? 13) + FLOOR_SLAB_METERS }, { xCells: cx, zCells: 3.5, yMeters: y + FLOOR_SLAB_METERS }, 1.6, "stone", ["museum", "vertical-circulation"]); scene.primitives.push(stair.primitive); scene.routes.push(stairRoute(`museum-vertical-${level}`, stair)); }
  scene.routes.push(createRoute("museum-public-loop", "primary", [
    { x: cx, z: 2 + (depth - courtyard) * 0.25, y: FLOOR_SLAB_METERS },
    { x: 2 + width - (width - courtyard) * 0.25, z: cz, y: FLOOR_SLAB_METERS },
    { x: cx, z: 2 + depth - (depth - courtyard) * 0.25, y: FLOOR_SLAB_METERS },
    { x: 2 + (width - courtyard) * 0.25, z: cz, y: FLOOR_SLAB_METERS },
    { x: cx, z: 2 + (depth - courtyard) * 0.25, y: FLOOR_SLAB_METERS },
  ]));
  scene.tactical.push(tacticalFeature("museum-entrance", "entrance", cx, 2, 0, 2, "The entrance frames a courtyard and four visible gallery approaches."), tacticalFeature("museum-courtyard-crossfire", "chokepoint", cx, cz, 0, 3, "The open courtyard is a contested crossing between wings."));
  addRoof(scene, "museum", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "roof");
  void rng;
}

function floorBases(heights: readonly number[]): number[] {
  return heights.map((_, level) => feetToMeters(heights.slice(0, level).reduce((sum, value) => sum + value, 0)));
}

function buildPoliceStation(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2;
  const cz = 2 + depth / 2;
  const bookingZ = 2 + depth * 0.42;
  const cellZ = 2 + depth * 0.72;
  const bases = floorBases(heights);
  scene.primitives.push(...rectangularShell("police-ground-shell", 0, cx, cz, 0, width, depth, feetToMeters(heights[0] ?? 12) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["police", "opening-frame", "secure-building"], { north: { widthCells: 2.6 }, south: { widthCells: 2.4, offsetCells: width * 0.3 } }));
  scene.rooms.push(
    createRoom("police-public-desk", "Public desk and waiting", "public", 0, cx, 2 + depth * 0.17, width - 3, 5),
    createRoom("police-booking", "Booking and interview suite", "combat", 0, cx, bookingZ, width * 0.55, 6),
    createRoom("police-evidence", "Locked evidence room", "private", 0, 2 + width * 0.18, bookingZ, width * 0.25, 6),
    createRoom("police-cellblock", "Secure cell block", "private", 0, cx, cellZ, width * 0.62, depth * 0.35),
    createRoom("police-garage", "Rear garage and service entry", "service", 0, 2 + width * 0.84, cellZ, width * 0.25, depth * 0.32),
  );
  connectRooms(scene.rooms, "police-public-desk", "police-booking");
  connectRooms(scene.rooms, "police-booking", "police-evidence");
  connectRooms(scene.rooms, "police-booking", "police-cellblock");
  connectRooms(scene.rooms, "police-cellblock", "police-garage");
  const cells = 3 + Math.round(density * 5);
  for (let index = 0; index < cells; index += 1) {
    const x = cx - width * 0.25 + (index % Math.ceil(cells / 2)) * Math.max(2.4, width * 0.5 / Math.ceil(cells / 2));
    const z = cellZ + (index % 2 === 0 ? -1.8 : 1.8);
    scene.primitives.push(box(`police-cell-${index}`, 0, x, FLOOR_SLAB_METERS, z, 2.2, feetToMeters(8), 2.8, "metal", ["police", "cell", "bars", "cover"]));
  }
  scene.primitives.push(box("police-evidence-cages", 0, 2 + width * 0.18, FLOOR_SLAB_METERS, bookingZ, width * 0.18, feetToMeters(7), 4.5, "metal", ["police", "evidence", "locked", "investigation"]));
  for (let level = 1; level < scene.floors; level += 1) {
    const y = bases[level] ?? 0;
    scene.primitives.push(...rectangularShell(`police-upper-${level}`, level, cx, cz - depth * 0.08, y, width * 0.78, depth * 0.65, feetToMeters(heights[level] ?? 12) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["police", "opening-frame", "detective-floor"], {}, [{ id: `police-stair-${level}`, centerXCells: cx - width * 0.25, centerZCells: cz, widthCells: 2.4, depthCells: 2.8 }]));
    const id = `police-detective-office-${level}`;
    scene.rooms.push(createRoom(id, level === scene.floors - 1 ? "Command and records" : "Detective bullpen", level === scene.floors - 1 ? "private" : "public", level, cx, cz - depth * 0.08, width * 0.72, depth * 0.58, y));
    connectRooms(scene.rooms, level === 1 ? "police-booking" : `police-detective-office-${level - 1}`, id);
    const stair = stairConnection(`police-stair-${level}`, level - 1, { xCells: cx - width * 0.25, zCells: cz, yMeters: (bases[level - 1] ?? 0) + FLOOR_SLAB_METERS }, { xCells: cx - width * 0.25, zCells: cz, yMeters: y + FLOOR_SLAB_METERS }, 1.6, "stone", ["police", "vertical-circulation"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`police-vertical-${level}`, stair));
  }
  scene.routes.push(createRoute("police-public-route", "primary", [{ x: cx, z: 1, y: FLOOR_SLAB_METERS }, { x: cx, z: bookingZ, y: FLOOR_SLAB_METERS }, { x: cx, z: cellZ, y: FLOOR_SLAB_METERS }]));
  scene.routes.push(createRoute("police-secure-route", "alternate", [{ x: width + 1, z: cellZ, y: FLOOR_SLAB_METERS }, { x: 2 + width * 0.84, z: cellZ, y: FLOOR_SLAB_METERS }, { x: cx, z: bookingZ, y: FLOOR_SLAB_METERS }]));
  scene.tactical.push(tacticalFeature("police-entrance", "entrance", cx, 2, 0, 2, "The public desk screens access to the secure station."), tacticalFeature("police-booking-choke", "chokepoint", cx, bookingZ, 0, 2, "Booking controls the route between public rooms, cells, and evidence."));
  addRoof(scene, "police", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "stone");
  void rng;
}

function buildSchool(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2;
  const cz = 2 + depth / 2;
  const courtyardW = width * 0.42;
  const wingW = (width - courtyardW) / 2;
  const rearD = Math.max(6, depth * 0.26);
  const bases = floorBases(heights);
  const wallHeight = feetToMeters(heights[0] ?? 12) - FLOOR_SLAB_METERS;
  scene.primitives.push(
    ...rectangularShell("school-west-wing", 0, 2 + wingW / 2, cz, 0, wingW, depth, wallHeight, profile.floor, profile.wall, ["school", "opening-frame", "classroom-wing"], { east: { widthCells: 2.2 } }),
    ...rectangularShell("school-east-wing", 0, 2 + width - wingW / 2, cz, 0, wingW, depth, wallHeight, profile.floor, profile.wall, ["school", "opening-frame", "classroom-wing"], { west: { widthCells: 2.2 } }),
    ...rectangularShell("school-rear-hall", 0, cx, 2 + depth - rearD / 2, 0, courtyardW, rearD, wallHeight, profile.floor, profile.wall, ["school", "opening-frame", "assembly-hall"], { north: { widthCells: 3 } }),
    box("school-courtyard", 0, cx, FLOOR_SLAB_METERS, cz - rearD * 0.35, courtyardW, FLOOR_SLAB_METERS, depth - rearD - 3, "stone", ["school", "courtyard", "floor", "corridor"]),
    corridor("school-entry-walk", 0, cx, 2.5, cx, cz - rearD * 0.35, FLOOR_SLAB_METERS, 1.6, "stone", ["school", "entrance"]),
  );
  scene.rooms.push(
    createRoom("school-courtyard-room", "School courtyard", "circulation", 0, cx, cz - rearD * 0.35, courtyardW, depth - rearD - 3),
    createRoom("school-west-classrooms", "West classroom wing", "public", 0, 2 + wingW / 2, cz, wingW - 1, depth - 2),
    createRoom("school-east-classrooms", "East classroom wing", "public", 0, 2 + width - wingW / 2, cz, wingW - 1, depth - 2),
    createRoom("school-assembly", "Assembly hall and stage", "combat", 0, cx, 2 + depth - rearD / 2, courtyardW - 1, rearD - 1),
  );
  for (const id of ["school-west-classrooms", "school-east-classrooms", "school-assembly"]) connectRooms(scene.rooms, "school-courtyard-room", id);
  const desks = 5 + Math.round(density * 9);
  for (let index = 0; index < desks; index += 1) {
    const z = 4 + (index % Math.ceil(desks / 2)) * Math.max(2, (depth - 7) / Math.ceil(desks / 2));
    scene.primitives.push(box(`school-west-desk-${index}`, 0, 2 + wingW / 2, FLOOR_SLAB_METERS, z, Math.max(1.2, wingW * 0.55), feetToMeters(2.5), 0.8, "wood", ["school", "desk", "cover"]));
  }
  for (let level = 1; level < scene.floors; level += 1) {
    const y = bases[level] ?? 0;
    scene.primitives.push(...rectangularShell(`school-upper-${level}`, level, cx, cz, y, width * 0.82, depth * 0.72, feetToMeters(heights[level] ?? 12) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["school", "opening-frame", "upper-classrooms"], {}, [{ id: `school-stair-${level}`, centerXCells: cx - width * 0.3, centerZCells: cz, widthCells: 2.4, depthCells: 2.8 }]));
    const id = `school-upper-room-${level}`;
    scene.rooms.push(createRoom(id, level === scene.floors - 1 ? "Library and faculty rooms" : "Upper classrooms", level === scene.floors - 1 ? "private" : "public", level, cx, cz, width * 0.76, depth * 0.66, y));
    connectRooms(scene.rooms, level === 1 ? "school-assembly" : `school-upper-room-${level - 1}`, id);
    const stair = stairConnection(`school-stair-${level}`, level - 1, { xCells: cx - width * 0.3, zCells: cz, yMeters: (bases[level - 1] ?? 0) + FLOOR_SLAB_METERS }, { xCells: cx - width * 0.3, zCells: cz, yMeters: y + FLOOR_SLAB_METERS }, 1.7, "wood", ["school", "vertical-circulation"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`school-vertical-${level}`, stair));
  }
  scene.routes.push(createRoute("school-courtyard-route", "primary", [{ x: cx, z: 2.5, y: FLOOR_SLAB_METERS }, { x: cx, z: cz - rearD * 0.35, y: FLOOR_SLAB_METERS }, { x: cx, z: depth - rearD + 2, y: FLOOR_SLAB_METERS }]));
  scene.routes.push(createRoute("school-wing-route", "alternate", [{ x: 2 + wingW / 2, z: 2, y: FLOOR_SLAB_METERS }, { x: cx, z: cz, y: FLOOR_SLAB_METERS }, { x: 2 + width - wingW / 2, z: depth - 2, y: FLOOR_SLAB_METERS }]));
  scene.tactical.push(
    tacticalFeature("school-entrance", "entrance", cx, 2, 0, 2, "The front gate opens into a supervised courtyard."),
    tacticalFeature("school-stage", "highGround", cx, depth - rearD + 3, 0, 3, "The assembly stage overlooks the hall and rear courtyard."),
    tacticalFeature("school-desk-cover", "cover", 2 + wingW / 2, cz, 0, 2, "Classroom desks create repeated low-cover lanes."),
    tacticalFeature("school-courtyard-choke", "chokepoint", cx, cz - rearD * 0.35, 0, 3, "Both teaching wings and the assembly hall overlook this crossing."),
  );
  addRoof(scene, "school", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "roof");
  void rng;
}

function buildHotel(scene: GeneratedScene, profile: BuildingProfile, width: number, depth: number, heights: number[], density: number, rng: GeneratorContext["rng"]): void {
  const cx = 2 + width / 2;
  const cz = 2 + depth / 2;
  const bases = floorBases(heights);
  scene.primitives.push(...rectangularShell("hotel-ground", 0, cx, cz, 0, width, depth, feetToMeters(heights[0] ?? 11) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["hotel", "opening-frame", "lobby-floor"], { north: { widthCells: 3.2 }, south: { widthCells: 1.6, offsetCells: width * 0.35 } }));
  scene.rooms.push(
    createRoom("hotel-lobby", "Lobby and reception", "public", 0, cx, 2 + depth * 0.25, width - 3, depth * 0.35),
    createRoom("hotel-ballroom", "Dining room and ballroom", "combat", 0, cx, 2 + depth * 0.62, width * 0.62, depth * 0.35),
    createRoom("hotel-kitchen", "Kitchen and staff service", "service", 0, 2 + width * 0.84, 2 + depth * 0.65, width * 0.23, depth * 0.38),
  );
  connectRooms(scene.rooms, "hotel-lobby", "hotel-ballroom");
  connectRooms(scene.rooms, "hotel-ballroom", "hotel-kitchen");
  scene.primitives.push(box("hotel-reception-desk", 0, cx, FLOOR_SLAB_METERS, 2 + depth * 0.18, width * 0.28, feetToMeters(3.4), 1.1, "wood", ["hotel", "reception", "cover"]));
  for (let level = 1; level < scene.floors; level += 1) {
    const y = bases[level] ?? 0;
    scene.primitives.push(...rectangularShell(`hotel-guest-floor-${level}`, level, cx, cz, y, width, depth, feetToMeters(heights[level] ?? 11) - FLOOR_SLAB_METERS, profile.floor, profile.wall, ["hotel", "guest-floor"], {}, [{ id: `hotel-stair-${level}`, centerXCells: cx - width * 0.36, centerZCells: cz, widthCells: 2.4, depthCells: 3 }]));
    scene.primitives.push(corridor(`hotel-corridor-${level}`, level, 3, cz, width + 1, cz, y + FLOOR_SLAB_METERS, 2.2, "wood", ["hotel", "guest-circulation"]));
    const roomsPerSide = 2 + Math.round(density * 4);
    let previousId = level === 1 ? "hotel-lobby" : `hotel-room-${level - 1}-0-north`;
    for (let index = 0; index < roomsPerSide; index += 1) {
      const x = 4 + index * ((width - 4) / Math.max(1, roomsPerSide - 1));
      for (const side of ["north", "south"] as const) {
        const id = `hotel-room-${level}-${index}-${side}`;
        const z = cz + (side === "north" ? -depth * 0.24 : depth * 0.24);
        scene.rooms.push(createRoom(id, `Guest room ${level}${index + 1}${side === "north" ? "A" : "B"}`, "private", level, x, z, Math.max(3, width / roomsPerSide - 0.5), depth * 0.38, y));
        connectRooms(scene.rooms, previousId, id);
        previousId = id;
        scene.primitives.push(box(`${id}-bed`, level, x, y + FLOOR_SLAB_METERS, z, 1.3, feetToMeters(2.4), 2.3, "wood", ["hotel", "bed", "cover"]));
      }
    }
    const stair = stairConnection(`hotel-stair-${level}`, level - 1, { xCells: cx - width * 0.36, zCells: cz, yMeters: (bases[level - 1] ?? 0) + FLOOR_SLAB_METERS }, { xCells: cx - width * 0.36, zCells: cz, yMeters: y + FLOOR_SLAB_METERS }, 1.6, "wood", ["hotel", "vertical-circulation", "service-stair"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`hotel-vertical-${level}`, stair));
  }
  scene.routes.push(createRoute("hotel-public-route", "primary", [{ x: cx, z: 1, y: FLOOR_SLAB_METERS }, { x: cx, z: 2 + depth * 0.25, y: FLOOR_SLAB_METERS }, { x: cx, z: 2 + depth * 0.62, y: FLOOR_SLAB_METERS }]));
  scene.routes.push(createRoute("hotel-service-route", "alternate", [{ x: width + 2, z: depth - 2, y: FLOOR_SLAB_METERS }, { x: 2 + width * 0.84, z: 2 + depth * 0.65, y: FLOOR_SLAB_METERS }, { x: cx, z: cz, y: FLOOR_SLAB_METERS }]));
  scene.tactical.push(tacticalFeature("hotel-entrance", "entrance", cx, 2, 0, 2, "The revolving entrance opens into a broad lobby."), tacticalFeature("hotel-ballroom-control", "chokepoint", cx, 2 + depth * 0.48, 0, 2, "Lobby, ballroom, and staff routes meet at this controlled threshold."));
  addRoof(scene, "hotel", scene.floors - 1, cx, feetToMeters(heights.reduce((sum, value) => sum + value, 0)), cz, width, depth, "roof");
  void rng;
}

export function generateBuilding(context: GeneratorContext): GeneratedScene {
  if (context.sceneProgram && (
    (!hasKnownBuildingArchetype(context.request.prompt) && (context.sceneProgram.coverage.includes("institutional-rooms") || context.sceneProgram.coverage.includes("residential-rooms")))
    || context.sceneProgram.domain === "building" && !hasKnownBuildingArchetype(context.request.prompt)
  )) {
    return generateProgramBuilding(context);
  }
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
  else if (archetype === "hospital") buildHospital(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("hospital"));
  else if (archetype === "planetarium") buildPlanetarium(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("planetarium"));
  else if (archetype === "museum") buildMuseum(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("museum"));
  else if (archetype === "police") buildPoliceStation(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("police"));
  else if (archetype === "school") buildSchool(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("school"));
  else if (archetype === "hotel") buildHotel(scene, profile, width, depth, floorHeightFeet, context.request.density, context.rng.fork("hotel"));
  else buildHall(scene, profile, width, depth, floorHeightFeet, context.rng.fork("hall"));
  return scene;
}
