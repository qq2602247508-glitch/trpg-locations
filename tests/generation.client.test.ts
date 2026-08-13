import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationClient } from "../src/workers/GenerationClient";
import { formatGenerationTiming } from "../src/timing";

describe("GenerationClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("formats timing with explicit total, planning, and geometry labels", () => {
    expect(formatGenerationTiming({ planningMs: 12.4, geometryMs: 0.6, totalMs: 15.2 }, 0))
      .toBe("总计 15 ms · 规划 12 ms · 几何 1 ms");
    expect(formatGenerationTiming(undefined, 9.5)).toContain("总计 10 ms");
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
    expect(scene.generationMs).toBeGreaterThanOrEqual(scene.timing?.planningMs ?? 0);
    expect(scene.timing?.geometryMs).toBeGreaterThanOrEqual(0);
    expect(scene.timing?.totalMs).toBeGreaterThanOrEqual((scene.timing?.planningMs ?? 0) + (scene.timing?.geometryMs ?? 0));
    client.dispose();
  });

  it("falls back locally when a planning worker stops responding", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => {
      throw new Error("ordinary timeout fallback must not replay Ollama");
    });
    vi.stubGlobal("fetch", fetcher);
    class SilentWorker {
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal("Worker", SilentWorker);
    const client = new GenerationClient();
    const pending = client.generate({
      prompt: "带熔炉、作业跨、上层猫道和仓储间的工坊",
      seed: "generation-client-timeout",
      size: "small",
      density: 0.45,
    }, "building");
    await vi.advanceTimersByTimeAsync(10_000);
    const scene = await pending;
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.seed).toBe("generation-client-timeout");
    expect(scene.primitives.length).toBeGreaterThan(0);
    expect(scene.timing?.totalMs).toBeGreaterThanOrEqual((scene.timing?.planningMs ?? 0) + (scene.timing?.geometryMs ?? 0));
    expect(fetcher).not.toHaveBeenCalled();
    client.dispose();
  });

  it("keeps forced local-model semantics on the in-thread fallback path", async () => {
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ version: "v1", regions: [] }) },
    }), { status: 200 })));
    const client = new GenerationClient();
    const scene = await client.generate({
      prompt: "一个陌生的地下研究设施，有实验室、逃生路线和秘密档案室",
      seed: "generation-client-forced-model",
      size: "medium",
      density: 0.6,
      forceLocalModel: true,
    }, "adaptive");
    expect(scene.semantic?.status).toMatch(/^ollama-/);
    expect(scene.semantic?.fallback).toBe("rule");
    expect(scene.sceneProgram?.version).toBe(1);
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.timing?.planningMs).toBeGreaterThanOrEqual(0);
    expect(scene.timing?.geometryMs).toBeGreaterThanOrEqual(0);
    expect(scene.timing?.totalMs).toBeGreaterThanOrEqual((scene.timing?.planningMs ?? 0) + (scene.timing?.geometryMs ?? 0));
    client.dispose();
  });
});
