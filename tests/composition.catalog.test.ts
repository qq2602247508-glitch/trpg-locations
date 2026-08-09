import { describe, expect, it } from "vitest";
import { SPATIAL_ATOMS, auditAtomQuality, auditSemanticCoverage, catalogMaturity, compileSceneComposition } from "../src/composition";
import { generateScene } from "../src/generators";
import { GRID_METERS } from "../src/schema";

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

  it("makes forest density alter clearings and canopy topology", () => {
    const prompt = "非常茂密的原始森林，三片不规则林间空地、封闭林冠、灌木、倒木、浅溪、大树和树冠战斗平台";
    const sparse = generateScene({ prompt, seed: "forest-structure-density", size: "medium", density: 0.2 }, "adaptive");
    const dense = generateScene({ prompt, seed: "forest-structure-density", size: "medium", density: 0.9 }, "adaptive");
    const clearingSize = (scene: typeof sparse) => scene.rooms.filter((room) => room.id.startsWith("forest-clearing-")).reduce((sum, room) => sum + room.sizeCells.x * room.sizeCells.z, 0);
    expect(clearingSize(sparse)).toBeGreaterThan(clearingSize(dense));
    expect(dense.primitives.filter((primitive) => primitive.tags?.includes("root-buttress")).length).toBeGreaterThan(sparse.primitives.filter((primitive) => primitive.tags?.includes("root-buttress")).length);
    expect(dense.primitives.filter((primitive) => primitive.tags?.includes("canopy-bridge")).length).toBeGreaterThanOrEqual(sparse.primitives.filter((primitive) => primitive.tags?.includes("canopy-bridge")).length);
    expect(dense.routes.filter((route) => route.id.startsWith("forest-canopy-bridge-route")).length).toBeGreaterThanOrEqual(1);
  });

  it("realizes forest cabin requirements as authored geometry", () => {
    const prompt = "原始森林里的猎人小屋，有柴棚、陷阱线、溪边木桥和树冠观察台";
    const scene = generateScene({ prompt, seed: "forest-cabin-requirements", size: "medium", density: 0.62 }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.buildingInstances?.some((building) => building.archetype === "home")).toBe(true);
    expect(tags.has("trap-line")).toBe(true);
    expect(tags.has("footbridge")).toBe(true);
    expect(tags.has("canopy-observatory")).toBe(true);
    expect(scene.rooms.some((room) => room.id.startsWith("forest-clearing-"))).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-forest-footbridge-route")).toBe(true);
  });

  it("keeps a wetland ranger-station compound connected", () => {
    const prompt = "沼泽边缘的废弃林务站，有木桥、瞭望塔、陷阱沟、倒木防线和地下储藏室";
    const scene = generateScene({ prompt, seed: "wetland-ranger-station", size: "medium", density: 0.62 }, "adaptive");
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
    expect(scene.buildingInstances?.some((building) => building.archetype === "home")).toBe(true);
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(tags.has("lookout-tower")).toBe(true);
    expect(tags.has("trench")).toBe(true);
    expect(tags.has("fallen-log-defense")).toBe(true);
  });

  it("composes a mangrove quarantine station from wetland and building modules", () => {
    const prompt = "海岸红树林里的检疫站，有高脚建筑、隔离棚、潮汐码头、巡逻塔和秘密药品库";
    const scene = generateScene({ prompt, seed: "mangrove-quarantine-station", size: "medium", density: 0.62 }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("swamp");
    expect(scene.buildingInstances?.some((building) => building.archetype === "clinic" && building.detailLevel === "full-interior")).toBe(true);
    expect(tags.has("mangrove")).toBe(true);
    expect(tags.has("tidal-channel")).toBe(true);
    expect(tags.has("stilt-foundation")).toBe(true);
    expect(tags.has("quarantine-shed")).toBe(true);
    expect(tags.has("tidal-dock")).toBe(true);
    expect(tags.has("lookout-tower")).toBe(true);
    expect(tags.has("medical-vault")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBe(100);
    const building = scene.buildingInstances?.find((entry) => entry.id === "wilderness-core-building");
    const postSiteCanopies = scene.primitives.filter((primitive) => primitive.tags?.includes("site-program") && primitive.tags?.includes("mangrove") && primitive.tags?.includes("canopy"));
    expect(building).toBeDefined();
    expect(postSiteCanopies.every((primitive) => Math.hypot(primitive.position.x / GRID_METERS - (building?.positionCells.x ?? 0), primitive.position.z / GRID_METERS - (building?.positionCells.z ?? 0)) >= 11.5)).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("composes a tundra weather station from ice, wetland and service modules", () => {
    const prompt = "冻土湿地上的气象站，有架高栈道、通信塔、发电机棚、冰水裂沟和地下储备仓";
    const scene = generateScene({ prompt, seed: "tundra-weather-station", size: "medium", density: 0.62 }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("ice");
    expect(scene.buildingInstances?.some((building) => building.archetype === "guild" && building.detailLevel === "full-interior")).toBe(true);
    expect(tags.has("stilt-foundation")).toBe(true);
    expect(tags.has("boardwalk")).toBe(true);
    expect(tags.has("communications-tower")).toBe(true);
    expect(tags.has("generator-shed")).toBe(true);
    expect(tags.has("ice-fissure")).toBe(true);
    expect(tags.has("reserve-vault")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-ice-fissure-crossing-route")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.envelopeProgram?.variant.startsWith("weather-"))).toBe(true);
    expect(tags.has("snow-ridge")).toBe(true);
    expect(tags.has("ice-shelf")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBe(100);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("generalizes wetland station atoms to an unfamiliar border outpost", () => {
    const prompt = "海岸盐沼湿地上的边防站，有高脚宿舍、瞭望塔、架高栈道、壕沟和地下补给库";
    const scene = generateScene({ prompt, seed: "salt-marsh-border-outpost", size: "medium", density: 0.7 }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("swamp");
    expect(scene.buildingInstances?.some((building) => building.detailLevel === "full-interior")).toBe(true);
    expect(tags.has("stilt-foundation")).toBe(true);
    expect(tags.has("lookout-tower")).toBe(true);
    expect(tags.has("trench")).toBe(true);
    expect(tags.has("reserve-vault")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.envelopeProgram?.variant.startsWith("border-"))).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBe(100);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("makes ice density alter meso structure and routes deterministically", () => {
    const prompt = "冰原气象观测场，有冻融池、雪脊、冰缝和两条安全路线";
    const sparse = generateScene({ prompt, seed: "ice-density-contract", size: "medium", density: 0.2 }, "adaptive");
    const dense = generateScene({ prompt, seed: "ice-density-contract", size: "medium", density: 0.9 }, "adaptive");
    const replay = generateScene({ prompt, seed: "ice-density-contract", size: "medium", density: 0.9 }, "adaptive");
    const other = generateScene({ prompt, seed: "ice-density-other", size: "medium", density: 0.9 }, "adaptive");
    const count = (scene: typeof sparse, tag: string) => scene.primitives.filter((entry) => entry.tags?.includes(tag)).length;
    const signature = (scene: typeof sparse) => scene.primitives
      .filter((entry) => entry.tags?.includes("ice-meso"))
      .map((entry) => `${entry.id}:${entry.position.x.toFixed(2)}:${entry.position.z.toFixed(2)}:${entry.size.x.toFixed(2)}:${entry.size.z.toFixed(2)}`)
      .join("|");
    expect(count(dense, "snow-ridge")).toBeGreaterThan(count(sparse, "snow-ridge"));
    expect(count(dense, "thaw-pool")).toBeGreaterThan(count(sparse, "thaw-pool"));
    expect(count(dense, "ice-shelf")).toBeGreaterThan(count(sparse, "ice-shelf"));
    expect(dense.routes.length).toBeGreaterThan(sparse.routes.length);
    expect(dense.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).length).toBeGreaterThan(sparse.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).length);
    expect(dense.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).every((route) => route.points.length >= 5)).toBe(true);
    expect(signature(dense)).toBe(signature(replay));
    expect(signature(dense)).not.toBe(signature(other));
  });

  it("generalizes unfamiliar research stations without falling back to a home envelope", () => {
    const prompt = "高山冻土湿地上的无线电研究站，有样本实验室、通信塔、发电机棚、架高栈道和地下样本库";
    const scene = generateScene({ prompt, seed: "unknown-field-station", size: "medium", density: 0.7 }, "adaptive");
    const building = scene.buildingInstances?.find((entry) => entry.id === "wilderness-core-building");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(building?.archetype).toBe("guild");
    expect(building?.envelopeProgram?.variant.startsWith("field-")).toBe(true);
    expect(building?.buildingProgram?.requiredFeatures).toEqual(expect.arrayContaining(["field-laboratory", "specimen-archive"]));
    expect(tags.has("communications-tower")).toBe(true);
    expect(tags.has("generator-shed")).toBe(true);
    expect(tags.has("reserve-vault")).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
    const alternateSeed = generateScene({ prompt, seed: "round48-field-station-b", size: "medium", density: 0.72 }, "adaptive");
    expect(alternateSeed.diagnostics.warnings).toHaveLength(0);
    expect(alternateSeed.primitives.some((primitive) => primitive.tags?.includes("room-connector") && primitive.tags?.includes("opening"))).toBe(true);
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
