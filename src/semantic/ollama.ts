import {
  classifyInput,
  type AdaptiveCover,
  type AdaptiveEnvironment,
  type AdaptiveLighting,
  type AdaptiveTheme,
  type AdaptiveTopology,
  type AdaptiveVerticality,
  type AdaptiveWater,
  type InputClassification,
} from "./classify";
import type { SceneKind } from "../schema";

export const DEFAULT_OLLAMA_MODEL = "qwen3.6:35b-mlx";
export const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";

const KINDS = ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness", "adaptive"] as const satisfies readonly SceneKind[];
const ENVIRONMENTS = ["interior", "urban", "underground", "wilderness", "coastal", "ruin"] as const satisfies readonly AdaptiveEnvironment[];
const TOPOLOGIES = ["linear", "branching", "open", "vertical", "loop"] as const satisfies readonly AdaptiveTopology[];
const VERTICALITIES = ["low", "medium", "high"] as const satisfies readonly AdaptiveVerticality[];
const WATERS = ["none", "minor", "major"] as const satisfies readonly AdaptiveWater[];
const LIGHTINGS = ["bright", "dim", "dark"] as const satisfies readonly AdaptiveLighting[];
const COVERS = ["sparse", "moderate", "dense"] as const satisfies readonly AdaptiveCover[];
const THEMES = ["cozy", "grim", "mystic", "industrial", "wild", "neutral"] as const satisfies readonly AdaptiveTheme[];

export interface OllamaSemanticHints {
  suggestedKind: SceneKind;
  environment: AdaptiveEnvironment;
  topology: AdaptiveTopology;
  verticality: AdaptiveVerticality;
  water: AdaptiveWater;
  lighting: AdaptiveLighting;
  cover: AdaptiveCover;
  theme: AdaptiveTheme;
  anchors: string[];
  hazards: string[];
}

export interface OllamaSemanticOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  /** Re-evaluate known broad wilderness prompts so mixed biomes compose. */
  force?: boolean;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestedKind", "environment", "topology", "verticality", "water", "lighting", "cover", "theme", "anchors", "hazards"],
  properties: {
    suggestedKind: { type: "string", enum: KINDS },
    environment: { type: "string", enum: ENVIRONMENTS },
    topology: { type: "string", enum: TOPOLOGIES },
    verticality: { type: "string", enum: VERTICALITIES },
    water: { type: "string", enum: WATERS },
    lighting: { type: "string", enum: LIGHTINGS },
    cover: { type: "string", enum: COVERS },
    theme: { type: "string", enum: THEMES },
    anchors: { type: "array", maxItems: 6, items: { type: "string", maxLength: 32 } },
    hazards: { type: "array", maxItems: 6, items: { type: "string", maxLength: 32 } },
  },
} as const;

function enumMember<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? value as T : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32))
    .filter(Boolean))].slice(0, 6);
}

export function parseOllamaSemanticHints(value: unknown): OllamaSemanticHints | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const suggestedKind = enumMember(record.suggestedKind, KINDS);
  const environment = enumMember(record.environment, ENVIRONMENTS);
  const topology = enumMember(record.topology, TOPOLOGIES);
  const verticality = enumMember(record.verticality, VERTICALITIES);
  const water = enumMember(record.water, WATERS);
  const lighting = enumMember(record.lighting, LIGHTINGS);
  const cover = enumMember(record.cover, COVERS);
  const theme = enumMember(record.theme, THEMES);
  const anchors = stringList(record.anchors);
  const hazards = stringList(record.hazards);
  if (!suggestedKind || !environment || !topology || !verticality || !water || !lighting || !cover || !theme || !anchors || !hazards) return undefined;
  return { suggestedKind, environment, topology, verticality, water, lighting, cover, theme, anchors, hazards };
}

export function mergeOllamaHints(local: InputClassification, hints: OllamaSemanticHints, model = DEFAULT_OLLAMA_MODEL): InputClassification {
  const anchors = [...new Set([...local.traits.anchors, ...hints.anchors])].slice(0, 8);
  const hazards = [...new Set([...local.traits.hazards, ...hints.hazards])].slice(0, 8);
  const traits = {
    ...local.traits,
    environment: hints.environment,
    topology: hints.topology,
    verticality: hints.verticality,
    water: hints.water,
    lighting: hints.lighting,
    cover: hints.cover,
    theme: hints.theme,
    anchors,
    hazards,
    tags: [
      `environment:${hints.environment}`,
      `topology:${hints.topology}`,
      `verticality:${hints.verticality}`,
      `water:${hints.water}`,
      `lighting:${hints.lighting}`,
      `cover:${hints.cover}`,
      `theme:${hints.theme}`,
      ...anchors.map((anchor) => `anchor:${anchor}`),
      ...hazards.map((hazard) => `hazard:${hazard}`),
    ],
    evidence: [...new Set([...local.traits.evidence, `ollama:${model}`])],
  };
  return {
    ...local,
    kind: hints.suggestedKind,
    source: "ollama",
    confidence: 0.72,
    semanticModel: model,
    traits,
  };
}

/** Uses Ollama only for locally ambiguous prompts and returns undefined on any failure. */
export async function classifyWithOllama(prompt: string, options: OllamaSemanticOptions = {}): Promise<InputClassification | undefined> {
  const local = classifyInput(prompt);
  if (local.source !== "adaptive" && options.force !== true) return undefined;
  const endpoint = (options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, "");
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const controller = new AbortController();
  // The 35B model can take roughly ten seconds for its first local cold load;
  // known prompts never pay this cost because they bypass Ollama entirely.
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await (options.fetcher ?? fetch)(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: RESPONSE_SCHEMA,
        options: { temperature: 0, num_predict: 220 },
        messages: [
          {
            role: "system",
            content: `Classify a TRPG location into abstract spatial intent only. Never invent dimensions, rooms, coordinates, topology edges, or random values. Return exactly one JSON object with these keys and no others:
{"suggestedKind":"adaptive","environment":"interior","topology":"open","verticality":"low","water":"none","lighting":"bright","cover":"moderate","theme":"neutral","anchors":[],"hazards":[]}
Allowed suggestedKind: ${KINDS.join(", ")}.
Allowed environment: ${ENVIRONMENTS.join(", ")}.
Allowed topology: ${TOPOLOGIES.join(", ")}.
Allowed verticality: ${VERTICALITIES.join(", ")}.
Allowed water: ${WATERS.join(", ")}.
Allowed lighting: ${LIGHTINGS.join(", ")}.
Allowed cover: ${COVERS.join(", ")}.
Allowed theme: ${THEMES.join(", ")}.
anchors and hazards are arrays of at most six short strings. Output JSON only.`,
          },
          { role: "user", content: prompt.slice(0, 600) },
        ],
      }),
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { message?: { content?: unknown } };
    if (typeof body.message?.content !== "string") return undefined;
    const hints = parseOllamaSemanticHints(JSON.parse(body.message.content));
    return hints ? mergeOllamaHints(local, hints, model) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
