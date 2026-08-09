import type { SceneCompositionProgram } from "./schema";

export interface CapabilityDomainResolution {
  domain?: SceneCompositionProgram["primaryDomain"];
  score: number;
  runnerUpScore: number;
  evidence: string[];
  confident: boolean;
}

/**
 * Convert retrieved atoms into one bounded domain decision. Shared by the
 * composition planner and geometry router so they cannot disagree about the
 * same BGE result. Structural atoms receive more weight than generic routes.
 */
export function resolveCapabilityDomain(ids: readonly string[]): CapabilityDomainResolution {
  const scores = new Map<NonNullable<CapabilityDomainResolution["domain"]>, { score: number; evidence: string[] }>();
  const add = (domain: NonNullable<CapabilityDomainResolution["domain"]>, id: string, weight: number) => {
    const entry = scores.get(domain) ?? { score: 0, evidence: [] };
    entry.score += weight;
    entry.evidence.push(id);
    scores.set(domain, entry);
  };
  for (const [index, id] of ids.entries()) {
    const rank = Math.max(0.52, 1 - index * 0.08);
    if (id === "terrain.crater-rim") add("crater", id, 4 * rank);
    if (id === "terrain.caldera") add("volcanic", id, 4 * rank);
    if (id === "water.lava-network") add("volcanic", id, 3.5 * rank);
    if (id === "terrain.ravine") add("rift", id, 2.4 * rank);
    if (id === "terrain.crevasse") add("rift", id, 3.2 * rank);
    if (id === "terrain.marsh-basin") add("swamp", id, 3.5 * rank);
    if (id === "water.tidal-channel") add("swamp", id, 2.2 * rank);
    if (id === "ecology.mangrove-canopy") add("swamp", id, 3.2 * rank);
    if (id === "water.meandering-channel") add("river", id, 3.4 * rank);
    if (id === "water.tributary") add("river", id, 2.8 * rank);
    if (id === "water.waterfall") add("river", id, 3.4 * rank);
    if (id === "water.pool") add("river", id, 1.1 * rank);
    if (id.startsWith("ecology.") && id !== "ecology.mangrove-canopy") add("forest", id, (id === "ecology.tree-cluster" ? 2.8 : 1.5) * rank);
    if (id === "terrain.irregular-clearing" || id === "structure.hollow-tree-shell") add("forest", id, 2.4 * rank);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));
  const winner = ranked[0];
  const runnerUpScore = ranked[1]?.[1].score ?? 0;
  if (!winner) return { score: 0, runnerUpScore: 0, evidence: [], confident: false };
  const confident = winner[1].score >= 2.4 && (winner[1].score - runnerUpScore >= 0.65 || winner[1].evidence.length >= 2);
  return { domain: confident ? winner[0] : undefined, score: winner[1].score, runnerUpScore, evidence: winner[1].evidence, confident };
}
