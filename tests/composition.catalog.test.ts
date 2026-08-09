import { describe, expect, it } from "vitest";
import { SPATIAL_ATOMS, auditAtomQuality, auditSemanticCoverage, catalogMaturity, compileSceneComposition } from "../src/composition";
import { generateScene } from "../src/generators";

describe("five-layer composition catalog", () => {
  it("keeps production-ready atoms behind a non-trivial quality gate", () => {
    const ready = SPATIAL_ATOMS.filter((entry) => entry.status === "production-ready");
    expect(ready.length).toBeGreaterThan(5);
    expect(ready.map(auditAtomQuality).every((result) => result.ready && result.issues.length === 0)).toBe(true);
    expect(catalogMaturity().planned).toBeGreaterThan(10);
  });

  it("maps forest density into ecology rather than only decoration", () => {
    const prompt = "茂密森林，林下灌木、倒木、三片空地和树冠平台";
    const sparse = generateScene({ prompt, seed: "forest-density-contract", size: "medium", density: 0.2 }, "adaptive");
    const dense = generateScene({ prompt, seed: "forest-density-contract", size: "medium", density: 0.9 }, "adaptive");
    const count = (tag: string, scene: typeof sparse) => scene.primitives.filter((entry) => entry.tags?.includes(tag)).length;
    expect(count("tree", dense)).toBeGreaterThan(count("tree", sparse) * 2);
    expect(count("undergrowth", dense)).toBeGreaterThan(count("undergrowth", sparse) * 2);
    expect(dense.compositionProgram?.density.ecologicalCoverage).toBeGreaterThan(sparse.compositionProgram?.density.ecologicalCoverage ?? 0);
  });

  it("changes river and volcanic macro structures across density bands", () => {
    const riverPrompt = "河谷、主河、支流、瀑布和深潭";
    const riverSparse = generateScene({ prompt: riverPrompt, seed: "hydrology-density", size: "medium", density: 0.15 }, "adaptive");
    const riverDense = generateScene({ prompt: riverPrompt, seed: "hydrology-density", size: "medium", density: 0.95 }, "adaptive");
    expect(riverDense.primitives.filter((entry) => entry.tags?.includes("tributary")).length).toBeGreaterThan(riverSparse.primitives.filter((entry) => entry.tags?.includes("tributary")).length * 2);
    const volcanoPrompt = "破碎火山口、熔岩支流、黑曜石脊和玄武岩平台";
    const volcanoSparse = generateScene({ prompt: volcanoPrompt, seed: "volcano-density", size: "medium", density: 0.15 }, "adaptive");
    const volcanoDense = generateScene({ prompt: volcanoPrompt, seed: "volcano-density", size: "medium", density: 0.95 }, "adaptive");
    expect(volcanoDense.primitives.filter((entry) => entry.tags?.includes("lava-branch")).length).toBeGreaterThan(volcanoSparse.primitives.filter((entry) => entry.tags?.includes("lava-branch")).length);
    expect(volcanoDense.primitives.filter((entry) => entry.tags?.includes("obsidian-ridge")).length).toBeGreaterThan(volcanoSparse.primitives.filter((entry) => entry.tags?.includes("obsidian-ridge")).length);
  });

  it("reports prompt requirements that are not physical geometry", () => {
    const request = { prompt: "森林、浅溪和树冠战斗平台", seed: "coverage-contract", size: "small" as const, density: 0.6 };
    const program = compileSceneComposition(request);
    const scene = generateScene(request, "adaptive");
    const report = auditSemanticCoverage(scene, program);
    expect(report.totalCritical).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(70);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBe(report.score);
  });

  it("selects compound motifs by prompt instead of loading every motif in a domain", () => {
    const mangrove = compileSceneComposition({ prompt: "红树林走私港村", seed: "motif-mangrove", size: "medium", density: 0.62 });
    expect(mangrove.motifIds).toContain("motif.mangrove-smuggler-port");
    expect(mangrove.motifIds).not.toContain("motif.hollow-tree-city");
    expect(new Set(mangrove.motifIds).size).toBe(mangrove.motifIds.length);

    const hollowTree = compileSceneComposition({ prompt: "空心古树内部的学者城市", seed: "motif-tree", size: "medium", density: 0.62 });
    expect(hollowTree.motifIds).toContain("motif.hollow-tree-city");
    expect(hollowTree.motifIds).not.toContain("motif.mangrove-smuggler-port");
  });

  it("treats water-city prompts as a dedicated waterfront grammar", () => {
    const request = {
      prompt: "河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷",
      seed: "water-city-grammar-contract",
      size: "medium" as const,
      density: 0.72,
    };
    const program = compileSceneComposition(request);
    expect(program.primaryDomain).toBe("river");
    expect(program.grammarId).toBe("grammar.water-city-v1");
    expect(program.motifIds).toContain("motif.water-city-quays");
    expect(program.requirements.map((item) => item.id)).toEqual(expect.arrayContaining([
      "water-city-main",
      "water-city-branches",
      "water-city-stone-bridge",
      "water-city-wood-bridge",
      "water-city-market",
      "water-city-dock",
      "water-city-bank-lanes",
    ]));
    const scene = generateScene(request, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(tags.has("main-canal")).toBe(true);
    expect(tags.has("branch-canal")).toBe(true);
    expect(tags.has("stone-bridge")).toBe(true);
    expect(tags.has("wood-bridge")).toBe(true);
    expect(tags.has("market-dock")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBeGreaterThanOrEqual(70);
    expect(scene.compositionProgram?.grammarId).toBe("grammar.water-city-v1");
  });

  it("keeps water-city topology deterministic yet seed-sensitive", () => {
    const prompt = "河道水城，弯曲主河、三条支流、石桥、木桥、水上市集、船坞与沿岸不规则街巷";
    const request = { prompt, seed: "water-city-seed-a", size: "medium" as const, density: 0.72 };
    const replay = generateScene(request, "adaptive");
    const same = generateScene(request, "adaptive");
    const other = generateScene({ ...request, seed: "water-city-seed-b" }, "adaptive");
    const signature = (scene: typeof replay) => scene.primitives
      .filter((entry) => entry.tags?.includes("water-city") || entry.tags?.includes("main-canal") || entry.tags?.includes("branch-canal"))
      .map((entry) => `${entry.id}:${entry.position.x.toFixed(2)}:${entry.position.z.toFixed(2)}:${entry.size.x.toFixed(2)}:${entry.size.z.toFixed(2)}`)
      .join("|");
    expect(signature(replay)).toBe(signature(same));
    expect(signature(replay)).not.toBe(signature(other));
  });

  it("realizes waterfront building details as supported geometry", () => {
    const scene = generateScene({
      prompt: "河道水城，水上市集、船坞、仓库和沿岸不规则街巷",
      seed: "waterfront-building-detail",
      size: "medium",
      density: 0.72,
    }, "adaptive");
    const waterfront = scene.primitives.filter((primitive) => primitive.tags?.includes("waterfront-building"));
    expect(waterfront.length).toBeGreaterThan(8);
    expect(waterfront.some((primitive) => primitive.tags?.includes("cargo-crane"))).toBe(true);
    expect(waterfront.some((primitive) => primitive.tags?.includes("dockside-awning"))).toBe(true);
    expect(waterfront.some((primitive) => primitive.tags?.includes("dockside-piling"))).toBe(true);
    expect(scene.tactical.some((feature) => feature.id.includes("dockside-choke"))).toBe(true);
  });

  it("changes mangrove parent topology across seeds, not only building props", () => {
    const prompt = "潮汐红树林里的炼金学者港村，有根桥、树上实验屋、半淹档案库和水下温室";
    const first = generateScene({ prompt, seed: "mangrove-macro-a", size: "medium", density: 0.62 }, "adaptive");
    const second = generateScene({ prompt, seed: "mangrove-macro-b", size: "medium", density: 0.62 }, "adaptive");
    const signature = (scene: typeof first) => scene.primitives
      .filter((entry) => entry.tags?.includes("tidal-channel") || entry.tags?.includes("root-boardwalk"))
      .map((entry) => `${entry.id}:${entry.position.x.toFixed(2)}:${entry.position.z.toFixed(2)}:${entry.size.x.toFixed(2)}:${entry.size.z.toFixed(2)}`)
      .join("|");
    expect(signature(first)).not.toBe(signature(second));
    expect(first.primitives.filter((entry) => entry.tags?.includes("tidal-channel")).length).toBeGreaterThan(3);
    expect(second.primitives.filter((entry) => entry.tags?.includes("root-boardwalk")).length).toBeGreaterThan(4);
  });

  it("uses density to change mangrove ecology topology, not only object count", () => {
    const prompt = "潮汐红树林里的炼金学者港村，有根桥、树上实验屋、半淹档案库和水下温室";
    const sparse = generateScene({ prompt, seed: "mangrove-density-contract", size: "medium", density: 0.2 }, "adaptive");
    const dense = generateScene({ prompt, seed: "mangrove-density-contract", size: "medium", density: 0.9 }, "adaptive");
    const count = (scene: typeof sparse, tag: string) => scene.primitives.filter((entry) => entry.tags?.includes(tag)).length;
    expect(count(dense, "prop-root")).toBeGreaterThan(count(sparse, "prop-root"));
    expect(count(dense, "root-boardwalk")).toBeGreaterThan(count(sparse, "root-boardwalk"));
    expect(dense.routes.filter((route) => route.id.startsWith("mangrove-boardwalk-route")).length)
      .toBeGreaterThan(sparse.routes.filter((route) => route.id.startsWith("mangrove-boardwalk-route")).length);
  });
});
