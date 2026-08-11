import type { GeneratedScene, GenerationRequest, SceneKind } from "../schema";

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
      const { generateScene } = await import("../generators");
      return generateScene(request, kind);
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<GeneratedScene>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        void this.fallbackPending(id);
      }, request.forceLocalModel ? FORCED_LOCAL_MODEL_TIMEOUT_MS : WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, request, kind, timeoutId });
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
    if (event.data.scene) pending.resolve(event.data.scene);
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
      const { generateScene } = await import("../generators");
      pending.resolve(await generateScene(pending.request, pending.kind));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Local scene planning fallback failed."));
    }
  }
}
