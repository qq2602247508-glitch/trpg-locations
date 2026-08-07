import { generateScene } from "../generators";
import { classifyWithOllama } from "../semantic/ollama";
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
const wildernessSemanticCache = new Map<string, NonNullable<Awaited<ReturnType<typeof classifyWithOllama>>>>();

async function classifyWilderness(prompt: string): Promise<Awaited<ReturnType<typeof classifyWithOllama>>> {
  const key = prompt.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const cached = wildernessSemanticCache.get(key);
  if (cached) return cached;
  const classification = await classifyWithOllama(prompt, { force: true });
  if (classification) {
    wildernessSemanticCache.set(key, classification);
    if (wildernessSemanticCache.size > 32) wildernessSemanticCache.delete(wildernessSemanticCache.keys().next().value ?? key);
  }
  return classification;
}

scope.addEventListener("message", async (event: MessageEvent<GenerationWorkerRequest>) => {
  const { id, request, kind } = event.data;
  try {
    // Fixed wilderness mode re-evaluates broad and mixed prompts so biome
    // coverage can compose with topology. Successful results are cached in the
    // worker; repeat generations remain deterministic without another model call.
    const classification = kind === "wilderness"
      ? await classifyWilderness(request.prompt)
      : kind === "adaptive"
        ? await classifyWithOllama(request.prompt)
        : undefined;
    const scene = generateScene(request, kind, classification);
    scope.postMessage({ id, scene } satisfies GenerationWorkerResponse);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown generation worker error",
    } satisfies GenerationWorkerResponse);
  }
});

export {};
