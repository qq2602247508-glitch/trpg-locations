import type {
  BuildingInstance,
  GeneratedScene,
  GeneratorContext,
  MaterialKey,
  SettlementBuildingKind,
  SettlementBuildingProgram,
} from "../schema";
import {
  FLOOR_SLAB_METERS,
  box,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  cylinder,
  feetToMeters,
  primitive,
  stairs,
  tacticalFeature,
} from "./shared";
import { planBuildingEnvelope, type BuildingEnvelopeProgram } from "./buildingEnvelope";

export interface BuildingLot {
  id: string;
  kind: SettlementBuildingKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  district: string;
  seed: string;
  lod?: BuildingInstance["detailLevel"];
  parcelId?: string;
  frontageRoadId?: string;
  entrance?: { x: number; z: number };
  baseY?: number;
  state?: "active" | "abandoned" | "flooded" | "temporary";
}

function localPoint(lot: BuildingLot, localX: number, localZ: number): { x: number; z: number } {
  const cosine = Math.cos(lot.rotation);
  const sine = Math.sin(lot.rotation);
  return {
    x: lot.x + localX * cosine + localZ * sine,
    z: lot.z - localX * sine + localZ * cosine,
  };
}

function profile(kind: SettlementBuildingKind, rng: GeneratorContext["rng"]): { floors: number; floorHeightFeet: number[]; material: MaterialKey } {
  const floors = kind === "tower" ? rng.int(3, 5)
    : kind === "warehouse" ? rng.int(1, 2)
      : kind === "shrine" ? rng.int(1, 2)
        : kind === "home" ? rng.int(1, 3)
          : kind === "factory" || kind === "barn" ? rng.int(1, 2)
            : rng.int(2, 3);
  const range: readonly [number, number] = kind === "warehouse" ? [14, 18]
    : kind === "shrine" ? [14, 20]
      : kind === "tower" ? [10, 13]
        : kind === "tavern" ? [10, 12]
          : kind === "manor" ? [11, 14]
            : [9, 11];
  const floorHeightFeet = Array.from({ length: floors }, () => rng.int(range[0], range[1]));
  const material: MaterialKey = kind === "warehouse" || kind === "tower" || kind === "factory" ? "darkStone"
    : kind === "shrine" ? "stone"
      : kind === "tavern" ? "wood"
        : "plaster";
  return { floors, floorHeightFeet, material };
}

function fullInteriorLabels(kind: SettlementBuildingKind): { publicName: string; serviceName: string; upperName: string; basementName: string; tags: string[] } {
  if (kind === "tavern") return { publicName: "Taproom and public hearth", serviceName: "Kitchen and service store", upperName: "Guest rooms", basementName: "Ale cellar", tags: ["taproom", "kitchen", "guest-room", "cellar"] };
  if (kind === "shrine") return { publicName: "Processional chapel", serviceName: "Vestry", upperName: "Bell loft", basementName: "Burial crypt", tags: ["nave", "vestry", "bell-platform", "crypt"] };
  if (kind === "warehouse" || kind === "factory") return { publicName: "Loading and production hall", serviceName: "Secured stores", upperName: "Foreman gallery", basementName: "Service cellar", tags: ["loading-hall", "storage", "catwalk", "underground"] };
  if (kind === "guild" || kind === "blacksmith") return { publicName: "Guild reception hall", serviceName: "Working craft hall", upperName: "Records and meeting loft", basementName: "Material vault", tags: ["guild-hall", "workshop", "archive", "vault"] };
  if (kind === "clinic") return { publicName: "Waiting and reception", serviceName: "Treatment room", upperName: "Private ward", basementName: "Medical store", tags: ["front-desk", "treatment", "ward", "underground"] };
  if (kind === "tower") return { publicName: "Watch entry", serviceName: "Guard store", upperName: "Watch chamber", basementName: "Supply vault", tags: ["guard-post", "storage", "high-ground", "underground"] };
  if (kind === "manor") return { publicName: "Great hall", serviceName: "Domestic service wing", upperName: "Family chambers", basementName: "Family cellar", tags: ["great-hall", "service-route", "private", "underground"] };
  return { publicName: "Living room", serviceName: "Store and work room", upperName: "Sleeping loft", basementName: "Root cellar", tags: ["living", "service", "loft", "cellar"] };
}

function planSettlementBuildingProgram(lot: BuildingLot, generated: ReturnType<typeof profile>, envelope: BuildingEnvelopeProgram): SettlementBuildingProgram {
  const labels = fullInteriorLabels(lot.kind);
  const primary = envelope.parts[0];
  const rooms: SettlementBuildingProgram["rooms"] = [];
  if (primary) rooms.push({ id: "ground-public", name: labels.publicName, level: 0, role: "public", centerLocalCells: primary.offset, sizeCells: { x: primary.size.x * 0.68, z: primary.size.z * 0.78 } });
  for (const [index, extension] of envelope.parts.slice(1).entries()) rooms.push({ id: `ground-service-${index + 1}`, name: index === 0 ? labels.serviceName : `${labels.serviceName} annex ${index + 1}`, level: 0, role: "service", centerLocalCells: extension.offset, sizeCells: { x: extension.size.x * 0.84, z: extension.size.z * 0.8 } });
  const representedFloors = Math.min(generated.floors, 3);
  for (let level = 1; level < representedFloors; level += 1) rooms.push({ id: `upper-${level}`, name: `${labels.upperName} ${level}`, level, role: lot.kind === "tower" ? "combat" : "private", centerLocalCells: { x: (primary?.offset.x ?? 0) + level * 0.08, z: (primary?.offset.z ?? 0) - level * 0.06 }, sizeCells: { x: Math.max(3, (primary?.size.x ?? lot.width) * (0.82 - level * 0.08)), z: Math.max(3, (primary?.size.z ?? lot.depth) * (0.78 - level * 0.07)) } });
  rooms.push({ id: "basement", name: labels.basementName, level: 3, role: "service", centerLocalCells: { x: (primary?.offset.x ?? 0) - lot.width * 0.08, z: (primary?.offset.z ?? 0) + lot.depth * 0.08 }, sizeCells: { x: Math.max(3, (primary?.size.x ?? lot.width) * 0.62), z: Math.max(3, (primary?.size.z ?? lot.depth) * 0.55) } });
  const connections: SettlementBuildingProgram["connections"] = [];
  for (const room of rooms.filter((candidate) => candidate.level === 0 && candidate.id !== "ground-public")) connections.push({ from: "ground-public", to: room.id, kind: "door" });
  const uppers = rooms.filter((candidate) => candidate.id.startsWith("upper-"));
  for (const [index, room] of uppers.entries()) connections.push({ from: index === 0 ? "ground-public" : uppers[index - 1]?.id ?? "ground-public", to: room.id, kind: "stair" });
  connections.push({ from: rooms.find((room) => room.id.startsWith("ground-service"))?.id ?? "ground-public", to: "basement", kind: "cellar-stair" });
  const verticalCores: SettlementBuildingProgram["verticalCores"] = [
    ...uppers.map((room, index) => ({ id: `main-stair-${index + 1}`, fromLevel: index, toLevel: index + 1, positionLocalCells: { x: lot.width * 0.26, z: lot.depth * 0.16 }, kind: "stair" as const })),
    { id: "cellar-stair", fromLevel: 3, toLevel: 0, positionLocalCells: { x: -lot.width * 0.26, z: lot.depth * 0.12 }, kind: "stair" as const },
  ];
  return { version: 1, archetype: lot.kind, envelopeVariant: envelope.variant, rooms, connections, verticalCores };
}

function summarizeBuildingProgram(program: SettlementBuildingProgram, tags: string[]): NonNullable<BuildingInstance["buildingProgram"]> {
  return {
    archetype: program.archetype,
    requiredFeatures: tags,
    roomCount: program.rooms.length,
    connectionCount: program.connections.length,
    levels: new Set(program.rooms.map((room) => room.level)).size,
    topology: program.archetype === "tower" ? "vertical" : program.archetype === "manor" ? "courtyard" : program.archetype === "shrine" ? "winged" : "composite",
  };
}

function instantiateFullInterior(scene: GeneratedScene, lot: BuildingLot, generated: ReturnType<typeof profile>, envelope: BuildingEnvelopeProgram, interiorProgram: SettlementBuildingProgram): BuildingInstance {
  const baseY = lot.baseY ?? FLOOR_SLAB_METERS;
  const width = Math.max(5.2, lot.width * 0.9);
  const depth = Math.max(5, lot.depth * 0.86);
  const wallHeight = feetToMeters(generated.floorHeightFeet[0] ?? 10);
  const upperY = baseY + wallHeight;
  // Keep the basement shell fully below the exterior grade. At exactly
  // 10 feet the 9-foot basement wall can protrude through a raised site pad,
  // making a surface trail look like it crosses an underground wall.
  const basementY = baseY - feetToMeters(12);
  const tags = ["settlement-building", "independent-building-module", "full-interior", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`];
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const addRotatedBox = (id: string, x: number, z: number, w: number, h: number, d: number, y: number, material: MaterialKey, extra: string[] = [], level = 0) => {
    const p = point(x, z);
    scene.primitives.push(box(`${lot.id}-${id}`, level, p.x, y, p.z, w, h, d, material, [...tags, ...extra], lot.rotation));
  };
  addRotatedBox("floor", 0, 0, width, FLOOR_SLAB_METERS, depth, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "program-room"]);
  addRotatedBox("north-wall", 0, -depth / 2, width, wallHeight, 0.22, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("west-wall", -width / 2, 0, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("east-wall", width / 2, 0, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("south-wall-left", -width * 0.32, depth / 2, width * 0.34, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "building-shell"]);
  addRotatedBox("south-wall-right", width * 0.32, depth / 2, width * 0.34, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "building-shell"]);
  addRotatedBox("partition-a", -width * 0.2, 0, 0.22, wallHeight, depth * 0.36, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  addRotatedBox("partition-b", -width * 0.2, -depth * 0.38, 0.22, wallHeight, depth * 0.18, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  const upperWidth = width * 0.72;
  const upperDepth = depth * 0.64;
  addRotatedBox("upper-floor", 0.08, -0.05, upperWidth, FLOOR_SLAB_METERS, upperDepth, upperY, "wood", ["floor", "standable", "upper-floor"], 1);
  addRotatedBox("upper-north", 0.08, -upperDepth / 2 - 0.05, upperWidth, wallHeight * 0.82, 0.2, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  addRotatedBox("upper-west", -upperWidth / 2 + 0.08, -0.05, 0.2, wallHeight * 0.82, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  addRotatedBox("upper-east", upperWidth / 2 + 0.08, -0.05, 0.2, wallHeight * 0.82, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  const roofP = point(0.08, -0.05);
  scene.primitives.push(primitive(`${lot.id}-gable-roof`, "gable", 2, roofP.x, upperY + wallHeight * 0.82, roofP.z, (upperDepth + 1) * 1.524, feetToMeters(5.5), (upperWidth + 1) * 1.524, "roof", [...tags, "roof", "pitched-roof", "standable"], lot.rotation + Math.PI / 2));
  addRotatedBox("basement-floor", 0, 0, width * 0.64, FLOOR_SLAB_METERS, depth * 0.58, basementY, "stone", ["floor", "underground", "standable"], 3);
  addRotatedBox("basement-north", 0, -depth * 0.29, width * 0.64, feetToMeters(9), 0.22, basementY, "darkStone", ["wall", "underground", "opening"], 3);
  addRotatedBox("basement-south", 0, depth * 0.29, width * 0.64, feetToMeters(9), 0.22, basementY, "darkStone", ["wall", "underground", "door-frame"], 3);
  const basementDepth = depth * 0.58;
  const cellarOpeningCenter = depth * 0.08;
  const cellarOpeningWidth = Math.min(1.5, basementDepth * 0.28);
  const westNorthDepth = basementDepth / 2 + cellarOpeningCenter - cellarOpeningWidth / 2;
  const westSouthDepth = basementDepth / 2 - cellarOpeningCenter - cellarOpeningWidth / 2;
  addRotatedBox("basement-west-north", -width * 0.32, (-basementDepth / 2 + cellarOpeningCenter - cellarOpeningWidth / 2) / 2, 0.22, feetToMeters(9), westNorthDepth, basementY, "darkStone", ["wall", "underground", "door-frame"], 3);
  addRotatedBox("basement-west-south", -width * 0.32, (cellarOpeningCenter + cellarOpeningWidth / 2 + basementDepth / 2) / 2, 0.22, feetToMeters(9), westSouthDepth, basementY, "darkStone", ["wall", "underground", "door-frame"], 3);
  addRotatedBox("basement-east", width * 0.32, 0, 0.22, feetToMeters(9), depth * 0.58, basementY, "darkStone", ["wall", "underground"], 3);
  addRotatedBox("basement-store", width * 0.12, -depth * 0.08, Math.max(1.1, width * 0.18), feetToMeters(4), Math.max(1, depth * 0.16), basementY + FLOOR_SLAB_METERS, "wood", ["underground", "storage", "cover"], 3);
  const stairP = point(width * 0.28, depth * 0.08);
  scene.primitives.push(stairs(`${lot.id}-upper-stair`, 0, stairP.x, baseY, stairP.z, 1.2, wallHeight, 4.2, "wood", [...tags, "building-stair", "vertical-opening"], lot.rotation));
  const cellarP = point(-width * 0.3, depth * 0.08);
  scene.primitives.push(stairs(`${lot.id}-cellar-stair`, 3, cellarP.x, basementY, cellarP.z, 1.2, baseY - basementY, 4.2, "stone", [...tags, "building-stair", "vertical-opening", "underground"], lot.rotation));
  const labels = fullInteriorLabels(lot.kind);
  const publicP = point(width * 0.13, 0);
  const serviceP = point(-width * 0.36, 0);
  const upperP = point(0.08, -0.05);
  const publicId = `core-${lot.id}-public`; const serviceId = `core-${lot.id}-service`; const upperId = `core-${lot.id}-upper`; const basementId = `core-${lot.id}-basement`;
  const rootId = `${lot.id}-room`;
  scene.rooms.push(
    createRoom(rootId, `${lot.kind} at ${lot.district}`, "circulation", 0, lot.x, lot.z, lot.width, lot.depth, baseY),
    createRoom(publicId, labels.publicName, "public", 0, publicP.x, publicP.z, width * 0.62, depth * 0.78, baseY),
    createRoom(serviceId, labels.serviceName, "service", 0, serviceP.x, serviceP.z, width * 0.28, depth * 0.78, baseY),
    createRoom(upperId, labels.upperName, "private", 1, upperP.x, upperP.z, upperWidth, upperDepth, upperY),
    createRoom(basementId, labels.basementName, "service", 3, lot.x, lot.z, width * 0.64, depth * 0.58, basementY),
  );
  connectRooms(scene.rooms, rootId, publicId); connectRooms(scene.rooms, publicId, serviceId); connectRooms(scene.rooms, publicId, upperId); connectRooms(scene.rooms, serviceId, basementId);
  const frontDoorP = point(0, depth / 2);
  scene.routes.push(
    createRoute(`${lot.id}-entry-route`, "primary", [{ x: lot.entrance?.x ?? frontDoorP.x, z: lot.entrance?.z ?? frontDoorP.z, y: baseY }, { x: frontDoorP.x, z: frontDoorP.z, y: baseY }, { x: publicP.x, z: publicP.z, y: baseY }]),
    createRoute(`${lot.id}-vertical-route`, "vertical", [{ x: stairP.x, z: stairP.z, y: baseY }, { x: upperP.x, z: upperP.z, y: upperY }]),
    createRoute(`${lot.id}-basement-route`, "vertical", [
      { x: serviceP.x, z: serviceP.z, y: baseY },
      { x: cellarP.x, z: cellarP.z, y: baseY },
      { x: cellarP.x, z: cellarP.z, y: basementY },
    ]),
  );
  addRotatedBox("furnishing-public", width * 0.15, 0, Math.max(1.5, width * 0.28), feetToMeters(3), 1.2, baseY + FLOOR_SLAB_METERS, lot.kind === "clinic" ? "metal" : "wood", [labels.tags[0] ?? "furniture", "cover"]);
  addRotatedBox("furnishing-service", -width * 0.34, -depth * 0.12, Math.max(1.1, width * 0.16), feetToMeters(4), 1.1, baseY + FLOOR_SLAB_METERS, lot.kind === "factory" || lot.kind === "blacksmith" ? "metal" : "wood", [labels.tags[1] ?? "service", "cover"]);
  for (const extension of envelope.parts.slice(1)) {
    const extensionHeight = wallHeight * Math.max(0.52, extension.heightRatio);
    addRotatedBox(`envelope-${extension.id}-floor`, extension.offset.x, extension.offset.z, extension.size.x, FLOOR_SLAB_METERS, extension.size.z, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "envelope-part"]);
    addRotatedBox(`envelope-${extension.id}-back`, extension.offset.x, extension.offset.z - extension.size.z / 2, extension.size.x, extensionHeight, 0.2, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
    addRotatedBox(`envelope-${extension.id}-side`, extension.offset.x + extension.size.x / 2, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
  }
  scene.tactical.push(tacticalFeature(`${lot.id}-interior-choke`, "chokepoint", lot.x, lot.z + depth * 0.34, baseY, 1, "The independently generated entrance and internal partition form a defensible threshold."));
  const instance: BuildingInstance = {
    id: lot.id, archetype: lot.kind, seed: lot.seed, district: lot.district,
    positionCells: { x: lot.x, z: lot.z }, footprintCells: { x: lot.width, z: lot.depth }, rotationY: lot.rotation,
    floors: 4, floorHeightFeet: [generated.floorHeightFeet[0] ?? 10, generated.floorHeightFeet[1] ?? 9, 8, 10], detailLevel: "full-interior",
    baseYMeters: baseY,
    exteriorHeightMeters: wallHeight * 1.82,
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}), ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}), ...(lot.entrance ? { entranceCells: lot.entrance } : {}),
    buildingProgram: summarizeBuildingProgram(interiorProgram, labels.tags),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}

function addFocusInteriorBlueprint(scene: GeneratedScene, lot: BuildingLot, generated: ReturnType<typeof profile>, envelope: BuildingEnvelopeProgram, interiorProgram: SettlementBuildingProgram): void {
  const baseY = lot.baseY ?? FLOOR_SLAB_METERS;
  const primary = envelope.parts[0];
  if (!primary) return;
  const tags = ["settlement-building", "independent-building-module", "focus-interior", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`];
  const point = (x: number, z: number) => localPoint(lot, x, z);
  let y = baseY;
  for (let level = 0; level < Math.min(generated.floors, 3); level += 1) {
    const floorHeight = feetToMeters(generated.floorHeightFeet[level] ?? 10);
    const shrink = Math.max(0.62, 1 - level * 0.1);
    const width = Math.max(3.8, primary.size.x * shrink);
    const depth = Math.max(3.8, primary.size.z * shrink);
    const center = point(primary.offset.x + level * 0.08, primary.offset.z - level * 0.06);
    const add = (id: string, lx: number, lz: number, w: number, h: number, d: number, material: MaterialKey, extra: string[] = []) => {
      const position = point(primary.offset.x + level * 0.08 + lx, primary.offset.z - level * 0.06 + lz);
      scene.primitives.push(box(`${lot.id}-focus-${level}-${id}`, level, position.x, y, position.z, w, h, d, material, [...tags, ...extra], lot.rotation));
    };
    const authoredRoom = interiorProgram.rooms.find((room) => room.level === level);
    add("floor", 0, 0, width, FLOOR_SLAB_METERS, depth, "wood", ["floor", "standable", "program-room", ...(authoredRoom ? [`program-room:${authoredRoom.id}`] : [])]);
    add("north", 0, -depth / 2, width, floorHeight, 0.18, generated.material, ["wall", "building-shell"]);
    add("west", -width / 2, 0, 0.18, floorHeight, depth, generated.material, ["wall", "building-shell"]);
    add("east", width / 2, 0, 0.18, floorHeight, depth, generated.material, ["wall", "building-shell", "focus-cutaway"]);
    add("south-left", -width * 0.31, depth / 2, width * 0.34, floorHeight, 0.18, generated.material, ["wall", "door-frame", "focus-cutaway"]);
    add("south-right", width * 0.31, depth / 2, width * 0.34, floorHeight, 0.18, generated.material, ["wall", "door-frame", "focus-cutaway"]);
    const partitionX = level % 2 === 0 ? -width * 0.12 : width * 0.17;
    add("partition", partitionX, -depth * 0.08, 0.18, floorHeight * 0.92, depth * 0.62, generated.material, ["wall", "room-partition", "door-frame"]);
    if (level > 0 || generated.floors > 1) {
      const stair = point(primary.offset.x + width * 0.28, primary.offset.z + depth * 0.18);
      scene.primitives.push(stairs(`${lot.id}-focus-stair-${level}`, level, stair.x, y, stair.z, 1.05, floorHeight, Math.max(2.8, depth * 0.42), "wood", [...tags, "building-stair", "vertical-opening", "standable"], lot.rotation));
    }
    if (level === 0) scene.primitives.push(box(`${lot.id}-focus-furniture`, level, center.x + width * 0.12, y + FLOOR_SLAB_METERS, center.z, Math.max(1.2, width * 0.24), feetToMeters(3.2), 1.1, lot.kind === "factory" || lot.kind === "clinic" ? "metal" : "wood", [...tags, "furniture", "cover"], lot.rotation));
    y += floorHeight;
  }
  const cellarY = baseY - feetToMeters(9);
  const cellarLocalX = primary.offset.x - primary.size.x * 0.08;
  const cellarLocalZ = primary.offset.z + primary.size.z * 0.08;
  const cellarWidth = primary.size.x * 0.62;
  const cellarDepth = primary.size.z * 0.55;
  const cellar = point(cellarLocalX, cellarLocalZ);
  const cellarStair = point(cellarLocalX - primary.size.x * 0.22, cellarLocalZ);
  const cellarWallHeight = feetToMeters(8);
  const addCellarWall = (id: string, localX: number, localZ: number, widthCells: number, depthCells: number, extra: string[] = []) => {
    const position = point(localX, localZ);
    scene.primitives.push(box(`${lot.id}-focus-cellar-${id}`, 3, position.x, cellarY, position.z, widthCells, cellarWallHeight, depthCells, "darkStone", [...tags, "wall", "underground", ...extra], lot.rotation));
  };
  scene.primitives.push(
    box(`${lot.id}-focus-cellar-floor`, 3, cellar.x, cellarY, cellar.z, cellarWidth, FLOOR_SLAB_METERS, cellarDepth, "stone", [...tags, "floor", "underground", "standable"], lot.rotation),
    stairs(`${lot.id}-focus-cellar-stair`, 3, cellarStair.x, cellarY, cellarStair.z, 1.05, baseY - cellarY, Math.max(3, primary.size.z * 0.45), "stone", [...tags, "building-stair", "vertical-opening", "underground", "standable"], lot.rotation),
  );
  addCellarWall("north", cellarLocalX, cellarLocalZ - cellarDepth / 2, cellarWidth, 0.18);
  addCellarWall("west", cellarLocalX - cellarWidth / 2, cellarLocalZ, 0.18, cellarDepth);
  addCellarWall("east", cellarLocalX + cellarWidth / 2, cellarLocalZ, 0.18, cellarDepth, ["focus-cutaway"]);
  addCellarWall("south", cellarLocalX, cellarLocalZ + cellarDepth / 2, cellarWidth, 0.18, ["focus-cutaway"]);
}

/** Independent exterior grammar consumed by settlement planners. */
export function instantiateBuildingModule(scene: GeneratedScene, lot: BuildingLot, rng: GeneratorContext["rng"]): BuildingInstance {
  const generated = profile(lot.kind, rng);
  const envelope = planBuildingEnvelope(lot.kind, lot.width, lot.depth, rng.fork("building-envelope"));
  const interiorProgram = planSettlementBuildingProgram(lot, generated, envelope);
  if (lot.lod === "full-interior") return instantiateFullInterior(scene, lot, generated, envelope, interiorProgram);
  const totalHeight = feetToMeters(generated.floorHeightFeet.reduce((sum, height) => sum + height, 0));
  const y = lot.baseY ?? FLOOR_SLAB_METERS;
  const tags = ["settlement-building", "independent-building-module", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`];
  for (const [partIndex, envelopePart] of envelope.parts.entries()) {
    const point = localPoint(lot, envelopePart.offset.x, envelopePart.offset.z);
    const damaged = lot.state === "abandoned" && partIndex === envelope.parts.length - 1;
    const height = totalHeight * envelopePart.heightRatio * (damaged ? 0.56 : 1);
    const partTags = [...tags, "building-shell", "envelope-part", `module-part:${envelopePart.id}`, `envelope-variant:${envelope.variant}`, `lod:${lot.lod ?? "facade"}`, ...(lot.state && lot.state !== "active" ? [`building-state:${lot.state}`] : []), ...(damaged ? ["collapsed", "broken-roofline"] : [])];
    if (envelopePart.shape === "cylinder") scene.primitives.push(cylinder(`${lot.id}-${envelopePart.id}`, 0, point.x, y, point.z, Math.min(envelopePart.size.x, envelopePart.size.z), height, generated.material, partTags));
    else scene.primitives.push(box(`${lot.id}-${envelopePart.id}`, 0, point.x, y, point.z, envelopePart.size.x, height, envelopePart.size.z, generated.material, partTags, lot.rotation));
    if (damaged) {
      scene.primitives.push(box(`${lot.id}-${envelopePart.id}-rubble`, 0, point.x + 0.4, y, point.z + 0.35, Math.max(1, envelopePart.size.x * 0.48), feetToMeters(2.2), Math.max(1, envelopePart.size.z * 0.42), "rock", [...partTags, "rubble", "cover"], lot.rotation + 0.18));
    } else if (envelopePart.roof === "spire") {
      scene.primitives.push(primitive(`${lot.id}-${envelopePart.id}-spire`, "cone", 0, point.x, y + height, point.z, envelopePart.size.x * 1.524, Math.max(feetToMeters(4), height * 0.42), envelopePart.size.z * 1.524, "roof", [...partTags, "roof", "spire"], lot.rotation));
    } else if (envelopePart.roof === "gable" || envelopePart.roof === "hip") {
      scene.primitives.push(primitive(`${lot.id}-${envelopePart.id}-roof`, "gable", 0, point.x, y + height, point.z, envelopePart.size.z * 1.04 * 1.524, Math.max(feetToMeters(3), height * 0.16), envelopePart.size.x * 1.06 * 1.524, "roof", [...partTags, "roof", envelopePart.roof === "hip" ? "hip-roof" : "pitched-roof"], lot.rotation + Math.PI / 2));
    } else {
      scene.primitives.push(box(`${lot.id}-${envelopePart.id}-roof`, 0, point.x, y + height, point.z, envelopePart.size.x * 1.03, 0.24, envelopePart.size.z * 1.03, "roof", [...partTags, "roof", "flat-roof"], lot.rotation));
    }
  }

  if (lot.lod !== "mass") {
    const entrance = localPoint(lot, 0, lot.depth * 0.42);
    scene.primitives.push(box(`${lot.id}-entrance-canopy`, 0, entrance.x, y, entrance.z, Math.min(2.4, lot.width * 0.38), feetToMeters(1), 1, lot.kind === "warehouse" || lot.kind === "factory" ? "metal" : "wood", [...tags, "entrance-detail", "canopy"], lot.rotation));
    const primary = envelope.parts[0];
    if (primary) {
      const facadeZ = primary.offset.z + primary.size.z / 2 + 0.04;
      const door = localPoint(lot, primary.offset.x, facadeZ);
      const cargoDoor = lot.kind === "warehouse" || lot.kind === "factory" || lot.kind === "barn";
      scene.primitives.push(box(`${lot.id}-front-door`, 0, door.x, y + FLOOR_SLAB_METERS, door.z, cargoDoor ? Math.min(2.6, primary.size.x * 0.38) : 0.86, cargoDoor ? feetToMeters(8) : feetToMeters(6.5), 0.14, cargoDoor ? "metal" : "wood", [...tags, "front-door", "entrance", "facade-detail"], lot.rotation));
      const windowCount = lot.kind === "warehouse" || lot.kind === "factory" ? 2 : lot.kind === "shrine" ? 3 : 4;
      for (let index = 0; index < windowCount; index += 1) {
        const localX = primary.offset.x + primary.size.x * (-0.36 + index * (0.72 / Math.max(1, windowCount - 1)));
        if (Math.abs(localX - primary.offset.x) < 0.42) continue;
        const windowPoint = localPoint(lot, localX, facadeZ + 0.01);
        scene.primitives.push(box(`${lot.id}-front-window-${index + 1}`, 0, windowPoint.x, y + feetToMeters(lot.kind === "shrine" ? 4 : 3.4), windowPoint.z, lot.kind === "shrine" ? 0.42 : 0.62, feetToMeters(lot.kind === "shrine" ? 7 : 3.6), 0.1, "warmLight", [...tags, "window", "window-rhythm", "facade-detail"], lot.rotation));
      }
    }
    if (lot.kind === "tavern" || lot.kind === "home" || lot.kind === "manor") {
      const chimney = localPoint(lot, -lot.width * 0.28, -lot.depth * 0.12);
      scene.primitives.push(box(`${lot.id}-chimney`, 0, chimney.x, y, chimney.z, 0.62, totalHeight * 1.12, 0.62, "darkStone", [...tags, "chimney", "vertical-landmark"], lot.rotation));
    }
    if (lot.kind === "warehouse" || lot.kind === "factory" || lot.kind === "barn") {
      const loading = localPoint(lot, 0, lot.depth * 0.47);
      scene.primitives.push(box(`${lot.id}-loading-platform`, 0, loading.x, FLOOR_SLAB_METERS, loading.z, lot.width * 0.68, feetToMeters(2.5), 1.15, "wood", [...tags, "loading-platform", "cover"], lot.rotation));
      scene.tactical.push(tacticalFeature(`${lot.id}-cargo-cover`, "cover", loading.x, loading.z, 0, 2, "Loading platforms and cargo form a tactical cover line."));
    }
    if (lot.kind === "mill") scene.primitives.push(cylinder(`${lot.id}-mill-wheel`, 0, lot.x + lot.width * 0.42, y, lot.z, 2.8, feetToMeters(7), "wood", [...tags, "mill-wheel", "landmark"]));
  }
  if (lot.kind === "tower") scene.tactical.push(tacticalFeature(`${lot.id}-high-ground`, "highGround", lot.x, lot.z, totalHeight, 2, "The tower envelope creates a reachable district landmark."));
  if (lot.state === "temporary") {
    const barricade = localPoint(lot, 0, lot.depth * 0.5);
    scene.primitives.push(box(`${lot.id}-temporary-barricade`, 0, barricade.x, y, barricade.z, Math.min(3.6, lot.width * 0.62), feetToMeters(4), 0.55, "wood", [...tags, "temporary", "barricade", "cover"], lot.rotation));
  }

  addFocusInteriorBlueprint(scene, lot, generated, envelope, interiorProgram);

  scene.rooms.push(createRoom(`${lot.id}-room`, `${lot.kind} at ${lot.district}`, lot.kind === "warehouse" ? "service" : lot.kind === "tower" ? "combat" : "public", 0, lot.x, lot.z, lot.width, lot.depth));
  const instance: BuildingInstance = {
    id: lot.id,
    archetype: lot.kind,
    seed: lot.seed,
    district: lot.district,
    positionCells: { x: lot.x, z: lot.z },
    footprintCells: { x: lot.width, z: lot.depth },
    rotationY: lot.rotation,
    floors: generated.floors,
    floorHeightFeet: generated.floorHeightFeet,
    baseYMeters: y,
    exteriorHeightMeters: totalHeight,
    detailLevel: lot.lod ?? "facade",
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}),
    ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}),
    ...(lot.entrance ? { entranceCells: lot.entrance } : {}),
    buildingProgram: summarizeBuildingProgram(interiorProgram, fullInteriorLabels(lot.kind).tags),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}
