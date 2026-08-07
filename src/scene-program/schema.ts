import type { SceneKind } from "../schema";

export const SCENE_PROGRAM_VERSION = 1 as const;

export const SCENE_DOMAINS = ["natural", "building", "settlement", "infrastructure", "interior", "hybrid"] as const;
export const RULESETS = ["dnd", "coc", "generic"] as const;
export const ERAS = ["ancient", "medieval", "industrial", "1920s", "modern", "future", "timeless"] as const;
export const GAMEPLAY_MODES = ["combat", "investigation", "chase", "infiltration", "social", "mixed"] as const;
export const REGION_FUNCTIONS = ["approach", "circulation", "combat", "investigation", "public", "private", "service", "hazard", "landmark", "residential", "commercial", "civic", "industrial", "natural"] as const;
export const ELEVATION_ROLES = ["sunken", "low", "level", "raised", "high", "vertical"] as const;
export const RELATION_TYPES = ["connects", "contains", "overlooks", "controls", "borders", "crosses", "runs-along", "hidden-from", "above", "below"] as const;
export const MORPHOLOGY_OPERATORS = [
  "plain", "basin", "ridge", "terraces", "channel-cut", "dry-channel", "ravine", "rift", "impact-crater", "caldera", "radial-fractures", "lava-flow", "wetland-pools", "burial-field", "crypt-sink", "ruin-grid", "coastline", "urban-blocks", "interior-partitions", "vertical-stack",
] as const;
export const COVERAGE_OPERATORS = [
  "woodland", "fungal", "grave-markers", "dragon-bones", "wreck-field", "ash", "snow", "ice", "rubble", "urban-buildings", "industrial-equipment", "institutional-rooms", "residential-rooms", "evidence", "sparse", "dense",
] as const;

export type SceneDomain = typeof SCENE_DOMAINS[number];
export type Ruleset = typeof RULESETS[number];
export type SceneEra = typeof ERAS[number];
export type GameplayMode = typeof GAMEPLAY_MODES[number];
export type RegionFunction = typeof REGION_FUNCTIONS[number];
export type ElevationRole = typeof ELEVATION_ROLES[number];
export type RelationType = typeof RELATION_TYPES[number];
export type MorphologyOperator = typeof MORPHOLOGY_OPERATORS[number];
export type CoverageOperator = typeof COVERAGE_OPERATORS[number];

export interface SceneProgramRegion {
  id: string;
  label: string;
  function: RegionFunction;
  scale: number;
  elevation: ElevationRole;
  features: string[];
  hazards: string[];
}

export interface SceneProgramRelation {
  from: string;
  to: string;
  type: RelationType;
}

export interface SceneProgramGameplay {
  mode: GameplayMode;
  objectives: string[];
  evidence: string[];
  encounterBeats: string[];
}

export interface SceneProgramConstraints {
  gridFeet: 5;
  routeRedundancy: number;
  verticalRoutes: number;
  realism: "stylized" | "plausible" | "strict";
}

/** Semantic intermediate representation. It describes spatial intent and
 * relationships, never coordinates, exact dimensions, or renderer geometry. */
export interface SceneProgram {
  version: 1;
  source: "local" | "ollama";
  model?: string;
  title: string;
  domain: SceneDomain;
  primaryKind: Exclude<SceneKind, "adaptive">;
  ruleset: Ruleset;
  era: SceneEra;
  topology: "linear" | "branching" | "open" | "vertical" | "loop" | "radial" | "network";
  morphology: MorphologyOperator[];
  coverage: CoverageOperator[];
  regions: SceneProgramRegion[];
  relations: SceneProgramRelation[];
  landmarks: string[];
  hazards: string[];
  gameplay: SceneProgramGameplay;
  constraints: SceneProgramConstraints;
}

export interface SceneProgramSummary {
  version: 1;
  source: "local" | "ollama";
  model?: string;
  domain: SceneDomain;
  ruleset: Ruleset;
  era: SceneEra;
  gameplay: GameplayMode;
  regionCount: number;
  morphology: MorphologyOperator[];
  coverage: CoverageOperator[];
}

export function summarizeSceneProgram(program: SceneProgram): SceneProgramSummary {
  return {
    version: 1,
    source: program.source,
    ...(program.model ? { model: program.model } : {}),
    domain: program.domain,
    ruleset: program.ruleset,
    era: program.era,
    gameplay: program.gameplay.mode,
    regionCount: program.regions.length,
    morphology: program.morphology,
    coverage: program.coverage,
  };
}
