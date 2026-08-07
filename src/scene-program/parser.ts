import type { SceneKind } from "../schema";
import {
  COVERAGE_OPERATORS,
  ELEVATION_ROLES,
  ERAS,
  GAMEPLAY_MODES,
  MORPHOLOGY_OPERATORS,
  REGION_FUNCTIONS,
  RELATION_TYPES,
  RULESETS,
  SCENE_DOMAINS,
  type SceneProgram,
  type SceneProgramRegion,
  type SceneProgramRelation,
} from "./schema";

const PRIMARY_KINDS = ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness"] as const satisfies readonly Exclude<SceneKind, "adaptive">[];
const TOPOLOGIES = ["linear", "branching", "open", "vertical", "loop", "radial", "network"] as const;
const REALISM = ["stylized", "plausible", "strict"] as const;

function member<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? value as T : undefined;
}

function clean(value: unknown, length = 48): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, length);
  return result || undefined;
}

function list(value: unknown, max = 8): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map((item) => clean(item)).filter((item): item is string => Boolean(item)))].slice(0, max);
}

function enumList<T extends string>(value: unknown, values: readonly T[], max = 8): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = [...new Set(value.map((item) => member(item, values)).filter((item): item is T => Boolean(item)))].slice(0, max);
  return result.length > 0 ? result : undefined;
}

function numberIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function parseRegions(value: unknown): SceneProgramRegion[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return undefined;
  const regions: SceneProgramRegion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const id = clean(record.id, 24)?.replace(/[^a-zA-Z0-9_-]/g, "-").toLocaleLowerCase("en-US");
    const label = clean(record.label, 48);
    const fn = member(record.function, REGION_FUNCTIONS);
    const scale = numberIn(record.scale, 0.08, 1);
    const elevation = member(record.elevation, ELEVATION_ROLES);
    const features = list(record.features, 6);
    const hazards = list(record.hazards, 4);
    if (!id || !label || !fn || scale === undefined || !elevation || !features || !hazards) return undefined;
    regions.push({ id, label, function: fn, scale, elevation, features, hazards });
  }
  if (new Set(regions.map((region) => region.id)).size !== regions.length) return undefined;
  return regions;
}

function parseRelations(value: unknown, regionIds: ReadonlySet<string>): SceneProgramRelation[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return undefined;
  const relations: SceneProgramRelation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const from = clean(record.from, 24);
    const to = clean(record.to, 24);
    const type = member(record.type, RELATION_TYPES);
    if (!from || !to || from === to || !regionIds.has(from) || !regionIds.has(to) || !type) return undefined;
    relations.push({ from, to, type });
  }
  return relations;
}

export function parseSceneProgram(value: unknown, source: SceneProgram["source"] = "ollama", model?: string): SceneProgram | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const title = clean(record.title, 64);
  const domain = member(record.domain, SCENE_DOMAINS);
  const primaryKind = member(record.primaryKind, PRIMARY_KINDS);
  const ruleset = member(record.ruleset, RULESETS);
  const era = member(record.era, ERAS);
  const topology = member(record.topology, TOPOLOGIES);
  const morphology = enumList(record.morphology, MORPHOLOGY_OPERATORS, 8);
  const coverage = enumList(record.coverage, COVERAGE_OPERATORS, 8);
  const regions = parseRegions(record.regions);
  const landmarks = list(record.landmarks, 8);
  const hazards = list(record.hazards, 8);
  const gameplayRaw = record.gameplay;
  const constraintsRaw = record.constraints;
  if (!title || !domain || !primaryKind || !ruleset || !era || !topology || !morphology || !coverage || !regions || !landmarks || !hazards || !gameplayRaw || typeof gameplayRaw !== "object" || Array.isArray(gameplayRaw) || !constraintsRaw || typeof constraintsRaw !== "object" || Array.isArray(constraintsRaw)) return undefined;
  const gameplayRecord = gameplayRaw as Record<string, unknown>;
  const mode = member(gameplayRecord.mode, GAMEPLAY_MODES);
  const objectives = list(gameplayRecord.objectives, 6);
  const evidence = list(gameplayRecord.evidence, 8);
  const encounterBeats = list(gameplayRecord.encounterBeats, 6);
  const constraintsRecord = constraintsRaw as Record<string, unknown>;
  const routeRedundancy = numberIn(constraintsRecord.routeRedundancy, 1, 4);
  const verticalRoutes = numberIn(constraintsRecord.verticalRoutes, 0, 4);
  const realism = member(constraintsRecord.realism, REALISM);
  const relations = parseRelations(record.relations, new Set(regions.map((region) => region.id)));
  if (!mode || !objectives || !evidence || !encounterBeats || routeRedundancy === undefined || verticalRoutes === undefined || !realism || !relations) return undefined;
  return {
    version: 1,
    source,
    ...(model ? { model } : {}),
    title,
    domain,
    primaryKind,
    ruleset,
    era,
    topology,
    morphology,
    coverage,
    regions,
    relations,
    landmarks,
    hazards,
    gameplay: { mode, objectives, evidence, encounterBeats },
    constraints: { gridFeet: 5, routeRedundancy: Math.round(routeRedundancy), verticalRoutes: Math.round(verticalRoutes), realism },
  };
}
