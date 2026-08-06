import { describe, expect, it } from "vitest";
import { generateScene } from "../src/generators";
import type { GenerationRequest, SceneKind } from "../src/schema";

const request: GenerationRequest = {
  prompt: "A layered tactical location with one dangerous route and meaningful cover.",
  seed: "validation-integration",
  size: "medium",
  density: 0.6,
};

describe("generator validation integration", () => {
  it.each(["tavern", "tower", "sewer", "cave", "adaptive"] as const satisfies readonly SceneKind[])(
    "%s scenes arrive valid without repair",
    (kind) => {
      const scene = generateScene(request, kind);

      expect(scene.diagnostics.valid).toBe(true);
      expect(scene.diagnostics.repairs).toEqual([]);
      expect(scene.diagnostics.metrics.primitiveCount).toBeGreaterThan(0);
      expect(scene.diagnostics.metrics.roomCount).toBeGreaterThan(0);
      expect(scene.diagnostics.metrics.primaryRouteCount).toBeGreaterThan(0);
      expect(scene.diagnostics.metrics.entranceCount).toBeGreaterThan(0);
    },
  );

  it("keeps a full generated scene byte-for-byte reproducible for a seed", () => {
    const first = generateScene({ ...request, prompt: "an unfamiliar storm shrine beside a bridge" }, "adaptive");
    const second = generateScene({ ...request, prompt: "an unfamiliar storm shrine beside a bridge" }, "adaptive");

    expect(first).toEqual(second);
  });
});
