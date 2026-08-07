import { describe, expect, it, vi } from "vitest";
import { generateScene } from "../src/generators";
import {
  SCENE_PROGRAM_RESPONSE_SCHEMA,
  parseSceneProgram,
  planSceneProgramLocally,
  planSceneProgramWithOllama,
} from "../src/scene-program";

function hasTag(scene: ReturnType<typeof generateScene>, tag: string): boolean {
  return scene.primitives.some((primitive) => primitive.tags?.includes(tag));
}

describe("SceneProgram v1", () => {
  it("rejects relations that reference undeclared regions", () => {
    const valid = planSceneProgramLocally("陨石坑", "adaptive");
    expect(parseSceneProgram(valid)).toBeDefined();
    expect(parseSceneProgram({
      ...valid,
      relations: [{ from: valid.regions[0]?.id, to: "missing-region", type: "connects" }],
    })).toBeUndefined();
  });

  it("requests strict schema output from Ollama and reparses the response", async () => {
    const planned = planSceneProgramLocally("1920年代 CoC 医院", "adaptive");
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { format?: unknown; think?: boolean; stream?: boolean };
      expect(request.format).toEqual(SCENE_PROGRAM_RESPONSE_SCHEMA);
      expect(request.think).toBe(false);
      expect(request.stream).toBe(false);
      return new Response(JSON.stringify({ message: { content: JSON.stringify(planned) } }), { status: 200 });
    });
    const result = await planSceneProgramWithOllama("1920年代 CoC 医院", { fetcher, timeoutMs: 100, model: "test-model" });
    expect(result?.source).toBe("ollama");
    expect(result?.model).toBe("test-model");
    expect(result?.ruleset).toBe("coc");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes only bounded Ollama enum synonyms before strict parsing", async () => {
    const planned = planSceneProgramLocally("星辰观测所", "adaptive");
    const nearValid = {
      ...planned,
      domain: "building",
      primaryKind: "observatory",
      morphology: ["structure", "courtyard"],
      regions: planned.regions.map((region, index) => index === 1 ? { ...region, function: "restricted" } : region),
      relations: planned.relations.map((relation, index) => index === 0 ? { ...relation, type: "descends" } : relation),
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify(nearValid) } }), { status: 200 }));
    const result = await planSceneProgramWithOllama("星辰观测所", { fetcher, timeoutMs: 100 });
    expect(result?.primaryKind).toBe("building");
    expect(result?.morphology).toEqual(["interior-partitions"]);
    expect(result?.regions[1]?.function).toBe("private");
    expect(result?.relations[0]?.type).toBe("below");
  });

  it("produces stable, interpretable local plans without hash-selected landforms", () => {
    const first = planSceneProgramLocally("星辰观测所与镜面水池", "adaptive");
    const second = planSceneProgramLocally("星辰观测所与镜面水池", "adaptive");
    expect(first).toEqual(second);
    expect(first.morphology).toEqual(["plain"]);
    expect(first.constraints.gridFeet).toBe(5);
    expect(first.regions.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["陨石坑", "impact-crater", "impact-crater"],
    ["D&D 龙骨埋葬地", "burial-ground", "dragon-spine"],
    ["阿弗纳斯地狱战车荒原", "infernal-waste", "infernal"],
  ] as const)("realizes natural semantics for %s", (prompt, archetype, tag) => {
    const scene = generateScene({ prompt, seed: `program-${archetype}`, size: "medium", density: 0.72 }, "adaptive");
    expect(scene.archetype).toBe(archetype);
    expect(hasTag(scene, tag)).toBe(true);
    expect(scene.sceneProgram?.version).toBe(1);
    expect(scene.diagnostics.warnings).toEqual([]);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("compiles Deepwater into a settlement network", () => {
    const scene = generateScene({ prompt: "深水城港区的市场、仓库和巡逻路", seed: "program-deepwater", size: "large", density: 0.82 }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.archetype).toBe("harbor");
    expect(hasTag(scene, "settlement-building")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it.each([
    ["1920年代 CoC 医院，病房、手术室、档案室和地下停尸间", "1920s", "coc"],
    ["现代城市医院，急诊、病房、手术室与后勤通道", "modern", "generic"],
  ] as const)("uses a functional institutional grammar for %s", (prompt, era, ruleset) => {
    const scene = generateScene({ prompt, seed: `program-hospital-${era}`, size: "medium", density: 0.68 }, "adaptive");
    expect(scene.archetype).toBe(`program-building:${era}`);
    expect(scene.sceneProgram?.era).toBe(era);
    expect(scene.sceneProgram?.ruleset).toBe(ruleset);
    expect(hasTag(scene, "program-building")).toBe(true);
    expect(scene.rooms.some((room) => room.name.includes("ward"))).toBe(true);
    expect(scene.floors).toBeGreaterThanOrEqual(3);
    expect(scene.rooms.find((room) => room.name.includes("morgue"))?.level).toBe(0);
    expect(scene.rooms.find((room) => room.name.includes("ward"))?.level).toBeGreaterThan(0);
    expect(scene.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(2);
    if (ruleset === "coc") expect(hasTag(scene, "evidence")).toBe(true);
    expect(scene.diagnostics.warnings).toEqual([]);
    expect(scene.diagnostics.valid).toBe(true);
  });
});
