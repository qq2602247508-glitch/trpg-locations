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
  createRoom,
  cylinder,
  feetToMeters,
  primitive,
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
          : rng.int(2, 3);
  const range: readonly [number, number] = kind === "warehouse" ? [14, 18]
    : kind === "shrine" ? [14, 20]
      : kind === "tower" ? [10, 13]
        : kind === "tavern" ? [10, 12]
          : kind === "manor" ? [11, 14]
            : [9, 11];
  const floorHeightFeet = Array.from({ length: floors }, () => rng.int(range[0], range[1]));
  const material: MaterialKey = kind === "warehouse" || kind === "tower" ? "darkStone"
    : kind === "shrine" ? "stone"
      : kind === "tavern" ? "wood"
        : "plaster";
  return { floors, floorHeightFeet, material };
}

/** Independent exterior grammar consumed by settlement planners. */
export function instantiateBuildingModule(scene: GeneratedScene, lot: BuildingLot, rng: GeneratorContext["rng"]): BuildingInstance {
  const generated = profile(lot.kind, rng);
  const totalHeight = feetToMeters(generated.floorHeightFeet.reduce((sum, height) => sum + height, 0));
  const y = FLOOR_SLAB_METERS;
  const tags = ["settlement-building", "independent-building-module", `building:${lot.kind}`, `district:${lot.district}`];
  const addMass = (suffix: string, localX: number, localZ: number, width: number, depth: number, height = totalHeight, material = generated.material) => {
    const point = localPoint(lot, localX, localZ);
    scene.primitives.push(box(`${lot.id}-${suffix}`, 0, point.x, y, point.z, width, height, depth, material, [...tags, `module-part:${suffix}`], lot.rotation));
  };

  if (lot.kind === "tower") {
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
  } else if (lot.kind === "warehouse") {
    addMass("storage-bay", 0, 0, lot.width * 0.94, lot.depth * 0.78);
    const loading = localPoint(lot, 0, -lot.depth * 0.46);
    scene.primitives.push(box(`${lot.id}-loading-platform`, 0, loading.x, FLOOR_SLAB_METERS, loading.z, lot.width * 0.78, feetToMeters(2.5), 1.2, "wood", [...tags, "loading-platform", "cover"], lot.rotation));
    scene.tactical.push(tacticalFeature(`${lot.id}-cargo-cover`, "cover", loading.x, loading.z, 0, 2, "Loading platforms and cargo form a tactical cover line."));
  } else {
    addMass("house", 0, 0, lot.width * 0.88, lot.depth * 0.84);
    const stoop = localPoint(lot, 0, -lot.depth * 0.47);
    scene.primitives.push(box(`${lot.id}-stoop`, 0, stoop.x, FLOOR_SLAB_METERS, stoop.z, Math.min(2.2, lot.width * 0.42), feetToMeters(1), 0.8, "wood", [...tags, "stoop", "entrance-detail"], lot.rotation));
  }

  if (lot.kind !== "tower" && lot.kind !== "shrine") {
    scene.primitives.push(box(`${lot.id}-roof`, 0, lot.x, y + totalHeight, lot.z, lot.width * 0.98, 0.28, lot.depth * 0.96, "roof", [...tags, "roof"], lot.rotation));
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
    detailLevel: "exterior-proxy",
  };
  (scene.buildingInstances ??= []).push(instance);
  return instance;
}
