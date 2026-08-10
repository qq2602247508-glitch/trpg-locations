import { describe, expect, it, vi } from "vitest";
import { SPATIAL_ATOMS } from "../src/composition";
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

  it("decomposes an unfamiliar compound prompt into several existing atoms", () => {
    const result = retrieveCapabilitiesLexically("坍塌的浮空岩窟修道院，有断桥、淹水下层、树根侵入和屋顶逃生路线", 10);
    expect(result.capabilityIds).toEqual(expect.arrayContaining([
      "terrain.floating-island",
      "terrain.cave-chamber",
      "state.collapse",
      "state.flood",
      "state.overgrowth",
      "structure.roof-system",
    ]));
    const registered = new Set(SPATIAL_ATOMS.map((atom) => atom.id));
    expect(result.capabilityIds.every((id) => registered.has(id))).toBe(true);
  });

  it("retrieves Chinese functional-space aliases without a model", () => {
    const result = retrieveCapabilitiesLexically("高山峡谷中的翼港整备所，有宽阔翼舱、挥发储压舱、驻员休息舱和高空导风台", 10);
    expect(result.capabilityIds).toEqual(expect.arrayContaining([
      "structure.hangar-space",
      "structure.fuel-space",
      "structure.quarters-space",
      "structure.observation-platform",
    ]));
    const relief = retrieveCapabilitiesLexically("冻土峡湾里的巡礼救护站，有伤员病房、祈祷小堂、地下粮药库和屋顶信号台", 10);
    expect(relief.capabilityIds).toEqual(expect.arrayContaining([
      "structure.medical-space",
      "structure.chapel-space",
      "structure.storage-space",
      "structure.observation-platform",
    ]));
    const quarantine = retrieveCapabilitiesLexically("盐碱荒原中的瘟疫隔离礼拜所，有伤员病房、祈祷小堂、地下焚化燃料库和屋顶钟火信号台", 10);
    expect(quarantine.capabilityIds).toEqual(expect.arrayContaining([
      "structure.medical-space",
      "structure.chapel-space",
      "structure.fuel-space",
      "structure.observation-platform",
    ]));
  });

  it("never returns an invented capability when BGE ranks the bounded catalog", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const input = (JSON.parse(String(init?.body)) as { input: string[] }).input;
      return new Response(JSON.stringify({ embeddings: input.map((_item, index) => index === 0 ? [1, 0, 0] : [Math.max(0.3, 1 - index * 0.01), index * 0.001, 0]) }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await retrieveCapabilitiesWithBge("悬空石盘之间的垂直聚落", { fetcher, model: "bounded-catalog-mock", limit: 6 });
    const registered = new Set(SPATIAL_ATOMS.map((atom) => atom.id));
    expect(result.capabilityIds.length).toBeGreaterThan(0);
    expect(result.capabilityIds.every((id) => registered.has(id))).toBe(true);
  });

  it("keeps retrieval cache entries separate across requested limits", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const input = (JSON.parse(String(init?.body)) as { input: string[] }).input;
      return new Response(JSON.stringify({
        embeddings: input.map(() => [1, 0, 0]),
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const narrow = await retrieveCapabilitiesWithBge("完全陌生的复合设施", {
      fetcher,
      model: "limit-cache-mock",
      limit: 2,
    });
    const broad = await retrieveCapabilitiesWithBge("完全陌生的复合设施", {
      fetcher,
      model: "limit-cache-mock",
      limit: 8,
    });
    expect(narrow.capabilityIds).toHaveLength(2);
    expect(broad.capabilityIds).toHaveLength(8);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
