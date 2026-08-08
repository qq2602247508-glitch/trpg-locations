import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationClient } from "../src/workers/GenerationClient";

describe("GenerationClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("falls back to lazy in-thread generation when Worker is unavailable", async () => {
    const client = new GenerationClient();
    const scene = await client.generate({
      prompt: "一座带侧门和楼梯的小型神殿",
      seed: "generation-client-fallback",
      size: "small",
      density: 0.5,
    }, "building");
    expect(scene.archetype).toBe("temple");
    expect(scene.diagnostics.valid).toBe(true);
    client.dispose();
  });

  it("falls back locally when a planning worker stops responding", async () => {
    vi.useFakeTimers();
    class SilentWorker {
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal("Worker", SilentWorker);
    const client = new GenerationClient();
    const pending = client.generate({
      prompt: "森林中的猎人小木屋，有阁楼与地窖",
      seed: "generation-client-timeout",
      size: "small",
      density: 0.45,
    }, "wilderness");
    await vi.advanceTimersByTimeAsync(10_000);
    const scene = await pending;
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.seed).toBe("generation-client-timeout");
    expect(scene.primitives.length).toBeGreaterThan(0);
    client.dispose();
  });
});
