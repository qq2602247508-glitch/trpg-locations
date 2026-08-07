import type { SceneKind } from "../schema";
import { DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from "../semantic/ollama";
import { parseSceneProgram } from "./parser";
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
} from "./schema";

const PRIMARY_KINDS = ["tavern", "tower", "sewer", "cave", "dungeon", "building", "settlement", "wilderness"] as const;
const TOPOLOGIES = ["linear", "branching", "open", "vertical", "loop", "radial", "network"] as const;

export interface SceneProgramPlannerOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  requestedKind?: SceneKind;
}

export const SCENE_PROGRAM_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "domain", "primaryKind", "ruleset", "era", "topology", "morphology", "coverage", "regions", "relations", "landmarks", "hazards", "gameplay", "constraints"],
  properties: {
    title: { type: "string", maxLength: 64 },
    domain: { type: "string", enum: SCENE_DOMAINS },
    primaryKind: { type: "string", enum: PRIMARY_KINDS },
    ruleset: { type: "string", enum: RULESETS },
    era: { type: "string", enum: ERAS },
    topology: { type: "string", enum: TOPOLOGIES },
    morphology: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string", enum: MORPHOLOGY_OPERATORS } },
    coverage: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string", enum: COVERAGE_OPERATORS } },
    regions: {
      type: "array", minItems: 2, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "label", "function", "scale", "elevation", "features", "hazards"],
        properties: {
          id: { type: "string", maxLength: 24 }, label: { type: "string", maxLength: 48 }, function: { type: "string", enum: REGION_FUNCTIONS }, scale: { type: "number", minimum: 0.08, maximum: 1 }, elevation: { type: "string", enum: ELEVATION_ROLES }, features: { type: "array", maxItems: 6, items: { type: "string", maxLength: 48 } }, hazards: { type: "array", maxItems: 4, items: { type: "string", maxLength: 48 } },
        },
      },
    },
    relations: {
      type: "array", minItems: 1, maxItems: 16,
      items: { type: "object", additionalProperties: false, required: ["from", "to", "type"], properties: { from: { type: "string", maxLength: 24 }, to: { type: "string", maxLength: 24 }, type: { type: "string", enum: RELATION_TYPES } } },
    },
    landmarks: { type: "array", maxItems: 8, items: { type: "string", maxLength: 48 } },
    hazards: { type: "array", maxItems: 8, items: { type: "string", maxLength: 48 } },
    gameplay: {
      type: "object", additionalProperties: false, required: ["mode", "objectives", "evidence", "encounterBeats"],
      properties: { mode: { type: "string", enum: GAMEPLAY_MODES }, objectives: { type: "array", maxItems: 6, items: { type: "string", maxLength: 48 } }, evidence: { type: "array", maxItems: 8, items: { type: "string", maxLength: 48 } }, encounterBeats: { type: "array", maxItems: 6, items: { type: "string", maxLength: 48 } } },
    },
    constraints: {
      type: "object", additionalProperties: false, required: ["gridFeet", "routeRedundancy", "verticalRoutes", "realism"],
      properties: { gridFeet: { type: "integer", enum: [5] }, routeRedundancy: { type: "integer", minimum: 1, maximum: 4 }, verticalRoutes: { type: "integer", minimum: 0, maximum: 4 }, realism: { type: "string", enum: ["stylized", "plausible", "strict"] } },
    },
  },
} as const;

/** Some Ollama runners treat JSON Schema as guidance rather than a grammar.
 * Normalize only unambiguous enum synonyms before the strict parser; missing
 * fields, arbitrary nesting, invalid references, and invented shapes still
 * fail closed and fall back to the deterministic local planner. */
function normalizeOllamaCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.primaryKind === "string" && !PRIMARY_KINDS.includes(record.primaryKind as typeof PRIMARY_KINDS[number])) {
    record.primaryKind = record.domain === "building" || record.domain === "interior" ? "building"
      : record.domain === "settlement" ? "settlement"
        : record.domain === "infrastructure" ? "sewer"
          : "wilderness";
  }
  if (Array.isArray(record.morphology)) {
    const morphologyAliases: Readonly<Record<string, string>> = {
      structure: "interior-partitions",
      courtyard: "interior-partitions",
      crater: "impact-crater",
      canyon: "ravine",
      fissures: "radial-fractures",
      forest: "plain",
    };
    const normalized = [...new Set(record.morphology.map((operator) => typeof operator === "string" ? morphologyAliases[operator] ?? operator : operator))];
    const supported = normalized.filter((operator): operator is typeof MORPHOLOGY_OPERATORS[number] => typeof operator === "string" && MORPHOLOGY_OPERATORS.includes(operator as typeof MORPHOLOGY_OPERATORS[number]));
    record.morphology = supported.length > 0 ? supported : [record.domain === "building" || record.domain === "interior" ? "interior-partitions" : record.domain === "settlement" ? "urban-blocks" : "plain"];
  }
  if (Array.isArray(record.regions)) {
    const functionAliases: Readonly<Record<string, string>> = {
      restricted: "private",
      objective: "landmark",
      entrance: "approach",
      access: "circulation",
      utility: "service",
      storage: "service",
    };
    const elevationAliases: Readonly<Record<string, string>> = {
      ground: "level",
      elevated: "raised",
      underground: "sunken",
    };
    record.regions = record.regions.map((region) => {
      if (!region || typeof region !== "object" || Array.isArray(region)) return region;
      const normalized = { ...(region as Record<string, unknown>) };
      if (typeof normalized.function === "string") normalized.function = functionAliases[normalized.function] ?? normalized.function;
      if (typeof normalized.elevation === "string") normalized.elevation = elevationAliases[normalized.elevation] ?? normalized.elevation;
      return normalized;
    });
  }
  if (Array.isArray(record.relations)) {
    const relationAliases: Readonly<Record<string, string>> = {
      adjacent: "borders",
      adjacent_to: "borders",
      leads_to: "connects",
      encloses: "contains",
      originates_from: "connects",
      surrounded_by: "contains",
      descends: "below",
      ascends: "above",
    };
    record.relations = record.relations.map((relation) => {
      if (!relation || typeof relation !== "object" || Array.isArray(relation)) return relation;
      const normalized = { ...(relation as Record<string, unknown>) };
      if (typeof normalized.type === "string") normalized.type = relationAliases[normalized.type] ?? normalized.type;
      return normalized;
    });
  }
  return record;
}

export async function planSceneProgramWithOllama(prompt: string, options: SceneProgramPlannerOptions = {}): Promise<SceneProgram | undefined> {
  const endpoint = (options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, "");
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 16_000);
  try {
    const response = await (options.fetcher ?? fetch)(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: SCENE_PROGRAM_RESPONSE_SCHEMA,
        options: { temperature: 0, num_predict: 1200 },
        messages: [
          {
            role: "system",
            content: `You are a spatial scene compiler front-end. Return exactly ONE SceneProgram v1 JSON object. Do not wrap it in scene_program, metadata, result, or markdown. Use exactly the keys and value shapes in this template:
{"title":"Short title","domain":"natural","primaryKind":"wilderness","ruleset":"generic","era":"timeless","topology":"open","morphology":["plain"],"coverage":["sparse"],"regions":[{"id":"approach","label":"Approach","function":"approach","scale":0.45,"elevation":"level","features":["entry-route"],"hazards":[]},{"id":"objective","label":"Objective","function":"landmark","scale":0.55,"elevation":"raised","features":["objective"],"hazards":[]}],"relations":[{"from":"approach","to":"objective","type":"connects"}],"landmarks":["objective"],"hazards":[],"gameplay":{"mode":"mixed","objectives":["reach objective"],"evidence":[],"encounterBeats":["approach","reveal","resolution"]},"constraints":{"gridFeet":5,"routeRedundancy":2,"verticalRoutes":1,"realism":"plausible"}}
Convert the user's request by replacing template values, never its keys or nesting. All enum values must come from the provided JSON Schema. A named enclosed institution or structure (for example an observatory, laboratory, museum, theatre, station, hospital, or school) uses domain building and primaryKind building even when it contains natural-looking features. Describe abstract regions, relationships, morphology operators, gameplay intent, era, and constraints. Never output coordinates, exact dimensions, individual grid cells, meshes, rendering code, prose, or rule mechanics. Create 2-6 meaningfully different regions whose scales roughly sum to 1. Relations may reference only declared region ids. D&D prioritizes combat routes; Call of Cthulhu prioritizes realistic functions, evidence, restricted areas, and escape routes. Unknown fantasy or real concepts must be decomposed into the closest physical processes and functional spaces instead of returning a generic mountain. Requested UI kind is ${options.requestedKind ?? "adaptive"}; respect it unless adaptive. Output the single JSON object only.`,
          },
          { role: "user", content: prompt.slice(0, 800) },
        ],
      }),
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { message?: { content?: unknown } };
    if (typeof body.message?.content !== "string") return undefined;
    return parseSceneProgram(normalizeOllamaCandidate(JSON.parse(body.message.content)), "ollama", model);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
