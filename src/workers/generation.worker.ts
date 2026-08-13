import type { GenerationRequest, GeneratedScene, SceneKind } from "../schema";
import type { SceneProgram, OllamaPlanningStatus } from "../scene-program";
import type { SceneCompositionProgram } from "../composition";
import { normalizeGenerationTiming } from "../timing";

interface GenerationWorkerRequest {
  id: number;
  request: GenerationRequest;
  kind: SceneKind;
}

interface GenerationWorkerResponse {
  id: number;
  scene?: GeneratedScene;
  error?: string;
}

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<GenerationWorkerRequest>) => void): void;
  postMessage(message: GenerationWorkerResponse): void;
}

// Keep the main tsconfig on DOM types; Vite evaluates this module in a worker.
const scope = globalThis as unknown as WorkerScope;
type PlannedProgram = { program: SceneProgram; ollamaStatus?: OllamaPlanningStatus; model?: string };
const sceneProgramCache = new Map<string, PlannedProgram>();
const compositionCache = new Map<string, SceneCompositionProgram>();

async function planProgram(prompt: string, kind: SceneKind, allowOllama: boolean, forceLocalModel = false): Promise<{ program: SceneProgram; ollamaStatus?: OllamaPlanningStatus; model?: string }> {
  const [{ planSceneProgramLocally, planSceneProgramWithOllamaDetailed }, { shouldComposeWildernessFacility }] = await Promise.all([
    import("../scene-program"),
    import("../semantic/siteIntent"),
  ]);
  const key = `${kind}|${forceLocalModel ? "forced-model" : "auto"}|${prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
  const cached = sceneProgramCache.get(key);
  if (cached) return cached;
  const localProgram = planSceneProgramLocally(prompt, kind);
  // Known physical operators and functional domains already have deterministic
  // planners. Spend the local-model latency only on unresolved concepts, where
  // semantic decomposition can actually add information.
  const unresolved = localProgram.morphology.length === 1
    && localProgram.morphology[0] === "plain"
    && localProgram.coverage.length === 1
    && localProgram.coverage[0] === "sparse";
  const shouldUseOllama = (forceLocalModel || (kind === "adaptive" && allowOllama && unresolved))
    && (forceLocalModel || !shouldComposeWildernessFacility(prompt))
    && (localProgram.primaryKind === "wilderness" || localProgram.primaryKind === "building")
    && (forceLocalModel || kind === "adaptive");
  const ollamaResult = shouldUseOllama
    ? await planSceneProgramWithOllamaDetailed(prompt, { requestedKind: kind })
    : undefined;
  const program = ollamaResult?.program ?? localProgram;
  const planned = { program, ...(ollamaResult ? { ollamaStatus: ollamaResult.status, model: ollamaResult.model } : {}) };
  sceneProgramCache.set(key, planned);
  if (sceneProgramCache.size > 32) sceneProgramCache.delete(sceneProgramCache.keys().next().value ?? key);
  return planned;
}

async function planComposition(request: GenerationRequest, kind: SceneKind): Promise<SceneCompositionProgram> {
  const [{ compileSceneComposition }, { retrieveCapabilitiesWithBge }, { shouldComposeWildernessFacility }] = await Promise.all([
    import("../composition"),
    import("../semantic/bge"),
    import("../semantic/siteIntent"),
  ]);
  const key = `${kind}|${request.prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US")}|${request.seed}|${request.density}`;
  const cached = compositionCache.get(key); if (cached) return cached;
  const local = compileSceneComposition(request);
  // Generic prompts need retrieval for domain resolution. Settlements also
  // benefit from capability retrieval, but their parent ownership is already
  // fixed by compileSceneComposition: BGE may enrich child atoms without
  // replacing the settlement grammar.
  const wildernessFacility = shouldComposeWildernessFacility(request.prompt);
  const fixedBuildingKind = ["building", "tower", "tavern", "dungeon", "sewer", "cave"].includes(kind);
  const retrieval = !fixedBuildingKind && (local.primaryDomain === "generic"
    || local.primaryDomain === "settlement"
    || wildernessFacility)
    ? await retrieveCapabilitiesWithBge(request.prompt, { limit: wildernessFacility ? 10 : 6 })
    : undefined;
  const program = retrieval && retrieval.capabilityIds.length > 0 ? compileSceneComposition(request, retrieval.source === "bge" ? "bge" : "local", retrieval.capabilityIds) : local;
  compositionCache.set(key, program); if (compositionCache.size > 32) compositionCache.delete(compositionCache.keys().next().value ?? key);
  return program;
}

scope.addEventListener("message", async (event: MessageEvent<GenerationWorkerRequest>) => {
  const { id, request, kind } = event.data;
  try {
    const startedAt = performance.now();
    const planningStartedAt = startedAt;
    const composition = await planComposition(request, kind);
    // A successful BGE/lexical capability retrieval is sufficient for the
    // deterministic compiler. Qwen is the final ambiguity fallback, not a
    // mandatory step in every unknown prompt.
    const planning = await planProgram(request.prompt, kind, composition.capabilityIds.length === 0, request.forceLocalModel === true);
    const planningMs = Math.max(0, performance.now() - planningStartedAt);
    const geometryStartedAt = performance.now();
    const { generateScene } = await import("../generators");
    const scene = generateScene(request, kind, undefined, planning.program, composition);
    const geometryMs = Math.max(0, performance.now() - geometryStartedAt);
    if (planning.ollamaStatus) {
      scene.semantic = planning.ollamaStatus === "success"
        ? { source: "ollama", model: planning.model, status: "ollama-success" }
        : { source: "local", model: planning.model, status: `ollama-${planning.ollamaStatus}`, fallback: "rule" };
    }
    scene.timing = normalizeGenerationTiming({
      planningMs,
      geometryMs,
      totalMs: Math.max(0, performance.now() - startedAt),
    });
    scene.generationMs = scene.timing.totalMs;
    scope.postMessage({ id, scene } satisfies GenerationWorkerResponse);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown generation worker error",
    } satisfies GenerationWorkerResponse);
  }
});

export {};
