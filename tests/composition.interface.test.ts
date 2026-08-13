import { describe, expect, it } from "vitest";
import { compileSceneComposition } from "../src/composition";
import { generateScene } from "../src/generators";
import { planSceneProgramLocally } from "../src/scene-program";

const CASES = [
  {
    id: "glacier-pilgrim-radio",
    prompt: "黑冰川裂缝旁的巡礼无线电救护站，有伤员舱、祷告室、地下燃料库、测风塔和跨冰隙担架桥。",
    archetype: "ice",
  },
  {
    id: "peat-telegraph-clinic",
    prompt: "酸雾泥炭湿地里的旧电报诊疗站，有治疗室、发报室、半淹药品库、架高木栈道和观察塔。",
    archetype: "swamp",
  },
  {
    id: "rift-cartography-post",
    prompt: "弯曲裂谷东岸的星图测绘哨所，有制图室、器材库、地下避难舱、贴崖升降梯和跨谷索桥。",
    archetype: "rift",
  },
  {
    id: "volcanic-glass-forge",
    prompt: "破火山口外缘的黑曜玻璃工坊，有熔炉间、退火库、地下燃料室、屋顶排烟台和跨熔岩维修桥。",
    archetype: "volcanic",
  },
  {
    id: "forest-herbal-hospice",
    prompt: "密林坡地里的草药巡护院，有诊疗木屋、干燥棚、地下根窖、树冠瞭望台和跨溪根桥。",
    archetype: "forest",
  },
  {
    id: "coastal-signal-hangar",
    prompt: "海岸悬崖上的滑翔救难站，有宽门机库、绞盘库、医务室、屋顶信号台和通往海蚀洞的维护栈道。",
    archetype: "mountain",
  },
] as const;

describe("cross-domain building and natural-terrain interfaces", () => {
  it.each(CASES)("keeps $id valid across Seed and density bands", ({ id, prompt, archetype }) => {
    const generated = [
      generateScene({ prompt, seed: `round-88-${id}-a`, size: "medium", density: 0.3 }, "adaptive"),
      generateScene({ prompt, seed: `round-88-${id}-a`, size: "medium", density: 0.84 }, "adaptive"),
      generateScene({ prompt, seed: `round-88-${id}-b`, size: "medium", density: 0.84 }, "adaptive"),
    ];
    const signature = (scene: (typeof generated)[number]) => scene.primitives
      .filter((primitive) => primitive.tags?.includes("terrain") || primitive.tags?.includes("building-pad") || primitive.tags?.includes("foundation"))
      .map((primitive) => `${primitive.id}:${primitive.position.x.toFixed(2)}:${primitive.position.y.toFixed(2)}:${primitive.position.z.toFixed(2)}:${primitive.size.x.toFixed(2)}:${primitive.size.z.toFixed(2)}`)
      .join("|");
    for (const scene of generated) {
      expect(scene.sceneProgram?.domain, `${id}: parent domain`).toBe("natural");
      expect(scene.archetype, `${id}: parent archetype`).toBe(archetype);
      expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building" && building.detailLevel === "full-interior"), `${id}: full building`).toBe(true);
      expect(scene.routes.some((route) => route.id === "wilderness-building-access"), `${id}: site access`).toBe(true);
      expect(scene.primitives.some((primitive) => primitive.tags?.includes("building-pad") || primitive.tags?.includes("foundation")), `${id}: foundation`).toBe(true);
      expect(scene.diagnostics.warnings, `${id}: ${scene.diagnostics.warnings.join("\n")}`).toHaveLength(0);
    }
    expect(signature(generated[0]!)).not.toBe(signature(generated[1]!));
    expect(signature(generated[1]!)).not.toBe(signature(generated[2]!));
  });

  it("keeps the peat clinic submerged-room connector clear of the shared basement wall", () => {
    const scene = generateScene({
      prompt: "酸雾泥炭湿地里的旧电报诊疗站，有治疗室、发报室、半淹药品库、架高木栈道和观察塔。",
      seed: "round-88-peat-telegraph-clinic-a",
      size: "medium",
      density: 0.84,
    }, "adaptive");

    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.diagnostics.metrics.connectorClearanceErrorCount).toBe(0);
    expect(scene.diagnostics.warnings).toEqual([]);
    const submergedBuilding = scene.buildingInstances?.find((building) => (
      building.functionalModules?.some((module) => module.kind === "submerged-room")
    ));
    expect(submergedBuilding).toBeDefined();
    expect(submergedBuilding?.functionalModules?.find((module) => module.kind === "submerged-room")?.tags)
      .toEqual(expect.arrayContaining(["prompt-derived-space", "submerged-room"]));
  });

  it("keeps the glacier rescue building when local retrieval adds its medical space", () => {
    const prompt = "黑冰川裂缝旁的巡礼无线电救护站，有伤员舱、祷告室、地下燃料库、测风塔和跨冰隙担架桥。";
    const request = { prompt, seed: "round-88-glacier-pilgrim-radio-b", size: "medium" as const, density: 0.84 };
    const retrievedCapabilities = [
      "structure.fuel-space",
      "structure.chapel-space",
      "terrain.crevasse",
      "structure.medical-space",
      "route.bridge",
      "state.flood",
      "structure.monastery-cluster",
      "structure.storage-space",
      "water.lava-network",
    ];
    const composition = compileSceneComposition(request, "local", retrievedCapabilities);
    const program = planSceneProgramLocally(prompt, "adaptive");
    const scene = generateScene(request, "adaptive", undefined, program, composition);
    expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building" && building.detailLevel === "full-interior")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("medical-wing"))).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("authors a focused cross-storey context contract for the coastal cave descent", () => {
    const prompt = "海岸悬崖上的滑翔救难站，有宽门机库、绞盘库、医务室、屋顶信号台和通往海蚀洞的维护栈道。";
    const scene = generateScene({ prompt, seed: "round-88-coastal-signal-hangar-a", size: "medium", density: 0.84 }, "adaptive");
    const catwalk = scene.primitives.find((primitive) => primitive.id === "wilderness-exterior-maintenance-walk");
    const caveFloor = scene.primitives.find((primitive) => primitive.id === "wilderness-sea-cave-floor");
    expect(catwalk?.level).toBe(0);
    expect(catwalk?.tags).toEqual(expect.arrayContaining([
      "building-instance:wilderness-core-building",
      "floor-context:3",
      "focus-cluster:sea-cave-interface",
    ]));
    expect(caveFloor?.level).toBe(3);
    expect(caveFloor?.tags).toContain("focus-cluster:sea-cave-interface");
    const linkedContext = scene.primitives.filter((primitive) => primitive.tags?.includes("floor-context:3"));
    expect(linkedContext.length).toBeGreaterThanOrEqual(2);
    expect(linkedContext.every((primitive) => primitive.tags?.includes("focus-cluster:sea-cave-interface"))).toBe(true);
    expect(linkedContext.some((primitive) => primitive.tags?.includes("interface-tail"))).toBe(true);
    expect(linkedContext.some((primitive) => primitive.tags?.includes("structural-support"))).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("keeps embedded full interiors structurally owned by their building identity", () => {
    const scene = generateScene({
      prompt: "繁忙港区的仓库、市场和码头",
      seed: "building-detail-contract-full",
      size: "large",
      density: 0.84,
    }, "settlement");
    const building = scene.buildingInstances?.find((entry) => entry.detailLevel === "full-interior");

    expect(building).toBeDefined();
    expect(building?.interiorProgram?.rooms.length).toBeGreaterThan(1);
    expect(building?.interiorProgram?.connections.length).toBeGreaterThan(0);
    expect(building?.interiorProgram?.rooms.some((room) => room.level > 0)).toBe(true);

    const ownedPrimitives = scene.primitives.filter((primitive) => primitive.tags?.includes(`building-instance:${building?.id}`));
    expect(ownedPrimitives.some((primitive) => primitive.tags?.includes("full-interior"))).toBe(true);
    expect(ownedPrimitives.some((primitive) => primitive.tags?.includes("program-room"))).toBe(true);
    expect(
      ownedPrimitives.some((primitive) => primitive.tags?.includes("room-connection"))
      || scene.routes.some((route) => route.id.startsWith(`${building?.id}-`)),
    ).toBe(true);
    expect(ownedPrimitives.some((primitive) => primitive.tags?.includes("vertical-opening"))).toBe(true);
    expect(new Set(ownedPrimitives.map((primitive) => primitive.level)).size).toBeGreaterThan(1);
    expect(ownedPrimitives.filter((primitive) => primitive.tags?.includes("program-room")).length)
      .toBeGreaterThanOrEqual(building?.interiorProgram?.rooms.length ?? 0);
  });

  it("keeps facade and mass buildings as replayable placeholders instead of embedded interiors", () => {
    const request = {
      prompt: "繁忙港区的仓库、市场和码头",
      seed: "building-detail-contract-placeholder",
      size: "large" as const,
      density: 0.84,
    };
    const first = generateScene(request, "settlement");
    const second = generateScene(request, "settlement");
    const placeholders = first.buildingInstances?.filter((entry) => entry.detailLevel === "facade" || entry.detailLevel === "mass") ?? [];

    expect(placeholders.length).toBeGreaterThan(0);
    for (const building of placeholders) {
      expect(building.seed.length).toBeGreaterThan(0);
      expect(building.envelopeProgram).toEqual(expect.objectContaining({
        version: 1,
        variant: expect.any(String),
        partCount: expect.any(Number),
        silhouetteSignature: expect.any(String),
      }));
      expect(building.interiorProgram?.rooms.length).toBeGreaterThan(1);
      expect(building.interiorProgram?.connections.length).toBeGreaterThan(0);

      const replay = second.buildingInstances?.find((entry) => entry.id === building.id);
      expect(replay?.seed).toBe(building.seed);
      expect(replay?.envelopeProgram).toEqual(building.envelopeProgram);
      expect(replay?.interiorProgram).toEqual(building.interiorProgram);

      const owned = first.primitives.filter((primitive) => primitive.tags?.includes(`building-instance:${building.id}`));
      expect(owned.some((primitive) => primitive.tags?.includes("focus-interior"))).toBe(false);
    }
  });
});
