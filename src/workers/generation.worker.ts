import { generateScene } from "../generators";
import { planSceneProgramLocally, planSceneProgramWithOllama, type SceneProgram } from "../scene-program";
import type { GenerationRequest, SceneKind } from "../schema";

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

async function planProgram(prompt: string, kind: SceneKind): Promise<SceneProgram> {
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
  const shouldUseOllama = unresolved
    && (localProgram.primaryKind === "wilderness" || localProgram.primaryKind === "building")
    && (kind === "adaptive" || kind === "wilderness" || kind === "building" || kind === "settlement");
  const program = shouldUseOllama
    ? await planSceneProgramWithOllama(prompt, { requestedKind: kind }) ?? localProgram
    : localProgram;
  sceneProgramCache.set(key, program);
  if (sceneProgramCache.size > 32) sceneProgramCache.delete(sceneProgramCache.keys().next().value ?? key);
  return program;
}

scope.addEventListener("message", async (event: MessageEvent<GenerationWorkerRequest>) => {
  const { id, request, kind } = event.data;
  try {
    const program = await planProgram(request.prompt, kind);
    const scene = generateScene(request, kind, undefined, program);
    scope.postMessage({ id, scene } satisfies GenerationWorkerResponse);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown generation worker error",
    } satisfies GenerationWorkerResponse);
  }
});

export {};
