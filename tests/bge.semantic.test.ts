import { describe, expect, it, vi } from "vitest";
import { retrieveCapabilitiesLexically, retrieveCapabilitiesWithBge } from "../src/semantic/bge";

describe("local capability retrieval", () => {
  it("retrieves bounded forest atoms without a model", () => {
    const result = retrieveCapabilitiesLexically("茂密森林、林下灌木、倒木和树冠平台");
    expect(result.source).toBe("lexical");
    expect(result.capabilityIds).toContain("ecology.undergrowth");
    expect(result.capabilityIds).toContain("ecology.fallen-log");
    expect(result.capabilityIds.length).toBeLessThanOrEqual(6);
  });

  it("uses BGE embeddings only to rank known capability cards", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const input = (JSON.parse(String(init?.body)) as { input: string[] }).input;
      return new Response(JSON.stringify({ embeddings: input.map((_item, index) => index === 0 ? [1, 0] : index === 1 ? [0.9, 0.1] : [0, 1]) }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await retrieveCapabilitiesWithBge("陌生空间", { fetcher, model: "mock-bge", limit: 3 });
    expect(result.source).toBe("bge");
    expect(result.capabilityIds[0]).toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back locally when Ollama embeddings are unavailable", async () => {
    const result = await retrieveCapabilitiesWithBge("河流、瀑布和支流", { model: "offline-bge", fetcher: vi.fn(async () => { throw new Error("offline"); }) as typeof fetch });
    expect(result.source).toBe("lexical");
    expect(result.capabilityIds).toContain("water.tributary");
  });
});
