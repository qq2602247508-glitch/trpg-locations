import { describe, expect, it } from "vitest";
import { generateScene } from "../src/generators";
import type { GenerationRequest, SceneKind } from "../src/schema";

const fixedKinds = ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness"] as const satisfies readonly Exclude<SceneKind, "adaptive">[];
const sizes = ["small", "medium", "large"] as const satisfies readonly GenerationRequest["size"][];
const densities = [0.2, 0.62, 1] as const;

describe("high-volume procedural regression", () => {
  it("keeps every fixed domain clean across seed, scale, and density bands", () => {
    let generated = 0;
    for (const kind of fixedKinds) {
      for (const size of sizes) {
        for (const density of densities) {
          for (let index = 0; index < 12; index += 1) {
            const scene = generateScene({
              prompt: `Procedural ${kind} tactical stress case`,
              seed: `stress-${kind}-${size}-${density}-${index}`,
              size,
              density,
            }, kind);
            expect(scene.gridFeet).toBe(5);
            expect(scene.diagnostics.valid).toBe(true);
            expect(scene.diagnostics.repairs).toEqual([]);
            expect(scene.diagnostics.metrics.geometryErrorCount).toBe(0);
            expect(scene.boundsCells.x * scene.boundsCells.z).toBeGreaterThan(4);
            generated += 1;
          }
        }
      }
    }
    expect(generated).toBe(756);
  });

  it.each([
    "星辰观测所，镜面水池与旋转平台",
    "巨兽骸骨森林中的灵魂法庭",
    "漂浮在云海上的钟表机械工坊",
    "潮汐周期会改变路线的珊瑚庭院",
    "倒挂在峡谷下方的使馆和索桥",
    "时间断层里的玻璃花园与破碎回廊",
  ])("degrades an unknown theme into a deterministic playable composition: %s", (prompt) => {
    const request: GenerationRequest = { prompt, seed: `unknown-${prompt.length}`, size: "large", density: 0.78 };
    const first = generateScene(request, "adaptive");
    const second = generateScene(request, "adaptive");
    expect(first).toEqual(second);
    expect(first.diagnostics.valid).toBe(true);
    expect(first.primitives.length).toBeGreaterThan(0);
    expect(first.routes.some((route) => route.kind === "primary")).toBe(true);
    expect(first.tactical.some((feature) => feature.kind === "entrance")).toBe(true);
    expect(first.description).toContain("Adaptive composition");
  });
});
