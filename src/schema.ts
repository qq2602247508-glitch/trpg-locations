export const GRID_FEET = 5;
export const GRID_METERS = 1.524;

import type { SceneProgram, SceneProgramSummary } from "./scene-program/schema";
import type { SiteProgramSummary } from "./site-program/schema";

export type SceneKind = "tavern" | "tower" | "sewer" | "cave" | "dungeon" | "building" | "settlement" | "wilderness" | "adaptive";
export type PrimitiveShape = "box" | "cylinder" | "cone" | "sphere" | "gable" | "stairs" | "water";
export type MaterialKey =
  | "stone"
  | "darkStone"
  | "wood"
  | "plaster"
  | "roof"
  | "metal"
  | "water"
  | "earth"
  | "rock"
  | "moss"
  | "hazard"
  | "warmLight";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 extends Vec2 {
  y: number;
}

export interface ScenePrimitive {
  id: string;
  shape: PrimitiveShape;
  position: Vec3;
  size: Vec3;
  rotationY?: number;
  material: MaterialKey;
  level: number;
  tags?: string[];
}

export interface Room {
  id: string;
  name: string;
  level: number;
  center: Vec3;
  sizeCells: Vec2;
  role: "public" | "private" | "service" | "circulation" | "combat" | "natural";
  connections: string[];
}

export interface Route {
  id: string;
  kind: "primary" | "alternate" | "vertical" | "waterflow";
  points: Vec3[];
  /** Semantic use stays independent from the rendering/debug route kind. */
  purpose?: "movement" | "crowd" | "service" | "escape" | "water";
  /** Relative activity or tactical importance, normalized to 0..1. */
  traffic?: number;
  /** Time layer used by settlement crowds, patrols, and service traffic. */
  schedule?: "day" | "night" | "all";
}

export interface TacticalFeature {
  id: string;
  kind: "cover" | "highGround" | "hazard" | "chokepoint" | "entrance" | "secret";
  position: Vec3;
  radiusCells: number;
  note: string;
}

export interface SceneDiagnostics {
  valid: boolean;
  score: number;
  warnings: string[];
  repairs: string[];
  metrics: Record<string, number>;
}

export type SettlementBuildingKind = "home" | "tavern" | "shrine" | "warehouse" | "tower" | "manor" | "guild" | "clinic" | "blacksmith" | "mill" | "barn" | "factory";

/**
 * Persistent identity for an independently generated building placed by a
 * settlement planner. Exterior proxies render immediately; the same seed can
 * later generate a full tactical interior on demand.
 */
export interface BuildingInstance {
  id: string;
  archetype: SettlementBuildingKind;
  seed: string;
  district: string;
  positionCells: Vec2;
  footprintCells: Vec2;
  rotationY: number;
  floors: number;
  floorHeightFeet: number[];
  detailLevel: "mass" | "facade" | "full-interior";
  parcelId?: string;
  frontageRoadId?: string;
  entranceCells?: Vec2;
  buildingProgram?: BuildingProgramSummary;
}

/** Auditable room-graph contract used before building geometry is compiled. */
export interface BuildingProgramSummary {
  archetype: string;
  requiredFeatures: string[];
  roomCount: number;
  connectionCount: number;
  levels: number;
  topology: "courtyard" | "winged" | "vertical" | "defensive" | "institutional" | "composite";
}

export interface GeneratedScene {
  version: 1;
  kind: SceneKind;
  /** Selected procedural grammar within a broad scene domain. */
  archetype?: string;
  title: string;
  description: string;
  seed: string;
  gridFeet: 5;
  boundsCells: Vec2;
  floors: number;
  floorHeightFeet: number[];
  /** Optional inspection labels when logical layers are not a simple upward
   * stack (for example a roof deck and a below-grade basement). */
  floorLabels?: string[];
  primitives: ScenePrimitive[];
  rooms: Room[];
  routes: Route[];
  tactical: TacticalFeature[];
  buildingInstances?: BuildingInstance[];
  diagnostics: SceneDiagnostics;
  generationMs: number;
  semantic?: {
    source: "local" | "ollama";
    model?: string;
  };
  /** Auditable semantic plan compiled into this deterministic scene. */
  sceneProgram?: SceneProgramSummary;
  /** Auditable terrain/road/district/parcel plan for settlements and mixed sites. */
  siteProgram?: SiteProgramSummary;
  buildingProgram?: BuildingProgramSummary;
}

export interface GenerationRequest {
  prompt: string;
  seed: string;
  size: "small" | "medium" | "large";
  density: number;
}

export interface SemanticGenerationHints {
  environment: string;
  topology: string;
  verticality: string;
  water: string;
  lighting: string;
  cover: string;
  theme: string;
  anchors: string[];
  hazards: string[];
  tags: string[];
}

export interface GeneratorContext {
  request: GenerationRequest;
  rng: import("./core/random").SeededRandom;
  semanticHints?: SemanticGenerationHints;
  sceneProgram?: SceneProgram;
}
