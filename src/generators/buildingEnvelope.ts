import type { SeededRandom } from "../core/random";
import type { SettlementBuildingKind, Vec2 } from "../schema";

export type EnvelopePartShape = "box" | "cylinder";
export type EnvelopeRoofKind = "gable" | "flat" | "spire" | "hip";

export interface BuildingEnvelopePart {
  id: string;
  purpose: "primary" | "wing" | "service" | "tower" | "apse";
  shape: EnvelopePartShape;
  offset: Vec2;
  size: Vec2;
  heightRatio: number;
  roof: EnvelopeRoofKind;
}

export interface BuildingEnvelopeProgram {
  version: 1;
  archetype: SettlementBuildingKind;
  variant: string;
  entranceSide: "north" | "south" | "east" | "west";
  parts: BuildingEnvelopePart[];
  silhouetteSignature: string;
}

function part(id: string, purpose: BuildingEnvelopePart["purpose"], offset: Vec2, size: Vec2, heightRatio: number, roof: EnvelopeRoofKind, shape: EnvelopePartShape = "box"): BuildingEnvelopePart {
  return { id, purpose, offset, size, heightRatio, roof, shape };
}

/**
 * Creates one stable, seeded building silhouette before any LOD is chosen.
 * Full interiors, facades and distant masses consume the same major parts.
 */
export function planBuildingEnvelope(kind: SettlementBuildingKind, width: number, depth: number, rng: SeededRandom): BuildingEnvelopeProgram {
  const variation = rng.int(0, 2);
  const asymmetry = rng.float(-0.055, 0.055);
  let variant = "compound";
  let parts: BuildingEnvelopePart[];
  if (kind === "tower") {
    variant = variation === 0 ? "round-shaft-with-stair-annex" : "watch-shaft-with-gate-annex";
    parts = [
      part("shaft", "tower", { x: 0, z: -depth * 0.04 }, { x: Math.min(width, depth) * 0.74, z: Math.min(width, depth) * 0.74 }, 1, "flat", "cylinder"),
      part("stair-annex", "service", { x: width * 0.29, z: depth * 0.22 }, { x: width * 0.3, z: depth * 0.36 }, 0.48, "gable"),
    ];
  } else if (kind === "shrine") {
    variant = variation === 0 ? "cruciform-chapel" : "aisled-chapel";
    parts = [
      part("nave", "primary", { x: 0, z: depth * 0.04 }, { x: width * 0.46, z: depth * 0.9 }, 0.76, "gable"),
      part("transept", "wing", { x: 0, z: -depth * 0.08 }, { x: width * 0.92, z: depth * 0.3 }, 0.68, "gable"),
      part("apse", "apse", { x: 0, z: -depth * 0.43 }, { x: width * 0.4, z: width * 0.4 }, 0.62, "spire", "cylinder"),
    ];
  } else if (kind === "manor") {
    variant = variation === 0 ? "u-court" : "offset-hall-and-wings";
    parts = [
      part("great-hall", "primary", { x: 0, z: -depth * 0.28 }, { x: width * 0.62, z: depth * 0.38 }, 1, "hip"),
      part("west-wing", "wing", { x: -width * 0.34, z: depth * 0.06 }, { x: width * 0.28, z: depth * 0.76 }, 0.78, "gable"),
      part("east-wing", "wing", { x: width * (0.31 + asymmetry), z: depth * 0.13 }, { x: width * 0.24, z: depth * 0.62 }, 0.72, "gable"),
    ];
  } else if (kind === "warehouse" || kind === "factory" || kind === "barn") {
    variant = kind === "factory" ? "sawtooth-production-bays" : kind === "warehouse" ? "loading-hall-and-office" : "barn-and-lean-to";
    parts = [
      part("main-bay", "primary", { x: -width * 0.08, z: 0 }, { x: width * 0.76, z: depth * 0.88 }, 1, kind === "factory" ? "flat" : "gable"),
      part("side-bay", "service", { x: width * 0.36, z: depth * (variation === 0 ? 0.16 : -0.14) }, { x: width * 0.3, z: depth * 0.54 }, 0.58, "flat"),
    ];
  } else if (kind === "tavern") {
    variant = variation === 0 ? "l-shaped-public-house" : "hall-with-kitchen-wing";
    parts = [
      part("public-hall", "primary", { x: -width * 0.08, z: -depth * 0.08 }, { x: width * 0.72, z: depth * 0.66 }, 1, "gable"),
      part("kitchen-wing", "service", { x: width * 0.3, z: depth * 0.24 }, { x: width * 0.34, z: depth * 0.44 }, 0.66, "gable"),
      ...(variation === 2 ? [part("rear-room", "wing", { x: -width * 0.26, z: depth * 0.34 }, { x: width * 0.32, z: depth * 0.3 }, 0.72, "flat")] : []),
    ];
  } else if (kind === "guild" || kind === "clinic" || kind === "blacksmith" || kind === "mill") {
    variant = kind === "clinic" ? "frontage-and-treatment-wing" : `${kind}-frontage-and-yard-wing`;
    parts = [
      part("front-block", "primary", { x: 0, z: -depth * 0.18 }, { x: width * 0.86, z: depth * 0.5 }, 1, kind === "blacksmith" ? "flat" : "gable"),
      part("rear-wing", "service", { x: width * (variation === 1 ? -0.24 : 0.24), z: depth * 0.25 }, { x: width * 0.38, z: depth * 0.5 }, 0.7, "flat"),
    ];
  } else {
    variant = variation === 0 ? "l-house" : variation === 1 ? "house-with-rear-addition" : "cross-gable-house";
    parts = [
      part("main-house", "primary", { x: -width * 0.06, z: -depth * 0.08 }, { x: width * 0.76, z: depth * 0.7 }, 1, "gable"),
      part("rear-addition", "service", { x: width * (variation === 0 ? 0.28 : -0.24), z: depth * 0.3 }, { x: width * 0.34, z: depth * 0.38 }, 0.58, variation === 2 ? "gable" : "flat"),
    ];
  }
  const silhouetteSignature = parts.map((item) => `${item.id}:${item.shape}:${item.offset.x.toFixed(2)},${item.offset.z.toFixed(2)}:${item.size.x.toFixed(2)}x${item.size.z.toFixed(2)}:${item.heightRatio.toFixed(2)}:${item.roof}`).join("|");
  return { version: 1, archetype: kind, variant, entranceSide: "south", parts, silhouetteSignature };
}
