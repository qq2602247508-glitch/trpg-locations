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
    expect(first.morphology).toEqual(["interior-partitions", "vertical-stack"]);
    expect(first.constraints.gridFeet).toBe(5);
    expect(first.regions.length).toBeGreaterThanOrEqual(2);
  });

  it("describes compound parent terrain in the local SceneProgram", () => {
    const mangrove = planSceneProgramLocally("红树林走私港村，有潮汐水道和树根栈道", "adaptive");
    expect(mangrove.domain).toBe("settlement");
    expect(mangrove.morphology).toEqual(expect.arrayContaining(["channel-cut", "wetland-pools"]));
    expect(mangrove.coverage).toEqual(expect.arrayContaining(["woodland", "dense"]));

    const salt = planSceneProgramLocally("三层盐晶浮空修道院群", "adaptive");
    expect(salt.morphology).toEqual(expect.arrayContaining(["floating-islands", "vertical-stack"]));
    expect(salt.coverage).toContain("ice");
  });

  it("gives a water-city prompt its own semantic regions instead of generic settlement blocks", () => {
    const program = planSceneProgramLocally("河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷", "adaptive");
    expect(program.domain).toBe("settlement");
    expect(program.primaryKind).toBe("settlement");
    expect(program.era).toBe("medieval");
    expect(program.topology).toBe("network");
    expect(program.regions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "main-canal",
      "branch-quays",
      "crossings",
      "water-market",
      "frontage-wards",
      "service-backstreets",
    ]));
    expect(program.regions.find((item) => item.id === "main-canal")?.elevation).toBe("low");
    expect(program.regions.find((item) => item.id === "crossings")?.elevation).toBe("raised");
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

  it("realizes mixed fungal magma terrain instead of dropping the secondary theme", () => {
    const scene = generateScene({ prompt: "幽暗地域蘑菇岩浆地，有超大蘑菇和熔岩喷口", seed: "fungal-magma", size: "large", density: 0.78 }, "adaptive");
    expect(scene.archetype).toBe("underdark");
    expect(hasTag(scene, "giant-fungus")).toBe(true);
    expect(hasTag(scene, "lava-vent")).toBe(true);
    expect(hasTag(scene, "lava")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("keeps the richer local observatory program and realizes named fixtures", () => {
    const scene = generateScene({ prompt: "星辰观测所，有黄铜天仪、镜面水池、旋转高台和地下档案室", seed: "observatory-features", size: "medium", density: 0.68 }, "adaptive");
    expect(scene.sceneProgram?.source).toBe("local");
    expect(scene.sceneProgram?.regionCount).toBe(6);
    expect(hasTag(scene, "mirror-pool")).toBe(true);
    expect(hasTag(scene, "telescope")).toBe(true);
    expect(hasTag(scene, "archive")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("classifies a planetarium as a building instead of a mountain", () => {
    const scene = generateScene({ prompt: "天文馆，穹顶影院、天文展厅和地下设备层", seed: "planetarium", size: "medium", density: 0.7 }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("building");
    expect(scene.archetype).toBe("planetarium");
    expect(hasTag(scene, "dome")).toBe(true);
    expect(hasTag(scene, "radial-gallery")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("composes floating islands on top of an impact crater", () => {
    const scene = generateScene({ prompt: "陨石坑、森林、浮空岛", seed: "crater-forest-islands", size: "large", density: 0.8 }, "adaptive");
    expect(scene.archetype).toBe("impact-crater");
    expect(hasTag(scene, "impact-rim")).toBe(true);
    expect(hasTag(scene, "woodland-cover")).toBe(true);
    expect(hasTag(scene, "floating-island")).toBe(true);
    expect(scene.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(2);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("builds a multi-level D&D dungeon graph with secrets and vertical routes", () => {
    const scene = generateScene({ prompt: "D&D 多层神殿地牢，有陷阱、隐藏房间、宝库和首领厅", seed: "temple-dungeon", size: "large", density: 0.86 }, "adaptive");
    expect(scene.archetype).toBe("dungeon:temple");
    expect(scene.floors).toBeGreaterThanOrEqual(3);
    expect(scene.rooms.length).toBeGreaterThanOrEqual(15);
    expect(scene.tactical.some((feature) => feature.kind === "secret")).toBe(true);
    expect(scene.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(2);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("keeps an explicit arcane dungeon out of the generic laboratory compiler", () => {
    const scene = generateScene({ prompt: "奥术法师地牢，径向传送环、实验室和隐藏密室", seed: "arcane-dungeon", size: "large", density: 0.82 }, "adaptive");
    expect(scene.archetype).toBe("dungeon:arcane");
    expect(hasTag(scene, "arcane-node")).toBe(true);
    expect(scene.rooms.length).toBeGreaterThanOrEqual(15);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("realizes three actual floating island levels with vertical routes", () => {
    const scene = generateScene({ prompt: "阿弗纳斯地狱荒原，三层浮空岛屿、铁制战争道路和熔岩裂缝", seed: "three-islands", size: "large", density: 0.8 }, "adaptive");
    expect(scene.archetype).toBe("floating-islands");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("floating-island")).length).toBeGreaterThan(100);
    expect(scene.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(2);
    expect(new Set(scene.rooms.map((room) => room.center.y)).size).toBe(3);
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
    expect(scene.archetype).toBe("hospital");
    expect(scene.sceneProgram?.era).toBe(era);
    expect(scene.sceneProgram?.ruleset).toBe(ruleset);
    expect(hasTag(scene, "hospital")).toBe(true);
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
