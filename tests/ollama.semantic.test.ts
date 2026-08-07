import { describe, expect, it, vi } from "vitest";
import { generateScene } from "../src/generators";
import { classifyWithOllama, parseOllamaSemanticHints } from "../src/semantic/ollama";

const validHints = {
  suggestedKind: "tower",
  environment: "interior",
  topology: "vertical",
  verticality: "high",
  water: "minor",
  lighting: "dim",
  cover: "moderate",
  theme: "mystic",
  anchors: ["黄铜天仪"],
  hazards: ["失控魔法"],
};

describe("Ollama semantic boundary", () => {
  it("rejects incomplete or out-of-schema model output", () => {
    expect(parseOllamaSemanticHints({ ...validHints, topology: "impossible-maze" })).toBeUndefined();
    expect(parseOllamaSemanticHints({ suggestedKind: "tower" })).toBeUndefined();
  });

  it("uses a valid constrained response only for an ambiguous prompt", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify(validHints) },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const classification = await classifyWithOllama("星辰观测所，有黄铜天仪和镜面水池", { fetcher, timeoutMs: 100 });
    expect(classification?.source).toBe("ollama");
    expect(classification?.kind).toBe("tower");
    expect(classification?.traits.tags).toContain("anchor:黄铜天仪");
    expect(fetcher).toHaveBeenCalledOnce();
    const scene = generateScene({ prompt: "星辰观测所", seed: "ollama-boundary", size: "medium", density: 0.6 }, "adaptive", classification);
    expect(scene.semantic?.source).toBe("ollama");
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("does not call the model when local category evidence is sufficient", async () => {
    const fetcher = vi.fn();
    expect(await classifyWithOllama("一座有角塔和城墙的堡垒", { fetcher })).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back when the service returns valid JSON with the wrong contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({ location_name: "观测所", arbitrary_dimensions: [99, 99] }) },
    }), { status: 200 }));
    expect(await classifyWithOllama("星辰观测所", { fetcher, timeoutMs: 100 })).toBeUndefined();
  });
});
