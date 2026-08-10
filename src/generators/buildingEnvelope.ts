import type { SeededRandom } from "../core/random";
import type { SettlementBuildingKind, Vec2 } from "../schema";

export type EnvelopePartShape = "box" | "cylinder";
export type EnvelopeRoofKind = "gable" | "flat" | "spire" | "hip";
export type SiteBuildingProfile = "weather-station" | "quarantine-station" | "ranger-station" | "border-outpost" | "field-station" | "observatory" | "forge" | "sanatorium" | "wizard-tower";

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
export function planBuildingEnvelope(
  kind: SettlementBuildingKind,
  width: number,
  depth: number,
  rng: SeededRandom,
  siteProfile?: SiteBuildingProfile,
): BuildingEnvelopeProgram {
  const variation = rng.int(0, 2);
  const asymmetry = rng.float(-0.055, 0.055);
  let variant = "compound";
  let parts: BuildingEnvelopePart[];
  if (siteProfile === "wizard-tower") {
    variant = variation === 0 ? "arcane-shaft-and-alchemy-wing" : variation === 1 ? "arcane-twin-turret" : "arcane-observatory-stack";
    parts = variation === 0 ? [
      part("arcane-shaft", "tower", { x: -width * 0.06, z: -depth * 0.08 }, { x: Math.min(width, depth) * 0.68, z: Math.min(width, depth) * 0.68 }, 1, "spire", "cylinder"),
      part("alchemy-wing", "service", { x: width * 0.28, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.38 }, 0.46, "gable"),
      part("observatory-turret", "tower", { x: -width * 0.28, z: depth * 0.24 }, { x: width * 0.24, z: width * 0.24 }, 0.78, "spire", "cylinder"),
    ] : variation === 1 ? [
      part("main-spell-tower", "tower", { x: -width * 0.12, z: -depth * 0.08 }, { x: Math.min(width, depth) * 0.62, z: Math.min(width, depth) * 0.62 }, 1, "spire", "cylinder"),
      part("library-turret", "tower", { x: width * 0.26, z: depth * 0.12 }, { x: width * 0.3, z: width * 0.3 }, 0.72, "spire", "cylinder"),
      part("entrance-link", "service", { x: width * 0.08, z: depth * 0.34 }, { x: width * 0.46, z: depth * 0.24 }, 0.38, "gable"),
    ] : [
      part("observatory-shaft", "tower", { x: 0, z: -depth * 0.12 }, { x: Math.min(width, depth) * 0.7, z: Math.min(width, depth) * 0.7 }, 1, "flat", "cylinder"),
      part("ritual-annex", "wing", { x: -width * 0.29, z: depth * 0.24 }, { x: width * 0.32, z: depth * 0.34 }, 0.48, "spire"),
      part("laboratory-annex", "service", { x: width * 0.29, z: depth * 0.22 }, { x: width * 0.32, z: depth * 0.38 }, 0.46, "gable"),
    ];
  } else if (siteProfile === "field-station") {
    variant = variation === 0 ? "field-lab-and-sample-wing" : variation === 1 ? "field-offset-research-bays" : "field-observation-compound";
    parts = variation === 0 ? [
      part("field-laboratory", "primary", { x: -width * 0.12, z: -depth * 0.08 }, { x: width * 0.62, z: depth * 0.58 }, 0.7, "gable"),
      part("sample-wing", "wing", { x: width * 0.29, z: depth * 0.08 }, { x: width * 0.36, z: depth * 0.48 }, 0.58, "flat"),
      part("equipment-lock", "service", { x: -width * 0.26, z: depth * 0.32 }, { x: width * 0.3, z: depth * 0.26 }, 0.42, "flat"),
      part("observation-node", "tower", { x: width * 0.28, z: -depth * 0.32 }, { x: width * 0.24, z: width * 0.24 }, 0.92, "flat", "cylinder"),
    ] : variation === 1 ? [
      part("research-spine", "primary", { x: 0, z: -depth * 0.12 }, { x: width * 0.76, z: depth * 0.46 }, 0.68, "hip"),
      part("wet-lab", "wing", { x: -width * 0.28, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.42 }, 0.55, "flat"),
      part("sample-store", "service", { x: width * 0.3, z: depth * 0.22 }, { x: width * 0.3, z: depth * 0.38 }, 0.48, "flat"),
    ] : [
      part("central-field-lab", "primary", { x: 0, z: -depth * 0.08 }, { x: width * 0.58, z: depth * 0.54 }, 0.7, "gable"),
      part("west-sample-bay", "wing", { x: -width * 0.31, z: depth * 0.18 }, { x: width * 0.28, z: depth * 0.38 }, 0.5, "flat"),
      part("east-equipment-bay", "wing", { x: width * 0.31, z: depth * 0.18 }, { x: width * 0.28, z: depth * 0.38 }, 0.52, "flat"),
      part("observation-node", "tower", { x: 0, z: depth * 0.3 }, { x: width * 0.25, z: width * 0.25 }, 0.88, "flat", "cylinder"),
    ];
  } else if (siteProfile === "weather-station") {
    variant = variation === 0 ? "weather-crosswind-lab" : variation === 1 ? "weather-offset-instrument-spine" : "weather-observation-court";
    parts = variation === 0 ? [
      part("operations-cabin", "primary", { x: -width * 0.12, z: 0 }, { x: width * 0.62, z: depth * 0.7 }, 0.72, "gable"),
      part("instrument-wing", "wing", { x: width * 0.28, z: -depth * 0.08 }, { x: width * 0.34, z: depth * 0.46 }, 0.54, "flat"),
      part("airlock", "service", { x: -width * 0.18, z: depth * 0.42 }, { x: width * 0.28, z: depth * 0.22 }, 0.42, "flat"),
      part("observation-pod", "tower", { x: width * 0.2, z: -depth * 0.34 }, { x: width * 0.26, z: width * 0.26 }, 0.92, "flat", "cylinder"),
    ] : variation === 1 ? [
      part("operations-spine", "primary", { x: 0, z: -depth * 0.08 }, { x: width * 0.78, z: depth * 0.48 }, 0.66, "gable"),
      part("instrument-bay", "wing", { x: -width * 0.27, z: depth * 0.24 }, { x: width * 0.34, z: depth * 0.46 }, 0.5, "flat"),
      part("radio-bay", "service", { x: width * 0.3, z: depth * 0.2 }, { x: width * 0.28, z: depth * 0.38 }, 0.76, "flat"),
      part("wind-observatory", "tower", { x: width * 0.3, z: -depth * 0.29 }, { x: width * 0.24, z: width * 0.24 }, 1, "flat", "cylinder"),
    ] : [
      part("operations-cabin", "primary", { x: 0, z: -depth * 0.14 }, { x: width * 0.68, z: depth * 0.5 }, 0.7, "hip"),
      part("west-instrument-bay", "wing", { x: -width * 0.32, z: depth * 0.18 }, { x: width * 0.28, z: depth * 0.38 }, 0.48, "flat"),
      part("east-radio-bay", "wing", { x: width * 0.32, z: depth * 0.2 }, { x: width * 0.28, z: depth * 0.42 }, 0.58, "flat"),
      part("weather-eye", "tower", { x: 0, z: depth * 0.28 }, { x: width * 0.28, z: width * 0.28 }, 0.9, "flat", "cylinder"),
    ];
  } else if (siteProfile === "quarantine-station") {
    variant = variation === 0 ? "quarantine-screened-court" : variation === 1 ? "quarantine-airlock-wing" : "quarantine-separated-pavilions";
    parts = variation === 0 ? [
      part("reception-cabin", "primary", { x: -width * 0.12, z: -depth * 0.12 }, { x: width * 0.62, z: depth * 0.52 }, 0.68, "hip"),
      part("treatment-wing", "wing", { x: width * 0.3, z: -depth * 0.02 }, { x: width * 0.34, z: depth * 0.62 }, 0.62, "gable"),
      part("wash-airlock", "service", { x: -width * 0.2, z: depth * 0.3 }, { x: width * 0.28, z: depth * 0.3 }, 0.44, "flat"),
    ] : variation === 1 ? [
      part("reception-spine", "primary", { x: 0, z: -depth * 0.16 }, { x: width * 0.76, z: depth * 0.46 }, 0.66, "gable"),
      part("isolation-wing", "wing", { x: -width * 0.29, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.48 }, 0.58, "hip"),
      part("treatment-wing", "wing", { x: width * 0.29, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.48 }, 0.58, "hip"),
      part("decontamination-airlock", "service", { x: 0, z: depth * 0.39 }, { x: width * 0.26, z: depth * 0.2 }, 0.4, "flat"),
    ] : [
      part("reception-pavilion", "primary", { x: -width * 0.22, z: -depth * 0.12 }, { x: width * 0.46, z: depth * 0.5 }, 0.66, "hip"),
      part("treatment-pavilion", "wing", { x: width * 0.27, z: -depth * 0.02 }, { x: width * 0.4, z: depth * 0.56 }, 0.6, "gable"),
      part("screened-link", "service", { x: 0, z: depth * 0.23 }, { x: width * 0.42, z: depth * 0.18 }, 0.36, "flat"),
    ];
  } else if (siteProfile === "ranger-station") {
    variant = variation === 0 ? "ranger-lodge-and-watch-bay" : variation === 1 ? "ranger-bent-cabin" : "ranger-yard-compound";
    parts = [
      part("ranger-lodge", "primary", { x: -width * 0.1, z: -depth * 0.08 }, { x: width * 0.66, z: depth * 0.62 }, 0.76, "gable"),
      part("equipment-bay", "service", { x: width * 0.3, z: depth * (variation === 1 ? -0.16 : 0.18) }, { x: width * 0.34, z: depth * 0.38 }, 0.48, "flat"),
      ...(variation === 2 ? [part("watch-bay", "tower", { x: -width * 0.32, z: depth * 0.24 }, { x: width * 0.25, z: width * 0.25 }, 0.9, "hip")] : []),
    ];
  } else if (siteProfile === "border-outpost") {
    variant = variation === 0 ? "border-gatehouse" : variation === 1 ? "border-offset-watch-block" : "border-courtyard-post";
    parts = [
      part("guard-block", "primary", { x: 0, z: -depth * 0.12 }, { x: width * 0.72, z: depth * 0.5 }, 0.72, "gable"),
      part("bunk-wing", "wing", { x: -width * 0.29, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.46 }, 0.56, "hip"),
      part("watch-block", "tower", { x: width * 0.31, z: depth * (variation === 1 ? -0.06 : 0.2) }, { x: width * 0.28, z: width * 0.28 }, 1, "flat"),
    ];
  } else if (siteProfile === "observatory") {
    variant = variation === 0 ? "observatory-dome-and-lab" : variation === 1 ? "observatory-offset-tower" : "observatory-courtyard-instruments";
    parts = variation === 0 ? [
      part("observation-dome", "tower", { x: -width * 0.08, z: -depth * 0.1 }, { x: Math.min(width, depth) * 0.58, z: Math.min(width, depth) * 0.58 }, 0.95, "flat", "cylinder"),
      part("darkroom-lab", "primary", { x: width * 0.24, z: depth * 0.18 }, { x: width * 0.46, z: depth * 0.48 }, 0.68, "hip"),
      part("archive-wing", "service", { x: -width * 0.3, z: depth * 0.24 }, { x: width * 0.3, z: depth * 0.38 }, 0.52, "gable"),
    ] : variation === 1 ? [
      part("observation-spine", "primary", { x: 0, z: -depth * 0.12 }, { x: width * 0.72, z: depth * 0.44 }, 0.68, "hip"),
      part("instrument-tower", "tower", { x: -width * 0.3, z: depth * 0.2 }, { x: width * 0.28, z: width * 0.28 }, 1, "flat", "cylinder"),
      part("calibration-bay", "service", { x: width * 0.28, z: depth * 0.2 }, { x: width * 0.34, z: depth * 0.4 }, 0.46, "flat"),
    ] : [
      part("central-observatory", "primary", { x: 0, z: -depth * 0.08 }, { x: width * 0.54, z: depth * 0.52 }, 0.72, "hip"),
      part("west-instrument-yard", "service", { x: -width * 0.3, z: depth * 0.18 }, { x: width * 0.3, z: depth * 0.42 }, 0.42, "flat"),
      part("east-archive-wing", "wing", { x: width * 0.3, z: depth * 0.2 }, { x: width * 0.3, z: depth * 0.44 }, 0.56, "gable"),
      part("sky-bridge-node", "tower", { x: 0, z: depth * 0.34 }, { x: width * 0.22, z: width * 0.22 }, 0.9, "flat", "cylinder"),
    ];
  } else if (siteProfile === "forge") {
    variant = variation === 0 ? "forge-long-bay-and-stack" : variation === 1 ? "forge-courtyard-furnaces" : "forge-split-workshops";
    parts = variation === 0 ? [
      part("forge-bay", "primary", { x: -width * 0.1, z: 0 }, { x: width * 0.72, z: depth * 0.76 }, 0.92, "gable"),
      part("furnace-wing", "service", { x: width * 0.3, z: depth * 0.2 }, { x: width * 0.32, z: depth * 0.42 }, 0.7, "flat"),
      part("slag-yard", "wing", { x: -width * 0.3, z: depth * 0.3 }, { x: width * 0.3, z: depth * 0.3 }, 0.32, "flat"),
    ] : variation === 1 ? [
      part("forge-hall", "primary", { x: 0, z: -depth * 0.1 }, { x: width * 0.62, z: depth * 0.54 }, 0.88, "gable"),
      part("west-furnace-court", "service", { x: -width * 0.31, z: depth * 0.18 }, { x: width * 0.28, z: depth * 0.48 }, 0.58, "flat"),
      part("east-quench-bay", "service", { x: width * 0.31, z: depth * 0.2 }, { x: width * 0.28, z: depth * 0.44 }, 0.54, "flat"),
    ] : [
      part("blacksmith-hall", "primary", { x: -width * 0.2, z: -depth * 0.12 }, { x: width * 0.48, z: depth * 0.58 }, 0.76, "gable"),
      part("smelter-wing", "service", { x: width * 0.24, z: depth * 0.12 }, { x: width * 0.36, z: depth * 0.48 }, 0.82, "flat"),
      part("ore-store", "service", { x: width * 0.28, z: depth * 0.38 }, { x: width * 0.28, z: depth * 0.24 }, 0.48, "flat"),
    ];
  } else if (siteProfile === "sanatorium") {
    variant = variation === 0 ? "sanatorium-cross-court" : variation === 1 ? "sanatorium-sea-facing-wings" : "sanatorium-pavilion-cluster";
    parts = variation === 0 ? [
      part("sanatorium-main", "primary", { x: 0, z: -depth * 0.12 }, { x: width * 0.44, z: depth * 0.58 }, 0.82, "hip"),
      part("ward-west", "wing", { x: -width * 0.3, z: depth * 0.16 }, { x: width * 0.3, z: depth * 0.48 }, 0.72, "gable"),
      part("ward-east", "wing", { x: width * 0.3, z: depth * 0.16 }, { x: width * 0.3, z: depth * 0.48 }, 0.72, "gable"),
      part("treatment-link", "service", { x: 0, z: depth * 0.32 }, { x: width * 0.4, z: depth * 0.2 }, 0.54, "flat"),
    ] : variation === 1 ? [
      part("sea-facing-main", "primary", { x: 0, z: -depth * 0.2 }, { x: width * 0.74, z: depth * 0.34 }, 0.76, "hip"),
      part("ward-wing-left", "wing", { x: -width * 0.3, z: depth * 0.14 }, { x: width * 0.28, z: depth * 0.5 }, 0.68, "gable"),
      part("ward-wing-right", "wing", { x: width * 0.3, z: depth * 0.14 }, { x: width * 0.28, z: depth * 0.5 }, 0.68, "gable"),
    ] : [
      part("central-treatment", "primary", { x: 0, z: -depth * 0.08 }, { x: width * 0.5, z: depth * 0.46 }, 0.86, "hip"),
      part("pavilion-west", "wing", { x: -width * 0.3, z: depth * 0.18 }, { x: width * 0.3, z: depth * 0.4 }, 0.62, "gable"),
      part("pavilion-east", "wing", { x: width * 0.3, z: depth * 0.18 }, { x: width * 0.3, z: depth * 0.4 }, 0.62, "gable"),
      part("hydrotherapy-bay", "service", { x: 0, z: depth * 0.38 }, { x: width * 0.36, z: depth * 0.2 }, 0.5, "flat"),
    ];
  } else if (kind === "tower") {
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
