import type { GeneratedScene, GenerationRequest } from "../schema";

export interface PerformanceAudit {
  areaCells: number;
  primitiveDensity: number;
  semanticYield: number;
  semanticUnits: number;
  primitiveBudget: number;
  budgetScore: number;
  qualityScore: number;
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * Audit renderable complexity without using renderer-only counters.  The
 * footprint is deliberately used instead of floor count so a multi-level
 * scene is not rewarded for duplicating the same ground area.
 */
export function auditPerformance(scene: Pick<GeneratedScene, "boundsCells" | "primitives" | "rooms" | "routes" | "tactical">, request: Pick<GenerationRequest, "size" | "density">): PerformanceAudit {
  const areaCells = Math.max(1, scene.boundsCells.x * scene.boundsCells.z);
  const primitiveCount = scene.primitives.length;
  const primitiveDensity = primitiveCount / areaCells;
  const semanticUnits = scene.rooms.length + scene.routes.length + scene.tactical.length;
  const semanticYield = primitiveCount === 0 ? 0 : (semanticUnits / primitiveCount) * 100;

  // Density is a request-level intent, while size changes the available area.
  // Keeping the target in primitives per cell makes scores comparable across
  // small/medium/large scenes.
  // The generated scene matrix currently spans roughly 0.02–1.45
  // primitives/cell. Keep the envelope in that observed range so the metric
  // can distinguish an over-detailed settlement from a sparse cave without
  // punishing intentionally sparse domains.
  const targetDensity = 0.55 + request.density * 0.8;
  const tolerance = 0.35 + request.density * 0.25;
  const primitiveBudget = areaCells * (targetDensity + tolerance);
  const excess = Math.max(0, primitiveDensity - (targetDensity + tolerance));
  const budgetScore = clampScore(100 - (excess / Math.max(1, targetDensity + tolerance)) * 100);

  // A yield of 1 semantic unit per 100 primitives is a useful floor for a
  // readable scene. The cap prevents unusually sparse scenes from dominating.
  const yieldScore = clampScore(semanticYield / 1.5 * 100);
  const qualityScore = Math.round(budgetScore * 0.6 + yieldScore * 0.4);

  return {
    areaCells,
    primitiveDensity,
    semanticYield,
    semanticUnits,
    primitiveBudget,
    budgetScore,
    qualityScore,
  };
}
