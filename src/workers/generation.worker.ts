import { generateScene } from "../generators";
import { planSceneProgramLocally, planSceneProgramWithOllama, type SceneProgram } from "../scene-program";
import type { GenerationRequest, SceneKind } from "../schema";
import { compileSceneComposition, type SceneCompositionProgram } from "../composition";
import { retrieveCapabilitiesWithBge } from "../semantic/bge";
import { shouldComposeWildernessFacility } from "../semantic/siteIntent";

interface GenerationWorkerRequest {
  id: number;
  request: GenerationRequest;
  kind: SceneKind;
}

interface GenerationWorkerResponse {
  id: number;
  scene?: ReturnType<typeof generateScene>;
  error?: string;
}

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<GenerationWorkerRequest>) => void): void;
  postMessage(message: GenerationWorkerResponse): void;
}

// Keep the main tsconfig on DOM types; Vite evaluates this module in a worker.
const scope = globalThis as unknown as WorkerScope;
const sceneProgramCache = new Map<string, SceneProgram>();
const compositionCache = new Map<string, SceneCompositionProgram>();

async function planProgram(prompt: string, kind: SceneKind, allowOllama: boolean): Promise<SceneProgram> {
  const key = `${kind}|${prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
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
  const shouldUseOllama = allowOllama && unresolved
    && !shouldComposeWildernessFacility(prompt)
    && (localProgram.primaryKind === "wilderness" || localProgram.primaryKind === "building")
    && (kind === "adaptive" || kind === "wilderness" || kind === "building" || kind === "settlement");
  const program = shouldUseOllama
    ? await planSceneProgramWithOllama(prompt, { requestedKind: kind }) ?? localProgram
    : localProgram;
  sceneProgramCache.set(key, program);
  if (sceneProgramCache.size > 32) sceneProgramCache.delete(sceneProgramCache.keys().next().value ?? key);
  return program;
}

async function planComposition(request: GenerationRequest): Promise<SceneCompositionProgram> {
  const key = `${request.prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US")}|${request.seed}|${request.density}`;
  const cached = compositionCache.get(key); if (cached) return cached;
  const local = compileSceneComposition(request);
  // Generic prompts need retrieval for domain resolution. Settlements also
  // benefit from capability retrieval, but their parent ownership is already
  // fixed by compileSceneComposition: BGE may enrich child atoms without
  // replacing the settlement grammar.
  const wildernessFacility = shouldComposeWildernessFacility(request.prompt);
  const retrieval = local.primaryDomain === "generic"
    || local.primaryDomain === "settlement"
    || wildernessFacility
    ? await retrieveCapabilitiesWithBge(request.prompt, { limit: wildernessFacility ? 10 : 6 })
    : undefined;
  const program = retrieval && retrieval.capabilityIds.length > 0 ? compileSceneComposition(request, retrieval.source === "bge" ? "bge" : "local", retrieval.capabilityIds) : local;
  compositionCache.set(key, program); if (compositionCache.size > 32) compositionCache.delete(compositionCache.keys().next().value ?? key);
  return program;
}

scope.addEventListener("message", async (event: MessageEvent<GenerationWorkerRequest>) => {
  const { id, request, kind } = event.data;
  try {
    const composition = await planComposition(request);
    // A successful BGE/lexical capability retrieval is sufficient for the
    // deterministic compiler. Qwen is the final ambiguity fallback, not a
    // mandatory step in every unknown prompt.
    const program = await planProgram(request.prompt, kind, composition.capabilityIds.length === 0);
    const scene = generateScene(request, kind, undefined, program, composition);
    scope.postMessage({ id, scene } satisfies GenerationWorkerResponse);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown generation worker error",
    } satisfies GenerationWorkerResponse);
  }
});

export {};
