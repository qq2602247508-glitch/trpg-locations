import { describe, expect, it } from "vitest";
import { auditPerformance } from "../src/validation/performance";
import { generateScene } from "../src/generators";
import type { GeneratedScene } from "../src/schema";

const scene = (overrides: Partial<GeneratedScene>): GeneratedScene => ({
  version: 1,
  kind: "building",
  title: "test",
  description: "test",
  seed: "test",
  gridFeet: 5,
  boundsCells: { x: 20, z: 20 },
  floors: 1,
  floorHeightFeet: [10],
  primitives: [],
  rooms: [],
  routes: [],
  tactical: [],
  diagnostics: { valid: true, score: 100, warnings: [], repairs: [], metrics: {} },
  generationMs: 0,
  ...overrides,
});

describe("performance audit", () => {
  it("penalizes low-value primitive inflation", () => {
    const lean = auditPerformance(scene({ primitives: Array.from({ length: 100 }, () => ({}) as never) }), { size: "medium", density: 0.5 });
    const inflated = auditPerformance(scene({ primitives: Array.from({ length: 5000 }, () => ({}) as never) }), { size: "medium", density: 0.5 });
    expect(inflated.qualityScore).toBeLessThan(lean.qualityScore);
    expect(inflated.budgetScore).toBeLessThan(lean.budgetScore);
  });

  it("rewards meaningful structure over decoration at equal primitive count", () => {
    const decorations = Array.from({ length: 500 }, () => ({}) as never);
    const meaningful = scene({
      primitives: decorations,
      rooms: Array.from({ length: 8 }, () => ({}) as never),
      routes: Array.from({ length: 5 }, () => ({}) as never),
      tactical: Array.from({ length: 4 }, () => ({}) as never),
    });
    const plain = auditPerformance(scene({ primitives: decorations }), { size: "medium", density: 0.5 });
    const rich = auditPerformance(meaningful, { size: "medium", density: 0.5 });
    expect(rich.semanticYield).toBeGreaterThan(plain.semanticYield);
    expect(rich.qualityScore).toBeGreaterThan(plain.qualityScore);
  });

  it("normalizes primitive density across map scale", () => {
    const small = auditPerformance(scene({
      boundsCells: { x: 10, z: 10 },
      primitives: Array.from({ length: 100 }, () => ({}) as never),
    }), { size: "small", density: 0.5 });
    const large = auditPerformance(scene({
      boundsCells: { x: 20, z: 20 },
      primitives: Array.from({ length: 400 }, () => ({}) as never),
    }), { size: "large", density: 0.5 });
    expect(large.primitiveDensity).toBe(small.primitiveDensity);
    expect(large.budgetScore).toBe(small.budgetScore);
  });

  it("publishes the audit metrics and remains exactly replayable", () => {
    const request = { prompt: "森林村庄，有木屋、林间小径和溪桥", seed: "regression-25-replay", size: "medium" as const, density: 0.72 };
    const first = generateScene(request, "adaptive");
    const second = generateScene(request, "adaptive");
    expect(first).toEqual(second);
    expect(first.diagnostics.metrics.primitiveDensity).toBeGreaterThan(0);
    expect(first.diagnostics.metrics.semanticYield).toBeGreaterThanOrEqual(0);
    expect(first.diagnostics.metrics.performanceBudgetScore).toBeGreaterThanOrEqual(0);
  });
});
