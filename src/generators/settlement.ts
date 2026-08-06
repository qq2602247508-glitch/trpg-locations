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
  for (const archetype of Object.keys(SETTLEMENT_TERMS) as SettlementArchetype[]) {
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

function distributeBuildings(context: GeneratorContext, width: number, depth: number, count: number, archetype: SettlementArchetype): SettlementBuilding[] {
  const { rng } = context;
  const buildings: SettlementBuilding[] = [];
  const districts = archetype === "harbor" ? ["quayside", "market", "warehouse-row", "old-town"] : archetype === "city" ? ["civic", "market", "residential", "craft", "old-town"] : archetype === "village" ? ["green", "farmstead", "crossroads"] : ["market", "residential", "craft", "gate"];
  const columns = Math.max(2, Math.ceil(Math.sqrt(count * width / Math.max(1, depth))));
  const rows = Math.max(2, Math.ceil(count / columns));
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const district = districts[index % districts.length] ?? "residential";
    const xBand = width / columns;
    const zBand = depth / rows;
    const kind = district === "warehouse-row" ? "warehouse" : district === "civic" ? (index % 2 === 0 ? "manor" : "shrine") : index % 11 === 0 ? "tower" : index % 7 === 0 ? "tavern" : index % 5 === 0 ? "shrine" : "home";
    const widthCells = kind === "warehouse" ? rng.int(6, 10) : kind === "manor" ? rng.int(7, 11) : kind === "tower" ? rng.int(4, 6) : rng.int(4, 7);
    const depthCells = kind === "warehouse" ? rng.int(4, 7) : kind === "manor" ? rng.int(6, 9) : kind === "tower" ? rng.int(4, 6) : rng.int(4, 7);
    buildings.push({
      id: `settlement-building-${index + 1}`,
      kind,
      x: Math.min(width - 2, Math.max(2, xBand * (column + 0.5) + rng.float(-xBand * 0.16, xBand * 0.16))),
      z: Math.min(depth - 2, Math.max(2, zBand * (row + 0.5) + rng.float(-zBand * 0.16, zBand * 0.16))),
      width: widthCells,
      depth: depthCells,
      rotation: rng.float(-0.18, 0.18),
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
  const avenueZ = centreZ + context.rng.float(-2, 2);
  const crossX = centreX + context.rng.float(-2, 2);
  const roadWidth = archetype === "city" ? 4 : 3;

  scene.primitives.push(
    corridor("settlement-main-avenue", 0, 0, avenueZ, width, avenueZ + context.rng.float(-2, 2), FLOOR_SLAB_METERS, roadWidth, "earth", ["road", "main-road"]),
    corridor("settlement-cross-street", 0, crossX, 0, crossX + context.rng.float(-2, 2), depth, FLOOR_SLAB_METERS + 0.01, Math.max(2, roadWidth - 1), "earth", ["road", "cross-street"]),
    box("settlement-central-plaza", 0, centreX, FLOOR_SLAB_METERS, centreZ, archetype === "city" ? 9 : 7, FLOOR_SLAB_METERS, archetype === "city" ? 9 : 7, "stone", ["floor", "plaza", "landmark"]),
  );
  if (archetype === "harbor") {
    const waterZ = depth - 3;
    scene.primitives.push(box("settlement-harbor-water", 0, centreX, -0.08, waterZ, width - 4, 0.22, 5, "water", ["water", "harbor-edge"]));
    scene.primitives.push(corridor("settlement-quay", 0, 2, waterZ - 2.6, width - 2, waterZ - 2.6, FLOOR_SLAB_METERS, 2, "stone", ["road", "quay", "water-edge"]));
    scene.routes.push(createRoute("settlement-waterfront-route", "waterflow", [{ x: 2, z: waterZ, y: -0.08 }, { x: width - 2, z: waterZ, y: -0.08 }]));
    scene.tactical.push(tacticalFeature("settlement-quay-hazard", "hazard", centreX, waterZ, -0.08, 3, "The water edge is a dangerous fallback and a source of boats."));
  }

  const modules = distributeBuildings(context, width - 4, depth - 4, buildingCount, archetype);
  for (const module of modules) {
    module.x += 2;
    module.z += 2;
    addBuildingModule(scene, module, context.rng.fork(module.id));
  }
  const plazaRoom = createRoom("settlement-plaza-room", "Central plaza", "circulation", 0, centreX, centreZ, archetype === "city" ? 9 : 7, archetype === "city" ? 9 : 7);
  scene.rooms.push(plazaRoom);
  for (const room of scene.rooms.filter((candidate) => candidate.id.endsWith("-room") && candidate.id !== plazaRoom.id)) connectRooms(scene.rooms, plazaRoom.id, room.id);

  scene.routes.push(
    createRoute("settlement-primary-route", "primary", [{ x: 0, z: avenueZ }, { x: centreX, z: centreZ }, { x: width, z: avenueZ + 1 }]),
    createRoute("settlement-alternate-route", "alternate", [{ x: crossX, z: 0 }, { x: centreX, z: centreZ }, { x: crossX + 1, z: depth }]),
  );
  scene.tactical.push(
    tacticalFeature("settlement-main-gate", "entrance", 1, avenueZ, 0, 2, "A major gate feeds the busiest route through the settlement."),
    tacticalFeature("settlement-plaza-choke", "chokepoint", centreX, centreZ, 0, 3, "The plaza is a natural meeting point and an exposed combat arena."),
  );
  if (archetype === "city" || archetype === "town") scene.tactical.push(tacticalFeature("settlement-landmark", "highGround", centreX + 4, centreZ - 3, 0, 2, "A civic landmark provides orientation and a defensible gathering point."));
  return scene;
}
