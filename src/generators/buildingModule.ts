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
  /** Explicit prompt-owned above-ground floor count. */
  floorCount?: number;
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

/**
 * Mass proxies are intentionally cheap, but they must still communicate the
 * building's use and silhouette from a settlement overview.  These landmarks
 * are structural cues (porches, chimneys, buttresses, monitors), not labels or
 * decorative noise.  Full/facade LODs keep their richer fixtures below.
 */
function addMassSilhouetteLandmarks(
  scene: GeneratedScene,
  lot: BuildingLot,
  envelope: BuildingEnvelopeProgram,
  baseY: number,
  totalHeight: number,
  tags: readonly string[],
): void {
  const primary = envelope.parts[0];
  if (!primary) return;
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const landmarkTags = [...tags, "mass-silhouette", "facade-landmark", "non-standable"];
  const frontZ = primary.offset.z + primary.size.z * 0.5 + 0.08;

  if (lot.kind === "home" || lot.kind === "tavern" || lot.kind === "manor") {
    const porch = point(primary.offset.x, frontZ + 0.62);
    scene.primitives.push(
      box(`${lot.id}-mass-porch`, 0, porch.x, baseY, porch.z, Math.min(primary.size.x * 0.54, 4.2), feetToMeters(1.1), 1.15, "wood", [...landmarkTags, "porch", "entrance-threshold"], lot.rotation),
    );
    const chimney = point(primary.offset.x - primary.size.x * 0.28, primary.offset.z - primary.size.z * 0.18);
    scene.primitives.push(
      box(`${lot.id}-mass-chimney`, 0, chimney.x, baseY, chimney.z, 0.58, Math.max(feetToMeters(7), totalHeight * 0.9), 0.58, "darkStone", [...landmarkTags, "chimney", "vertical-landmark"], lot.rotation),
    );
  }

  if (lot.kind === "shrine") {
    const nave = envelope.parts.find((part) => part.id === "nave") ?? primary;
    for (const side of [-1, 1]) {
      const buttress = point(nave.offset.x + side * nave.size.x * 0.46, nave.offset.z + nave.size.z * 0.06);
      scene.primitives.push(
        box(`${lot.id}-mass-buttress-${side < 0 ? "west" : "east"}`, 0, buttress.x, baseY, buttress.z, 0.42, totalHeight * 0.78, 0.72, "stone", [...landmarkTags, "buttress", "cover"], lot.rotation),
      );
    }
  }

  if (lot.kind === "warehouse" || lot.kind === "factory") {
    const bay = envelope.parts.find((part) => part.id === "main-bay") ?? primary;
    const monitorCount = lot.kind === "factory" ? 3 : 1;
    for (let index = 0; index < monitorCount; index += 1) {
      const t = (index + 1) / (monitorCount + 1);
      const monitor = point(bay.offset.x + (t - 0.5) * bay.size.x * 0.82, bay.offset.z - bay.size.z * 0.08);
      scene.primitives.push(
        primitive(`${lot.id}-mass-monitor-${index + 1}`, "gable", 1, monitor.x, baseY + totalHeight * 0.76, monitor.z, Math.min(3.2, bay.size.z * 0.26) * GRID_METERS, feetToMeters(2.2), Math.min(2.8, bay.size.x * 0.22) * GRID_METERS, "roof", [...landmarkTags, "roof-monitor", "industrial-silhouette"], lot.rotation + Math.PI / 2),
      );
    }
  }

  if (lot.kind === "mill") {
    const wheel = point(lot.width * 0.46, lot.depth * 0.02);
    scene.primitives.push(
      cylinder(`${lot.id}-mass-wheel`, 0, wheel.x, baseY, wheel.z, 2.8, feetToMeters(7), "wood", [...landmarkTags, "mill-wheel", "vertical-landmark"]),
    );
  }
}

function profile(kind: SettlementBuildingKind, rng: GeneratorContext["rng"], siteProfile?: SiteBuildingProfile, requestedFloors?: number): { floors: number; floorHeightFeet: number[]; material: MaterialKey } {
  const generatedFloors = siteProfile === "wizard-tower" ? rng.int(4, 5)
    : siteProfile === "field-station" ? rng.int(1, 2)
    : siteProfile === "weather-station" ? rng.int(1, 2)
    : siteProfile === "quarantine-station" ? rng.int(1, 2)
      : siteProfile === "ranger-station" ? rng.int(1, 2)
        : siteProfile === "border-outpost" ? 2
          : siteProfile === "observatory" ? rng.int(2, 3)
            : siteProfile === "forge" ? rng.int(1, 2)
              : siteProfile === "sanatorium" ? rng.int(2, 3)
                : kind === "tower" ? rng.int(3, 5)
    : kind === "warehouse" ? rng.int(1, 2)
      : kind === "shrine" ? rng.int(1, 2)
        : kind === "home" ? rng.int(1, 3)
          : kind === "factory" || kind === "barn" ? rng.int(1, 2)
            : rng.int(2, 3);
  const floors = requestedFloors === undefined ? generatedFloors : Math.max(1, Math.min(6, Math.round(requestedFloors)));
  const range: readonly [number, number] = siteProfile === "wizard-tower" ? [11, 14]
    : siteProfile === "forge" ? [14, 18]
      : siteProfile === "sanatorium" ? [11, 14]
        : siteProfile ? [9, 12]
    : kind === "warehouse" ? [14, 18]
    : kind === "shrine" ? [14, 20]
      : kind === "tower" ? [10, 13]
        : kind === "tavern" ? [10, 12]
          : kind === "manor" ? [11, 14]
            : [9, 11];
  const floorHeightFeet = Array.from({ length: floors }, () => rng.int(range[0], range[1]));
  const material: MaterialKey = siteProfile === "wizard-tower" ? "darkStone"
    : siteProfile === "field-station" ? "darkStone"
    : siteProfile === "weather-station" ? "metal"
    : siteProfile === "quarantine-station" ? "wood"
      : siteProfile === "ranger-station" ? "wood"
        : siteProfile === "border-outpost" ? "darkStone"
          : siteProfile === "observatory" ? "metal"
            : siteProfile === "forge" ? "darkStone"
              : siteProfile === "sanatorium" ? "plaster"
                : kind === "warehouse" || kind === "tower" || kind === "factory" ? "darkStone"
    : kind === "shrine" ? "stone"
      : kind === "tavern" ? "wood"
        : "plaster";
  return { floors, floorHeightFeet, material };
}

function fullInteriorLabels(kind: SettlementBuildingKind, siteProfile?: SiteBuildingProfile): { publicName: string; serviceName: string; upperName: string; basementName: string; tags: string[] } {
  if (siteProfile === "wizard-tower") return { publicName: "Arcane receiving and ritual chamber", serviceName: "Alchemy laboratory", upperName: "Spell library and observatory", basementName: "Sealed reagent vault", tags: ["ritual-chamber", "alchemy-laboratory", "spell-library", "reagent-vault"] };
  if (siteProfile === "weather-station") return { publicName: "Weather operations room", serviceName: "Instrument and radio bay", upperName: "Observation loft", basementName: "Emergency reserve vault", tags: ["weather-operations", "instrument-bay", "observation", "reserve-vault"] };
  if (siteProfile === "quarantine-station") return { publicName: "Screened quarantine reception", serviceName: "Treatment and decontamination wing", upperName: "Quarantine watch loft", basementName: "Secured medicine vault", tags: ["quarantine-reception", "decontamination", "quarantine-watch", "medical-vault"] };
  if (siteProfile === "field-station") return { publicName: "Field laboratory and briefing bay", serviceName: "Sample processing wing", upperName: "Observation and radio loft", basementName: "Specimen archive vault", tags: ["field-laboratory", "sample-processing", "observation", "specimen-archive"] };
  if (siteProfile === "ranger-station") return { publicName: "Ranger ready room", serviceName: "Equipment and trail store", upperName: "Watch loft", basementName: "Emergency cache", tags: ["ranger-ready-room", "equipment-store", "watch-loft", "reserve-vault"] };
  if (siteProfile === "border-outpost") return { publicName: "Border inspection room", serviceName: "Guard and equipment wing", upperName: "Watch chamber", basementName: "Secured supply vault", tags: ["inspection-room", "guard-room", "watch-chamber", "supply-vault"] };
  if (siteProfile === "observatory") return { publicName: "Observation control room", serviceName: "Instrument calibration lab", upperName: "Star dome and chart loft", basementName: "Darkroom and archive vault", tags: ["observation-control", "instrument-lab", "star-dome", "darkroom-archive"] };
  if (siteProfile === "forge") return { publicName: "Black-iron forge hall", serviceName: "Smelter and quench bay", upperName: "Smiths gallery", basementName: "Ore and slag store", tags: ["forge-hall", "smelter", "quench-bay", "ore-store"] };
  if (siteProfile === "sanatorium") return { publicName: "Sanatorium reception and day room", serviceName: "Treatment and hydrotherapy wing", upperName: "Patient ward gallery", basementName: "Boiler and medical archive", tags: ["sanatorium-reception", "treatment-wing", "patient-ward", "boiler-archive"] };
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
    const role = module.kind === "observation" ? "combat"
      : module.kind === "archive" || module.kind === "storage" || module.kind === "quarters" ? "private"
        : module.kind === "chapel" ? "public"
          : "service";
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
  if (lot.kind === "tower") {
    scene.primitives.push(
      box(`${lot.id}-waterfront-tower-landing`, 0, edge.x, y, edge.z, Math.min(lot.width * 0.46, 3.4), 0.22, 1.25, "stone", [...tags, "tower-landing", "quay-threshold", "standable", "cover"], lot.rotation),
    );
    for (const [index, offset] of [-0.38, 0.38].entries()) {
      const post = point(lot.width * offset * 0.46, frontage + 0.5);
      scene.primitives.push(cylinder(`${lot.id}-waterfront-tower-mooring-${index + 1}`, 0, post.x, y, post.z, 0.16, feetToMeters(3.8), "wood", [...tags, "mooring-post", "cover"]));
    }
    return;
  }
  if (lot.district === "commercial") {
    const canopy = point(0, frontage + 0.72);
    scene.primitives.push(
      box(`${lot.id}-waterfront-market-canopy`, 0, canopy.x, y + feetToMeters(7.2), canopy.z, Math.min(lot.width * 0.72, 7.5), 0.16, 1.8, "wood", [...tags, "market-canopy", "cover"], lot.rotation),
      box(`${lot.id}-waterfront-market-counter`, 0, edge.x, y + feetToMeters(2.2), edge.z, Math.min(lot.width * 0.58, 5.2), feetToMeters(2.2), 0.7, "wood", [...tags, "market-counter", "cover"], lot.rotation),
    );
    for (const [index, offset] of [-0.42, 0.42].entries()) {
      const support = point(lot.width * offset * 0.72, frontage + 0.72);
      scene.primitives.push(cylinder(`${lot.id}-waterfront-market-support-${index + 1}`, 0, support.x, y, support.z, 0.16, feetToMeters(7.2), "wood", [...tags, "market-canopy-support", "structural-support"]));
    }
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
  const exteriorFunctionalWings = lot.id === "wilderness-core-building";
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
    let side = index % 2 === 0 ? 1 : -1;
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
      const shaftWallHalfWidth = flightOffsetX + 0.74;
      const shaftWallHeight = baseY - archiveY;
      const shaftWestWall = point(archiveLocalX - shaftWallHalfWidth, localZ);
      const shaftEastWall = point(archiveLocalX + shaftWallHalfWidth, localZ);
      const shaftLandingWall = point(archiveLocalX, localZ + flightRun / 2 + 0.68);
      const landingSupportWest = point(archiveLocalX - flightOffsetX, localZ + flightRun / 2);
      const landingSupportEast = point(archiveLocalX + flightOffsetX, localZ + flightRun / 2);
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
        box(`${lot.id}-${module.kind}-shaft-wall-west`, 3, shaftWestWall.x, archiveY, shaftWestWall.z, 0.18, shaftWallHeight, flightRun + 1.36, "darkStone", [...common, `function:${module.kind}`, "archive-access", "stairwell-wall", "structural-support", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-wall-east`, 3, shaftEastWall.x, archiveY, shaftEastWall.z, 0.18, shaftWallHeight, flightRun + 1.36, "darkStone", [...common, `function:${module.kind}`, "archive-access", "stairwell-wall", "structural-support", "underground", "focus-cutaway"], lot.rotation),
        box(`${lot.id}-${module.kind}-shaft-wall-landing`, 3, shaftLandingWall.x, archiveY, shaftLandingWall.z, shaftWallHalfWidth * 2, shaftWallHeight, 0.18, "darkStone", [...common, `function:${module.kind}`, "archive-access", "stairwell-wall", "structural-support", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-landing-support-west`, 3, landingSupportWest.x, archiveY, landingSupportWest.z, 0.18, flightRise, 0.18, "darkStone", [...common, `function:${module.kind}`, "archive-access", "landing-support", "structural-support", "underground"], lot.rotation),
        box(`${lot.id}-${module.kind}-landing-support-east`, 3, landingSupportEast.x, archiveY, landingSupportEast.z, 0.18, flightRise, 0.18, "darkStone", [...common, `function:${module.kind}`, "archive-access", "landing-support", "structural-support", "underground"], lot.rotation),
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
    } else if (module.kind === "storage") {
      const underground = module.levelRole === "basement";
      const storageY = underground ? undergroundY : baseY;
      const level = underground ? 3 : 0;
      const storageX = underground ? localX * 0.32 : localX * 0.5;
      const storageWidth = Math.max(3.2, lot.width * 0.38);
      const storageDepth = Math.max(3, lot.depth * 0.34);
      const center = point(storageX, localZ);
      for (const [rackIndex, rackOffset] of [-0.32, 0.32].entries()) {
        addBox(module, `rack-${rackIndex + 1}`, level, storageX + storageWidth * rackOffset, storageY + FLOOR_SLAB_METERS, localZ, 0.52, feetToMeters(6), storageDepth * 0.82, "metal", ["storage-rack", "cover", ...(underground ? ["underground"] : [])]);
        for (const [shelfIndex, heightFeet] of [1.1, 3, 4.9].entries()) {
          addBox(module, `rack-${rackIndex + 1}-shelf-${shelfIndex + 1}`, level, storageX + storageWidth * rackOffset, storageY + feetToMeters(heightFeet), localZ, 0.72, 0.14, storageDepth * 0.78, "wood", ["storage-shelf", "supply-store", ...(underground ? ["underground"] : [])]);
        }
      }
      for (const [crateIndex, xOffset, zOffset] of [[1, -0.08, -0.18], [2, 0.08, 0.12], [3, 0, 0.28]] as const) {
        addBox(module, `crate-${crateIndex}`, level, storageX + storageWidth * xOffset, storageY + FLOOR_SLAB_METERS, localZ + storageDepth * zOffset, 0.72, feetToMeters(1.8 + crateIndex * 0.25), 0.72, "wood", ["storage-crate", "cover", ...(underground ? ["underground"] : [])]);
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-cover`, "cover", center.x, center.z, storageY, 1.5, "Dense racks and stacked crates create narrow searchable cover lanes."));
    } else if (module.kind === "hangar") {
      const hangarWidth = Math.max(6.8, lot.width * 0.74);
      const hangarDepth = Math.max(5.8, lot.depth * 0.62);
      // A hangar is much wider than the normal functional annexes.  When the
      // parent building sits near a wilderness boundary, blindly alternating
      // left/right can send the wide door, launch apron and its route beyond
      // the authored scene or cut through an already-authored wilderness
      // route. Preserve the Seed-selected side whenever it fits both
      // constraints; otherwise prefer the alternate side only when it has
      // better boundary clearance and does not intersect the service network.
      const maximumX = scene.boundsCells.x;
      const maximumZ = scene.boundsCells.z;
      const apronWidth = 5.2;
      const toLocal = (worldX: number, worldZ: number): { x: number; z: number } => {
        const dx = worldX / GRID_METERS - lot.x;
        const dz = worldZ / GRID_METERS - lot.z;
        const cosine = Math.cos(lot.rotation);
        const sine = Math.sin(lot.rotation);
        return {
          x: dx * cosine - dz * sine,
          z: dx * sine + dz * cosine,
        };
      };
      const apronMargin = (candidateSide: number): number => {
        const candidateHangarX = candidateSide * (lot.width * 0.5 + hangarWidth * 0.5 + 0.28);
        const candidateApronX = candidateHangarX + candidateSide * (hangarWidth / 2 + 2.7);
        const outerEdge = point(candidateApronX + candidateSide * apronWidth * 0.5, localZ);
        return Math.min(outerEdge.x, maximumX - outerEdge.x, outerEdge.z, maximumZ - outerEdge.z);
      };
      const routeCrossesBackWall = (candidateSide: number): boolean => {
        const candidateHangarX = candidateSide * (lot.width * 0.5 + hangarWidth * 0.5 + 0.28);
        const wallZ = localZ - hangarDepth / 2;
        const wallMinX = candidateHangarX - hangarWidth / 2 - 0.55;
        const wallMaxX = candidateHangarX + hangarWidth / 2 + 0.55;
        const wallTolerance = 0.55;
        return scene.routes.some((route) => route.points.some((routePoint, pointIndex) => {
          const next = route.points[pointIndex + 1];
          if (!next) return false;
          const from = toLocal(routePoint.x, routePoint.z);
          const to = toLocal(next.x, next.z);
          const segmentMinZ = Math.min(from.z, to.z);
          const segmentMaxZ = Math.max(from.z, to.z);
          if (segmentMaxZ < wallZ - wallTolerance || segmentMinZ > wallZ + wallTolerance) return false;
          const deltaZ = to.z - from.z;
          if (Math.abs(deltaZ) < 1e-6) {
            return Math.abs(from.z - wallZ) <= wallTolerance
              && Math.max(from.x, to.x) >= wallMinX
              && Math.min(from.x, to.x) <= wallMaxX;
          }
          const ratio = (wallZ - from.z) / deltaZ;
          if (ratio < -0.08 || ratio > 1.08) return false;
          const intersectionX = from.x + (to.x - from.x) * ratio;
          return intersectionX >= wallMinX && intersectionX <= wallMaxX;
        }));
      };
      const preferredMargin = apronMargin(side);
      const alternateMargin = apronMargin(-side);
      const preferredCrossesRoute = routeCrossesBackWall(side);
      const alternateCrossesRoute = routeCrossesBackWall(-side);
      if (
        (preferredMargin < 0 || preferredCrossesRoute)
        && alternateMargin > preferredMargin
        && !alternateCrossesRoute
      ) side *= -1;
      const hangarX = side * (lot.width * 0.5 + hangarWidth * 0.5 + 0.28);
      const hangarZ = localZ;
      const hangarHeight = feetToMeters(16);
      const center = addBox(module, "floor", 0, hangarX, baseY, hangarZ, hangarWidth, FLOOR_SLAB_METERS, hangarDepth, "stone", ["floor", "standable", "hangar-floor", "maintenance-bay"]);
      addBox(module, "back-wall", 0, hangarX, baseY, hangarZ - hangarDepth / 2, hangarWidth, hangarHeight, 0.22, "metal", ["wall", "hangar-shell", "structural-support"]);
      const innerX = hangarX - side * hangarWidth / 2;
      const outerX = hangarX + side * hangarWidth / 2;
      const wideDoorDepth = Math.max(3.6, hangarDepth * 0.68);
      const outerWallSegmentDepth = Math.max(0.65, (hangarDepth - wideDoorDepth) / 2);
      const outerWallOffset = (wideDoorDepth + outerWallSegmentDepth) / 2;
      addBox(module, "outer-wall-north", 0, outerX, baseY, hangarZ - outerWallOffset, 0.22, hangarHeight, outerWallSegmentDepth, "metal", ["wall", "hangar-shell", "wide-door", "opening", "structural-support"]);
      addBox(module, "outer-wall-south", 0, outerX, baseY, hangarZ + outerWallOffset, 0.22, hangarHeight, outerWallSegmentDepth, "metal", ["wall", "hangar-shell", "wide-door", "opening", "structural-support"]);
      addBox(module, "door-header", 1, outerX, baseY + feetToMeters(12.5), hangarZ, 0.32, feetToMeters(3.5), wideDoorDepth, "metal", ["hangar-shell", "wide-door", "door-header", "structural-support"]);
      const personnelDoorDepth = Math.min(1.35, hangarDepth * 0.24);
      const innerWallSegmentDepth = Math.max(0.7, (hangarDepth - personnelDoorDepth) / 2);
      const innerWallOffset = (personnelDoorDepth + innerWallSegmentDepth) / 2;
      addBox(module, "inner-wall-north", 0, innerX, baseY, hangarZ - innerWallOffset, 0.22, hangarHeight, innerWallSegmentDepth, "metal", ["wall", "hangar-shell", "personnel-door", "opening"]);
      addBox(module, "inner-wall-south", 0, innerX, baseY, hangarZ + innerWallOffset, 0.22, hangarHeight, innerWallSegmentDepth, "metal", ["wall", "hangar-shell", "personnel-door", "opening"]);
      const roofCenter = point(hangarX, hangarZ);
      scene.primitives.push(primitive(`${lot.id}-${module.kind}-roof`, "gable", 2, roofCenter.x, baseY + hangarHeight, roofCenter.z, hangarDepth * 1.06 * GRID_METERS, feetToMeters(4.5), hangarWidth * 1.06 * GRID_METERS, "roof", [...common, `function:${module.kind}`, ...module.tags, "hangar-roof", "pitched-roof"], lot.rotation + Math.PI / 2));
      for (const [trussIndex, zOffset] of [-0.32, 0, 0.32].entries()) {
        addBox(module, `roof-truss-${trussIndex + 1}`, 1, hangarX, baseY + feetToMeters(12.2), hangarZ + hangarDepth * zOffset, hangarWidth * 0.9, 0.22, 0.22, "metal", ["roof-truss", "hangar-shell", "structural-support", "overhead"]);
      }
      addBox(module, "ridge-monitor", 2, hangarX, baseY + hangarHeight + feetToMeters(1.2), hangarZ, hangarWidth * 0.46, feetToMeters(2.1), 0.72, "metal", ["ridge-monitor", "hangar-shell", "ventilation", "vertical-landmark"]);
      for (const [postIndex, xOffset] of [-0.34, 0, 0.34].entries()) addBox(module, `gantry-post-${postIndex + 1}`, 0, hangarX + hangarWidth * xOffset, baseY, hangarZ - hangarDepth * 0.3, 0.24, feetToMeters(10), 0.24, "metal", ["gantry", "structural-support", "cover"]);
      addBox(module, "gantry-beam", 1, hangarX, baseY + feetToMeters(10), hangarZ - hangarDepth * 0.3, hangarWidth * 0.78, 0.24, 0.3, "metal", ["gantry", "overhead", "maintenance-bay"]);
      addBox(module, "service-cradle", 0, hangarX, baseY + FLOOR_SLAB_METERS, hangarZ + hangarDepth * 0.12, hangarWidth * 0.52, feetToMeters(2.4), 1.6, "wood", ["vehicle-cradle", "maintenance-bay", "cover"]);
      for (const [trackIndex, zOffset] of [-0.42, 0.42].entries()) {
        addBox(module, `door-track-${trackIndex + 1}`, 0, outerX + side * 0.18, baseY, hangarZ + wideDoorDepth * zOffset, 0.18, hangarHeight * 0.86, 0.18, "metal", ["door-track", "wide-door", "hangar-shell", "structural-support"]);
      }
      const apronX = hangarX + side * (hangarWidth / 2 + 2.7);
      const apron = addBox(module, "launch-apron", 0, apronX, baseY, hangarZ, apronWidth, FLOOR_SLAB_METERS, wideDoorDepth * 0.92, "wood", ["floor", "platform", "hangar-apron", "launch-deck", "standable", "exterior-route"]);
      for (const [supportIndex, zOffset] of [-0.34, 0.34].entries()) {
        addCylinder(module, `apron-support-${supportIndex + 1}`, 0, apronX + side * apronWidth * 0.38, Math.min(0, baseY - feetToMeters(8)), hangarZ + wideDoorDepth * zOffset, 0.32, Math.max(feetToMeters(8), baseY), "metal", ["hangar-apron", "structural-support", "supported"]);
      }
      for (const [railIndex, zOffset] of [-0.48, 0.48].entries()) {
        addBox(module, `apron-rail-${railIndex + 1}`, 0, apronX, baseY + feetToMeters(2.8), hangarZ + wideDoorDepth * 0.44 * zOffset / 0.48, apronWidth * 0.82, 0.12, 0.12, "metal", ["apron-rail", "railing", "hangar-apron", "edge-protection"]);
      }
      const threshold = point(side * lot.width * 0.46, hangarZ);
      const hangarDoor = point(hangarX - side * hangarWidth / 2, hangarZ);
      const launchDoor = point(outerX, hangarZ);
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "alternate", [
        { x: threshold.x, z: threshold.z, y: baseY },
        { x: hangarDoor.x, z: hangarDoor.z, y: baseY },
        { x: center.x, z: center.z, y: baseY },
        { x: launchDoor.x, z: launchDoor.z, y: baseY },
        { x: apron.x, z: apron.z, y: baseY },
      ], { purpose: "service", traffic: 0.46, schedule: "all" }));
      if (moduleRoom) {
        moduleRoom.center = { x: center.x, y: baseY, z: center.z };
        moduleRoom.sizeCells = { x: hangarWidth * 0.84, z: hangarDepth * 0.82 };
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-choke`, "chokepoint", hangarDoor.x, hangarDoor.z, baseY, 1.5, "The wide hangar threshold opens into a gantry-framed maintenance arena."));
    } else if (module.kind === "fuel") {
      const underground = module.levelRole === "basement";
      const fuelY = underground ? undergroundY : baseY;
      const level = underground ? 3 : 0;
      const fuelX = underground ? localX * 0.28 : side * (lot.width * 0.5 + 2.2);
      const fuelWidth = 4.8;
      const fuelDepth = 4.4;
      const center = point(fuelX, localZ);
      addBox(module, "containment-floor", level, fuelX, fuelY, localZ, fuelWidth, FLOOR_SLAB_METERS, fuelDepth, underground ? "darkStone" : "stone", ["floor", "standable", "fuel-containment", "containment-floor", ...(underground ? ["underground"] : ["exterior-hazard-zone"])]);
      const entrySide = underground ? -Math.sign(fuelX || 1) : -side;
      const entryX = fuelX + entrySide * fuelWidth * 0.5;
      const curbHeight = feetToMeters(1.35);
      addBox(module, "containment-curb-north", level, fuelX, fuelY, localZ - fuelDepth * 0.5, fuelWidth, curbHeight, 0.18, "stone", ["containment-curb", "hazard-boundary", "cover", ...(underground ? ["underground"] : [])]);
      addBox(module, "containment-curb-south", level, fuelX, fuelY, localZ + fuelDepth * 0.5, fuelWidth, curbHeight, 0.18, "stone", ["containment-curb", "hazard-boundary", "cover", ...(underground ? ["underground"] : [])]);
      const curbSegmentDepth = Math.max(0.8, (fuelDepth - 1.3) / 2);
      const curbOffset = (1.3 + curbSegmentDepth) / 2;
      addBox(module, "containment-curb-entry-north", level, entryX, fuelY, localZ - curbOffset, 0.18, curbHeight, curbSegmentDepth, "stone", ["containment-curb", "fuel-route-opening", "hazard-boundary", ...(underground ? ["underground"] : [])]);
      addBox(module, "containment-curb-entry-south", level, entryX, fuelY, localZ + curbOffset, 0.18, curbHeight, curbSegmentDepth, "stone", ["containment-curb", "fuel-route-opening", "hazard-boundary", ...(underground ? ["underground"] : [])]);
      const farCurbX = fuelX - entrySide * fuelWidth * 0.5;
      addBox(module, "containment-curb-far", level, farCurbX, fuelY, localZ, 0.18, curbHeight, fuelDepth, "stone", ["containment-curb", "hazard-boundary", "cover", ...(underground ? ["underground"] : [])]);
      for (const [tankIndex, offset] of [-1.25, 0, 1.25].entries()) {
        addCylinder(module, `tank-${tankIndex + 1}`, level, fuelX + offset, fuelY + FLOOR_SLAB_METERS, localZ, 1.05, feetToMeters(5.6), "metal", ["fuel-tank", "hazard", "cover", ...(underground ? ["underground"] : [])]);
      }
      addBox(module, "manifold", level, fuelX, fuelY + feetToMeters(4.6), localZ, 3.8, 0.22, 0.3, "metal", ["fuel-manifold", "pipe", "hazard", ...(underground ? ["underground"] : [])]);
      addBox(module, "control-valve", level, fuelX, fuelY + FLOOR_SLAB_METERS, localZ + 1.45, 1.2, feetToMeters(3.2), 0.72, "metal", ["fuel-control", "restricted", "cover", ...(underground ? ["underground"] : [])]);
      addCylinder(module, "vent-stack", level, farCurbX + entrySide * 0.38, fuelY, localZ - fuelDepth * 0.3, 0.42, underground ? baseY - fuelY + feetToMeters(7) : feetToMeters(11), "metal", ["vent-stack", "fuel-ventilation", "vertical-landmark", "hazard", ...(underground ? ["underground-to-surface"] : [])]);
      for (const [bollardIndex, zOffset] of [-0.65, 0.65].entries()) {
        addCylinder(module, `impact-bollard-${bollardIndex + 1}`, level, entryX + entrySide * 0.35, fuelY, localZ + zOffset, 0.28, feetToMeters(3.1), "metal", ["impact-bollard", "fuel-route-opening", "cover", ...(underground ? ["underground"] : [])]);
      }
      const fuelEntry = point(entryX, localZ);
      const fuelThreshold = point(underground ? localX * 0.12 : side * lot.width * 0.46, localZ);
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "alternate", [
        { x: fuelThreshold.x, z: fuelThreshold.z, y: fuelY },
        { x: fuelEntry.x, z: fuelEntry.z, y: fuelY },
        { x: center.x, z: center.z, y: fuelY },
      ], { purpose: "service", traffic: 0.24, schedule: "all" }));
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-hazard`, "hazard", center.x, center.z, fuelY, 1.8, "Pressurized fuel tanks turn the store into a high-risk objective."));
    } else if (module.kind === "quarters") {
      const elevated = generated.floors > 1 && module.levelRole === "upper";
      const quartersY = elevated ? baseY + groundHeight : baseY;
      const level = elevated ? 1 : 0;
      const quartersX = localX * 0.38;
      const quartersWidth = Math.max(3.8, lot.width * 0.42);
      const quartersDepth = Math.max(3.4, lot.depth * 0.38);
      const center = point(quartersX, localZ);
      addBox(module, "privacy-screen", level, quartersX, quartersY, localZ, 0.16, feetToMeters(6.2), quartersDepth * 0.72, "wood", ["quarters-partition", "wall", "opening"]);
      for (const [bunkIndex, xOffset, zOffset] of [[1, -0.25, -0.22], [2, 0.25, -0.22], [3, -0.25, 0.22], [4, 0.25, 0.22]] as const) {
        addBox(module, `bunk-${bunkIndex}`, level, quartersX + quartersWidth * xOffset, quartersY + FLOOR_SLAB_METERS, localZ + quartersDepth * zOffset, 0.78, feetToMeters(2.1), 1.55, "wood", ["bunk", "quarters", "cover", "private"]);
      }
      addBox(module, "locker-bank", level, quartersX + quartersWidth * 0.34, quartersY + FLOOR_SLAB_METERS, localZ, 0.62, feetToMeters(5.2), quartersDepth * 0.5, "metal", ["locker", "quarters", "cover"]);
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-cover`, "cover", center.x, center.z, quartersY, 1.4, "Bunks, lockers and privacy screens create close interior cover."));
    } else if (module.kind === "chapel") {
      const chapelWidth = exteriorFunctionalWings ? Math.max(4.8, lot.width * 0.46) : Math.max(3.8, lot.width * 0.58);
      const chapelDepth = exteriorFunctionalWings ? Math.max(5.6, lot.depth * 0.52) : Math.max(3.8, lot.depth * 0.68);
      const chapelX = exteriorFunctionalWings ? side * (lot.width * 0.5 + chapelWidth * 0.3) : localX * 0.28;
      const chapelHeight = feetToMeters(11.5);
      const center = point(chapelX, localZ);
      addBox(module, "floor", 0, chapelX, baseY, localZ, chapelWidth, FLOOR_SLAB_METERS, chapelDepth, "stone", ["floor", "standable", "chapel-floor", "processional-aisle"]);
      const entryX = chapelX - side * chapelWidth * 0.5;
      if (exteriorFunctionalWings) {
        const rearOpeningWidth = Math.min(1.5, chapelWidth * 0.28);
        const rearSegmentWidth = Math.max(0.8, (chapelWidth - rearOpeningWidth) / 2);
        const rearOpeningOffset = (rearOpeningWidth + rearSegmentWidth) / 2;
        addBox(module, "rear-wall-west", 0, chapelX - rearOpeningOffset, baseY, localZ - chapelDepth * 0.5, rearSegmentWidth, chapelHeight, 0.2, "stone", ["wall", "chapel-shell", "apse"]);
        addBox(module, "rear-wall-east", 0, chapelX + rearOpeningOffset, baseY, localZ - chapelDepth * 0.5, rearSegmentWidth, chapelHeight, 0.2, "stone", ["wall", "chapel-shell", "apse"]);
        addBox(module, "rear-door-frame", 0, chapelX, baseY, localZ - chapelDepth * 0.5, rearOpeningWidth, feetToMeters(7), 0.22, "stone", ["door-frame", "opening", "chapel-shell", "apse", "alternate-route"]);
        const outerSideX = chapelX + side * chapelWidth * 0.5;
        addBox(module, "outer-side-wall", 0, outerSideX, baseY, localZ, 0.2, chapelHeight, chapelDepth, "stone", ["wall", "chapel-shell", "buttress-line"]);
        const entrySegmentDepth = Math.max(0.85, (chapelDepth - 1.4) / 2);
        const entryOffset = (1.4 + entrySegmentDepth) / 2;
        addBox(module, "entry-wall-north", 0, entryX, baseY, localZ - entryOffset, 0.2, chapelHeight, entrySegmentDepth, "stone", ["wall", "chapel-shell", "chapel-entry", "opening"]);
        addBox(module, "entry-wall-south", 0, entryX, baseY, localZ + entryOffset, 0.2, chapelHeight, entrySegmentDepth, "stone", ["wall", "chapel-shell", "chapel-entry", "opening"]);
      }
      const apseX = chapelX + side * chapelWidth * 0.34;
      addCylinder(module, "apse", 0, apseX, baseY, localZ - chapelDepth * 0.34, Math.max(2.4, chapelWidth * 0.52), chapelHeight * 0.78, "stone", ["apse", "chapel-shell", "sacred-focus", "vertical-landmark"]);
      addBox(module, "raised-sanctuary", 0, apseX, baseY + feetToMeters(0.8), localZ - chapelDepth * 0.29, chapelWidth * 0.56, FLOOR_SLAB_METERS, chapelDepth * 0.22, "stone", ["raised-sanctuary", "standable", "altar-platform", "high-ground"]);
      addBox(module, "altar", 0, apseX, baseY + feetToMeters(1), localZ - chapelDepth * 0.34, Math.max(1.5, chapelWidth * 0.34), feetToMeters(3.2), 0.9, "stone", ["altar", "chapel", "landmark", "cover"]);
      const aisleHalfWidth = Math.max(0.52, chapelWidth * 0.12);
      const pewHalfWidth = Math.max(0.8, chapelWidth * 0.5 - aisleHalfWidth - 0.42);
      for (const [pewIndex, zOffset] of [-0.04, 0.17, 0.38].entries()) {
        for (const pewSide of [-1, 1]) {
          addBox(module, `pew-${pewIndex + 1}-${pewSide < 0 ? "west" : "east"}`, 0, chapelX + pewSide * (aisleHalfWidth + pewHalfWidth * 0.5), baseY + FLOOR_SLAB_METERS, localZ + chapelDepth * zOffset, pewHalfWidth, feetToMeters(1.7), 0.46, "wood", ["pew", "chapel", "cover", "processional-aisle"]);
        }
      }
      const roofCenter = point(chapelX, localZ);
      scene.primitives.push(primitive(`${lot.id}-${module.kind}-roof`, "gable", 2, roofCenter.x, baseY + chapelHeight, roofCenter.z, chapelDepth * 1.06 * GRID_METERS, feetToMeters(4.2), chapelWidth * 1.08 * GRID_METERS, "roof", [...common, `function:${module.kind}`, ...module.tags, "chapel-roof", "pitched-roof", "sacred-silhouette"], lot.rotation + Math.PI / 2));
      const bellX = chapelX - side * chapelWidth * 0.26;
      for (const bellSide of [-1, 1]) addBox(module, `bell-cote-post-${bellSide < 0 ? "north" : "south"}`, 2, bellX, baseY + chapelHeight, localZ + bellSide * 0.42, 0.2, feetToMeters(5), 0.2, "stone", ["bell-cote", "chapel-roof", "structural-support", "vertical-landmark"]);
      addBox(module, "bell-cote-cap", 2, bellX, baseY + chapelHeight + feetToMeters(4.7), localZ, 0.55, 0.2, 1.25, "stone", ["bell-cote", "chapel-roof", "vertical-landmark"]);
      addCylinder(module, "bell", 2, bellX, baseY + chapelHeight + feetToMeters(1.7), localZ, 0.42, feetToMeters(2.2), "metal", ["bell-cote", "bell", "sacred-silhouette"]);
      const chapelEntry = point(entryX, localZ);
      const chapelThreshold = point(side * lot.width * 0.46, localZ);
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "alternate", [
        { x: chapelThreshold.x, z: chapelThreshold.z, y: baseY },
        { x: chapelEntry.x, z: chapelEntry.z, y: baseY },
        { x: center.x, z: center.z, y: baseY },
        { x: point(apseX, localZ - chapelDepth * 0.29).x, z: point(apseX, localZ - chapelDepth * 0.29).z, y: baseY + feetToMeters(0.8) },
      ], { purpose: "movement", traffic: 0.42, schedule: "all" }));
      if (moduleRoom) {
        moduleRoom.center = { x: center.x, y: baseY, z: center.z };
        moduleRoom.sizeCells = { x: chapelWidth * 0.82, z: chapelDepth * 0.86 };
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-choke`, "chokepoint", center.x, center.z, baseY, 1.4, "Pew rows and the altar screen create a sacred central bottleneck."));
    } else if (module.kind === "medical") {
      const medicalWidth = exteriorFunctionalWings ? Math.max(5.4, lot.width * 0.5) : Math.max(4.2, lot.width * 0.6);
      const medicalDepth = exteriorFunctionalWings ? Math.max(5.2, lot.depth * 0.48) : Math.max(3.8, lot.depth * 0.66);
      const medicalX = exteriorFunctionalWings ? side * (lot.width * 0.5 + medicalWidth * 0.28) : localX * 0.24;
      const medicalHeight = feetToMeters(10.5);
      const center = point(medicalX, localZ);
      addBox(module, "ward-floor", 0, medicalX, baseY, localZ, medicalWidth, FLOOR_SLAB_METERS, medicalDepth, "stone", ["floor", "standable", "ward-floor", "medical-wing"]);
      const entryX = medicalX - side * medicalWidth * 0.5;
      if (exteriorFunctionalWings) {
        addBox(module, "rear-wall", 0, medicalX, baseY, localZ - medicalDepth * 0.5, medicalWidth, medicalHeight, 0.2, "plaster", ["wall", "medical-shell", "ward-wall"]);
        const outerSideX = medicalX + side * medicalWidth * 0.5;
        addBox(module, "outer-side-wall", 0, outerSideX, baseY, localZ, 0.2, medicalHeight, medicalDepth, "plaster", ["wall", "medical-shell", "ward-wall"]);
        const frontSegmentDepth = Math.max(0.8, (medicalDepth - 1.6) / 2);
        const frontOffset = (1.6 + frontSegmentDepth) / 2;
        addBox(module, "entry-wall-north", 0, entryX, baseY, localZ - frontOffset, 0.2, medicalHeight, frontSegmentDepth, "plaster", ["wall", "medical-shell", "stretcher-entry", "opening"]);
        addBox(module, "entry-wall-south", 0, entryX, baseY, localZ + frontOffset, 0.2, medicalHeight, frontSegmentDepth, "plaster", ["wall", "medical-shell", "stretcher-entry", "opening"]);
      }
      for (const [bedIndex, xOffset, zOffset] of [[1, -0.24, -0.25], [2, -0.24, 0.18], [3, 0.08, -0.25], [4, 0.08, 0.18]] as const) {
        addBox(module, `bed-${bedIndex}`, 0, medicalX + medicalWidth * xOffset, baseY + FLOOR_SLAB_METERS, localZ + medicalDepth * zOffset, 0.78, feetToMeters(2.15), 1.62, "wood", ["medical-bed", "ward", "cover"]);
      }
      addBox(module, "treatment-table", 0, medicalX + medicalWidth * 0.29, baseY + FLOOR_SLAB_METERS, localZ - medicalDepth * 0.14, 1.55, feetToMeters(2.7), 0.92, "metal", ["treatment-table", "medical", "cover"]);
      addBox(module, "medicine-cabinet", 0, medicalX + medicalWidth * 0.4, baseY + FLOOR_SLAB_METERS, localZ - medicalDepth * 0.34, 0.62, feetToMeters(5.6), 1.2, "metal", ["medicine-cabinet", "medical", "restricted", "cover"]);
      addBox(module, "nurse-station", 0, medicalX + medicalWidth * 0.27, baseY + FLOOR_SLAB_METERS, localZ + medicalDepth * 0.27, 1.8, feetToMeters(3.4), 1.05, "wood", ["nurse-station", "medical", "cover", "ward-control"]);
      addBox(module, "screen", 0, medicalX, baseY, localZ + medicalDepth * 0.34, medicalWidth * 0.58, feetToMeters(6.5), 0.14, "plaster", ["medical-screen", "wall", "opening"]);
      const roofCenter = point(medicalX, localZ);
      scene.primitives.push(primitive(`${lot.id}-${module.kind}-roof`, "gable", 2, roofCenter.x, baseY + medicalHeight, roofCenter.z, medicalDepth * 1.06 * GRID_METERS, feetToMeters(3.2), medicalWidth * 1.06 * GRID_METERS, "roof", [...common, `function:${module.kind}`, ...module.tags, "medical-roof", "pitched-roof", "medical-wing"], lot.rotation + Math.PI / 2));
      const canopyX = medicalX - side * (medicalWidth * 0.5 + 0.75);
      addBox(module, "medical-canopy", 0, canopyX, baseY + feetToMeters(8), localZ, 1.7, 0.18, 2.3, "metal", ["medical-canopy", "stretcher-entry", "shelter", "medical-wing"]);
      for (const canopySide of [-1, 1]) addCylinder(module, `canopy-support-${canopySide < 0 ? "north" : "south"}`, 0, canopyX - side * 0.55, baseY, localZ + canopySide * 0.86, 0.18, feetToMeters(8), "metal", ["medical-canopy", "structural-support", "stretcher-entry"]);
      addBox(module, "roof-monitor", 2, medicalX + side * medicalWidth * 0.16, baseY + medicalHeight + feetToMeters(0.5), localZ, 1.45, feetToMeters(2.2), 1.15, "metal", ["medical-roof-monitor", "ventilation", "medical-wing", "vertical-landmark"]);
      const medicalEntry = point(entryX, localZ);
      const medicalThreshold = point(side * lot.width * 0.46, localZ);
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "alternate", [
        { x: medicalThreshold.x, z: medicalThreshold.z, y: baseY },
        { x: medicalEntry.x, z: medicalEntry.z, y: baseY },
        { x: center.x, z: center.z, y: baseY },
      ], { purpose: "movement", traffic: 0.48, schedule: "all" }));
      if (moduleRoom) {
        moduleRoom.center = { x: center.x, y: baseY, z: center.z };
        moduleRoom.sizeCells = { x: medicalWidth * 0.84, z: medicalDepth * 0.84 };
      }
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-cover`, "cover", center.x, center.z, baseY, 1.5, "Beds, screens and treatment furniture divide the ward into tactical lanes."));
    } else if (module.kind === "greenhouse") {
      const width = Math.max(4, lot.width * 0.46);
      const depth = Math.max(3.4, lot.depth * 0.4);
      const submerged = module.levelRole === "basement";
      const greenhouseY = submerged ? undergroundY : baseY;
      const level = submerged ? 3 : 0;
      // Exterior greenhouses are annexes, not overlays on the parent room.
      // Keep the inner edge just outside the authored building footprint so
      // the main entry/stair routes cannot pass through a glasshouse frame.
      const greenhouseX = submerged
        ? localX * 0.42
        : side * (lot.width * 0.5 + width * 0.5 + 0.35);
      const center = addBox(module, "floor", level, greenhouseX, greenhouseY, localZ, width, FLOOR_SLAB_METERS, depth, "stone", ["floor", "standable", "greenhouse-floor", ...(submerged ? ["underground"] : [])]);
      addBox(module, "north-frame", level, greenhouseX, greenhouseY, localZ - depth / 2, width, feetToMeters(7), 0.16, "wood", ["greenhouse-frame", "wall"]);
      addBox(module, "south-frame", level, greenhouseX, greenhouseY, localZ + depth / 2, width, feetToMeters(7), 0.16, "wood", ["greenhouse-frame", "wall"]);
      if (submerged) {
        addBox(module, "west-frame", level, greenhouseX - width / 2, greenhouseY, localZ, 0.16, feetToMeters(7), depth, "wood", ["greenhouse-frame", "wall"]);
        addBox(module, "east-frame", level, greenhouseX + width / 2, greenhouseY, localZ, 0.16, feetToMeters(7), depth, "wood", ["greenhouse-frame", "wall"]);
      } else {
        const innerX = greenhouseX - side * width / 2;
        const outerX = greenhouseX + side * width / 2;
        const doorGap = Math.min(1.35, depth * 0.34);
        const frameDepth = Math.max(0.55, (depth - doorGap) / 2);
        addBox(module, "outer-frame", level, outerX, greenhouseY, localZ, 0.16, feetToMeters(7), depth, "wood", ["greenhouse-frame", "wall"]);
        addBox(module, "inner-frame-north", level, innerX, greenhouseY, localZ - (doorGap + frameDepth) / 2, 0.16, feetToMeters(7), frameDepth, "wood", ["greenhouse-frame", "wall", "door-frame", "opening"]);
        addBox(module, "inner-frame-south", level, innerX, greenhouseY, localZ + (doorGap + frameDepth) / 2, 0.16, feetToMeters(7), frameDepth, "wood", ["greenhouse-frame", "wall", "door-frame", "opening"]);
      }
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
      if (module.tags?.includes("fungal")) {
        // A fungal greenhouse must read as a cultivated mushroom space even
        // when the parent settlement is shown from a distance. Use a small
        // deterministic cluster of real stems and caps, rather than relying
        // on a green material or a metadata-only "fungal" label.
        const mushroomFixtures = [
          { x: -0.28, z: -0.22, stem: 4.2, cap: 1.35 },
          { x: 0.08, z: 0.16, stem: 5.4, cap: 1.75 },
          { x: 0.31, z: -0.08, stem: 3.6, cap: 1.12 },
        ];
        for (const [index, fixture] of mushroomFixtures.entries()) {
          const stem = point(greenhouseX + width * fixture.x, localZ + depth * fixture.z);
          const mushroomTags = [...common, `function:${module.kind}`, "greenhouse", "fungal", "mushroom", "cultivated-mushroom", "cover"];
          scene.primitives.push(
            cylinder(`${lot.id}-${module.kind}-mushroom-stem-${index + 1}`, level, stem.x, greenhouseY + FLOOR_SLAB_METERS, stem.z, 0.28, feetToMeters(fixture.stem), "moss", mushroomTags),
            primitive(`${lot.id}-${module.kind}-mushroom-cap-${index + 1}`, "cone", level, stem.x, greenhouseY + feetToMeters(fixture.stem + 0.5), stem.z, feetToMeters(fixture.cap), feetToMeters(1.1), feetToMeters(fixture.cap), index === 1 ? "warmLight" : "moss", [...mushroomTags, "mushroom-cap", "standable"]),
          );
        }
      }
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
      } else {
        const greenhouseDoor = point(greenhouseX - side * width / 2, localZ);
        const buildingThreshold = point(side * lot.width * 0.45, localZ);
        scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "alternate", [
          { x: buildingThreshold.x, z: buildingThreshold.z, y: baseY },
          { x: greenhouseDoor.x, z: greenhouseDoor.z, y: greenhouseY },
          { x: center.x, z: center.z, y: greenhouseY },
        ], { purpose: "service", traffic: 0.3, schedule: "all" }));
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
      const roofBaseY = baseY + totalHeight;
      const platformY = roofBaseY + feetToMeters(6.2);
      const platformX = side * lot.width * 0.08;
      const platformZ = localZ * 0.18;
      const platformWidth = Math.max(3.8, lot.width * 0.44);
      const platformDepth = Math.max(3.4, lot.depth * 0.38);
      const platformMaterial: MaterialKey = lot.climateProfile === "forest" || lot.kind === "shrine" ? "wood" : "metal";
      const center = addBox(module, "platform", 2, platformX, platformY, platformZ, platformWidth, 0.24, platformDepth, platformMaterial, ["floor", "platform", "roof-platform", "observation-platform", "signal-platform", "standable", "high-ground", "supported"]);
      for (const [supportIndex, xOffset, zOffset] of [
        [1, -0.38, -0.36],
        [2, 0.38, -0.36],
        [3, -0.38, 0.36],
        [4, 0.38, 0.36],
      ] as const) {
        addCylinder(
          module,
          `platform-support-${supportIndex}`,
          2,
          platformX + platformWidth * xOffset,
          roofBaseY,
          platformZ + platformDepth * zOffset,
          0.24,
          platformY - roofBaseY,
          platformMaterial,
          ["observation-platform", "structural-support", "supported"],
        );
      }
      const mastHeight = feetToMeters(13);
      addCylinder(module, "mast", 2, platformX, platformY + 0.24, platformZ, 0.42, mastHeight, platformMaterial, ["antenna", "signal-mast", "wind-vane", "vertical-landmark"]);
      addBox(module, "mast-crossbar", 2, platformX, platformY + feetToMeters(9.5), platformZ, Math.max(2.6, platformWidth * 0.62), 0.18, 0.22, platformMaterial, ["signal-arm", "wind-vane", "horizontal-landmark"]);
      addBox(module, "vane-arrow", 2, platformX + platformWidth * 0.26, platformY + feetToMeters(10.1), platformZ, Math.max(1.5, platformWidth * 0.34), 0.16, 0.16, "warmLight", ["wind-vane", "signal-arrow", "directional-marker"]);
      addBox(module, "vane-tail", 2, platformX - platformWidth * 0.24, platformY + feetToMeters(9.8), platformZ, Math.max(0.9, platformWidth * 0.2), feetToMeters(1.6), 0.12, "wood", ["wind-vane", "signal-tail", "directional-marker"]);
      const railHeight = feetToMeters(3);
      addBox(module, "rail-west", 2, platformX - platformWidth / 2, platformY + 0.24, platformZ, 0.12, railHeight, platformDepth, platformMaterial, ["railing", "roof-edge"]);
      addBox(module, "rail-east", 2, platformX + platformWidth / 2, platformY + 0.24, platformZ, 0.12, railHeight, platformDepth, platformMaterial, ["railing", "roof-edge"]);
      addBox(module, "rail-north", 2, platformX, platformY + 0.24, platformZ - platformDepth / 2, platformWidth, railHeight, 0.12, platformMaterial, ["railing", "roof-edge"]);
      const access = point(platformX, platformZ + platformDepth * 0.34);
      const accessRise = platformY - roofBaseY;
      scene.primitives.push(
        stairs(`${lot.id}-${module.kind}-roof-ladder`, 2, access.x, roofBaseY, access.z, 0.95, accessRise, 1.8, platformMaterial, [...common, `function:${module.kind}`, ...module.tags, "roof-ladder", "vertical-route", "vertical-opening", "standable"], lot.rotation + Math.PI),
        box(`${lot.id}-${module.kind}-roof-hatch`, 2, access.x, roofBaseY + 0.06, access.z, 1.2, 0.14, 1.2, platformMaterial, [...common, `function:${module.kind}`, ...module.tags, "roof-hatch", "vertical-opening", "entrance"], lot.rotation),
      );
      scene.routes.push(createRoute(`${lot.id}-${module.kind}-route`, "vertical", [
        { x: access.x, z: access.z, y: roofBaseY },
        { x: center.x, z: center.z, y: platformY },
      ], { purpose: "movement", traffic: 0.32, schedule: "all" }));
      scene.tactical.push(tacticalFeature(`${lot.id}-${module.kind}-high`, "highGround", center.x, center.z, platformY, 2, "The raised signal and observation deck provides a commanding but exposed sight line."));
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
  const totalHeight = feetToMeters(generated.floorHeightFeet.reduce((sum, height) => sum + height, 0));
  const wizardTower = lot.siteProfile === "wizard-tower";
  // A cellar belongs below the building's local grade. Anchoring it to the
  // global world datum makes every high-bank or mountain building grow a
  // thirty-foot access stair and visually detaches the basement from its
  // parent structure.
  // Keep the cellar deep enough that a lower contour road can pass beside a
  // high-bank building without intersecting the basement shell. Sixteen feet
  // still yields a compact two-flight access while preserving at least seven
  // feet of earth above a nine-foot cellar wall.
  const basementDepthFeet = lot.siteProfile === "field-station" || lot.siteProfile === "weather-station" ? 12 : 16;
  const basementY = baseY - feetToMeters(basementDepthFeet);
  const stateTags = lot.state && lot.state !== "active" ? [`building-state:${lot.state}`] : [];
  const tags = ["settlement-building", "independent-building-module", "full-interior", `building:${lot.kind}`, `building-instance:${lot.id}`, `district:${lot.district}`, ...stateTags];
  const point = (x: number, z: number) => localPoint(lot, x, z);
  const addRotatedBox = (id: string, x: number, z: number, w: number, h: number, d: number, y: number, material: MaterialKey, extra: string[] = [], level = 0) => {
    const p = point(x, z);
    scene.primitives.push(box(`${lot.id}-${id}`, level, p.x, y, p.z, w, h, d, material, [...tags, ...extra], lot.rotation));
  };
  const addFloorWithCentralOpening = (id: string, x: number, z: number, floorWidth: number, floorDepth: number, y: number, level = 1) => {
    const opening = Math.min(2.25, floorWidth * 0.34, floorDepth * 0.34);
    const sideWidth = Math.max(0.55, (floorWidth - opening) / 2);
    const endDepth = Math.max(0.55, (floorDepth - opening) / 2);
    const commonTags = ["floor", "standable", "wizard-tower", "tower-upper-floor", "stair-opening", "vertical-opening"];
    addRotatedBox(`${id}-west`, x - opening / 2 - sideWidth / 2, z, sideWidth, FLOOR_SLAB_METERS, floorDepth, y, "stone", commonTags, level);
    addRotatedBox(`${id}-east`, x + opening / 2 + sideWidth / 2, z, sideWidth, FLOOR_SLAB_METERS, floorDepth, y, "stone", commonTags, level);
    addRotatedBox(`${id}-north`, x, z - opening / 2 - endDepth / 2, opening, FLOOR_SLAB_METERS, endDepth, y, "stone", commonTags, level);
    addRotatedBox(`${id}-south`, x, z + opening / 2 + endDepth / 2, opening, FLOOR_SLAB_METERS, endDepth, y, "stone", commonTags, level);
  };
  const addWizardRoundWallRing = (id: string, centerX: number, centerZ: number, diameter: number, y: number, height: number, level: number, entranceGap = false) => {
    const segments = 12;
    const radius = Math.max(1.1, diameter / 2 - 0.22);
    const chord = (Math.PI * diameter) / segments + 0.12;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (Math.PI * 2 * segment) / segments;
      const frontFacing = Math.sin(angle) > 0.72;
      if (entranceGap && segment === 3) continue;
      const wall = point(centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius);
      scene.primitives.push(box(
        `${lot.id}-${id}-wall-${segment + 1}`,
        level,
        wall.x,
        y,
        wall.z,
        chord,
        height,
        0.28,
        generated.material,
        [...tags, "wall", "building-shell", "wizard-tower", "round-tower-wall", "opening", "window-opening", ...(frontFacing && !entranceGap ? ["focus-cutaway"] : []), ...(frontFacing && entranceGap ? ["door-frame"] : [])],
        lot.rotation + Math.PI / 2 - angle,
      ));
    }
  };
  const addWizardRoundFloorRing = (id: string, centerX: number, centerZ: number, diameter: number, y: number, level: number) => {
    const segments = 12;
    const outerRadius = Math.max(1.55, diameter / 2 - 0.18);
    const innerRadius = Math.min(1.15, outerRadius * 0.48);
    const middleRadius = (outerRadius + innerRadius) / 2;
    const radialDepth = outerRadius - innerRadius;
    const chord = (Math.PI * 2 * middleRadius) / segments * 1.08;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (Math.PI * 2 * segment) / segments;
      const slab = point(centerX + Math.cos(angle) * middleRadius, centerZ + Math.sin(angle) * middleRadius);
      scene.primitives.push(box(
        `${lot.id}-${id}-slab-${segment + 1}`,
        level,
        slab.x,
        y,
        slab.z,
        chord,
        FLOOR_SLAB_METERS,
        radialDepth,
        "stone",
        [...tags, "floor", "floor-slab", "standable", "wizard-tower", "tower-upper-floor", "stair-opening", "vertical-opening", "opening-frame"],
        lot.rotation + Math.PI / 2 - angle,
      ));
    }
  };
  if (wizardTower) {
    const floorCenter = point(primaryOffset.x, primaryOffset.z);
    scene.primitives.push(cylinder(`${lot.id}-floor`, 0, floorCenter.x, baseY, floorCenter.z, Math.min(width, depth), FLOOR_SLAB_METERS, "stone", [...tags, "floor", "floor-slab", "standable", "program-room", "wizard-tower", "site-profile:wizard-tower"]));
  } else {
    addRotatedBox("floor", primaryOffset.x, primaryOffset.z, width, FLOOR_SLAB_METERS, depth, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "program-room", ...(lot.siteProfile ? ["field-station", `site-profile:${lot.siteProfile}`] : [])]);
  }
  const mainDoorGap = Math.min(1.35, width * 0.28);
  const primaryWest = primaryOffset.x - width / 2;
  const primaryEast = primaryOffset.x + width / 2;
  const leftWallWidth = Math.max(0.3, entryDoorLocalX - mainDoorGap / 2 - primaryWest);
  const rightWallWidth = Math.max(0.3, primaryEast - entryDoorLocalX - mainDoorGap / 2);
  if (wizardTower) {
    addWizardRoundWallRing("ground-ring", primaryOffset.x, primaryOffset.z, Math.min(width, depth), baseY, wallHeight, 0, true);
  } else {
    addRotatedBox("north-wall", primaryOffset.x, primaryOffset.z - depth / 2, width, wallHeight, 0.22, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
    addRotatedBox("west-wall", primaryOffset.x - width / 2, primaryOffset.z, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening"]);
    addRotatedBox("east-wall", primaryOffset.x + width / 2, primaryOffset.z, 0.22, wallHeight, depth, baseY, generated.material, ["wall", "building-shell", "program-room", "opening", "window-opening", "focus-cutaway"]);
    addRotatedBox("south-wall-left", primaryWest + leftWallWidth / 2, primaryFrontZ, leftWallWidth, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "opening", "building-shell", "focus-cutaway"]);
    addRotatedBox("south-wall-right", primaryEast - rightWallWidth / 2, primaryFrontZ, rightWallWidth, wallHeight, 0.22, baseY, generated.material, ["wall", "door-frame", "opening", "building-shell", "focus-cutaway"]);
  }
  addRotatedBox("partition-a", primaryOffset.x - width * 0.2, primaryOffset.z, 0.13, wallHeight, depth * 0.36, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  addRotatedBox("partition-b", primaryOffset.x - width * 0.2, primaryOffset.z - depth * 0.38, 0.13, wallHeight, depth * 0.18, baseY, generated.material, ["wall", "room-partition", "door-frame"]);
  const upperWidth = width * 0.72;
  const upperDepth = depth * 0.64;
  const labels = fullInteriorLabels(lot.kind, lot.siteProfile);
  const genericUpperFloorDatums: Array<{
    y: number;
    width: number;
    depth: number;
    centerX: number;
    centerZ: number;
    wallHeight: number;
  }> = [];
  if (wizardTower) addWizardRoundFloorRing("upper-floor", primaryOffset.x + 0.08, primaryOffset.z - 0.05, Math.min(upperWidth, upperDepth), upperY, 1);
  else if (generated.floors > 1) addFloorWithCentralOpening("upper-floor", primaryOffset.x + 0.08, primaryOffset.z - 0.05, upperWidth, upperDepth, upperY, 1);
  if (wizardTower) {
    const firstUpperWallHeight = Math.max(feetToMeters(8), feetToMeters(generated.floorHeightFeet[1] ?? generated.floorHeightFeet[0] ?? 11) - FLOOR_SLAB_METERS);
    addWizardRoundWallRing("upper-ring-1", primaryOffset.x + 0.08, primaryOffset.z - 0.05, Math.min(upperWidth, upperDepth), upperY, firstUpperWallHeight, 1);
  } else if (generated.floors > 1) {
    const firstUpperWallHeight = Math.max(feetToMeters(8), feetToMeters(generated.floorHeightFeet[1] ?? generated.floorHeightFeet[0] ?? 11) - FLOOR_SLAB_METERS);
    const centerX = primaryOffset.x + 0.08;
    const centerZ = primaryOffset.z - 0.05;
    addRotatedBox("upper-north", centerX, centerZ - upperDepth / 2, upperWidth, firstUpperWallHeight, 0.2, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
    addRotatedBox("upper-west", centerX - upperWidth / 2, centerZ, 0.2, firstUpperWallHeight, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening"], 1);
    addRotatedBox("upper-east", centerX + upperWidth / 2, centerZ, 0.2, firstUpperWallHeight, upperDepth, upperY, generated.material, ["wall", "upper-floor", "opening", "window-opening", "focus-cutaway"], 1);
    genericUpperFloorDatums.push({ y: upperY, width: upperWidth, depth: upperDepth, centerX, centerZ, wallHeight: firstUpperWallHeight });

    let floorY = upperY;
    for (let physicalFloor = 2; physicalFloor < generated.floors; physicalFloor += 1) {
      floorY += feetToMeters(generated.floorHeightFeet[physicalFloor - 1] ?? generated.floorHeightFeet[0] ?? 11);
      const scale = Math.max(0.46, 0.72 - physicalFloor * 0.055);
      const floorWidth = Math.max(3.4, width * scale);
      const floorDepth = Math.max(3.4, depth * scale);
      const floorCenterX = primaryOffset.x + (physicalFloor % 2 === 0 ? -0.06 : 0.08);
      const floorCenterZ = primaryOffset.z - physicalFloor * 0.045;
      const floorWallHeight = Math.max(feetToMeters(8), feetToMeters(generated.floorHeightFeet[physicalFloor] ?? generated.floorHeightFeet[0] ?? 11) - FLOOR_SLAB_METERS);
      addFloorWithCentralOpening(`stacked-upper-${physicalFloor}-floor`, floorCenterX, floorCenterZ, floorWidth, floorDepth, floorY, 1);
      addRotatedBox(`stacked-upper-${physicalFloor}-north`, floorCenterX, floorCenterZ - floorDepth / 2, floorWidth, floorWallHeight, 0.2, floorY, generated.material, ["wall", "upper-floor", "stacked-floor", "opening", "window-opening"], 1);
      addRotatedBox(`stacked-upper-${physicalFloor}-west`, floorCenterX - floorWidth / 2, floorCenterZ, 0.2, floorWallHeight, floorDepth, floorY, generated.material, ["wall", "upper-floor", "stacked-floor", "opening", "window-opening"], 1);
      addRotatedBox(`stacked-upper-${physicalFloor}-east`, floorCenterX + floorWidth / 2, floorCenterZ, 0.2, floorWallHeight, floorDepth, floorY, generated.material, ["wall", "upper-floor", "stacked-floor", "opening", "window-opening", "focus-cutaway"], 1);
      genericUpperFloorDatums.push({ y: floorY, width: floorWidth, depth: floorDepth, centerX: floorCenterX, centerZ: floorCenterZ, wallHeight: floorWallHeight });
    }
  }
  if (generated.floors > 1 && (lot.siteProfile === "field-station" || lot.siteProfile === "weather-station")) {
    const fixtureTags = ["upper-floor", "observation-loft", "station-fixture", "cover"];
    addRotatedBox("upper-radio-console", primaryOffset.x - upperWidth * 0.27, primaryOffset.z - upperDepth * 0.24, Math.max(1.25, upperWidth * 0.28), feetToMeters(3.2), 0.72, upperY + FLOOR_SLAB_METERS, "metal", [...fixtureTags, "radio-console", "communications"], 1);
    addRotatedBox("upper-chart-table", primaryOffset.x + upperWidth * 0.08, primaryOffset.z + upperDepth * 0.08, Math.max(1.4, upperWidth * 0.3), feetToMeters(2.9), Math.max(0.9, upperDepth * 0.22), upperY + FLOOR_SLAB_METERS, "wood", [...fixtureTags, "chart-table", "worktable"], 1);
    addRotatedBox("upper-instrument-rack", primaryOffset.x + upperWidth * 0.32, primaryOffset.z - upperDepth * 0.2, 0.62, feetToMeters(5.6), Math.max(1.2, upperDepth * 0.3), upperY + FLOOR_SLAB_METERS, "metal", [...fixtureTags, "instrument-rack", "observation"], 1);
  }
  const wizardFloorDatums: Array<{ y: number; width: number; depth: number }> = [{ y: baseY, width, depth }, { y: upperY, width: upperWidth, depth: upperDepth }];
  let authoredRoofBaseY = baseY + totalHeight;
  if (wizardTower) {
    let floorY = upperY;
    for (let physicalFloor = 2; physicalFloor < generated.floors; physicalFloor += 1) {
      floorY += feetToMeters(generated.floorHeightFeet[physicalFloor - 1] ?? generated.floorHeightFeet[0] ?? 11);
      const scale = Math.max(0.5, 0.72 - physicalFloor * 0.055);
      const floorWidth = Math.max(3.4, width * scale);
      const floorDepth = Math.max(3.4, depth * scale);
      const floorWallHeight = Math.max(feetToMeters(8), feetToMeters(generated.floorHeightFeet[physicalFloor] ?? generated.floorHeightFeet[0] ?? 11) - FLOOR_SLAB_METERS);
      wizardFloorDatums.push({ y: floorY, width: floorWidth, depth: floorDepth });
      addWizardRoundFloorRing(`wizard-upper-${physicalFloor}-floor`, primaryOffset.x, primaryOffset.z, Math.min(floorWidth, floorDepth), floorY, physicalFloor);
      addWizardRoundWallRing(`upper-ring-${physicalFloor}`, primaryOffset.x, primaryOffset.z, Math.min(floorWidth, floorDepth), floorY, floorWallHeight, physicalFloor);
    }
    const roofP = point(primaryOffset.x, primaryOffset.z);
    scene.primitives.push(primitive(`${lot.id}-wizard-spire-roof`, "cone", 2, roofP.x, baseY + totalHeight, roofP.z, Math.max(upperWidth, upperDepth) * 1.524, feetToMeters(8), Math.max(upperWidth, upperDepth) * 1.524, "roof", [...tags, "roof", "wizard-tower", "spire", "vertical-landmark"], lot.rotation));
  } else {
    const topFloor = genericUpperFloorDatums.at(-1);
    const roofCenterX = topFloor?.centerX ?? primaryOffset.x;
    const roofCenterZ = topFloor?.centerZ ?? primaryOffset.z;
    const roofWidth = topFloor?.width ?? width;
    const roofDepth = topFloor?.depth ?? depth;
    authoredRoofBaseY = topFloor ? topFloor.y + topFloor.wallHeight : baseY + wallHeight;
    const roofP = point(roofCenterX, roofCenterZ);
    scene.primitives.push(primitive(`${lot.id}-gable-roof`, "gable", 2, roofP.x, authoredRoofBaseY, roofP.z, (roofDepth + 1) * 1.524, feetToMeters(5.5), (roofWidth + 1) * 1.524, "roof", [...tags, "roof", "pitched-roof", "standable"], lot.rotation + Math.PI / 2));
  }
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
  const stairP = point(wizardTower ? width * 0.28 : primaryOffset.x, wizardTower ? depth * 0.08 : primaryOffset.z);
  const wizardSpiralRoutePoints: Array<{ x: number; z: number; y: number }> = [];
  const genericStackedRoutePoints: Array<{ x: number; z: number; y: number }> = [];
  if (wizardTower) {
    const stepCount = 18;
    for (let flight = 1; flight < wizardFloorDatums.length; flight += 1) {
      const from = wizardFloorDatums[flight - 1]!;
      const to = wizardFloorDatums[flight]!;
      const rise = to.y - from.y;
      const radius = Math.min(1.55, Math.min(from.width, from.depth, to.width, to.depth) * 0.36);
      const startAngle = flight * Math.PI * 0.62;
      for (let step = 0; step < stepCount; step += 1) {
        const t = (step + 0.5) / stepCount;
        const angle = startAngle + t * Math.PI * 2;
        const localX = primaryOffset.x + Math.cos(angle) * radius;
        const localZ = primaryOffset.z + Math.sin(angle) * radius;
        const world = point(localX, localZ);
        scene.primitives.push(box(
          `${lot.id}-wizard-spiral-${flight}-${step + 1}`,
          Math.max(0, flight - 1),
          world.x,
          from.y + rise * t,
          world.z,
          0.62,
          0.16,
          0.42,
          "stone",
          [...tags, "wizard-tower", "spiral-stair", "building-stair", "vertical-opening", "standable"],
          lot.rotation - angle,
        ));
      }
      const landingAngle = startAngle + Math.PI * 2;
      const landingLocal = { x: primaryOffset.x + Math.cos(landingAngle) * radius, z: primaryOffset.z + Math.sin(landingAngle) * radius };
      const landingWorld = point(landingLocal.x, landingLocal.z);
      scene.primitives.push(box(
        `${lot.id}-wizard-spiral-landing-${flight}`,
        flight,
        landingWorld.x,
        to.y - 0.08,
        landingWorld.z,
        1.25,
        0.16,
        1.25,
        "stone",
        [...tags, "wizard-tower", "spiral-landing", "stair-opening", "vertical-opening", "opening-frame", "standable"],
        lot.rotation,
      ));
      if (flight === 1) {
        const startWorld = point(primaryOffset.x + Math.cos(startAngle) * radius, primaryOffset.z + Math.sin(startAngle) * radius);
        wizardSpiralRoutePoints.push({ x: startWorld.x, z: startWorld.z, y: from.y });
      }
      wizardSpiralRoutePoints.push({ x: landingWorld.x, z: landingWorld.z, y: to.y });
    }
  } else {
    const stackedDatums = [{ y: baseY, centerX: primaryOffset.x, centerZ: primaryOffset.z }, ...genericUpperFloorDatums];
    for (let flight = 1; flight < stackedDatums.length; flight += 1) {
      const from = stackedDatums[flight - 1]!;
      const to = stackedDatums[flight]!;
      const rise = to.y - from.y;
      const stairLocalX = (from.centerX + to.centerX) / 2;
      const stairLocalZ = (from.centerZ + to.centerZ) / 2;
      const stairWorld = point(stairLocalX, stairLocalZ);
      scene.primitives.push(
        stairs(`${lot.id}-upper-stair-${flight}`, flight === 1 ? 0 : 1, stairWorld.x, from.y, stairWorld.z, 1.2, rise, 4.2, "wood", [...tags, "building-stair", "vertical-opening", "stacked-stair"], lot.rotation + (flight % 2 === 0 ? Math.PI : 0)),
        box(`${lot.id}-upper-stair-landing-${flight}`, 1, stairWorld.x, to.y - 0.08, stairWorld.z, 1.35, 0.16, 1.35, "wood", [...tags, "building-stair", "stair-landing", "vertical-opening", "standable"], lot.rotation),
      );
      if (flight === 1) genericStackedRoutePoints.push({ x: stairWorld.x, z: stairWorld.z, y: from.y });
      genericStackedRoutePoints.push({ x: stairWorld.x, z: stairWorld.z, y: to.y });
    }
  }
  const cellarCenterLocalX = -width * 0.3;
  const cellarCenterLocalZ = depth * 0.08;
  const cellarFlightRun = Math.min(3.2, Math.max(2.45, depth * 0.43));
  const cellarFlightOffsetX = Math.min(0.62, width * 0.1);
  const cellarLowerP = point(cellarCenterLocalX + cellarFlightOffsetX, cellarCenterLocalZ);
  const cellarUpperP = point(cellarCenterLocalX - cellarFlightOffsetX, cellarCenterLocalZ);
  const cellarLandingP = point(cellarCenterLocalX, cellarCenterLocalZ + cellarFlightRun / 2);
  const cellarRise = baseY - basementY;
  const cellarFlightRise = cellarRise / 2;
  const hasDedicatedBasementAccess = lot.functionalModules?.some((module) => module.kind === "archive" && module.levelRole === "basement") === true;
  if (!hasDedicatedBasementAccess) scene.primitives.push(
    stairs(`${lot.id}-cellar-stair-lower`, 3, cellarLowerP.x, basementY, cellarLowerP.z, 1.05, cellarFlightRise, cellarFlightRun, "stone", [...tags, "building-stair", "stair-flight", "vertical-opening", "underground", "standable"], lot.rotation),
    box(`${lot.id}-cellar-stair-landing`, 3, cellarLandingP.x, basementY + cellarFlightRise, cellarLandingP.z, Math.max(1.8, cellarFlightOffsetX * 2 + 1.05), FLOOR_SLAB_METERS, 1.05, "stone", [...tags, "building-stair", "stair-landing", "vertical-opening", "underground", "standable"], lot.rotation),
    stairs(`${lot.id}-cellar-stair-upper`, 0, cellarUpperP.x, basementY + cellarFlightRise, cellarUpperP.z, 1.05, cellarFlightRise, cellarFlightRun, "stone", [...tags, "building-stair", "stair-flight", "vertical-opening", "standable"], lot.rotation + Math.PI),
  );
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
  if (wizardTower) {
    let previousRoomId = upperId;
    for (let physicalFloor = 2; physicalFloor < wizardFloorDatums.length; physicalFloor += 1) {
      const datum = wizardFloorDatums[physicalFloor]!;
      const roomId = `core-${lot.id}-wizard-upper-${physicalFloor}`;
      const roomName = physicalFloor === wizardFloorDatums.length - 1 ? "Observatory and roof access chamber" : `Arcane study chamber ${physicalFloor}`;
      scene.rooms.push(createRoom(roomId, roomName, physicalFloor === wizardFloorDatums.length - 1 ? "combat" : "private", 1, lot.x, lot.z, datum.width * 0.8, datum.depth * 0.8, datum.y));
      connectRooms(scene.rooms, previousRoomId, roomId);
      previousRoomId = roomId;
    }
  } else {
    let previousRoomId = upperId;
    for (let physicalFloor = 2; physicalFloor <= genericUpperFloorDatums.length; physicalFloor += 1) {
      const datum = genericUpperFloorDatums[physicalFloor - 1]!;
      const roomId = `core-${lot.id}-upper-${physicalFloor}`;
      scene.rooms.push(createRoom(roomId, `${labels.upperName} ${physicalFloor}`, lot.kind === "tower" ? "combat" : "private", 1, datum.centerX, datum.centerZ, datum.width * 0.82, datum.depth * 0.82, datum.y));
      connectRooms(scene.rooms, previousRoomId, roomId);
      previousRoomId = roomId;
    }
  }
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
  const entryRoutePoints = lot.parcelId
    ? [
      { x: entryStart.x, z: entryStart.z, y: baseY },
      { x: approachP.x, z: approachP.z, y: baseY },
    ]
    : [
      { x: entryStart.x, z: entryStart.z, y: baseY },
      { x: entryCornerP.x, z: entryCornerP.z, y: baseY },
      { x: approachP.x, z: approachP.z, y: baseY },
    ];
  const upperRoutes = wizardTower
    ? [createRoute(`${lot.id}-wizard-spiral-route`, "vertical", wizardSpiralRoutePoints, { purpose: "movement", traffic: 0.52, schedule: "all" })]
    : genericStackedRoutePoints.length > 1
      ? [createRoute(`${lot.id}-vertical-route`, "vertical", genericStackedRoutePoints, { purpose: "movement", traffic: 0.48, schedule: "all" })]
      : [];
  scene.routes.push(
    createRoute(`${lot.id}-entry-route`, "primary", [
      ...entryRoutePoints,
      { x: frontDoorP.x, z: frontDoorP.z, y: baseY },
      { x: publicP.x, z: publicP.z, y: baseY },
    ]),
    ...upperRoutes,
    ...(!hasDedicatedBasementAccess ? [createRoute(`${lot.id}-basement-route`, "vertical", [
      { x: serviceP.x, z: serviceP.z, y: baseY },
      { x: cellarUpperP.x, z: cellarUpperP.z, y: baseY },
      { x: cellarLandingP.x, z: cellarLandingP.z, y: basementY + cellarFlightRise },
      { x: cellarLowerP.x, z: cellarLowerP.z, y: basementY },
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
  // Full-interior settlement buildings need a small, type-specific tactical
  // kit.  A single generic chest and table made every independent building
  // read as the same white-box shell once the roof was hidden.  These pieces
  // are deliberately constrained to the authored room envelope, leave a
  // walkable centre lane, and become cover/obstacles rather than decorative
  // metadata.
  if (lot.kind === "guild") {
    for (const [index, zOffset] of [-0.28, 0.28].entries()) {
      addRotatedBox(`guild-archive-shelf-${index + 1}`, width * 0.34, depth * zOffset, 0.22, feetToMeters(5.8), Math.max(1.2, depth * 0.34), baseY + FLOOR_SLAB_METERS, "wood", ["archive", "reserve-vault", "shelf", "cover"]);
    }
    addRotatedBox("guild-map-table", -width * 0.08, depth * 0.18, Math.max(1.8, width * 0.28), feetToMeters(2.8), 1.2, baseY + FLOOR_SLAB_METERS, "wood", ["guild-fixture", "map-table", "cover"]);
    addRotatedBox("guild-scribe-desk", width * 0.08, -depth * 0.22, Math.max(1.3, width * 0.2), feetToMeters(2.6), 0.72, baseY + FLOOR_SLAB_METERS, "wood", ["guild-fixture", "scribe-desk", "archive", "cover"]);
  } else if (lot.kind === "tower" && lot.siteProfile === "wizard-tower") {
    addRotatedBox("wizard-alchemy-bench", -width * 0.22, depth * 0.16, Math.max(1.5, width * 0.3), feetToMeters(3.2), 0.86, baseY + FLOOR_SLAB_METERS, "wood", ["wizard-tower", "alchemy-laboratory", "workbench", "cover"]);
    addRotatedBox("wizard-reagent-rack", width * 0.31, depth * 0.1, 0.24, feetToMeters(6.2), Math.max(1.2, depth * 0.3), baseY + FLOOR_SLAB_METERS, "wood", ["wizard-tower", "reagent-rack", "cover"]);
    for (const [index, xOffset] of [-0.26, 0, 0.26].entries()) {
      const vessel = point(width * xOffset, -depth * 0.16);
      scene.primitives.push(cylinder(`${lot.id}-wizard-vessel-${index + 1}`, 0, vessel.x, baseY + FLOOR_SLAB_METERS, vessel.z, 0.52 + index * 0.08, feetToMeters(2.4 + index * 0.5), index === 1 ? "warmLight" : "hazard", [...tags, "wizard-tower", "alchemical-vessel", "laboratory-fixture", "cover"]));
    }
    for (const [index, zOffset] of [-0.25, 0.25].entries()) {
      addRotatedBox(`wizard-library-shelf-${index + 1}`, upperWidth * 0.34, upperDepth * zOffset, 0.22, feetToMeters(6), Math.max(1.15, upperDepth * 0.34), upperY + FLOOR_SLAB_METERS, "wood", ["wizard-tower", "spell-library", "bookshelf", "cover"], 1);
    }
    const ritualP = point(-upperWidth * 0.14, upperDepth * 0.08);
    scene.primitives.push(cylinder(`${lot.id}-wizard-ritual-circle`, 1, ritualP.x, upperY + FLOOR_SLAB_METERS + 0.03, ritualP.z, Math.max(1.6, upperWidth * 0.34), 0.08, "warmLight", [...tags, "wizard-tower", "ritual-circle", "hazard", "landmark"]));
    const observatoryP = point(0, -upperDepth * 0.18);
    scene.primitives.push(
      cylinder(`${lot.id}-wizard-telescope-pier`, 2, observatoryP.x, upperY + wallHeight * 0.82, observatoryP.z, 0.62, feetToMeters(4.2), "metal", [...tags, "wizard-tower", "observatory", "telescope", "vertical-landmark"]),
      box(`${lot.id}-wizard-telescope-tube`, 2, observatoryP.x + 0.55, upperY + wallHeight * 0.82 + feetToMeters(3.4), observatoryP.z, 1.8, 0.28, 0.28, "metal", [...tags, "wizard-tower", "observatory", "telescope"], lot.rotation + 0.42),
    );
    scene.tactical.push(
      tacticalFeature(`${lot.id}-wizard-ritual-hazard`, "hazard", ritualP.x, ritualP.z, upperY, 1.4, "The active ritual circle controls the centre of the spell library."),
      tacticalFeature(`${lot.id}-wizard-observatory-high`, "highGround", observatoryP.x, observatoryP.z, upperY + wallHeight * 0.82, 1.5, "The roof observatory is a recognizable arcane high point."),
    );
  } else if (lot.kind === "tower") {
    addRotatedBox("tower-watch-console", 0, -depth * 0.2, Math.max(1.2, width * 0.34), feetToMeters(3.2), 0.7, upperY + FLOOR_SLAB_METERS, "wood", ["tower-fixture", "watch-console", "high-ground", "cover"], 1);
    addRotatedBox("tower-supply-rack", -width * 0.3, depth * 0.18, 0.22, feetToMeters(5.4), Math.max(0.9, depth * 0.22), baseY + FLOOR_SLAB_METERS, "wood", ["tower-fixture", "supply-rack", "cover"]);
  } else if (lot.kind === "shrine") {
    addRotatedBox("shrine-altar", width * 0.18, -depth * 0.25, Math.max(1.3, width * 0.22), feetToMeters(3.2), 0.9, baseY + FLOOR_SLAB_METERS, "stone", ["shrine-fixture", "altar", "landmark", "cover"]);
    for (const [index, zOffset] of [-0.18, 0, 0.18].entries()) addRotatedBox(
      `shrine-pew-${index + 1}`,
      -width * 0.12,
      depth * zOffset,
      Math.max(1.4, width * 0.3),
      feetToMeters(1.8),
      0.45,
      baseY + FLOOR_SLAB_METERS,
      "wood",
      ["shrine-fixture", "pew", "cover"],
    );
  } else if (lot.kind === "factory" || lot.kind === "warehouse") {
    addRotatedBox("industrial-workbench", -width * 0.18, depth * 0.2, Math.max(1.8, width * 0.3), feetToMeters(3.4), 1.1, baseY + FLOOR_SLAB_METERS, "metal", ["industrial-fixture", "workbench", "machinery", "cover"]);
    for (const [index, zOffset] of [-0.25, 0.25].entries()) addRotatedBox(
      `industrial-rack-${index + 1}`,
      width * 0.32,
      depth * zOffset,
      0.22,
      feetToMeters(5.6),
      Math.max(1.2, depth * 0.28),
      baseY + FLOOR_SLAB_METERS,
      "metal",
      ["industrial-fixture", "storage-rack", "cover"],
    );
  } else if (lot.kind === "tavern") {
    addRotatedBox("tavern-bar-counter", -width * 0.28, -depth * 0.18, Math.max(1.6, width * 0.3), feetToMeters(3.5), 0.82, baseY + FLOOR_SLAB_METERS, "wood", ["tavern-fixture", "bar", "cover"]);
    for (const [index, xOffset] of [-0.12, 0.12].entries()) addRotatedBox(
      `tavern-table-${index + 1}`,
      width * xOffset,
      depth * 0.2,
      1.15,
      feetToMeters(2.5),
      1.15,
      baseY + FLOOR_SLAB_METERS,
      "wood",
      ["tavern-fixture", "table", "cover"],
    );
  } else if (lot.kind === "manor") {
    addRotatedBox("manor-dining-table", width * 0.08, depth * 0.1, Math.max(2, width * 0.34), feetToMeters(2.8), 1.2, baseY + FLOOR_SLAB_METERS, "wood", ["manor-fixture", "dining-table", "cover"]);
    addRotatedBox("manor-hearth", -width * 0.3, -depth * 0.28, 1.1, feetToMeters(4.4), 0.8, baseY + FLOOR_SLAB_METERS, "darkStone", ["manor-fixture", "hearth", "cover"]);
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
  if (lot.siteProfile === "observatory") {
    const dome = point(primaryOffset.x, primaryOffset.z - upperDepth * 0.18);
    scene.primitives.push(
      cylinder(`${lot.id}-observatory-telescope-pier`, 2, dome.x, upperY + wallHeight * 0.82, dome.z, 0.72, feetToMeters(4.6), "metal", [...tags, "observatory", "telescope", "vertical-landmark", "high-ground"]),
      box(`${lot.id}-observatory-telescope-tube`, 2, dome.x + 0.72, upperY + wallHeight * 0.82 + feetToMeters(3.2), dome.z, 2.1, 0.3, 0.34, "metal", [...tags, "observatory", "telescope", "instrument"]),
      primitive(`${lot.id}-observatory-dome`, "sphere", 2, dome.x, upperY + wallHeight * 0.82 + feetToMeters(1.8), dome.z, Math.max(1.9, upperWidth * 0.42), feetToMeters(2.2), Math.max(1.9, upperDepth * 0.42), "metal", [...tags, "observatory", "star-dome", "roof", "high-ground"]),
    );
    addRotatedBox("observatory-calibration-table", primaryOffset.x + width * 0.16, primaryOffset.z + depth * 0.18, Math.max(1.4, width * 0.28), feetToMeters(2.8), 1.1, baseY + FLOOR_SLAB_METERS, "metal", ["observatory", "calibration", "instrument-lab", "cover"]);
    addRotatedBox("observatory-chart-cabinet", primaryOffset.x - width * 0.3, primaryOffset.z + depth * 0.16, 0.7, feetToMeters(5.4), Math.max(1.2, depth * 0.24), baseY + FLOOR_SLAB_METERS, "wood", ["observatory", "chart-archive", "cabinet", "cover"]);
  }
  if (lot.siteProfile === "forge") {
    addRotatedBox("forge-anvil", primaryOffset.x - width * 0.14, primaryOffset.z + depth * 0.08, 1.2, feetToMeters(2.2), 0.82, baseY + FLOOR_SLAB_METERS, "darkStone", ["forge", "anvil", "workshop", "cover"]);
    for (const [index, offsetX] of [-0.26, 0.04, 0.34].entries()) {
      const furnace = point(primaryOffset.x + width * offsetX, primaryOffset.z - depth * 0.2);
      scene.primitives.push(
        cylinder(`${lot.id}-forge-furnace-${index + 1}`, 0, furnace.x, baseY + FLOOR_SLAB_METERS, furnace.z, 0.72 + index * 0.08, feetToMeters(5.4 + index * 0.5), "hazard", [...tags, "forge", "furnace", "heat-hazard", "cover"]),
      );
    }
    addRotatedBox("forge-quench-trough", primaryOffset.x + width * 0.28, primaryOffset.z + depth * 0.22, Math.max(1.4, width * 0.26), feetToMeters(1.5), 1.2, baseY + FLOOR_SLAB_METERS, "water", ["forge", "quench-bay", "hazard", "cover"]);
    addRotatedBox("forge-ore-rack", -width * 0.12, depth * 0.18, Math.max(1.2, width * 0.3), feetToMeters(4.8), 0.6, basementY + FLOOR_SLAB_METERS, "wood", ["forge", "ore-store", "underground", "rack", "cover"], 3);
  }
  if (lot.siteProfile === "sanatorium") {
    for (const [index, offsetX, offsetZ] of [[1, -0.25, -0.18], [2, 0.08, -0.18], [3, -0.25, 0.18], [4, 0.08, 0.18]] as const) {
      addRotatedBox(`sanatorium-bed-${index}`, primaryOffset.x + width * offsetX, primaryOffset.z + depth * offsetZ, 0.76, feetToMeters(2.1), 1.65, baseY + FLOOR_SLAB_METERS, "wood", ["sanatorium", "patient-ward", "bed", "cover"]);
    }
    addRotatedBox("sanatorium-treatment-table", primaryOffset.x + width * 0.18, primaryOffset.z + depth * 0.18, Math.max(1.4, width * 0.28), feetToMeters(2.5), 1.1, baseY + FLOOR_SLAB_METERS, "metal", ["sanatorium", "hydrotherapy", "treatment", "cover"]);
    addRotatedBox("sanatorium-boiler", -width * 0.2, depth * 0.18, 1.5, feetToMeters(5.6), 1.5, basementY + FLOOR_SLAB_METERS, "metal", ["sanatorium", "boiler", "underground", "hazard", "cover"], 3);
    for (const [index, offsetX] of [-0.08, 0.12].entries()) {
      addRotatedBox(`sanatorium-steam-pipe-${index + 1}`, offsetX * width, depth * 0.08, 0.22, feetToMeters(7), 0.22, basementY + FLOOR_SLAB_METERS, "metal", ["sanatorium", "steam-pipe", "underground", "vertical-landmark"], 3);
    }
  }
  if (lot.siteProfile === "quarantine-station") {
    for (const [cotIndex, offsetX, offsetZ] of [[1, -0.25, -0.16], [2, 0.06, -0.16], [3, -0.25, 0.18], [4, 0.06, 0.18]] as const) {
      addRotatedBox(`quarantine-cot-${cotIndex}`, primaryOffset.x + width * offsetX, primaryOffset.z + depth * offsetZ, 0.72, feetToMeters(2.1), 1.55, baseY + FLOOR_SLAB_METERS, "wood", ["quarantine-cot", "ward-rhythm", "cover"]);
    }
    addRotatedBox("quarantine-gate-left", primaryOffset.x + width * 0.22, primaryOffset.z, 0.1, feetToMeters(7), depth * 0.32, baseY, "metal", ["controlled-threshold", "screening-gate", "opening"]);
    addRotatedBox("quarantine-gate-right", primaryOffset.x + width * 0.22, primaryOffset.z - depth * 0.38, 0.1, feetToMeters(7), depth * 0.18, baseY, "metal", ["controlled-threshold", "screening-gate", "opening"]);
    addRotatedBox("quarantine-nurse-counter", primaryOffset.x + width * 0.34, primaryOffset.z + depth * 0.24, 0.72, feetToMeters(3.2), depth * 0.22, baseY + FLOOR_SLAB_METERS, "metal", ["nurse-counter", "quarantine-reception", "cover"]);
  }
  const extensionRooms: Array<{ id: string; x: number; z: number; partId: string }> = [];
  for (const [extensionIndex, extension] of envelope.parts.slice(1).entries()) {
    const previousParts = envelope.parts.slice(0, extensionIndex + 1);
    const parentEnvelope = previousParts
      .map((candidate) => {
        const gapX = Math.max(0, Math.abs(extension.offset.x - candidate.offset.x) - (extension.size.x + candidate.size.x) / 2);
        const gapZ = Math.max(0, Math.abs(extension.offset.z - candidate.offset.z) - (extension.size.z + candidate.size.z) / 2);
        const centerDistance = Math.hypot(extension.offset.x - candidate.offset.x, extension.offset.z - candidate.offset.z);
        return { candidate, score: gapX + gapZ + centerDistance * 0.025 };
      })
      .sort((left, right) => left.score - right.score)[0]?.candidate ?? primaryEnvelope;
    const parentOffset = parentEnvelope?.offset ?? primaryOffset;
    const extensionHeight = wallHeight * Math.max(0.52, extension.heightRatio);
    addRotatedBox(`envelope-${extension.id}-floor`, extension.offset.x, extension.offset.z, extension.size.x, FLOOR_SLAB_METERS, extension.size.z, baseY, generated.material === "plaster" ? "wood" : "stone", ["floor", "standable", "envelope-part"]);
    if (!lot.siteProfile) {
      addRotatedBox(`envelope-${extension.id}-back`, extension.offset.x, extension.offset.z - extension.size.z / 2, extension.size.x, extensionHeight, 0.2, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
      addRotatedBox(`envelope-${extension.id}-front`, extension.offset.x, extension.offset.z + extension.size.z / 2, extension.size.x, extensionHeight, 0.2, baseY, generated.material, ["wall", "building-shell", "envelope-part", "door-frame", "focus-cutaway"]);
      addRotatedBox(`envelope-${extension.id}-west`, extension.offset.x - extension.size.x / 2, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening"]);
      addRotatedBox(`envelope-${extension.id}-east`, extension.offset.x + extension.size.x / 2, extension.offset.z, 0.2, extensionHeight, extension.size.z, baseY, generated.material, ["wall", "building-shell", "envelope-part", "opening", "focus-cutaway"]);
    } else {
      const deltaX = extension.offset.x - parentOffset.x;
      const deltaZ = extension.offset.z - parentOffset.z;
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
    const parentExtensionRoom = parentEnvelope && parentEnvelope.id !== primaryEnvelope?.id
      ? extensionRooms.find((room) => room.partId === parentEnvelope.id)
      : undefined;
    const parentRoomId = parentExtensionRoom?.id ?? publicId;
    const parentWorldPoint = parentExtensionRoom ? { x: parentExtensionRoom.x, z: parentExtensionRoom.z } : publicP;
    connectRooms(scene.rooms, parentRoomId, extensionRoomId);
    extensionRooms.push({ id: extensionRoomId, x: extensionPoint.x, z: extensionPoint.z, partId: extension.id });

    const thresholdLocalX = parentOffset.x + (extension.offset.x - parentOffset.x) * 0.54;
    const thresholdLocalZ = parentOffset.z + (extension.offset.z - parentOffset.z) * 0.54;
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
      { x: parentWorldPoint.x, z: parentWorldPoint.z, y: baseY },
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
  if (lot.state === "abandoned") {
    const damagedPart = envelope.parts.at(-1);
    if (damagedPart) {
      // Full-interior buildings must express abandonment as changed geometry,
      // not only a label. Remove one facade and part of the roof from the last
      // annex, then turn the missing material into reachable rubble cover.
      scene.primitives = scene.primitives.filter((primitiveEntry) => {
        if (!primitiveEntry.id.startsWith(`${lot.id}-envelope-${damagedPart.id}-`)) return true;
        return !primitiveEntry.id.includes("-front") && !primitiveEntry.id.endsWith("-roof");
      });
      const damagedCenter = point(damagedPart.offset.x, damagedPart.offset.z + damagedPart.size.z * 0.28);
      scene.primitives.push(
        box(`${lot.id}-abandoned-rubble`, 0, damagedCenter.x, baseY, damagedCenter.z, Math.max(1.4, damagedPart.size.x * 0.68), feetToMeters(2.4), Math.max(1.2, damagedPart.size.z * 0.38), "rock", [...tags, "collapsed", "rubble", "cover", "broken-roofline"], lot.rotation + 0.12),
        box(`${lot.id}-abandoned-roof-fragment`, 0, damagedCenter.x - 0.35, baseY + feetToMeters(2.2), damagedCenter.z + 0.2, Math.max(1.2, damagedPart.size.x * 0.54), 0.18, Math.max(0.9, damagedPart.size.z * 0.28), "roof", [...tags, "collapsed", "roof-fragment", "cover"], lot.rotation - 0.2),
      );
      scene.tactical.push(tacticalFeature(`${lot.id}-abandoned-breach`, "cover", damagedCenter.x, damagedCenter.z, baseY, 1.6, "A collapsed annex wall opens a secondary breach through rubble and broken roofing."));
    }
  }
  scene.tactical.push(tacticalFeature(`${lot.id}-interior-choke`, "chokepoint", lot.x, lot.z + depth * 0.34, baseY, 1, "The independently generated entrance and internal partition form a defensible threshold."));
  const instance: BuildingInstance = {
    id: lot.id, archetype: lot.kind, seed: lot.seed, district: lot.district,
    positionCells: { x: lot.x, z: lot.z }, footprintCells: { x: lot.width, z: lot.depth }, rotationY: lot.rotation,
    floors: generated.floors, floorHeightFeet: [...generated.floorHeightFeet], detailLevel: "full-interior",
    baseYMeters: baseY,
    exteriorHeightMeters: authoredRoofBaseY - baseY,
    ...(lot.parcelId ? { parcelId: lot.parcelId } : {}), ...(lot.frontageRoadId ? { frontageRoadId: lot.frontageRoadId } : {}), entranceCells: frontDoorP,
    buildingProgram: summarizeBuildingProgram(interiorProgram, [...labels.tags, ...functionalTags(lot)]),
    interiorProgram,
    envelopeProgram: { version: 1, variant: envelope.variant, partCount: envelope.parts.length, silhouetteSignature: envelope.silhouetteSignature },
  };
  addFunctionalModuleGeometry(scene, lot, generated, { y: basementY, halfWidthCells: width * 0.32, depthCells: depth * 0.58 });
  const facadeHeight = generated.floorHeightFeet.reduce((sum, height) => sum + feetToMeters(height), 0);
  addSiteClimateFacadeGeometry(scene, lot, baseY, facadeHeight, envelope);
  addWaterfrontExterior(scene, lot, generated, baseY, facadeHeight);
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
  const generated = profile(lot.kind, rng, lot.siteProfile, lot.floorCount);
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
  if (lot.lod === "mass") {
    addMassSilhouetteLandmarks(scene, lot, envelope, y, totalHeight, tags);
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
