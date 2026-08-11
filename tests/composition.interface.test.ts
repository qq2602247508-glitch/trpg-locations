import { describe, expect, it } from "vitest";
import { generateScene } from "../src/generators";

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
});
