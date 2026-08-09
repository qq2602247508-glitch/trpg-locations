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
import { planBuildingEnvelope, type BuildingEnvelopeProgram, type SiteBuildingProfile } from "./buildingEnvelope";
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
  siteProfile?: SiteBuildingProfile;
  climateProfile?: "polar" | "wetland" | "alpine" | "forest" | "coastal" | "volcanic" | "temperate";
}

function localPoint(lot: BuildingLot, localX: number, localZ: number): { x: number; z: number } {
  const cosine = Math.cos(lot.rotation);
  const sine = Math.sin(lot.rotation);
  return {
    x: lot.x + localX * cosine + localZ * sine,
    z: lot.z - localX * sine + localZ * cosine,
  };
}

function profile(kind: SettlementBuildingKind, rng: GeneratorContext["rng"], siteProfile?: SiteBuildingProfile): { floors: number; floorHeightFeet: number[]; material: MaterialKey } {
  const floors = siteProfile === "field-station" ? rng.int(1, 2)
    : siteProfile === "weather-station" ? rng.int(1, 2)
    : siteProfile === "quarantine-station" ? rng.int(1, 2)
      : siteProfile === "ranger-station" ? rng.int(1, 2)
        : siteProfile === "border-outpost" ? 2
          : kind === "tower" ? rng.int(3, 5)
    : kind === "warehouse" ? rng.int(1, 2)
      : kind === "shrine" ? rng.int(1, 2)
        : kind === "home" ? rng.int(1, 3)
          : kind === "factory" || kind === "barn" ? rng.int(1, 2)
            : rng.int(2, 3);
  const range: readonly [number, number] = siteProfile ? [9, 12]
    : kind === "warehouse" ? [14, 18]
    : kind === "shrine" ? [14, 20]
      : kind === "tower" ? [10, 13]
        : kind === "tavern" ? [10, 12]
          : kind === "manor" ? [11, 14]
            : [9, 11];
  const floorHeightFeet = Array.from({ length: floors }, () => rng.int(range[0], range[1]));
  const material: MaterialKey = siteProfile === "field-station" ? "darkStone"
    : siteProfile === "weather-station" ? "metal"
    : siteProfile === "quarantine-station" ? "wood"
      : siteProfile === "ranger-station" ? "wood"
        : siteProfile === "border-outpost" ? "darkStone"
          : kind === "warehouse" || kind === "tower" || kind === "factory" ? "darkStone"
    : kind === "shrine" ? "stone"
      : kind === "tavern" ? "wood"
        : "plaster";
  return { floors, floorHeightFeet, material };
}

function fullInteriorLabels(kind: SettlementBuildingKind, siteProfile?: SiteBuildingProfile): { publicName: string; serviceName: string; upperName: string; basementName: string; tags: string[] } {
  if (siteProfile === "weather-station") return { publicName: "Weather operations room", serviceName: "Instrument and radio bay", upperName: "Observation loft", basementName: "Emergency reserve vault", tags: ["weather-operations", "instrument-bay", "observation", "reserve-vault"] };
  if (siteProfile === "quarantine-station") return { publicName: "Screened quarantine reception", serviceName: "Treatment and decontamination wing", upperName: "Quarantine watch loft", basementName: "Secured medicine vault", tags: ["quarantine-reception", "decontamination", "quarantine-watch", "medical-vault"] };
  if (siteProfile === "field-station") return { publicName: "Field laboratory and briefing bay", serviceName: "Sample processing wing", upperName: "Observation and radio loft", basementName: "Specimen archive vault", tags: ["field-laboratory", "sample-processing", "observation", "specimen-archive"] };
  if (siteProfile === "ranger-station") return { publicName: "Ranger ready room", serviceName: "Equipment and trail store", upperName: "Watch loft", basementName: "Emergency cache", tags: ["ranger-ready-room", "equipment-store", "watch-loft", "reserve-vault"] };
  if (siteProfile === "border-outpost") return { publicName: "Border inspection room", serviceName: "Guard and equipment wing", upperName: "Watch chamber", basementName: "Secured supply vault", tags: ["inspection-room", "guard-room", "watch-chamber", "supply-vault"] };
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
  const labels = fullInteriorLabels(lot.kind, lot.siteProfile);
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

/** Climate is a facade grammar, not a palette switch. Each profile adds
 * supported geometry that explains how the building survives its parent site. */
function addSiteClimateFacadeGeometry(scene: GeneratedScene, lot: BuildingLot, baseY: number, totalHeight: number, envelope: BuildingEnvelopeProgram): void {
  const climate = lot.climateProfile;
  if (!climate || climate === "temperate") return;
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const common = ["settlement-building", `building-instance:${lot.id}`, "climate-facade", `climate:${climate}`, "supported"];
  const primary = envelope.parts[0];
  const facadeCenterX = primary?.offset.x ?? 0;
  const facadeWidth = primary?.size.x ?? lot.width;
  const frontZ = (primary?.offset.z ?? 0) + (primary?.size.z ?? lot.depth) * 0.5;
  if (climate === "polar") {
    const windbreak = point(facadeCenterX - facadeWidth * 0.34, frontZ + 1.15);
    const roof = point(primary?.offset.x ?? 0, primary?.offset.z ?? -lot.depth * 0.08);
    scene.primitives.push(
      box(`${lot.id}-polar-windbreak`, 0, windbreak.x, baseY, windbreak.z, Math.min(3.8, facadeWidth * 0.48), feetToMeters(6.5), 0.24, "metal", [...common, "polar-windbreak", "cover"], lot.rotation),
      box(`${lot.id}-polar-roof-snow-fence`, 2, roof.x, baseY + totalHeight + feetToMeters(1.8), roof.z, Math.min(5.6, facadeWidth * 0.72), feetToMeters(3.2), 0.14, "metal", [...common, "snow-fence", "roof-service"], lot.rotation),
    );
    for (const offset of [-0.32, 0, 0.32]) {
      const panel = point(facadeCenterX + facadeWidth * offset, frontZ + 0.08);
      scene.primitives.push(box(`${lot.id}-polar-panel-${String(offset).replace("-", "m")}`, 0, panel.x, baseY + feetToMeters(2.4), panel.z, Math.max(0.8, facadeWidth * 0.24), feetToMeters(4.4), 0.12, "ice", [...common, "insulated-cladding"], lot.rotation));
    }
    return;
  }
  if (climate === "wetland") {
    const awning = point(0, frontZ + 0.78);
    scene.primitives.push(box(`${lot.id}-wetland-rain-awning`, 0, awning.x, baseY + feetToMeters(8), awning.z, Math.min(5.8, facadeWidth * 0.7), 0.18, 1.6, "wood", [...common, "rain-awning", "cover"], lot.rotation));
    for (const xOffset of [-0.32, 0.32]) for (const zOffset of [frontZ + 0.18, frontZ + 1.34]) {
      const post = point(facadeCenterX + facadeWidth * xOffset, zOffset);
      scene.primitives.push(cylinder(`${lot.id}-wetland-awning-post-${xOffset}-${zOffset.toFixed(2)}`, 0, post.x, baseY, post.z, 0.16, feetToMeters(8), "wood", [...common, "awning-support", "flood-marker"]));
    }
    return;
  }
  if (climate === "alpine") {
    for (const offset of [-0.38, 0.38]) {
      const buttress = point(facadeCenterX + facadeWidth * offset, frontZ + 0.12);
      scene.primitives.push(box(`${lot.id}-alpine-buttress-${offset}`, 0, buttress.x, baseY, buttress.z, 1.1, feetToMeters(4.8), 1.15, "rock", [...common, "stone-buttress", "cover"], lot.rotation));
    }
    const screen = point(facadeCenterX, (primary?.offset.z ?? 0) - (primary?.size.z ?? lot.depth) * 0.5 - 0.28);
    scene.primitives.push(box(`${lot.id}-alpine-wind-screen`, 0, screen.x, baseY, screen.z, Math.min(5.8, facadeWidth * 0.7), feetToMeters(5.4), 0.28, "darkStone", [...common, "alpine-wind-screen"], lot.rotation));
    return;
  }
  if (climate === "volcanic") {
    const shield = point(facadeCenterX, (primary?.offset.z ?? 0) - (primary?.size.z ?? lot.depth) * 0.5 - 0.42);
    const serviceApron = point(facadeCenterX, frontZ + 0.92);
    scene.primitives.push(
      box(`${lot.id}-volcanic-heat-shield`, 0, shield.x, baseY, shield.z, Math.min(6.4, facadeWidth * 0.78), feetToMeters(6.8), 0.42, "darkStone", [...common, "heat-shield", "basalt-cladding", "cover"], lot.rotation),
      box(`${lot.id}-volcanic-service-apron`, 0, serviceApron.x, baseY, serviceApron.z, Math.min(6.2, facadeWidth * 0.76), feetToMeters(1.1), 2.1, "darkStone", [...common, "cooled-stone-apron", "standable", "service-threshold"], lot.rotation),
    );
    for (const offset of [-0.28, 0.28]) {
      const vent = point(facadeCenterX + facadeWidth * offset, (primary?.offset.z ?? 0) - (primary?.size.z ?? lot.depth) * 0.34);
      scene.primitives.push(cylinder(`${lot.id}-volcanic-cooling-vent-${offset}`, 1, vent.x, baseY + totalHeight * 0.42, vent.z, 0.48, feetToMeters(9), "metal", [...common, "cooling-vent", "exhaust-stack", "vertical-landmark"]));
    }
    return;
  }
  if (climate === "forest") {
    const porch = point(0, frontZ + 0.9);
    scene.primitives.push(box(`${lot.id}-forest-porch`, 0, porch.x, baseY, porch.z, Math.min(5.6, facadeWidth * 0.7), feetToMeters(1.2), 1.8, "wood", [...common, "timber-porch", "standable"], lot.rotation));
    const store = point(-lot.width * 0.42, -lot.depth * 0.26);
    scene.primitives.push(box(`${lot.id}-forest-wood-store`, 0, store.x, baseY, store.z, 1.5, feetToMeters(4), 2.4, "wood", [...common, "wood-store", "cover"], lot.rotation));
    return;
  }
  const brace = point(0, frontZ + 0.1);
  scene.primitives.push(box(`${lot.id}-coastal-storm-brace`, 0, brace.x, baseY + feetToMeters(2), brace.z, Math.min(5.8, facadeWidth * 0.72), 0.22, feetToMeters(4), "wood", [...common, "storm-brace", "storm-shutter"], lot.rotation));
}

/**
 * Water-city frontage is a building grammar, not a paint pass. Harbor and
 * industrial lots receive a supported loading edge, timber awning, crane and
 * pilings; commercial lots receive a market canopy. All pieces inherit the
 * lot's rotation/base elevation so they remain attached to the independent
 * building and can affect cover and routes.
 */
function addWaterfrontExterior(scene: GeneratedScene, lot: BuildingLot, generated: ReturnType<typeof profile>, baseY: number, totalHeight: number): void {
  if (!["harbor", "industrial", "commercial"].includes(lot.district)) return;
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const tags = ["settlement-building", "waterfront-building", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`, "waterfront-detail"];
  const frontage = lot.depth * 0.46;
  const y = baseY + FLOOR_SLAB_METERS + 0.06;
  const edge = point(0, frontage);
  if (lot.district === "commercial") {
    const canopy = point(0, frontage + 0.72);
    scene.primitives.push(
      box(`${lot.id}-waterfront-market-canopy`, 0, canopy.x, y + feetToMeters(7.2), canopy.z, Math.min(lot.width * 0.72, 7.5), 0.16, 1.8, "wood", [...tags, "market-canopy", "cover"], lot.rotation),
      box(`${lot.id}-waterfront-market-counter`, 0, edge.x, y + feetToMeters(2.2), edge.z, Math.min(lot.width * 0.58, 5.2), feetToMeters(2.2), 0.7, "wood", [...tags, "market-counter", "cover"], lot.rotation),
    );
    return;
  }
  const loadingWidth = Math.min(lot.width * 0.78, 8.5);
  scene.primitives.push(
    box(`${lot.id}-dockside-loading-platform`, 0, edge.x, y, edge.z, loadingWidth, 0.22, 1.8, "wood", [...tags, "dockside-platform", "loading-platform", "standable", "cover"], lot.rotation),
    box(`${lot.id}-dockside-awning`, 0, edge.x, y + feetToMeters(8.2), edge.z - 0.55, loadingWidth, 0.16, 1.7, "wood", [...tags, "dockside-awning", "pitched-roof"], lot.rotation),
  );
  const mast = point(-lot.width * 0.34, frontage + 0.4);
  scene.primitives.push(
    cylinder(`${lot.id}-dockside-crane-mast`, 0, mast.x, y, mast.z, 0.22, Math.max(feetToMeters(8), totalHeight * 0.42), "wood", [...tags, "cargo-crane", "vertical-landmark", "cover"]),
    box(`${lot.id}-dockside-crane-boom`, 0, mast.x + Math.cos(lot.rotation) * 2.2, y + Math.max(feetToMeters(8), totalHeight * 0.42), mast.z - Math.sin(lot.rotation) * 2.2, 4.6, 0.18, 0.18, "wood", [...tags, "cargo-crane", "horizontal-boom"], lot.rotation),
  );
  for (const [index, offset] of [-0.34, 0, 0.34].entries()) {
    const pile = point(lot.width * offset, frontage + 1.25);
    scene.primitives.push(cylinder(`${lot.id}-dockside-piling-${index + 1}`, 0, pile.x, y - feetToMeters(2.2), pile.z, 0.16, feetToMeters(5.2), "wood", [...tags, "dockside-piling", "cover"]));
  }
  scene.tactical.push(tacticalFeature(`${lot.id}-dockside-choke`, "chokepoint", edge.x, edge.z, y, 1, "The loading edge and crane create a narrow exposed waterfront approach."));
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
  authoredUnderground?: { y: number; halfWidthCells: number; depthCells: number },
): void {
  const modules = lot.functionalModules ?? [];
  if (modules.length === 0) return;
  const baseY = lot.baseY ?? FLOOR_SLAB_METERS;
  // Full-interior buildings already author a basement datum. Reuse it so a
  // functional archive/greenhouse cannot create a second, vertically offset
  // underground floor and a duplicate stair inside the same room.
  const undergroundY = authoredUnderground?.y ?? Math.min(baseY - feetToMeters(13), FLOOR_SLAB_METERS - feetToMeters(10));
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
      const archiveLocalX = localX * 0.45;
      const archiveWidth = Math.max(3.5, lot.width * 0.42);
      const archiveDepth = Math.max(3.2, lot.depth * 0.36);
      const center = addBox(module, "floor", 3, archiveLocalX, archiveY, localZ, archiveWidth, FLOOR_SLAB_METERS, archiveDepth, "stone", ["floor", "standable", "archive-floor", "underground"]);
      for (let shelf = -1; shelf <= 1; shelf += 1) {
        addBox(module, `shelf-${shelf + 2}`, 3, archiveLocalX + shelf * 1.05, archiveY + FLOOR_SLAB_METERS, localZ, 0.55, feetToMeters(6.2), Math.max(2.2, lot.depth * 0.27), "wood", ["archive-shelf", "cover", "restricted"]);
      }
      if (module.requiresWater) addBox(module, "floodwater", 3, archiveLocalX, archiveY + feetToMeters(1.1), localZ, Math.max(3, lot.width * 0.34), 0.14, Math.max(2.8, lot.depth * 0.3), "water", ["water", "flooded", "hazard"]);
      // A single full-rise stair is longer than most archive rooms and used
      // to split the entire cellar. Fold the same vertical connection into
      // two opposed flights along one wall, joined by a real landing.
      const flightRun = Math.min(3.1, Math.max(2.3, archiveDepth * 0.72));
      const flightRise = (baseY - archiveY) / 2;
      const flightOffsetX = Math.min(0.62, archiveWidth * 0.18);
      const lowerFlightLocalX = archiveLocalX + flightOffsetX;
      const upperFlightLocalX = archiveLocalX - flightOffsetX;
      const lowerFlight = point(lowerFlightLocalX, localZ);
      const upperFlight = point(upperFlightLocalX, localZ);
      const landing = point(archiveLocalX, localZ + flightRun / 2);
      const archiveAccess = point(upperFlightLocalX, localZ - flightRun / 2);
      const archiveEntry = point(lowerFlightLocalX, localZ - flightRun / 2);
      const shaftNorth = point(upperFlightLocalX, localZ - flightRun / 2 - 0.7);
      const shaftSouth = point(upperFlightLocalX, localZ - flightRun / 2 + 0.7);
      const shaftWest = point(upperFlightLocalX - 0.7, localZ - flightRun / 2);
      const shaftEast = point(upperFlightLocalX + 0.7, localZ - flightRun / 2);
      const archiveThresholdLocalX = authoredUnderground
        ? Math.sign(archiveLocalX || 1) * authoredUnderground.halfWidthCells
        : archiveLocalX;
      const archiveThresholdLocalZ = authoredUnderground
        ? Math.max(-authoredUnderground.depthCells * 0.38, Math.min(authoredUnderground.depthCells * 0.38, localZ))
        : localZ;
      const archiveThreshold = point(archiveThresholdLocalX, archiveThresholdLocalZ);
      scene.primitives.push(
        box(`${lot.id}-${module.kind}-surface-hatch`, 0, archiveAccess.x, baseY + FLOOR_SLAB_METERS, archiveAccess.z, 1.5, 0.16, 1.5, "metal", [...common, `function:${module.kind}`, "archive-hatch", "vertical-opening", "entrance"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-collar-north`, 3, shaftNorth.x, baseY - 0.34, shaftNorth.z, 1.6, 0.34, 0.18, "darkStone", [...common, `function:${module.kind}`, "archive-access", "shaft-collar", "top-portal", "vertical-opening", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-collar-south`, 3, shaftSouth.x, baseY - 0.34, shaftSouth.z, 1.6, 0.34, 0.18, "darkStone", [...common, `function:${module.kind}`, "archive-access", "shaft-collar", "top-portal", "vertical-opening", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-collar-west`, 3, shaftWest.x, baseY - 0.34, shaftWest.z, 0.18, 0.34, 1.6, "darkStone", [...common, `function:${module.kind}`, "archive-access", "shaft-collar", "top-portal", "vertical-opening", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-collar-east`, 3, shaftEast.x, baseY - 0.34, shaftEast.z, 0.18, 0.34, 1.6, "darkStone", [...common, `function:${module.kind}`, "archive-access", "shaft-collar", "top-portal", "vertical-opening", "underground"], lot.rotation),
        stairs(`${lot.id}-${module.kind}-access-lower-flight`, 3, lowerFlight.x, archiveY, lowerFlight.z, 1.05, flightRise, flightRun, "stone", [...common, `function:${module.kind}`, "archive-access", "stair-flight", "vertical-opening", "standable", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-access-landing`, 3, landing.x, archiveY + flightRise, landing.z, Math.max(1.8, flightOffsetX * 2 + 1.05), FLOOR_SLAB_METERS, 1.05, "stone", [...common, `function:${module.kind}`, "archive-access", "stair-landing", "standable", "underground"], lot.rotation),
        stairs(`${lot.id}-${module.kind}-access-upper-flight`, 3, upperFlight.x, archiveY + flightRise, upperFlight.z, 1.05, flightRise, flightRun, "stone", [...common, `function:${module.kind}`, "archive-access", "stair-flight", "vertical-opening", "standable", "underground"], lot.rotation + Math.PI),
        box(`${lot.id}-${module.kind}-basement-threshold`, 3, archiveThreshold.x, archiveY, archiveThreshold.z, 0.24, feetToMeters(7), 1.35, "darkStone", [...common, `function:${module.kind}`, "archive-access", "door-frame", "opening", "underground"], lot.rotation),
      );
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [
        { x: archiveAccess.x, z: archiveAccess.z, y: baseY },
        { x: landing.x, z: landing.z, y: archiveY + flightRise },
        { x: archiveEntry.x, z: archiveEntry.z, y: archiveY },
        { x: archiveThreshold.x, z: archiveThreshold.z, y: archiveY },
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
  const primaryEnvelope = envelope.parts[0];
  const width = lot.siteProfile ? Math.max(4.6, primaryEnvelope?.size.x ?? lot.width * 0.72) : Math.max(5.2, lot.width * 0.9);
  const depth = lot.siteProfile ? Math.max(4.4, primaryEnvelope?.size.z ?? lot.depth * 0.68) : Math.max(5, lot.depth * 0.86);
  const primaryOffset = lot.siteProfile ? (primaryEnvelope?.offset ?? { x: 0, z: 0 }) : { x: 0, z: 0 };
  const primaryFrontZ = primaryOffset.z + depth / 2;
  const entryDoorLocalX = [primaryOffset.x, primaryOffset.x + width * 0.23, primaryOffset.x - width * 0.23]
    .find((candidateX) => !envelope.parts.slice(1).some((part) => candidateX > part.offset.x - part.size.x / 2 - 0.12
      && candidateX < part.offset.x + part.size.x / 2 + 0.12
      && primaryFrontZ > part.offset.z - part.size.z / 2 - 0.12
      && primaryFrontZ < part.offset.z + part.size.z / 2 + 0.12))
    ?? primaryOffset.x;
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
  addRotatedBox("floor", primaryOffset.x, primaryOffset.z, width, FLOOR_SLAB_METERS, depth, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "program-room", ...(lot.siteProfile ? ["field-station", `site-profile:${lot.siteProfile}`] : [])]);
  addRotatedBox("north-wall", primaryOffset.x, primaryOffset.z - depth / 2, width, wallHeight, 0.22, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("west-wall", primaryOffset.x - width / 2, primaryOffset.z, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
  addRotatedBox("east-wall", primaryOffset.x + width / 2, primaryOffset.z, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening", "focus-cutaway"]);
  const mainDoorGap = Math.min(1.35, width * 0.28);
  const primaryWest = primaryOffset.x - width / 2;
  const primaryEast = primaryOffset.x + width / 2;
  const leftWallWidth = Math.max(0.3, entryDoorLocalX - mainDoorGap / 2 - primaryWest);
  const rightWallWidth = Math.max(0.3, primaryEast - entryDoorLocalX - mainDoorGap / 2);
  addRotatedBox("south-wall-left", primaryWest + leftWallWidth / 2, primaryFrontZ, leftWallWidth, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "opening", "building-shell", "focus-cutaway"]);
  addRotatedBox("south-wall-right", primaryEast - rightWallWidth / 2, primaryFrontZ, rightWallWidth, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "opening", "building-shell", "focus-cutaway"]);
  addRotatedBox("partition-a", primaryOffset.x - width * 0.2, primaryOffset.z, 0.13, wallHeight, depth * 0.36, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  addRotatedBox("partition-b", primaryOffset.x - width * 0.2, primaryOffset.z - depth * 0.38, 0.13, wallHeight, depth * 0.18, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  const upperWidth = width * 0.72;
  const upperDepth = depth * 0.64;
  const labels = fullInteriorLabels(lot.kind, lot.siteProfile);
  addRotatedBox("upper-floor", primaryOffset.x + 0.08, primaryOffset.z - 0.05, upperWidth, FLOOR_SLAB_METERS, upperDepth, upperY, "wood", ["floor", "standable", "upper-floor"], 1);
  addRotatedBox("upper-north", primaryOffset.x + 0.08, primaryOffset.z - upperDepth / 2 - 0.05, upperWidth, wallHeight * 0.82, 0.2, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  addRotatedBox("upper-west", primaryOffset.x - upperWidth / 2 + 0.08, primaryOffset.z - 0.05, 0.2, wallHeight * 0.82, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  addRotatedBox("upper-east", primaryOffset.x + upperWidth / 2 + 0.08, primaryOffset.z - 0.05, 0.2, wallHeight * 0.82, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
  const roofP = point(primaryOffset.x + 0.08, primaryOffset.z - 0.05);
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
  const cellarRole = labels.tags[3] ?? "cellar";
  const cellarRoleTags = cellarRole === "underground" ? [] : [cellarRole];
  for (const [rackIndex, zOffset] of [-0.2, 0.2].entries()) {
    const rackWidth = Math.max(1.35, width * 0.27);
    const rackX = width * 0.16;
    const rackZ = depth * zOffset;
    const rackMaterial = lot.kind === "clinic" || lot.siteProfile === "field-station" ? "metal" : "wood";
    for (const [postIndex, xDirection] of [-1, 1].entries()) addRotatedBox(
      `basement-rack-${rackIndex + 1}-post-${postIndex + 1}`,
      rackX + xDirection * rackWidth * 0.46,
      rackZ,
      0.13,
      feetToMeters(5.2),
      0.5,
      basementY + FLOOR_SLAB_METERS,
      rackMaterial,
      ["underground", "basement-fixture", "cellar-rack", "rack-upright", ...cellarRoleTags, "cover"],
      3,
    );
    for (const [shelfIndex, heightFeet] of [0.9, 2.7, 4.5].entries()) addRotatedBox(
      `basement-rack-${rackIndex + 1}-shelf-${shelfIndex + 1}`,
      rackX,
      rackZ,
      rackWidth,
      feetToMeters(0.22),
      0.58,
      basementY + feetToMeters(heightFeet),
      rackMaterial,
      ["underground", "basement-fixture", "cellar-rack", "rack-shelf", ...cellarRoleTags, "cover"],
      3,
    );
  }
  for (const [crateIndex, xOffset, zOffset] of [[1, 0.02, -0.03], [2, 0.18, 0.02], [3, 0.06, 0.16]] as const) {
    addRotatedBox(
      `basement-crate-${crateIndex}`,
      width * xOffset,
      depth * zOffset,
      crateIndex === 2 ? 0.78 : 0.64,
      feetToMeters(crateIndex === 3 ? 2.5 : 1.8),
      crateIndex === 1 ? 0.78 : 0.62,
      basementY + FLOOR_SLAB_METERS,
      lot.kind === "clinic" ? "metal" : "wood",
      ["underground", "basement-fixture", "cellar-crate", ...cellarRoleTags, "cover"],
      3,
    );
  }
  const barrelP = point(width * 0.22, depth * 0.02);
  scene.primitives.push(cylinder(`${lot.id}-basement-barrel`, 3, barrelP.x, basementY + FLOOR_SLAB_METERS, barrelP.z, 0.72, feetToMeters(3.2), lot.kind === "clinic" ? "metal" : "wood", [...tags, "underground", "basement-fixture", "cellar-barrel", ...cellarRoleTags, "cover"]));
  scene.tactical.push(tacticalFeature(`${lot.id}-basement-storage-cover`, "cover", barrelP.x, barrelP.z, basementY, 1.4, "Shelving, stacked stores and a barrel divide the cellar into searchable cover lanes."));
  const stairP = point(width * 0.28, depth * 0.08);
  scene.primitives.push(stairs(`${lot.id}-upper-stair`, 0, stairP.x, baseY, stairP.z, 1.2, wallHeight, 4.2, "wood", [...tags, "building-stair", "vertical-opening"], lot.rotation));
  const cellarP = point(-width * 0.3, depth * 0.08);
  const hasDedicatedBasementAccess = lot.functionalModules?.some((module) => module.kind === "archive" && module.levelRole === "basement") === true;
  if (!hasDedicatedBasementAccess) scene.primitives.push(stairs(`${lot.id}-cellar-stair`, 3, cellarP.x, basementY, cellarP.z, 1.2, baseY - basementY, 4.2, "stone", [...tags, "building-stair", "vertical-opening", "underground"], lot.rotation));
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
  const frontDoorP = point(entryDoorLocalX, primaryFrontZ);
  const compoundSouth = Math.max(...envelope.parts.map((part) => part.offset.z + part.size.z / 2)) + 0.8;
  const compoundWest = Math.min(...envelope.parts.map((part) => part.offset.x - part.size.x / 2)) - 0.8;
  const compoundEast = Math.max(...envelope.parts.map((part) => part.offset.x + part.size.x / 2)) + 0.8;
  const approachP = point(entryDoorLocalX, compoundSouth);
  const westCornerP = point(compoundWest, compoundSouth);
  const eastCornerP = point(compoundEast, compoundSouth);
  const entryStart = lot.entrance ?? approachP;
  const entryCornerP = Math.hypot(entryStart.x - westCornerP.x, entryStart.z - westCornerP.z)
    <= Math.hypot(entryStart.x - eastCornerP.x, entryStart.z - eastCornerP.z)
    ? westCornerP
    : eastCornerP;
  scene.routes.push(
    createRoute(`${lot.id}-entry-route`, "primary", [
      { x: entryStart.x, z: entryStart.z, y: baseY },
      { x: entryCornerP.x, z: entryCornerP.z, y: baseY },
      { x: approachP.x, z: approachP.z, y: baseY },
      { x: frontDoorP.x, z: frontDoorP.z, y: baseY },
      { x: publicP.x, z: publicP.z, y: baseY },
    ]),
    createRoute(`${lot.id}-vertical-route`, "vertical", [{ x: stairP.x, z: stairP.z, y: baseY }, { x: upperP.x, z: upperP.z, y: upperY }]),
    ...(!hasDedicatedBasementAccess ? [createRoute(`${lot.id}-basement-route`, "vertical", [
      { x: serviceP.x, z: serviceP.z, y: baseY },
      { x: cellarP.x, z: cellarP.z, y: baseY },
      { x: cellarP.x, z: cellarP.z, y: basementY },
    ])] : []),
  );
  if (lot.kind === "home") {
    addRotatedBox("home-hearth", width * 0.23, -depth * 0.36, 1.45, feetToMeters(4.2), 1.08, baseY + FLOOR_SLAB_METERS, "darkStone", ["home-fixture", "hearth", "cover"]);
    const chimneyP = point(width * 0.23, -depth * 0.39);
    scene.primitives.push(cylinder(`${lot.id}-home-chimney`, 0, chimneyP.x, baseY + feetToMeters(4), chimneyP.z, 0.42, feetToMeters(8), "darkStone", [...tags, "home-fixture", "chimney", "vertical-landmark"]));
    const homeTableX = -width * 0.05;
    const homeTableZ = depth * 0.19;
    addRotatedBox("home-table-top", homeTableX, homeTableZ, Math.max(1.55, width * 0.24), feetToMeters(0.28), 1.15, baseY + feetToMeters(2.8), "wood", ["home-fixture", "table", "cover"]);
    for (const [legIndex, xOffset, zOffset] of [[1, -0.09, -0.11], [2, 0.09, -0.11], [3, -0.09, 0.11], [4, 0.09, 0.11]] as const) addRotatedBox(
      `home-table-leg-${legIndex}`,
      homeTableX + width * xOffset,
      homeTableZ + depth * zOffset,
      0.16,
      feetToMeters(2.8),
      0.16,
      baseY + FLOOR_SLAB_METERS,
      "wood",
      ["home-fixture", "table-leg"],
    );
    for (const [benchIndex, zDirection] of [-1, 1].entries()) addRotatedBox(
      `home-bench-${benchIndex + 1}`,
      homeTableX,
      homeTableZ + zDirection * 1.05,
      Math.max(1.4, width * 0.21),
      feetToMeters(1.55),
      0.48,
      baseY + FLOOR_SLAB_METERS,
      "wood",
      ["home-fixture", "bench", "cover"],
    );
    addRotatedBox("home-workbench", -width * 0.34, -depth * 0.12, Math.max(1.1, width * 0.16), feetToMeters(3.2), 0.82, baseY + FLOOR_SLAB_METERS, "wood", ["home-fixture", "workbench", "service", "cover"]);
    addRotatedBox("home-tool-rack", -width * 0.42, -depth * 0.3, 0.18, feetToMeters(5.2), Math.max(1.1, depth * 0.18), baseY + FLOOR_SLAB_METERS, "wood", ["home-fixture", "tool-rack", "service"]);
    addRotatedBox("home-loft-bunk", upperWidth * 0.22, -upperDepth * 0.24, Math.max(1.2, upperWidth * 0.28), feetToMeters(2.1), 1.55, upperY + FLOOR_SLAB_METERS, "wood", ["home-fixture", "bunk", "private", "cover"], 1);
  } else {
    addRotatedBox("furnishing-public", width * 0.15, 0, Math.max(1.5, width * 0.28), feetToMeters(3), 1.2, baseY + FLOOR_SLAB_METERS, lot.kind === "clinic" ? "metal" : "wood", [labels.tags[0] ?? "furniture", "cover"]);
    addRotatedBox("furnishing-service", -width * 0.34, -depth * 0.12, Math.max(1.1, width * 0.16), feetToMeters(4), 1.1, baseY + FLOOR_SLAB_METERS, lot.kind === "factory" || lot.kind === "blacksmith" ? "metal" : "wood", [labels.tags[1] ?? "service", "cover"]);
  }
  if (lot.siteProfile === "field-station" || lot.siteProfile === "weather-station") {
    for (const [benchIndex, offsetZ] of [-0.18, 0.18].entries()) {
      addRotatedBox(
        `station-sample-bench-${benchIndex + 1}`,
        primaryOffset.x + width * 0.14,
        primaryOffset.z + depth * offsetZ,
        Math.max(1.2, width * 0.34),
        feetToMeters(3.1),
        0.72,
        baseY + FLOOR_SLAB_METERS,
        "metal",
        ["field-laboratory", benchIndex === 0 ? "dirty-sample-bench" : "clean-sample-bench", "laboratory-fixture", "cover"],
      );
    }
    addRotatedBox("station-clean-buffer-left", primaryOffset.x - width * 0.02, primaryOffset.z - depth * 0.28, width * 0.22, feetToMeters(6.5), 0.1, baseY, "metal", ["clean-buffer", "screen", "opening", "controlled-threshold"]);
    addRotatedBox("station-clean-buffer-right", primaryOffset.x + width * 0.34, primaryOffset.z - depth * 0.28, width * 0.22, feetToMeters(6.5), 0.1, baseY, "metal", ["clean-buffer", "screen", "opening", "controlled-threshold"]);
    addRotatedBox("station-instrument-console", primaryOffset.x - width * 0.32, primaryOffset.z + depth * 0.18, 0.72, feetToMeters(4.8), Math.max(1.2, depth * 0.24), baseY + FLOOR_SLAB_METERS, "metal", ["instrument-console", "field-laboratory", "cover"]);
    const sink = point(primaryOffset.x - width * 0.06, primaryOffset.z - depth * 0.34);
    scene.primitives.push(cylinder(`${lot.id}-station-wash-sink`, 0, sink.x, baseY + FLOOR_SLAB_METERS, sink.z, 0.62, feetToMeters(3.4), "metal", [...tags, "wash-sink", "clean-buffer", "laboratory-fixture"]));
  }
  if (lot.siteProfile === "quarantine-station") {
    for (const [cotIndex, offsetX, offsetZ] of [[1, -0.25, -0.16], [2, 0.06, -0.16], [3, -0.25, 0.18], [4, 0.06, 0.18]] as const) {
      addRotatedBox(`quarantine-cot-${cotIndex}`, primaryOffset.x + width * offsetX, primaryOffset.z + depth * offsetZ, 0.72, feetToMeters(2.1), 1.55, baseY + FLOOR_SLAB_METERS, "wood", ["quarantine-cot", "ward-rhythm", "cover"]);
    }
    addRotatedBox("quarantine-gate-left", primaryOffset.x + width * 0.22, primaryOffset.z, 0.1, feetToMeters(7), depth * 0.32, baseY, "metal", ["controlled-threshold", "screening-gate", "opening"]);
    addRotatedBox("quarantine-gate-right", primaryOffset.x + width * 0.22, primaryOffset.z - depth * 0.38, 0.1, feetToMeters(7), depth * 0.18, baseY, "metal", ["controlled-threshold", "screening-gate", "opening"]);
    addRotatedBox("quarantine-nurse-counter", primaryOffset.x + width * 0.34, primaryOffset.z + depth * 0.24, 0.72, feetToMeters(3.2), depth * 0.22, baseY + FLOOR_SLAB_METERS, "metal", ["nurse-counter", "quarantine-reception", "cover"]);
  }
  const extensionRooms: Array<{ id: string; x: number; z: number }> = [];
  for (const [extensionIndex, extension] of envelope.parts.slice(1).entries()) {
    const extensionHeight = wallHeight * Math.max(0.52, extension.heightRatio);
    addRotatedBox(`envelope-${extension.id}-floor`, extension.offset.x, extension.offset.z, extension.size.x, FLOOR_SLAB_METERS, extension.size.z, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "envelope-part"]);
    if (!lot.siteProfile) {
      addRotatedBox(`envelope-${extension.id}-back`, extension.offset.x, extension.offset.z - extension.size.z / 2, extension.size.x, extensionHeight, 0.2, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
      addRotatedBox(`envelope-${extension.id}-front`, extension.offset.x, extension.offset.z + extension.size.z / 2, extension.size.x, extensionHeight, 0.2, baseY, generated.material, ["wall", "building-shell", "envelope-part", "door-frame", "focus-cutaway"]);
      addRotatedBox(`envelope-${extension.id}-west`, extension.offset.x - extension.size.x / 2, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
      addRotatedBox(`envelope-${extension.id}-east`, extension.offset.x + extension.size.x / 2, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening", "focus-cutaway"]);
    } else {
      const deltaX = extension.offset.x - primaryOffset.x;
      const deltaZ = extension.offset.z - primaryOffset.z;
      const connectionSide = Math.abs(deltaX) >= Math.abs(deltaZ)
        ? deltaX >= 0 ? "west" : "east"
        : deltaZ >= 0 ? "back" : "front";
      const doorGap = Math.min(1.35, Math.max(0.9, Math.min(extension.size.x, extension.size.z) * 0.32));
      const horizontalWall = (id: "back" | "front", z: number, cutaway: boolean) => {
        const extra = ["wall", "building-shell", "envelope-part", ...(cutaway ? ["focus-cutaway"] : [])];
        if (connectionSide !== id) {
          addRotatedBox(`envelope-${extension.id}-${id}`, extension.offset.x, z, extension.size.x, extensionHeight, 0.2, baseY, generated.material, extra);
          return;
        }
        const segmentWidth = Math.max(0.35, (extension.size.x - doorGap) / 2);
        const offset = (doorGap + segmentWidth) / 2;
        addRotatedBox(`envelope-${extension.id}-${id}-left`, extension.offset.x - offset, z, segmentWidth, extensionHeight, 0.2, baseY, generated.material, [...extra, "door-frame", "opening"]);
        addRotatedBox(`envelope-${extension.id}-${id}-right`, extension.offset.x + offset, z, segmentWidth, extensionHeight, 0.2, baseY, generated.material, [...extra, "door-frame", "opening"]);
      };
      const verticalWall = (id: "west" | "east", x: number, cutaway: boolean) => {
        const extra = ["wall", "building-shell", "envelope-part", ...(cutaway ? ["focus-cutaway"] : [])];
        if (connectionSide !== id) {
          addRotatedBox(`envelope-${extension.id}-${id}`, x, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, extra);
          return;
        }
        const segmentDepth = Math.max(0.35, (extension.size.z - doorGap) / 2);
        const offset = (doorGap + segmentDepth) / 2;
        addRotatedBox(`envelope-${extension.id}-${id}-north`, x, extension.offset.z - offset, 0.2, extensionHeight, segmentDepth, baseY, generated.material, [...extra, "door-frame", "opening"]);
        addRotatedBox(`envelope-${extension.id}-${id}-south`, x, extension.offset.z + offset, 0.2, extensionHeight, segmentDepth, baseY, generated.material, [...extra, "door-frame", "opening"]);
      };
      horizontalWall("back", extension.offset.z - extension.size.z / 2, false);
      horizontalWall("front", extension.offset.z + extension.size.z / 2, true);
      verticalWall("west", extension.offset.x - extension.size.x / 2, false);
      verticalWall("east", extension.offset.x + extension.size.x / 2, true);
    }
    const extensionRoof = point(extension.offset.x, extension.offset.z);
    if (extension.roof === "gable" || extension.roof === "hip") {
      scene.primitives.push(primitive(`${lot.id}-envelope-${extension.id}-roof`, "gable", 2, extensionRoof.x, baseY + extensionHeight, extensionRoof.z, extension.size.z * 1.06 * 1.524, Math.max(feetToMeters(2.2), extensionHeight * 0.18), extension.size.x * 1.08 * 1.524, "roof", [...tags, "roof", "envelope-part", extension.roof === "hip" ? "hip-roof" : "pitched-roof"], lot.rotation + Math.PI / 2));
    } else {
      addRotatedBox(`envelope-${extension.id}-roof`, extension.offset.x, extension.offset.z, extension.size.x * 1.04, 0.2, extension.size.z * 1.04, baseY + extensionHeight, "roof", ["roof", "flat-roof", "envelope-part", "standable"], 2);
    }
    if (!lot.siteProfile) continue;
    const roomProgram = interiorProgram.rooms.find((room) => room.id === `ground-service-${extensionIndex + 1}`);
    const extensionPoint = point(extension.offset.x, extension.offset.z);
    const extensionRoomId = `${lot.id}-${roomProgram?.id ?? `envelope-room-${extensionIndex + 1}`}`;
    scene.rooms.push(createRoom(
      extensionRoomId,
      roomProgram?.name ?? `${labels.serviceName} ${extensionIndex + 1}`,
      roomProgram?.role ?? "service",
      0,
      extensionPoint.x,
      extensionPoint.z,
      roomProgram?.sizeCells.x ?? extension.size.x * 0.82,
      roomProgram?.sizeCells.z ?? extension.size.z * 0.78,
      baseY,
    ));
    connectRooms(scene.rooms, publicId, extensionRoomId);
    extensionRooms.push({ id: extensionRoomId, x: extensionPoint.x, z: extensionPoint.z });

    const thresholdLocalX = primaryOffset.x + (extension.offset.x - primaryOffset.x) * 0.54;
    const thresholdLocalZ = primaryOffset.z + (extension.offset.z - primaryOffset.z) * 0.54;
    const threshold = point(thresholdLocalX, thresholdLocalZ);
    const connectorRotation = lot.rotation + Math.atan2(extension.offset.z - primaryOffset.z, extension.offset.x - primaryOffset.x);
    scene.primitives.push(box(
      `${lot.id}-envelope-${extension.id}-door-threshold`,
      0,
      threshold.x,
      baseY + 0.04,
      threshold.z,
      1.15,
      0.12,
      1.45,
      "wood",
      [...tags, "door", "opening", "room-connector", `program-room:${roomProgram?.id ?? extension.id}`],
      connectorRotation,
    ));
    scene.routes.push(createRoute(`${lot.id}-envelope-${extension.id}-route`, "alternate", [
      { x: publicP.x, z: publicP.z, y: baseY },
      { x: threshold.x, z: threshold.z, y: baseY },
      { x: extensionPoint.x, z: extensionPoint.z, y: baseY },
    ], { purpose: "service", traffic: 0.34, schedule: "all" }));

    const fixtureMaterial: MaterialKey = lot.siteProfile === "weather-station" || lot.siteProfile === "field-station" ? "metal" : "wood";
    const fixtureTags = lot.siteProfile === "quarantine-station"
      ? ["screened-bay", "medical-fixture", "cover"]
      : lot.siteProfile === "weather-station"
        ? ["instrument-console", "weather-instruments", "cover"]
        : lot.siteProfile === "field-station"
          ? ["sample-bench", "field-laboratory", "cover"]
          : ["service-fixture", "cover"];
    const fixtureOffset = extensionIndex % 2 === 0 ? -0.18 : 0.18;
    addRotatedBox(
      `envelope-${extension.id}-fixture`,
      extension.offset.x + extension.size.x * fixtureOffset,
      extension.offset.z,
      Math.max(0.9, extension.size.x * 0.32),
      feetToMeters(3.1),
      Math.max(0.8, extension.size.z * 0.24),
      baseY + FLOOR_SLAB_METERS,
      fixtureMaterial,
      [labels.tags[Math.min(extensionIndex + 1, labels.tags.length - 1)] ?? "service", ...fixtureTags],
    );
  }
  scene.tactical.push(tacticalFeature(`${lot.id}-interior-choke`, "chokepoint", lot.x, lot.z + depth * 0.34, baseY, 1, "The independently generated entrance and internal partition form a defensible threshold."));
  const instance: BuildingInstance = {
    id: lot.id, archetype: lot.kind, seed: lot.seed, district: lot.district,
    positionCells: { x: lot.x, z: lot.z }, footprintCells: { x: lot.width, z: lot.depth }, rotationY: lot.rotation,
    floors: 4, floorHeightFeet: [generated.floorHeightFeet[0] ?? 10, generated.floorHeightFeet[1] ?? 9, 8, 10], detailLevel: "full-interior",
    baseYMeters: baseY,
    exteriorHeightMeters: wallHeight * 1.82,
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}), ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}), entranceCells: frontDoorP,
    buildingProgram: summarizeBuildingProgram(interiorProgram, [...labels.tags, ...functionalTags(lot)]),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  addFunctionalModuleGeometry(scene, lot, generated, { y: basementY, halfWidthCells: width * 0.32, depthCells: depth * 0.58 });
  const totalHeight = generated.floorHeightFeet.reduce((sum, height) => sum + feetToMeters(height), 0);
  addSiteClimateFacadeGeometry(scene, lot, baseY, totalHeight, envelope);
  addWaterfrontExterior(scene, lot, generated, baseY, totalHeight);
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
  const generated = profile(lot.kind, rng, lot.siteProfile);
  if (lot.functionalModules?.some((module) => module.kind === "laboratory" && module.levelRole === "upper")) generated.material = "wood";
  const envelope = planBuildingEnvelope(lot.kind, lot.width, lot.depth, rng.fork("building-envelope"), lot.siteProfile);
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
  addSiteClimateFacadeGeometry(scene, lot, y, totalHeight, envelope);
  addWaterfrontExterior(scene, lot, generated, y, totalHeight);

  if (!scene.rooms.some((room) => room.id === `${lot.id}-room`)) {
    scene.rooms.push(createRoom(`${lot.id}-room`, `${lot.kind} at ${lot.district}`, lot.kind === "warehouse" ? "service" : lot.kind === "tower" ? "combat" : "public", 0, lot.x, lot.z, lot.width, lot.depth));
  }
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
    buildingProgram: summarizeBuildingProgram(interiorProgram, [...fullInteriorLabels(lot.kind, lot.siteProfile).tags, ...functionalTags(lot)]),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}
