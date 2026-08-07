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
  tacticalFeature,
} from "./shared";

export type SettlementArchetype = "village" | "town" | "city" | "harbor";

const SETTLEMENT_TERMS: Readonly<Record<SettlementArchetype, readonly string[]>> = {
  village: ["village", "hamlet", "村庄", "村落"],
  town: ["town", "market town", "城镇", "集镇", "小镇"],
  city: ["city", "district", "urban", "deepwater", "深水城", "城市", "街区"],
  harbor: ["harbor", "harbour", "dock", "port", "港区", "港口", "码头", "海港"],
};

export function classifySettlementArchetype(prompt: string): SettlementArchetype {
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  // A prompt can describe a district inside a larger city (for example
  // "深水城港区"). Prefer the most physically specific grammar instead of
  // whichever broad noun happens to appear first in the table.
  const precedence: readonly SettlementArchetype[] = ["harbor", "village", "city", "town"];
  for (const archetype of precedence) {
    if (SETTLEMENT_TERMS[archetype].some((term) => normalized.includes(term))) return archetype;
  }
  return "town";
}

interface SettlementBuilding {
  id: string;
  kind: "home" | "tavern" | "shrine" | "warehouse" | "tower" | "manor";
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  district: string;
}

interface RoadSegment {
  id: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  width: number;
  hierarchy: "main" | "cross" | "lane";
}

function settlementBounds(context: GeneratorContext, archetype: SettlementArchetype): { width: number; depth: number; buildings: number } {
  const { rng, request } = context;
  const base: readonly [number, number, number] = archetype === "village" ? [32, 28, 6] : archetype === "harbor" ? [62, 46, 12] : archetype === "city" ? [80, 66, 18] : [52, 42, 10];
  const scale = request.size === "small" ? 0.8 : request.size === "large" ? 1.25 : 1;
  return {
    width: Math.round(base[0] * scale) + rng.int(-3, 4),
    depth: Math.round(base[1] * scale) + rng.int(-3, 4),
    buildings: Math.max(4, Math.round(base[2] * scale) + rng.int(-1, 2)),
  };
}

function addBuildingModule(scene: GeneratedScene, building: SettlementBuilding, rng: GeneratorContext["rng"]): void {
  const y = FLOOR_SLAB_METERS;
  const material: MaterialKey = building.kind === "warehouse" ? "darkStone" : building.kind === "shrine" ? "stone" : building.kind === "tower" ? "darkStone" : building.kind === "manor" ? "plaster" : building.kind === "tavern" ? "wood" : "plaster";
  const height = building.kind === "tower" ? feetToMeters(rng.int(18, 30)) : building.kind === "warehouse" ? feetToMeters(rng.int(12, 18)) : feetToMeters(rng.int(9, 15));
  const tags = ["settlement-building", `building:${building.kind}`, `district:${building.district}`];
  if (building.kind === "tower") {
    scene.primitives.push(cylinder(`${building.id}-mass`, 0, building.x, y, building.z, Math.min(building.width, building.depth), height, material, [...tags, "landmark", "high-ground"]));
    scene.tactical.push(tacticalFeature(`${building.id}-high-ground`, "highGround", building.x, building.z, 0, 2, "A vertical landmark creates a visible high point over the street grid."));
  } else if (building.kind === "shrine") {
    scene.primitives.push(box(`${building.id}-base`, 0, building.x, y, building.z, building.width, height * 0.55, building.depth, material, tags));
    scene.primitives.push(primitive(`${building.id}-roof`, "cone", 0, building.x, y + height * 0.55, building.z, building.width * 1.05 * 1.524, height * 0.52, building.depth * 1.05 * 1.524, "roof", [...tags, "roof"], Math.PI / 4));
  } else {
    scene.primitives.push(box(`${building.id}-mass`, 0, building.x, y, building.z, building.width, height, building.depth, material, tags, building.rotation));
    scene.primitives.push(box(`${building.id}-roof`, 0, building.x, y + height, building.z, building.width * 1.08, 0.24, building.depth * 1.08, "roof", [...tags, "roof"], building.rotation));
  }
  scene.rooms.push(createRoom(`${building.id}-room`, `${building.kind} at ${building.district}`, building.kind === "warehouse" ? "service" : building.kind === "tower" ? "combat" : "public", 0, building.x, building.z, building.width, building.depth));
}

function distributeBuildings(context: GeneratorContext, width: number, depth: number, count: number, archetype: SettlementArchetype, roads: readonly RoadSegment[]): SettlementBuilding[] {
  const { rng } = context;
  const buildings: SettlementBuilding[] = [];
  const districts = archetype === "harbor" ? ["quayside", "market", "warehouse-row", "old-town"] : archetype === "city" ? ["civic", "market", "residential", "craft", "old-town"] : archetype === "village" ? ["green", "farmstead", "crossroads"] : ["market", "residential", "craft", "gate"];
  const plazaRadius = archetype === "city" ? 7 : archetype === "village" ? 4 : 5.5;
  const waterLimit = archetype === "harbor" ? depth - 7 : depth - 2;
  let attempts = 0;
  while (buildings.length < count && attempts < count * 60) {
    attempts += 1;
    const index = buildings.length;
    const road = rng.pick(roads);
    const dx = road.toX - road.fromX;
    const dz = road.toZ - road.fromZ;
    const length = Math.max(1, Math.hypot(dx, dz));
    const ux = dx / length;
    const uz = dz / length;
    const district = archetype === "harbor" && Math.max(road.fromZ, road.toZ) > depth * 0.62
      ? (index % 2 === 0 ? "warehouse-row" : "quayside")
      : districts[index % districts.length] ?? "residential";
    const kind = district === "warehouse-row" ? "warehouse" : district === "civic" ? (index % 2 === 0 ? "manor" : "shrine") : index % 11 === 0 ? "tower" : index % 7 === 0 ? "tavern" : index % 5 === 0 ? "shrine" : "home";
    const widthCells = kind === "warehouse" ? rng.int(6, 10) : kind === "manor" ? rng.int(7, 11) : kind === "tower" ? rng.int(4, 6) : rng.int(4, 7);
    const depthCells = kind === "warehouse" ? rng.int(4, 7) : kind === "manor" ? rng.int(6, 9) : kind === "tower" ? rng.int(4, 6) : rng.int(4, 7);
    const t = rng.float(0.12, 0.88);
    const side = rng.bool() ? -1 : 1;
    const setback = road.width / 2 + depthCells / 2 + rng.float(1.1, 2.4);
    const x = road.fromX + dx * t - uz * setback * side;
    const z = road.fromZ + dz * t + ux * setback * side;
    const clearance = Math.max(widthCells, depthCells) / 2 + (archetype === "village" ? 0.55 : 1.2);
    if (x < clearance || x > width - clearance || z < clearance || z > waterLimit - clearance) continue;
    if (Math.hypot(x - width / 2, z - depth / 2) < plazaRadius + clearance) continue;
    const overlaps = buildings.some((building) => (
      Math.abs(building.x - x) < (Math.max(building.width, building.depth) + Math.max(widthCells, depthCells)) / 2 + (archetype === "village" ? 0.35 : 1)
      && Math.abs(building.z - z) < (Math.max(building.width, building.depth) + Math.max(widthCells, depthCells)) / 2 + (archetype === "village" ? 0.35 : 1)
    ));
    if (overlaps) continue;
    buildings.push({
      id: `settlement-building-${index + 1}`,
      kind,
      x,
      z,
      width: widthCells,
      depth: depthCells,
      rotation: Math.atan2(dx, dz) + rng.float(-0.1, 0.1),
      district,
    });
  }
  return buildings;
}

export function generateSettlement(context: GeneratorContext): GeneratedScene {
  const archetype = classifySettlementArchetype(context.request.prompt);
  const { width, depth, buildings: buildingCount } = settlementBounds(context, archetype);
  const scene = baseScene(
    "settlement",
    choose(context.rng, archetype === "harbor" ? ["The Lantern Quays", "Saltwind Harbor", "The Tideward Ward"] : archetype === "city" ? ["A District of Deepwater", "The Broken Crown Ward", "Eastwall City Blocks"] : archetype === "village" ? ["The Hollow Green", "Miller's Rest", "The Last Hedge Village"] : ["The Crossroads Town", "Redmarket", "The Walled Borough"]),
    `${archetype} planner: irregular roads, functional districts, independent building modules, crowd routes, and tactical landmarks.`,
    context.request.seed,
    { x: width, z: depth },
    1,
    [10],
  );
  scene.archetype = archetype;
  const centreX = width / 2;
  const centreZ = depth / 2;
  const roadWidth = archetype === "city" ? 4 : 3;
  const westZ = centreZ + context.rng.float(-depth * 0.12, depth * 0.08);
  const eastZ = centreZ + context.rng.float(-depth * 0.08, depth * 0.12);
  const northX = centreX + context.rng.float(-width * 0.12, width * 0.08);
  const southX = centreX + context.rng.float(-width * 0.08, width * 0.12);
  const westBend = { x: width * 0.27, z: westZ + context.rng.float(-3, 3) };
  const eastBend = { x: width * 0.74, z: eastZ + context.rng.float(-3, 3) };
  const northBend = { x: northX + context.rng.float(-3, 3), z: depth * 0.26 };
  const southBend = { x: southX + context.rng.float(-3, 3), z: depth * 0.74 };
  const roads: RoadSegment[] = [
    { id: "main-west", fromX: 0, fromZ: westZ, toX: westBend.x, toZ: westBend.z, width: roadWidth, hierarchy: "main" },
    { id: "main-market", fromX: westBend.x, fromZ: westBend.z, toX: centreX, toZ: centreZ, width: roadWidth, hierarchy: "main" },
    { id: "main-east", fromX: centreX, fromZ: centreZ, toX: eastBend.x, toZ: eastBend.z, width: roadWidth, hierarchy: "main" },
    { id: "main-gate", fromX: eastBend.x, fromZ: eastBend.z, toX: width, toZ: eastZ, width: roadWidth, hierarchy: "main" },
    { id: "cross-north", fromX: northX, fromZ: 0, toX: northBend.x, toZ: northBend.z, width: Math.max(2, roadWidth - 1), hierarchy: "cross" },
    { id: "cross-market", fromX: northBend.x, fromZ: northBend.z, toX: centreX, toZ: centreZ, width: Math.max(2, roadWidth - 1), hierarchy: "cross" },
    { id: "cross-south", fromX: centreX, fromZ: centreZ, toX: southBend.x, toZ: southBend.z, width: Math.max(2, roadWidth - 1), hierarchy: "cross" },
    { id: "cross-gate", fromX: southBend.x, fromZ: southBend.z, toX: southX, toZ: depth, width: Math.max(2, roadWidth - 1), hierarchy: "cross" },
    { id: "old-town-lane", fromX: westBend.x, fromZ: westBend.z, toX: width * 0.18, toZ: depth * 0.78, width: 1.7, hierarchy: "lane" },
  ];
  const landDepth = archetype === "harbor" ? depth - 7 : depth;
  scene.primitives.push(box("settlement-ground", 0, width / 2, 0, landDepth / 2, width, FLOOR_SLAB_METERS, landDepth, "earth", ["floor", "terrain", "settlement-ground"]));
  scene.primitives.push(...roads.map((road) => corridor(`settlement-road-${road.id}`, 0, road.fromX, road.fromZ, road.toX, road.toZ, FLOOR_SLAB_METERS, road.width, road.hierarchy === "main" ? "stone" : "earth", ["road", `${road.hierarchy}-road`])));
  scene.primitives.push(box("settlement-central-plaza", 0, centreX, FLOOR_SLAB_METERS + 0.01, centreZ, archetype === "city" ? 9 : 7, FLOOR_SLAB_METERS, archetype === "city" ? 9 : 7, "stone", ["floor", "plaza", "landmark"]));
  if (archetype === "harbor") {
    const waterZ = depth - 3;
    scene.primitives.push(box("settlement-harbor-water", 0, centreX, -0.08, waterZ, width - 4, 0.22, 5, "water", ["water", "harbor-edge"]));
    scene.primitives.push(corridor("settlement-quay", 0, 2, waterZ - 2.6, width - 2, waterZ - 2.6, FLOOR_SLAB_METERS, 2, "stone", ["road", "quay", "water-edge"]));
    scene.routes.push(createRoute("settlement-waterfront-route", "waterflow", [{ x: 2, z: waterZ, y: -0.08 }, { x: width - 2, z: waterZ, y: -0.08 }]));
    scene.tactical.push(tacticalFeature("settlement-quay-hazard", "hazard", centreX, waterZ, -0.08, 3, "The water edge is a dangerous fallback and a source of boats."));
  }

  const modules = distributeBuildings(context, width, depth, buildingCount, archetype, roads);
  for (const module of modules) {
    addBuildingModule(scene, module, context.rng.fork(module.id));
  }
  const plazaRoom = createRoom("settlement-plaza-room", "Central plaza", "circulation", 0, centreX, centreZ, archetype === "city" ? 9 : 7, archetype === "city" ? 9 : 7);
  scene.rooms.push(plazaRoom);
  for (const room of scene.rooms.filter((candidate) => candidate.id.endsWith("-room") && candidate.id !== plazaRoom.id)) connectRooms(scene.rooms, plazaRoom.id, room.id);

  scene.routes.push(
    createRoute("settlement-primary-route", "primary", [{ x: 0, z: westZ }, { x: westBend.x, z: westBend.z }, { x: centreX, z: centreZ }, { x: eastBend.x, z: eastBend.z }, { x: width, z: eastZ }]),
    createRoute("settlement-alternate-route", "alternate", [{ x: northX, z: 0 }, { x: northBend.x, z: northBend.z }, { x: centreX, z: centreZ }, { x: southBend.x, z: southBend.z }, { x: southX, z: depth }]),
  );
  scene.tactical.push(
    tacticalFeature("settlement-main-gate", "entrance", 1, westZ, 0, 2, "A major gate feeds the busiest route through the settlement."),
    tacticalFeature("settlement-plaza-choke", "chokepoint", centreX, centreZ, 0, 3, "The plaza is a natural meeting point and an exposed combat arena."),
  );
  if (archetype === "city" || archetype === "town") scene.tactical.push(tacticalFeature("settlement-landmark", "highGround", centreX + 4, centreZ - 3, 0, 2, "A civic landmark provides orientation and a defensible gathering point."));
  return scene;
}
