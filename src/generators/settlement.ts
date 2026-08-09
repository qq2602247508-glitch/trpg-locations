import type { GeneratedScene, GeneratorContext } from "../schema";
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
  tacticalFeature,
} from "./shared";
import { instantiateBuildingModule, type BuildingLot } from "./buildingModule";

export type SettlementArchetype = "village" | "town" | "city" | "harbor";

const SETTLEMENT_TERMS: Readonly<Record<SettlementArchetype, readonly string[]>> = {
  village: ["village", "hamlet", "market village", "村镇", "村庄", "村落", "渔猎村", "市场村"],
  town: ["town", "market town", "城镇", "集镇", "小镇"],
  city: ["city", "district", "urban", "deepwater", "深水城", "城市", "街区"],
  harbor: ["harbor", "harbour", "dock", "port", "港区", "港口", "港镇", "码头", "海港"],
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
  const densityFactor = 0.72 + request.density * 0.58;
  return {
    width: Math.round(base[0] * scale) + rng.int(-3, 4),
    depth: Math.round(base[1] * scale) + rng.int(-3, 4),
    buildings: Math.max(4, Math.round(base[2] * scale * densityFactor) + rng.int(-1, 2)),
  };
}

function addPerimeterDefenses(
  scene: GeneratedScene,
  archetype: SettlementArchetype,
  width: number,
  landDepth: number,
  gates: { westZ: number; eastZ: number; northX: number; southX: number },
  roadWidth: number,
): void {
  if (archetype !== "city" && archetype !== "town") return;
  const gap = roadWidth + 1.6;
  const wallHeight = feetToMeters(archetype === "city" ? 18 : 12);
  const segments: Array<{ id: string; x: number; z: number; width: number; depth: number }> = [];
  const splitVertical = (id: string, x: number, gateZ: number) => {
    const before = gateZ - gap / 2;
    const after = gateZ + gap / 2;
    if (before > 1) segments.push({ id: `${id}-north`, x, z: before / 2, width: 0.75, depth: before });
    if (landDepth - after > 1) segments.push({ id: `${id}-south`, x, z: (after + landDepth) / 2, width: 0.75, depth: landDepth - after });
  };
  const splitHorizontal = (id: string, z: number, gateX: number) => {
    const before = gateX - gap / 2;
    const after = gateX + gap / 2;
    if (before > 1) segments.push({ id: `${id}-west`, x: before / 2, z, width: before, depth: 0.75 });
    if (width - after > 1) segments.push({ id: `${id}-east`, x: (after + width) / 2, z, width: width - after, depth: 0.75 });
  };
  splitVertical("settlement-west-wall", 0.4, gates.westZ);
  splitVertical("settlement-east-wall", width - 0.4, gates.eastZ);
  splitHorizontal("settlement-north-wall", 0.4, gates.northX);
  splitHorizontal("settlement-south-wall", landDepth - 0.4, gates.southX);
  for (const segment of segments) {
    scene.primitives.push(box(segment.id, 0, segment.x, FLOOR_SLAB_METERS, segment.z, segment.width, wallHeight, segment.depth, "darkStone", ["fortification", "city-wall", "cover"]));
  }
  if (archetype === "city") {
    for (const [index, corner] of [[0.8, 0.8], [width - 0.8, 0.8], [0.8, landDepth - 0.8], [width - 0.8, landDepth - 0.8]].entries()) {
      scene.primitives.push(cylinder(`settlement-wall-tower-${index + 1}`, 0, corner[0] ?? 0.8, FLOOR_SLAB_METERS, corner[1] ?? 0.8, 2.4, wallHeight * 1.35, "darkStone", ["fortification", "corner-tower", "high-ground"]));
    }
  }
}

function connectDistrictGraph(scene: GeneratedScene, plazaId: string): void {
  const districtRooms = new Map<string, typeof scene.rooms>();
  for (const room of scene.rooms.filter((candidate) => candidate.id.startsWith("settlement-building-"))) {
    const district = room.name.split(" at ").at(-1) ?? "mixed";
    const group = districtRooms.get(district) ?? [];
    group.push(room);
    districtRooms.set(district, group);
  }
  const hubs: string[] = [];
  for (const group of districtRooms.values()) {
    const first = group[0];
    if (!first) continue;
    hubs.push(first.id);
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      if (previous && current) connectRooms(scene.rooms, previous.id, current.id);
    }
  }
  if (hubs[0]) connectRooms(scene.rooms, plazaId, hubs[0]);
  for (let index = 1; index < hubs.length; index += 1) {
    const previous = hubs[index - 1];
    const current = hubs[index];
    if (previous && current) connectRooms(scene.rooms, previous, current);
  }
  if (hubs.length > 2 && hubs.at(-1)) connectRooms(scene.rooms, hubs.at(-1) as string, plazaId);
}

function distributeBuildings(context: GeneratorContext, width: number, depth: number, count: number, archetype: SettlementArchetype, roads: readonly RoadSegment[]): BuildingLot[] {
  const { rng } = context;
  const buildings: BuildingLot[] = [];
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
      seed: `${context.request.seed}/building/${index + 1}`,
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
  addPerimeterDefenses(scene, archetype, width, landDepth, { westZ, eastZ, northX, southX }, roadWidth);

  const modules = distributeBuildings(context, width, depth, buildingCount, archetype, roads);
  for (const module of modules) {
    instantiateBuildingModule(scene, module, context.rng.fork(module.seed));
  }
  const plazaRoom = createRoom("settlement-plaza-room", "Central plaza", "circulation", 0, centreX, centreZ, archetype === "city" ? 9 : 7, archetype === "city" ? 9 : 7);
  scene.rooms.push(plazaRoom);
  connectDistrictGraph(scene, plazaRoom.id);

  scene.routes.push(
    createRoute("settlement-primary-route", "primary", [{ x: 0, z: westZ }, { x: westBend.x, z: westBend.z }, { x: centreX, z: centreZ }, { x: eastBend.x, z: eastBend.z }, { x: width, z: eastZ }], { purpose: "crowd", traffic: 0.95, schedule: "day" }),
    createRoute("settlement-alternate-route", "alternate", [{ x: northX, z: 0 }, { x: northBend.x, z: northBend.z }, { x: centreX, z: centreZ }, { x: southBend.x, z: southBend.z }, { x: southX, z: archetype === "harbor" ? landDepth : depth }], { purpose: "crowd", traffic: 0.72, schedule: "all" }),
    createRoute("settlement-market-circulation", "alternate", [{ x: westBend.x, z: westBend.z }, { x: centreX - 3, z: centreZ - 3 }, { x: centreX + 3, z: centreZ - 3 }, { x: eastBend.x, z: eastBend.z }], { purpose: "crowd", traffic: 0.84, schedule: "day" }),
    createRoute("settlement-service-flow", "alternate", [{ x: width * 0.18, z: depth * 0.78 }, { x: westBend.x, z: westBend.z }, { x: centreX, z: centreZ }], { purpose: "service", traffic: 0.5, schedule: "all" }),
  );
  scene.tactical.push(
    tacticalFeature("settlement-main-gate", "entrance", 1, westZ, 0, 2, "A major gate feeds the busiest route through the settlement."),
    tacticalFeature("settlement-plaza-choke", "chokepoint", centreX, centreZ, 0, 3, "The plaza is a natural meeting point and an exposed combat arena."),
  );
  if (archetype === "harbor") {
    scene.routes.push(createRoute("settlement-cargo-flow", "alternate", [{ x: 2, z: depth - 5.6 }, { x: southX, z: landDepth - 0.5 }, { x: southBend.x, z: southBend.z }, { x: centreX, z: centreZ }], { purpose: "service", traffic: 0.88, schedule: "day" }));
    scene.tactical.push(tacticalFeature("settlement-customs-choke", "chokepoint", southX, landDepth - 0.5, 0, 2, "Cargo handlers, customs officers, and carts create a predictable waterfront bottleneck."));
  }
  if (archetype === "city" || archetype === "town") {
    const inset = 1;
    scene.routes.push(createRoute("settlement-night-watch", "alternate", [
      { x: inset, z: inset },
      { x: width - inset, z: inset },
      { x: width - inset, z: landDepth - inset },
      { x: inset, z: landDepth - inset },
      { x: inset, z: inset },
    ], { purpose: "movement", traffic: 0.42, schedule: "night" }));
    scene.tactical.push(tacticalFeature("settlement-night-watch-choke", "chokepoint", inset, westZ, 0, 1, "Night patrols repeatedly pass this wall-side approach."));
  }
  if (archetype === "city" || archetype === "town") scene.tactical.push(tacticalFeature("settlement-landmark", "highGround", centreX + 4, centreZ - 3, 0, 2, "A civic landmark provides orientation and a defensible gathering point."));
  return scene;
}
