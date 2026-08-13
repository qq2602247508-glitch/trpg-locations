export interface GenerationTiming {
  planningMs: number;
  geometryMs: number;
  totalMs: number;
  transportMs?: number;
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function normalizeGenerationTiming(value: unknown, fallbackTotal = 0): GenerationTiming {
  const raw = typeof value === "object" && value !== null ? value as Partial<GenerationTiming> : {};
  const planningMs = finiteNonNegative(raw.planningMs);
  const geometryMs = finiteNonNegative(raw.geometryMs);
  const totalMs = Math.max(finiteNonNegative(raw.totalMs), finiteNonNegative(fallbackTotal), planningMs + geometryMs);
  const residualMs = Math.max(0, totalMs - planningMs - geometryMs);
  const transportMs = raw.transportMs === undefined
    ? residualMs
    : Math.min(residualMs, finiteNonNegative(raw.transportMs));
  return { planningMs, geometryMs, totalMs, transportMs };
}

export function formatGenerationTiming(timing: GenerationTiming | undefined, generationMs = 0): string {
  const normalized = normalizeGenerationTiming(timing, generationMs);
  return `总计 ${normalized.totalMs.toFixed(0)} ms · 规划 ${normalized.planningMs.toFixed(0)} ms · 几何 ${normalized.geometryMs.toFixed(0)} ms`;
}
