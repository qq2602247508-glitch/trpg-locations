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

scope.addEventListener("message", async (event: MessageEvent<GenerationWorkerRequest>) => {
  const { id, request, kind } = event.data;
  try {
    // Fixed wilderness mode still needs semantic help for novel biomes such as
    // 河川、蘑菇地 or user-coined fantasy regions. Known local prompts bypass
    // Ollama inside classifyWithOllama, so only ambiguous prompts pay latency.
    const classification = kind === "adaptive" || kind === "wilderness" ? await classifyWithOllama(request.prompt) : undefined;
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
