import type {
  BuildingInstance,
  GeneratedScene,
  GeneratorContext,
  MaterialKey,
  SettlementBuildingKind,
  SettlementBuildingProgram,
} from "../schema";
import { GRID_METERS } from "../schema";
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
import type { BuildingFunctionalModuleProgram } from "../site-program/schema";

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
  functionalModules?: readonly BuildingFunctionalModuleProgram[];
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
  for (const [index, module] of (lot.functionalModules ?? []).entries()) {
    const level = module.levelRole === "basement" ? 3 : module.levelRole === "roof" || module.levelRole === "upper" ? 1 : 0;
    const role = module.kind === "observation" ? "combat" : module.kind === "archive" ? "private" : "service";
    rooms.push({
      id: `function-${module.kind}-${index + 1}`,
      name: module.label,
      level,
      role,
      centerLocalCells: {
        x: (index % 2 === 0 ? 1 : -1) * lot.width * (module.levelRole === "exterior" ? 0.42 : 0.16),
        z: lot.depth * (-0.18 + index * 0.12),
      },
      sizeCells: {
        x: Math.max(3, Math.min(lot.width * 0.48, Math.sqrt(module.minimumFootprintCells) * 1.15)),
        z: Math.max(3, Math.min(lot.depth * 0.48, Math.sqrt(module.minimumFootprintCells) * 1.05)),
      },
    });
  }
  const connections: SettlementBuildingProgram["connections"] = [];
  for (const room of rooms.filter((candidate) => candidate.level === 0 && candidate.id !== "ground-public")) connections.push({ from: "ground-public", to: room.id, kind: "door" });
  const uppers = rooms.filter((candidate) => candidate.id.startsWith("upper-"));
  for (const [index, room] of uppers.entries()) connections.push({ from: index === 0 ? "ground-public" : uppers[index - 1]?.id ?? "ground-public", to: room.id, kind: "stair" });
  connections.push({ from: rooms.find((room) => room.id.startsWith("ground-service"))?.id ?? "ground-public", to: "basement", kind: "cellar-stair" });
  for (const room of rooms.filter((candidate) => candidate.id.startsWith("function-"))) {
    connections.push({
      from: room.level === 3 ? "basement" : room.level > 0 ? (uppers[0]?.id ?? "ground-public") : "ground-public",
      to: room.id,
      kind: room.level === 0 ? "door" : "stair",
    });
  }
  const verticalCores: SettlementBuildingProgram["verticalCores"] = [
    ...uppers.map((room, index) => ({ id: `main-stair-${index + 1}`, fromLevel: index, toLevel: index + 1, positionLocalCells: { x: lot.width * 0.26, z: lot.depth * 0.16 }, kind: "stair" as const })),
    { id: "cellar-stair", fromLevel: 3, toLevel: 0, positionLocalCells: { x: -lot.width * 0.26, z: lot.depth * 0.12 }, kind: "stair" as const },
  ];
  return { version: 1, archetype: lot.kind, envelopeVariant: envelope.variant, rooms, connections, verticalCores };
}

function functionalTags(lot: BuildingLot): string[] {
  return (lot.functionalModules ?? []).flatMap((module) => [module.kind, ...module.tags]);
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

function addFunctionalModuleGeometry(
  scene: GeneratedScene,
  lot: BuildingLot,
  generated: ReturnType<typeof profile>,
): void {
  const modules = lot.functionalModules ?? [];
  if (modules.length === 0) return;
  const baseY = lot.baseY ?? FLOOR_SLAB_METERS;
  const undergroundY = Math.min(baseY - feetToMeters(13), FLOOR_SLAB_METERS - feetToMeters(10));
  const groundHeight = feetToMeters(generated.floorHeightFeet[0] ?? 10);
  const totalHeight = feetToMeters(generated.floorHeightFeet.reduce((sum, height) => sum + height, 0));
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const common = ["functional-module", `building-instance:${lot.id}`, `building:${lot.kind}`];
  const addBox = (module: BuildingFunctionalModuleProgram, id: string, level: number, x: number, y: number, z: number, width: number, height: number, depth: number, material: MaterialKey, tags: string[] = []) => {
    const world = point(x, z);
    scene.primitives.push(box(`${lot.id}-${module.kind}-${id}`, level, world.x, y, world.z, width, height, depth, material, [...new Set([...common, `function:${module.kind}`, ...module.tags, ...tags])], lot.rotation));
    return world;
  };
  const addCylinder = (module: BuildingFunctionalModuleProgram, id: string, level: number, x: number, y: number, z: number, diameter: number, height: number, material: MaterialKey, tags: string[] = []) => {
    const world = point(x, z);
    scene.primitives.push(cylinder(`${lot.id}-${module.kind}-${id}`, level, world.x, y, world.z, diameter, height, material, [...new Set([...common, `function:${module.kind}`, ...module.tags, ...tags])]));
    return world;
  };

  for (const [index, module] of modules.entries()) {
    const side = index % 2 === 0 ? 1 : -1;
    const localX = side * lot.width * 0.38;
    const localZ = lot.depth * (-0.16 + index * 0.14);
    const moduleRoom = scene.rooms.find((room) => room.id === `${lot.id}-function-${module.kind}-${index + 1}`);
    if (module.kind === "laboratory") {
      const elevated = module.levelRole === "upper";
      const level = elevated ? 1 : 0;
      const laboratoryY = elevated ? baseY + groundHeight : baseY;
      const laboratoryX = side * lot.width * 0.12;
      const roomCenter = addBox(module, "floor", level, laboratoryX, laboratoryY, localZ, Math.max(3.2, lot.width * 0.38), FLOOR_SLAB_METERS, Math.max(3.2, lot.depth * 0.38), "stone", ["floor", "standable", "laboratory-floor"]);
      addBox(module, "workbench", level, laboratoryX, laboratoryY + FLOOR_SLAB_METERS, localZ, Math.max(1.8, lot.width * 0.22), feetToMeters(3.2), 1.05, "wood", ["workbench", "cover"]);
      addBox(module, "reagent-rack", level, laboratoryX - side * lot.width * 0.12, laboratoryY + FLOOR_SLAB_METERS, localZ - lot.depth * 0.11, 0.65, feetToMeters(5.5), Math.max(1.4, lot.depth * 0.24), "wood", ["storage", "reagent-rack", "cover"]);
      addCylinder(module, "hazard-vat", level, laboratoryX + side * lot.width * 0.12, laboratoryY + FLOOR_SLAB_METERS, localZ + lot.depth * 0.1, 1.05, feetToMeters(3.5), "hazard", ["hazard-vat"]);
      addBox(module, "hood-wall", level, laboratoryX, laboratoryY, localZ - Math.max(1.6, lot.depth * 0.18), Math.max(3.2, lot.width * 0.34), feetToMeters(6.5), 0.18, "darkStone", ["laboratory-shell", "exhaust-wall", "cover"]);
      addCylinder(module, "exhaust-stack", 1, laboratoryX + side * lot.width * 0.16, laboratoryY + feetToMeters(6.5), localZ - Math.max(1.4, lot.depth * 0.16), 0.65, feetToMeters(9), "metal", ["laboratory-shell", "exhaust-stack", "vertical-landmark"]);
      for (const [vialIndex, vialX, vialZ] of [[1, -0.45, -0.2], [2, 0, 0.16], [3, 0.46, -0.08]] as const) {
        addCylinder(module, `vial-${vialIndex}`, level, laboratoryX + vialX, laboratoryY + feetToMeters(3.2), localZ + vialZ, 0.34, feetToMeters(1.8 + vialIndex * 0.25), vialIndex === 2 ? "warmLight" : "hazard", ["alchemical-vessel", "laboratory-fixture"]);
      }
      if (elevated) {
        const access = point(laboratoryX + side * lot.width * 0.2, localZ + lot.depth * 0.18);
        scene.primitives.push(stairs(`${lot.id}-${module.kind}-elevated-access`, 0, access.x, baseY, access.z, 1.05, groundHeight, 4.2, "wood", [...common, `function:${module.kind}`, "elevated-access", "standable", "vertical-opening"], lot.rotation));
        for (const [supportIndex, supportX, supportZ] of [
          [1, laboratoryX - lot.width * 0.16, localZ - lot.depth * 0.14],
          [2, laboratoryX + lot.width * 0.16, localZ - lot.depth * 0.14],
          [3, laboratoryX - lot.width * 0.16, localZ + lot.depth * 0.14],
          [4, laboratoryX + lot.width * 0.16, localZ + lot.depth * 0.14],
        ] as const) {
          addCylinder(module, `tree-support-${supportIndex}`, 0, supportX, baseY, supportZ, 0.62, groundHeight, "wood", ["tree-support", "stilt-foundation", "structural-support"]);
        }
        addCylinder(module, "living-trunk", 1, laboratoryX - side * lot.width * 0.16, laboratoryY, localZ - lot.depth * 0.13, 1.35, feetToMeters(9), "wood", ["living-tree", "tree-trunk", "structural-support", "cover"]);
        addBox(module, "branch-beam-a", 1, laboratoryX, laboratoryY + feetToMeters(5.8), localZ - lot.depth * 0.12, Math.max(3.4, lot.width * 0.42), 0.42, 0.5, "wood", ["living-tree", "branch-beam", "overhead"]);
        addBox(module, "branch-beam-b", 1, laboratoryX - side * lot.width * 0.13, laboratoryY + feetToMeters(4.8), localZ, 0.5, 0.46, Math.max(3.2, lot.depth * 0.38), "wood", ["living-tree", "branch-beam", "overhead"]);
        addBox(module, "branch-bridge", 1, laboratoryX + side * lot.width * 0.28, laboratoryY, localZ + lot.depth * 0.18, Math.max(2.8, lot.width * 0.34), 0.24, 1.25, "wood", ["branch-bridge", "standable", "alternate-route"]);
        const roofCenter = point(laboratoryX, localZ);
        scene.primitives.push(primitive(`${lot.id}-${module.kind}-canopy-roof`, "gable", 2, roofCenter.x, laboratoryY + feetToMeters(7), roofCenter.z, Math.max(3.8, lot.depth * 0.42) * GRID_METERS, feetToMeters(3.8), Math.max(4.2, lot.width * 0.44) * GRID_METERS, "roof", [...common, `function:${module.kind}`, "treehouse-roof", "pitched-roof"], lot.rotation + Math.PI / 2));
        scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [{ x: access.x, z: access.z, y: baseY }, { x: roomCenter.x, z: roomCenter.z, y: laboratoryY }], { purpose: "service", traffic: 0.5, schedule: "all" }));
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-hazard`, "hazard", roomCenter.x, roomCenter.z, laboratoryY, 1.2, "A working laboratory introduces volatile cover and a controllable hazard."));
    } else if (module.kind === "distillation") {
      const tower = addCylinder(module, "tower", 0, localX, baseY, localZ, 2.4, Math.max(feetToMeters(13), groundHeight * 1.25), "metal", ["distillation-tower", "vertical-landmark"]);
      addCylinder(module, "receiver", 0, localX + side * 1.65, baseY, localZ + 0.65, 1.45, feetToMeters(7), "metal", ["receiver-tank", "cover"]);
      addBox(module, "pipe", 0, localX + side * 0.85, baseY + feetToMeters(7), localZ + 0.18, 1.75, 0.22, 0.28, "metal", ["pipe", "overhead"]);
      addBox(module, "platform", 1, localX, baseY + feetToMeters(8), localZ, 3.5, 0.22, 3.1, "wood", ["maintenance-platform", "standable", "high-ground"]);
      const stair = point(localX + side * 2.2, localZ);
      scene.primitives.push(stairs(`${lot.id}-${module.kind}-access`, 0, stair.x, baseY, stair.z, 1, feetToMeters(8), 3.8, "metal", [...common, `function:${module.kind}`, "maintenance-access", "standable"], lot.rotation));
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [{ x: stair.x, z: stair.z, y: baseY }, { x: tower.x, z: tower.z, y: baseY + feetToMeters(8) }], { purpose: "service", traffic: 0.45, schedule: "all" }));
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-high`, "highGround", tower.x, tower.z, baseY + feetToMeters(8), 1.6, "The distillation maintenance deck is reachable high ground."));
    } else if (module.kind === "archive") {
      const archiveY = undergroundY;
      const center = addBox(module, "floor", 3, localX * 0.45, archiveY, localZ, Math.max(3.5, lot.width * 0.42), FLOOR_SLAB_METERS, Math.max(3.2, lot.depth * 0.36), "stone", ["floor", "standable", "archive-floor", "underground"]);
      for (let shelf = -1; shelf <= 1; shelf += 1) {
        addBox(module, `shelf-${shelf + 2}`, 3, localX * 0.45 + shelf * 1.05, archiveY + FLOOR_SLAB_METERS, localZ, 0.55, feetToMeters(6.2), Math.max(2.2, lot.depth * 0.27), "wood", ["archive-shelf", "cover", "restricted"]);
      }
      if (module.requiresWater) addBox(module, "floodwater", 3, localX * 0.45, archiveY + feetToMeters(1.1), localZ, Math.max(3, lot.width * 0.34), 0.14, Math.max(2.8, lot.depth * 0.3), "water", ["water", "flooded", "hazard"]);
      const archiveAccess = point(localX * 0.45 + lot.width * 0.2, localZ + lot.depth * 0.16);
      scene.primitives.push(
        box(`${lot.id}-${module.kind}-surface-hatch`, 0, archiveAccess.x, baseY + FLOOR_SLAB_METERS, archiveAccess.z, 1.5, 0.16, 1.5, "metal", [...common, `function:${module.kind}`, "archive-hatch", "vertical-opening", "entrance"], lot.rotation),
        stairs(`${lot.id}-${module.kind}-access-stair`, 3, archiveAccess.x, archiveY, archiveAccess.z, 1.05, baseY - archiveY, Math.max(3.8, lot.depth * 0.34), "stone", [...common, `function:${module.kind}`, "archive-access", "vertical-opening", "standable", "underground"], lot.rotation),
      );
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [
        { x: archiveAccess.x, z: archiveAccess.z, y: baseY },
        { x: center.x, z: center.z, y: archiveY },
      ], { purpose: "service", traffic: 0.28, schedule: "all" }));
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-choke`, "chokepoint", center.x, center.z, archiveY, 1.1, "Dense archive stacks form narrow investigative and combat aisles."));
    } else if (module.kind === "greenhouse") {
      const width = Math.max(4, lot.width * 0.46);
      const depth = Math.max(3.4, lot.depth * 0.4);
      const submerged = module.levelRole === "basement";
      const greenhouseY = submerged ? undergroundY : baseY;
      const level = submerged ? 3 : 0;
      const greenhouseX = submerged ? localX * 0.42 : localX;
      const center = addBox(module, "floor", level, greenhouseX, greenhouseY, localZ, width, FLOOR_SLAB_METERS, depth, "stone", ["floor", "standable", "greenhouse-floor", ...(submerged ? ["underground"] : [])]);
      addBox(module, "north-frame", level, greenhouseX, greenhouseY, localZ - depth / 2, width, feetToMeters(7), 0.16, "wood", ["greenhouse-frame", "wall"]);
      addBox(module, "west-frame", level, greenhouseX - width / 2, greenhouseY, localZ, 0.16, feetToMeters(7), depth, "wood", ["greenhouse-frame", "wall"]);
      addBox(module, "south-frame", level, greenhouseX, greenhouseY, localZ + depth / 2, width, feetToMeters(7), 0.16, "wood", ["greenhouse-frame", "wall"]);
      addBox(module, "east-frame", level, greenhouseX + width / 2, greenhouseY, localZ, 0.16, feetToMeters(7), depth, "wood", ["greenhouse-frame", "wall"]);
      for (const [postIndex, postX, postZ] of [
        [1, greenhouseX - width / 2, localZ - depth / 2],
        [2, greenhouseX + width / 2, localZ - depth / 2],
        [3, greenhouseX - width / 2, localZ + depth / 2],
        [4, greenhouseX + width / 2, localZ + depth / 2],
      ] as const) {
        addBox(module, `frame-post-${postIndex}`, level, postX, greenhouseY, postZ, 0.18, feetToMeters(7), 0.18, "metal", ["greenhouse-frame", "structural-support"]);
      }
      for (const [beamIndex, beamOffset] of [-0.38, -0.12, 0.12, 0.38].entries()) {
        addBox(module, `roof-beam-${beamIndex + 1}`, submerged ? 3 : 1, greenhouseX + width * beamOffset, greenhouseY + feetToMeters(7), localZ, 0.14, 0.18, depth * 1.03, "wood", ["greenhouse-roof-frame", "overhead"]);
      }
      addBox(module, "roof-ridge", submerged ? 3 : 1, greenhouseX, greenhouseY + feetToMeters(7.35), localZ, width * 1.03, 0.18, 0.16, "metal", ["greenhouse-roof-frame", "ridge"]);
      for (const bedOffset of [-0.24, 0.24]) addBox(module, `bed-${bedOffset > 0 ? 2 : 1}`, level, greenhouseX + width * bedOffset, greenhouseY + FLOOR_SLAB_METERS, localZ, width * 0.28, feetToMeters(1.6), depth * 0.68, "moss", ["growing-bed", "cover", "wet-zone"]);
      if (submerged) addBox(module, "water", 3, greenhouseX, greenhouseY + feetToMeters(1.25), localZ, width * 0.9, 0.14, depth * 0.86, "water", ["water", "submerged", "hazard"]);
      if (submerged) {
        const access = point(greenhouseX + width * 0.34, localZ + depth * 0.34);
        scene.primitives.push(
          stairs(`${lot.id}-${module.kind}-access`, 3, access.x, greenhouseY, access.z, 1.05, baseY - greenhouseY, 4.5, "stone", [...common, `function:${module.kind}`, "greenhouse-access", "vertical-opening", "standable", "underground"], lot.rotation),
        );
        scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [
          { x: access.x, z: access.z, y: baseY },
          { x: center.x, z: center.z, y: greenhouseY },
        ], { purpose: "service", traffic: 0.24, schedule: "all" }));
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-cover`, "cover", center.x, center.z, greenhouseY, 1.6, "Raised cultivation beds divide the greenhouse into cover lanes."));
    } else if (module.kind === "submerged-room") {
      const submergedY = undergroundY;
      const width = Math.max(3.6, lot.width * 0.42);
      const depth = Math.max(3.4, lot.depth * 0.38);
      const center = addBox(module, "floor", 3, localX * 0.42, submergedY, localZ, width, FLOOR_SLAB_METERS, depth, "stone", ["floor", "standable", "submerged-floor", "underground"]);
      addBox(module, "water", 3, localX * 0.42, submergedY + feetToMeters(1.4), localZ, width * 0.82, 0.15, depth * 0.72, "water", ["water", "flooded", "hazard"]);
      addBox(module, "retaining-wall", 3, localX * 0.42 - width / 2, submergedY, localZ, 0.2, feetToMeters(8), depth, "darkStone", ["wall", "submerged", "water-tight"]);
      const access = point(localX * 0.42 + width * 0.34, localZ + depth * 0.34);
      scene.primitives.push(stairs(`${lot.id}-${module.kind}-access`, 3, access.x, submergedY, access.z, 1.05, baseY - submergedY, 4.5, "stone", [...common, `function:${module.kind}`, "submerged-access", "standable"], lot.rotation));
      scene.primitives.push(box(`${lot.id}-${module.kind}-door-opening`, 3, access.x, submergedY, access.z, 1.4, feetToMeters(7), 0.3, "stone", [...common, `function:${module.kind}`, "opening", "door-frame", "vertical-opening"], lot.rotation));
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [{ x: access.x, z: access.z, y: baseY }, { x: center.x, z: center.z, y: submergedY }], { purpose: "service", traffic: 0.25, schedule: "all" }));
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-hazard`, "hazard", center.x, center.z, submergedY, 1.8, "Floodwater slows movement and conceals a lower access route."));
    } else if (module.kind === "observation") {
      const roofY = baseY + totalHeight;
      const center = addBox(module, "platform", 2, 0, roofY, localZ * 0.25, Math.max(3.4, lot.width * 0.42), 0.24, Math.max(3.2, lot.depth * 0.36), "wood", ["roof-platform", "standable", "high-ground"]);
      addCylinder(module, "mast", 2, 0, roofY + 0.24, localZ * 0.25, 0.48, feetToMeters(10), "metal", ["antenna", "vertical-landmark"]);
      for (const rail of [-1, 1]) addBox(module, `rail-${rail > 0 ? 2 : 1}`, 2, rail * lot.width * 0.2, roofY + 0.24, localZ * 0.25, 0.12, feetToMeters(3), Math.max(3.2, lot.depth * 0.36), "metal", ["railing", "roof-edge"]);
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-high`, "highGround", center.x, center.z, roofY, 2, "The observation deck provides a commanding but exposed sight line."));
    } else {
      const center = addBox(module, "floor", 0, localX, baseY, localZ, Math.max(3.8, lot.width * 0.44), FLOOR_SLAB_METERS, Math.max(3.4, lot.depth * 0.38), "stone", ["floor", "standable", "workshop-floor"]);
      for (const offset of [-0.2, 0.2]) addBox(module, `machine-${offset > 0 ? 2 : 1}`, 0, localX + lot.width * offset, baseY + FLOOR_SLAB_METERS, localZ, 1.2, feetToMeters(4.5), 1.6, "metal", ["machinery", "cover"]);
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-cover`, "cover", center.x, center.z, baseY, 1.6, "Heavy workshop machinery creates durable cover and a service bottleneck."));
    }
    if (moduleRoom) moduleRoom.name = module.label;
  }
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
  const basementY = Math.min(baseY - feetToMeters(14), FLOOR_SLAB_METERS - feetToMeters(10));
  const tags = ["settlement-building", "independent-building-module", "full-interior", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`];
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const addRotatedBox = (id: string, x: number, z: number, w: number, h: number, d: number, y: number, material: MaterialKey, extra: string[] = [], level = 0) => {
    const p = point(x, z);
    scene.primitives.push(box(`${lot.id}-${id}`, level, p.x, y, p.z, w, h, d, material, [...tags, ...extra], lot.rotation));
  };
  addRotatedBox("floor", 0, 0, width, FLOOR_SLAB_METERS, depth, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "program-room"]);
  addRotatedBox("north-wall", 0, -depth / 2, width, wallHeight, 0.22, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("west-wall", -width / 2, 0, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("east-wall", width / 2, 0, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening", "focus-cutaway"]);
  addRotatedBox("south-wall-left", -width * 0.32, depth / 2, width * 0.34, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "building-shell", "focus-cutaway"]);
  addRotatedBox("south-wall-right", width * 0.32, depth / 2, width * 0.34, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "building-shell", "focus-cutaway"]);
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
  addRotatedBox("basement-south", 0, depth * 0.29, width * 0.64, feetToMeters(9), 0.22, basementY, "darkStone", ["wall", "underground", "door-frame", "focus-cutaway"], 3);
  const basementDepth = depth * 0.58;
  const cellarOpeningCenter = depth * 0.08;
  const cellarOpeningWidth = Math.min(1.5, basementDepth * 0.28);
  const westNorthDepth = basementDepth / 2 + cellarOpeningCenter - cellarOpeningWidth / 2;
  const westSouthDepth = basementDepth / 2 - cellarOpeningCenter - cellarOpeningWidth / 2;
  addRotatedBox("basement-west-north", -width * 0.32, (-basementDepth / 2 + cellarOpeningCenter - cellarOpeningWidth / 2) / 2, 0.22, feetToMeters(9), westNorthDepth, basementY, "darkStone", ["wall", "underground", "door-frame"], 3);
  addRotatedBox("basement-west-south", -width * 0.32, (cellarOpeningCenter + cellarOpeningWidth / 2 + basementDepth / 2) / 2, 0.22, feetToMeters(9), westSouthDepth, basementY, "darkStone", ["wall", "underground", "door-frame"], 3);
  addRotatedBox("basement-east", width * 0.32, 0, 0.22, feetToMeters(9), depth * 0.58, basementY, "darkStone", ["wall", "underground", "focus-cutaway"], 3);
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
    buildingProgram: summarizeBuildingProgram(interiorProgram, [...labels.tags, ...functionalTags(lot)]),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  addFunctionalModuleGeometry(scene, lot, generated);
  for (const [index, module] of (lot.functionalModules ?? []).entries()) {
    const roomProgram = interiorProgram.rooms.find((room) => room.id === `function-${module.kind}-${index + 1}`);
    if (!roomProgram) continue;
    const world = point(roomProgram.centerLocalCells.x, roomProgram.centerLocalCells.z);
    const roomId = `${lot.id}-${roomProgram.id}`;
    scene.rooms.push(createRoom(roomId, roomProgram.name, roomProgram.role, roomProgram.level, world.x, world.z, roomProgram.sizeCells.x, roomProgram.sizeCells.z, roomProgram.level === 3 ? basementY : roomProgram.level > 0 ? upperY : baseY));
    connectRooms(scene.rooms, roomProgram.level === 3 ? basementId : roomProgram.level > 0 ? upperId : publicId, roomId);
  }
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
  const cellarY = Math.min(baseY - feetToMeters(12), FLOOR_SLAB_METERS - feetToMeters(9));
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
  if (lot.functionalModules?.some((module) => module.kind === "laboratory" && module.levelRole === "upper")) generated.material = "wood";
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
  addFunctionalModuleGeometry(scene, lot, generated);

  scene.rooms.push(createRoom(`${lot.id}-room`, `${lot.kind} at ${lot.district}`, lot.kind === "warehouse" ? "service" : lot.kind === "tower" ? "combat" : "public", 0, lot.x, lot.z, lot.width, lot.depth));
  for (const [index, module] of (lot.functionalModules ?? []).entries()) {
    const roomProgram = interiorProgram.rooms.find((room) => room.id === `function-${module.kind}-${index + 1}`);
    if (!roomProgram) continue;
    const world = localPoint(lot, roomProgram.centerLocalCells.x, roomProgram.centerLocalCells.z);
    const moduleY = roomProgram.level === 3 ? y - feetToMeters(12) : roomProgram.level > 0 ? y + feetToMeters(generated.floorHeightFeet[0] ?? 10) : y;
    const roomId = `${lot.id}-${roomProgram.id}`;
    scene.rooms.push(createRoom(roomId, roomProgram.name, roomProgram.role, roomProgram.level, world.x, world.z, roomProgram.sizeCells.x, roomProgram.sizeCells.z, moduleY));
    connectRooms(scene.rooms, `${lot.id}-room`, roomId);
  }
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
    buildingProgram: summarizeBuildingProgram(interiorProgram, [...fullInteriorLabels(lot.kind).tags, ...functionalTags(lot)]),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}
