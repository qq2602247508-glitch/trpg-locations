import type {
  BuildingInstance,
  GeneratedScene,
  GeneratorContext,
  MaterialKey,
  SettlementBuildingKind,
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

function instantiateFullInterior(scene: GeneratedScene, lot: BuildingLot, generated: ReturnType<typeof profile>): BuildingInstance {
  const baseY = lot.baseY ?? FLOOR_SLAB_METERS;
  const width = Math.max(5.2, lot.width * 0.9);
  const depth = Math.max(5, lot.depth * 0.86);
  const wallHeight = feetToMeters(generated.floorHeightFeet[0] ?? 10);
  const upperY = baseY + wallHeight;
  const basementY = baseY - feetToMeters(10);
  const tags = ["settlement-building", "independent-building-module", "full-interior", `building:${lot.kind}`, `district:${lot.district}`];
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
  scene.tactical.push(tacticalFeature(`${lot.id}-interior-choke`, "chokepoint", lot.x, lot.z + depth * 0.34, baseY, 1, "The independently generated entrance and internal partition form a defensible threshold."));
  const instance: BuildingInstance = {
    id: lot.id, archetype: lot.kind, seed: lot.seed, district: lot.district,
    positionCells: { x: lot.x, z: lot.z }, footprintCells: { x: lot.width, z: lot.depth }, rotationY: lot.rotation,
    floors: 4, floorHeightFeet: [generated.floorHeightFeet[0] ?? 10, generated.floorHeightFeet[1] ?? 9, 8, 10], detailLevel: "full-interior",
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}), ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}), ...(lot.entrance ? { entranceCells: lot.entrance } : {}),
    buildingProgram: { archetype: lot.kind, requiredFeatures: labels.tags, roomCount: 4, connectionCount: 3, levels: 4, topology: lot.kind === "tower" ? "vertical" : "composite" },
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}

/** Independent exterior grammar consumed by settlement planners. */
export function instantiateBuildingModule(scene: GeneratedScene, lot: BuildingLot, rng: GeneratorContext["rng"]): BuildingInstance {
  const generated = profile(lot.kind, rng);
  if (lot.lod === "full-interior") return instantiateFullInterior(scene, lot, generated);
  const totalHeight = feetToMeters(generated.floorHeightFeet.reduce((sum, height) => sum + height, 0));
  const y = lot.baseY ?? FLOOR_SLAB_METERS;
  const tags = ["settlement-building", "independent-building-module", `building:${lot.kind}`, `district:${lot.district}`];
  const addMass = (suffix: string, localX: number, localZ: number, width: number, depth: number, height = totalHeight, material = generated.material) => {
    const point = localPoint(lot, localX, localZ);
    scene.primitives.push(box(`${lot.id}-${suffix}`, 0, point.x, y, point.z, width, height, depth, material, [...tags, `module-part:${suffix}`], lot.rotation));
  };

  if (lot.lod === "mass") {
    addMass("district-mass", 0, 0, lot.width * 0.84, lot.depth * 0.82, totalHeight * 0.82);
    if (lot.kind !== "warehouse" && lot.kind !== "factory" && lot.kind !== "blacksmith") {
      scene.primitives.push(primitive(`${lot.id}-mass-roof`, "gable", 0, lot.x, y + totalHeight * 0.82, lot.z, lot.depth * 0.86 * 1.524, feetToMeters(3.5), lot.width * 0.88 * 1.524, "roof", [...tags, "roof", "pitched-roof", "lod-mass"], lot.rotation + Math.PI / 2));
    }
  } else if (lot.kind === "tower") {
    scene.primitives.push(cylinder(`${lot.id}-shaft`, 0, lot.x, y, lot.z, Math.min(lot.width, lot.depth) * 0.82, totalHeight, generated.material, [...tags, "tower-shaft", "high-ground"]));
    scene.primitives.push(cylinder(`${lot.id}-crown`, 0, lot.x, y + totalHeight, lot.z, Math.min(lot.width, lot.depth), 0.42, "stone", [...tags, "roof", "roof-platform"]));
    scene.tactical.push(tacticalFeature(`${lot.id}-high-ground`, "highGround", lot.x, lot.z, totalHeight, 2, "An independently seeded tower creates a reachable district landmark."));
  } else if (lot.kind === "shrine") {
    addMass("nave", 0, -lot.depth * 0.06, lot.width * 0.58, lot.depth * 0.82, totalHeight * 0.72);
    const apse = localPoint(lot, 0, lot.depth * 0.36);
    scene.primitives.push(cylinder(`${lot.id}-apse`, 0, apse.x, y, apse.z, lot.width * 0.48, totalHeight * 0.68, "stone", [...tags, "apse", "sacred-axis"]));
    scene.primitives.push(primitive(`${lot.id}-spire`, "cone", 0, lot.x, y + totalHeight * 0.72, lot.z, lot.width * 0.72 * 1.524, totalHeight * 0.42, lot.width * 0.72 * 1.524, "roof", [...tags, "roof", "spire"], lot.rotation));
  } else if (lot.kind === "manor") {
    addMass("great-hall", 0, lot.depth * 0.22, lot.width * 0.5, lot.depth * 0.45);
    addMass("west-wing", -lot.width * 0.34, 0, lot.width * 0.24, lot.depth * 0.88, totalHeight * 0.86);
    addMass("east-wing", lot.width * 0.34, 0, lot.width * 0.24, lot.depth * 0.88, totalHeight * 0.86);
    const court = localPoint(lot, 0, -lot.depth * 0.2);
    scene.primitives.push(box(`${lot.id}-courtyard`, 0, court.x, FLOOR_SLAB_METERS + 0.01, court.z, lot.width * 0.38, FLOOR_SLAB_METERS, lot.depth * 0.32, "stone", [...tags, "courtyard", "combat-space"], lot.rotation));
  } else if (lot.kind === "tavern") {
    addMass("public-hall", -lot.width * 0.1, lot.depth * 0.16, lot.width * 0.78, lot.depth * 0.56);
    addMass("service-wing", lot.width * 0.26, -lot.depth * 0.24, lot.width * 0.38, lot.depth * 0.5, totalHeight * 0.78);
    const chimney = localPoint(lot, -lot.width * 0.34, lot.depth * 0.16);
    scene.primitives.push(box(`${lot.id}-chimney`, 0, chimney.x, y, chimney.z, 0.7, totalHeight * 1.18, 0.7, "darkStone", [...tags, "chimney", "vertical-landmark"], lot.rotation));
  } else if (lot.kind === "warehouse" || lot.kind === "factory" || lot.kind === "barn") {
    addMass("storage-bay", 0, 0, lot.width * 0.94, lot.depth * 0.78);
    const loading = localPoint(lot, 0, -lot.depth * 0.46);
    scene.primitives.push(box(`${lot.id}-loading-platform`, 0, loading.x, FLOOR_SLAB_METERS, loading.z, lot.width * 0.78, feetToMeters(2.5), 1.2, "wood", [...tags, "loading-platform", "cover"], lot.rotation));
    scene.tactical.push(tacticalFeature(`${lot.id}-cargo-cover`, "cover", loading.x, loading.z, 0, 2, "Loading platforms and cargo form a tactical cover line."));
  } else if (lot.kind === "guild" || lot.kind === "clinic" || lot.kind === "blacksmith" || lot.kind === "mill") {
    addMass("public-block", -lot.width * 0.14, 0, lot.width * 0.58, lot.depth * 0.82);
    addMass("specialist-wing", lot.width * 0.28, lot.depth * 0.08, lot.width * 0.3, lot.depth * 0.62, totalHeight * 0.78, lot.kind === "blacksmith" ? "darkStone" : generated.material);
    if (lot.kind === "mill") scene.primitives.push(cylinder(`${lot.id}-mill-wheel`, 0, lot.x + lot.width * 0.42, y, lot.z, 2.8, feetToMeters(7), "wood", [...tags, "mill-wheel", "landmark"]));
  } else {
    addMass("house", 0, 0, lot.width * 0.88, lot.depth * 0.84);
    const stoop = localPoint(lot, 0, -lot.depth * 0.47);
    scene.primitives.push(box(`${lot.id}-stoop`, 0, stoop.x, FLOOR_SLAB_METERS, stoop.z, Math.min(2.2, lot.width * 0.42), feetToMeters(1), 0.8, "wood", [...tags, "stoop", "entrance-detail"], lot.rotation));
  }

  if (lot.kind !== "tower" && lot.kind !== "shrine" && lot.lod !== "mass") {
    if (lot.kind === "warehouse" || lot.kind === "factory" || lot.kind === "blacksmith") {
      scene.primitives.push(box(`${lot.id}-roof`, 0, lot.x, y + totalHeight, lot.z, lot.width * 0.98, 0.28, lot.depth * 0.96, "roof", [...tags, "roof", "industrial-roof"], lot.rotation));
    } else {
      scene.primitives.push(primitive(`${lot.id}-roof`, "gable", 0, lot.x, y + totalHeight, lot.z, lot.depth * 1.02 * 1.524, feetToMeters(Math.max(3.5, (generated.floorHeightFeet[0] ?? 10) * 0.42)), lot.width * 1.04 * 1.524, "roof", [...tags, "roof", "pitched-roof"], lot.rotation + Math.PI / 2));
    }
  }

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
    detailLevel: lot.lod ?? "facade",
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}),
    ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}),
    ...(lot.entrance ? { entranceCells: lot.entrance } : {}),
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}
