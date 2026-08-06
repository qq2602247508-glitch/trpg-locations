export const GRID_FEET = 5;
export const GRID_METERS = 1.524;

export type SceneKind = "tavern" | "tower" | "sewer" | "cave" | "building" | "settlement" | "adaptive";
export type PrimitiveShape = "box" | "cylinder" | "cone" | "sphere" | "stairs" | "water";
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
  primitives: ScenePrimitive[];
  rooms: Room[];
  routes: Route[];
  tactical: TacticalFeature[];
  diagnostics: SceneDiagnostics;
  generationMs: number;
}

export interface GenerationRequest {
  prompt: string;
  seed: string;
  size: "small" | "medium" | "large";
  density: number;
}

export interface GeneratorContext {
  request: GenerationRequest;
  rng: import("./core/random").SeededRandom;
}
