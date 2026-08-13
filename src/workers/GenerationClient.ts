import type { GeneratedScene, GenerationRequest, SceneKind } from "../schema";
import { normalizeGenerationTiming } from "../timing";

interface WorkerResponse {
  id: number;
  scene?: GeneratedScene;
  error?: string;
}

interface PendingGeneration {
  resolve: (scene: GeneratedScene) => void;
  reject: (error: Error) => void;
  request: GenerationRequest;
  kind: SceneKind;
  timeoutId: ReturnType<typeof setTimeout>;
  startedAt: number;
}

const WORKER_TIMEOUT_MS = 10_000;
const FORCED_LOCAL_MODEL_TIMEOUT_MS = 75_000;

/** Runs deterministic planning off the render thread, with a lazy local fallback. */
export class GenerationClient {
  private worker?: Worker;

  private nextId = 1;

  private readonly pending = new Map<number, PendingGeneration>();

  constructor() {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./generation.worker.ts", import.meta.url), {
        type: "module",
        name: "trpg-scene-planner",
      });
      this.worker.addEventListener("message", this.handleMessage);
      this.worker.addEventListener("error", this.handleWorkerFailure);
    } catch {
      this.worker = undefined;
    }
  }

  async generate(request: GenerationRequest, kind: SceneKind): Promise<GeneratedScene> {
    if (!this.worker) {
      const startedAt = performance.now();
      return this.generateInThread(request, kind, true).then((scene) => this.withClientTiming(scene, startedAt));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<GeneratedScene>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        void this.fallbackPending(id);
      }, request.forceLocalModel ? FORCED_LOCAL_MODEL_TIMEOUT_MS : WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, request, kind, timeoutId, startedAt: performance.now() });
      this.worker?.postMessage({ id, request, kind });
    });
  }

  dispose(): void {
    this.worker?.removeEventListener("message", this.handleMessage);
    this.worker?.removeEventListener("error", this.handleWorkerFailure);
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Scene planner was disposed."));
    }
    this.pending.clear();
  }

  private readonly handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const pending = this.pending.get(event.data.id);
    if (!pending) return;
    this.pending.delete(event.data.id);
    clearTimeout(pending.timeoutId);
    if (event.data.scene) pending.resolve(this.withClientTiming(event.data.scene, pending.startedAt));
    else pending.reject(new Error(event.data.error ?? "Scene planner returned no scene."));
  };

  private readonly handleWorkerFailure = (): void => {
    this.worker?.terminate();
    this.worker = undefined;
    for (const id of [...this.pending.keys()]) void this.fallbackPending(id);
  };

  private async fallbackPending(id: number): Promise<void> {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timeoutId);
    try {
      // A timed-out ordinary worker may already have an automatic Ollama
      // request in flight. Fall back deterministically instead of replaying
      // the same model side effect. Explicit forced mode retains its model
      // contract and may retry on the in-thread path.
      const scene = await this.generateInThread(
        pending.request,
        pending.kind,
        pending.request.forceLocalModel === true,
      );
      pending.resolve(this.withClientTiming(scene, pending.startedAt));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Local scene planning fallback failed."));
    }
  }

  private async generateInThread(
    request: GenerationRequest,
    kind: SceneKind,
    allowAutomaticOllama: boolean,
  ): Promise<GeneratedScene> {
    const { generateScene } = await import("../generators");
    const { compileSceneComposition } = await import("../composition");
    const { retrieveCapabilitiesWithBge } = await import("../semantic/bge");
    const { shouldComposeWildernessFacility } = await import("../semantic/siteIntent");
    const planningStartedAt = performance.now();
    const compositionLocal = compileSceneComposition(request);
    const wildernessFacility = shouldComposeWildernessFacility(request.prompt);
    const fixedBuildingKind = ["building", "tower", "tavern", "dungeon", "sewer", "cave"].includes(kind);
    const retrieval = !fixedBuildingKind && (compositionLocal.primaryDomain === "generic"
      || compositionLocal.primaryDomain === "settlement" || wildernessFacility)
      ? await retrieveCapabilitiesWithBge(request.prompt, { limit: wildernessFacility ? 10 : 6 })
      : undefined;
    const composition = retrieval && retrieval.capabilityIds.length > 0
      ? compileSceneComposition(request, retrieval.source === "bge" ? "bge" : "local", retrieval.capabilityIds)
      : compositionLocal;
    const { planSceneProgramLocally, planSceneProgramWithOllamaDetailed } = await import("../scene-program");
    const localProgram = planSceneProgramLocally(request.prompt, kind);
    const unresolved = localProgram.morphology.length === 1
      && localProgram.morphology[0] === "plain"
      && localProgram.coverage.length === 1
      && localProgram.coverage[0] === "sparse";
    const shouldUseOllama = (request.forceLocalModel === true
      || (allowAutomaticOllama && kind === "adaptive" && composition.capabilityIds.length === 0 && unresolved))
      && (request.forceLocalModel === true || !shouldComposeWildernessFacility(request.prompt))
      && (localProgram.primaryKind === "wilderness" || localProgram.primaryKind === "building")
      && (request.forceLocalModel === true || kind === "adaptive");
    const result = shouldUseOllama
      ? await planSceneProgramWithOllamaDetailed(request.prompt, { requestedKind: kind })
      : undefined;
    const program = result?.program ?? localProgram;
    const planningMs = Math.max(0, performance.now() - planningStartedAt);
    const geometryStartedAt = performance.now();
    const scene = generateScene(request, kind, undefined, program, composition);
    const geometryMs = Math.max(0, performance.now() - geometryStartedAt);
    if (result) {
      scene.semantic = result.status === "success"
        ? { source: "ollama", model: result.model, status: "ollama-success" }
        : { source: "local", model: result.model, status: `ollama-${result.status}`, fallback: "rule" };
    }
    scene.timing = normalizeGenerationTiming({ planningMs, geometryMs, totalMs: planningMs + geometryMs });
    scene.generationMs = scene.timing.totalMs;
    return scene;
  }

  private withClientTiming(scene: GeneratedScene, startedAt: number): GeneratedScene {
    const totalMs = Math.max(0, performance.now() - startedAt);
    const timing = normalizeGenerationTiming(scene.timing, totalMs);
    // The client owns request-to-resolve total time, so recompute transport
    // overhead from the calibrated total instead of trusting worker-local
    // transport metadata.
    scene.timing = normalizeGenerationTiming({
      planningMs: timing.planningMs,
      geometryMs: timing.geometryMs,
      totalMs,
    }, totalMs);
    scene.generationMs = scene.timing.totalMs;
    return scene;
  }
}
