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

  it("lets bounded semantic capabilities select a real generator for unfamiliar wording", () => {
    const request = { prompt: "雾中银阶沿两条分叉流线跌落，围住两处可渡点", seed: "bge-water-geometry", size: "medium" as const, density: 0.66 };
    const composition = compileSceneComposition(request, "bge", ["water.meandering-channel", "water.tributary", "water.waterfall", "route.bridge"]);
    expect(composition.primaryDomain).toBe("river");
    expect(composition.grammarId).toBe("grammar.river-v1");
    const scene = generateScene(request, "wilderness", undefined, undefined, composition);
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("river-valley");
    expect(tags.has("river")).toBe(true);
    expect(tags.has("watercourse")).toBe(true);
    expect(scene.compositionProgram?.source).toBe("bge");
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

  it("builds a mixed forest ecology with density-driven relief", () => {
    const prompt = "茂密森林里层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断";
    const request = { prompt, seed: "forest-atom-quality", size: "medium" as const };
    const sparse = generateScene({ ...request, density: 0.25 }, "adaptive");
    const dense = generateScene({ ...request, density: 0.82 }, "adaptive");
    const tags = new Set(dense.primitives.flatMap((primitive) => primitive.tags ?? []));
    for (const species of ["broadleaf", "conifer", "snag", "understory"]) {
      expect(tags.has(`tree-species:${species}`)).toBe(true);
    }
    const terrainBands = (scene: typeof dense) => new Set(scene.primitives
      .filter((primitive) => primitive.id.startsWith("forest-morphology-cell-"))
      .flatMap((primitive) => primitive.tags?.filter((tag) => tag.startsWith("elevation:")) ?? [])).size;
    const verticalFaces = (scene: typeof dense) => scene.primitives.filter((primitive) => primitive.tags?.includes("forest-morphology-boundary")).length;
    const slopeFacades = (scene: typeof dense) => scene.primitives.filter((primitive) => primitive.shape === "ramp" && primitive.tags?.includes("slope-facade"));
    expect(terrainBands(dense)).toBeGreaterThan(terrainBands(sparse));
    expect(verticalFaces(dense)).toBeGreaterThan(verticalFaces(sparse));
    expect(dense.primitives.filter((primitive) => primitive.tags?.includes("tree")).length).toBeGreaterThan(sparse.primitives.filter((primitive) => primitive.tags?.includes("tree")).length * 1.8);
    expect(slopeFacades(dense).length).toBeGreaterThan(100);
    expect(slopeFacades(dense).every((primitive) => !primitive.tags?.includes("standable") && primitive.tags?.includes("non-walkable-facade"))).toBe(true);
    expect(dense.description).toContain("natural slope facades");
  });

  it("uses discontinuous forest-edge clusters instead of a universal terrain skirt", () => {
    const prompt = "茂密森林，林缘有盘根、灌丛和倒木，内部有三片不规则空地";
    const request = { prompt, seed: "forest-edge-seed-a", size: "medium" as const, density: 0.82 };
    const first = generateScene(request, "adaptive");
    const replay = generateScene(request, "adaptive");
    const other = generateScene({ ...request, seed: "forest-edge-seed-b" }, "adaptive");
    const roots = (scene: typeof first) => scene.primitives.filter((primitive) => primitive.tags?.includes("root-apron"));
    const shrubs = (scene: typeof first) => scene.primitives.filter((primitive) => primitive.tags?.includes("edge-thicket"));
    const signature = (scene: typeof first) => roots(scene).map((primitive) => `${primitive.position.x.toFixed(2)},${primitive.position.z.toFixed(2)},${primitive.rotationY?.toFixed(2)}`).join("|");
    expect(roots(first).length).toBeGreaterThan(8);
    expect(roots(first).every((primitive) => primitive.shape === "ramp" && !primitive.tags?.includes("standable"))).toBe(true);
    expect(shrubs(first).length).toBeGreaterThan(20);
    expect(first.primitives.some((primitive) => primitive.tags?.includes("erosion-skirt"))).toBe(false);
    expect(signature(first)).toBe(signature(replay));
    expect(signature(first)).not.toBe(signature(other));
    expect(first.description).toContain("discontinuous forest-edge clusters");
  });

  it("keeps contour-following forest routes deterministic and seed-sensitive", () => {
    const prompt = "起伏针叶林，林间小径连接三片空地、倒木和树冠哨台";
    const request = { prompt, seed: "forest-contour-seed-a", size: "medium" as const, density: 0.82 };
    const first = generateScene(request, "adaptive");
    const replay = generateScene(request, "adaptive");
    const other = generateScene({ ...request, seed: "forest-contour-seed-b" }, "adaptive");
    const signature = (scene: typeof first) => scene.routes
      .filter((route) => route.id.startsWith("forest-"))
      .map((route) => `${route.id}:${route.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`).join(";")}`)
      .join("|");
    expect(signature(first)).toBe(signature(replay));
    expect(signature(first)).not.toBe(signature(other));
    for (const route of first.routes.filter((entry) => entry.id === "forest-primary-route" || entry.id === "forest-hunter-trail")) {
      for (let index = 1; index < route.points.length; index += 1) {
        expect(Math.abs(route.points[index]!.y - route.points[index - 1]!.y)).toBeLessThanOrEqual(2.05);
      }
    }
  });

  it("turns cold-forest language into a visible terrain state", () => {
    const scene = generateScene({
      prompt: "寒冷山麓针叶林，密集冷杉、倒木、林下蕨类、三片不规则空地和树冠哨台",
      seed: "cold-forest-state",
      size: "medium",
      density: 0.82,
    }, "adaptive");
    const snow = scene.primitives.filter((primitive) => primitive.tags?.includes("snow-patch"));
    expect(snow.length).toBeGreaterThan(8);
    expect(snow.every((primitive) => primitive.tags?.includes("terrain-state"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("cold-forest-floor"))).toBe(true);
    expect(scene.description).toContain("high-ground snow patches");
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
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("cellar-rack")).length).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("cellar-crate")).length).toBeGreaterThanOrEqual(3);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("cellar-barrel"))).toBe(true);
    expect(scene.tactical.some((feature) => feature.id.includes("basement-storage-cover"))).toBe(true);
    for (const fixture of ["hearth", "table", "bench", "workbench", "tool-rack", "bunk"]) {
      expect(scene.primitives.some((primitive) => primitive.tags?.includes(fixture))).toBe(true);
    }
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
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("quarantine-cot")).length).toBeGreaterThanOrEqual(4);
    expect(tags.has("screening-gate")).toBe(true);
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
    expect(tags.has("climate:polar")).toBe(true);
    expect(tags.has("polar-windbreak")).toBe(true);
    expect(tags.has("insulated-cladding")).toBe(true);
    expect(tags.has("snow-fence")).toBe(true);
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
    expect(count(dense, "ice-base-plate")).toBeGreaterThan(count(sparse, "ice-base-plate"));
    expect(count(dense, "snow-ridge-leeward")).toBeGreaterThan(count(sparse, "snow-ridge-leeward"));
    expect(dense.primitives.some((primitive) => primitive.id === "ice-field")).toBe(false);
    expect(dense.compositionProgram?.primaryDomain).toBe("ice");
    expect(dense.compositionProgram?.grammarId).toBe("grammar.ice-field-v1");
    expect(dense.compositionProgram?.motifIds).toContain("motif.eroded-ice-ridges");
    expect(dense.compositionProgram?.semanticCoverage?.score).toBe(100);
    expect(dense.viewProgram?.mode).toBe("scene");
    expect(dense.routes.length).toBeGreaterThan(sparse.routes.length);
    expect(dense.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).length).toBeGreaterThan(sparse.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).length);
    expect(dense.routes.filter((route) => route.id.startsWith("ice-snow-ridge-route-")).every((route) => route.points.length >= 5)).toBe(true);
    expect(signature(dense)).toBe(signature(replay));
    expect(signature(dense)).not.toBe(signature(other));
  });

  it("cuts glacier-crevasse prompts into two banks with only supported crossings", () => {
    const scene = generateScene({
      prompt: "巨大冰川裂缝从北到南完全切断冰原，只有两座狭窄冰桥可以跨越",
      seed: "ice-main-crevasse-contract",
      size: "large",
      density: 0.82,
    }, "adaptive");
    const tagged = (tag: string) => scene.primitives.filter((primitive) => primitive.tags?.includes(tag));
    expect(scene.archetype).toBe("ice");
    expect(tagged("crevasse-west-bank").length).toBeGreaterThan(8);
    expect(tagged("crevasse-east-bank").length).toBeGreaterThan(8);
    expect(tagged("crevasse-wall").length).toBeGreaterThan(16);
    expect(tagged("crevasse-bottom").every((primitive) => !primitive.tags?.includes("standable"))).toBe(true);
    expect(tagged("crevasse-bridge")).toHaveLength(2);
    expect(tagged("crevasse-bridge").every((primitive) => primitive.tags?.includes("supported") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.routes.filter((route) => route.id.startsWith("ice-main-crevasse-crossing-route-"))).toHaveLength(2);
    const bottoms = tagged("crevasse-bottom");
    const protectedProps = scene.primitives.filter((primitive) => primitive.tags?.includes("ice-shelf") || primitive.tags?.includes("natural-detail") || primitive.id.startsWith("standable-prop-"));
    const overlaps = (left: typeof scene.primitives[number], right: typeof scene.primitives[number]) => Math.abs(left.position.x - right.position.x) < (left.size.x + right.size.x) / 2 && Math.abs(left.position.z - right.position.z) < (left.size.z + right.size.z) / 2;
    expect(protectedProps.every((primitive) => bottoms.every((bottom) => !overlaps(primitive, bottom)))).toBe(true);
    expect(scene.description).toContain("deep main-crevasse segments");
  });

  it("keeps an unfamiliar glacier research compound on a reserved-safe bank", () => {
    const prompt = "巨大冰川裂缝研究站，主实验楼建在安全冰岸，通信塔、发电机棚、地下样本库，两座自然冰桥连接东岸观测点";
    const scene = generateScene({ prompt, seed: "glacier-compound-reservation", size: "large", density: 0.82 }, "adaptive");
    expect(scene.archetype).toBe("ice");
    expect(scene.terrainReservations?.length).toBeGreaterThan(8);
    expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building" && building.archetype === "guild")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id === "wilderness-ice-bank-north")).toBe(false);
    const zones = scene.terrainReservations ?? [];
    const protectedPieces = scene.primitives.filter((primitive) => ["building-pad", "generator-shed", "communications-tower"].some((tag) => primitive.tags?.includes(tag)) && !primitive.tags?.includes("vertical-route"));
    const overlapsZone = (primitive: typeof scene.primitives[number], zone: typeof zones[number]) => {
      const px = primitive.position.x / GRID_METERS;
      const pz = primitive.position.z / GRID_METERS;
      const halfX = primitive.size.x / GRID_METERS / 2;
      const halfZ = primitive.size.z / GRID_METERS / 2;
      const dx = px - zone.centerCells.x;
      const dz = pz - zone.centerCells.z;
      const cosine = Math.cos(zone.rotationY ?? 0);
      const sine = Math.sin(zone.rotationY ?? 0);
      const localX = dx * cosine - dz * sine;
      const localZ = dx * sine + dz * cosine;
      const footprintPadding = Math.max(halfX, halfZ);
      return Math.abs(localX) < footprintPadding + zone.sizeCells.x / 2 + zone.clearanceCells
        && Math.abs(localZ) < footprintPadding + zone.sizeCells.z / 2 + zone.clearanceCells;
    };
    expect(protectedPieces.length).toBeGreaterThan(5);
    expect(protectedPieces.every((primitive) => zones.every((zone) => !overlapsZone(primitive, zone)))).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("crevasse-bridge"))).toHaveLength(2);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("composes an unfamiliar geothermal workshop outside reserved lava channels", () => {
    const prompt = "活火山破碎火山口边缘的地热观测工坊，有样本实验室、通信塔、发电机棚、地下冷却样本库、两条熔岩沟和玄武岩检修桥";
    const scene = generateScene({ prompt, seed: "volcanic-workshop-reservation", size: "large", density: 0.84 }, "adaptive");
    expect(scene.archetype).toBe("volcanic");
    const zones = (scene.terrainReservations ?? []).filter((zone) => zone.kind === "lava");
    expect(zones.length).toBeGreaterThanOrEqual(4);
    expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building" && building.archetype === "guild")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("climate:volcanic") && primitive.tags?.includes("heat-shield"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("cooled-stone-apron"))).toBe(true);
    const inspectionBridge = scene.primitives.find((primitive) => primitive.tags?.includes("volcanic-maintenance-bridge"));
    expect(inspectionBridge).toBeDefined();
    expect((inspectionBridge?.size.z ?? Number.POSITIVE_INFINITY) / GRID_METERS).toBeLessThan(15);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("volcanic-inspection-platform") && primitive.tags?.includes("standable"))).toBe(true);
    const protectedPieces = scene.primitives.filter((primitive) => ["building-pad", "generator-shed", "communications-tower"].some((tag) => primitive.tags?.includes(tag)) && !primitive.tags?.includes("vertical-route"));
    const overlapsZone = (primitive: typeof scene.primitives[number], zone: typeof zones[number]) => {
      const px = primitive.position.x / GRID_METERS;
      const pz = primitive.position.z / GRID_METERS;
      const halfX = primitive.size.x / GRID_METERS / 2;
      const halfZ = primitive.size.z / GRID_METERS / 2;
      const dx = px - zone.centerCells.x;
      const dz = pz - zone.centerCells.z;
      const cosine = Math.cos(zone.rotationY ?? 0);
      const sine = Math.sin(zone.rotationY ?? 0);
      const localX = dx * cosine - dz * sine;
      const localZ = dx * sine + dz * cosine;
      const footprintPadding = Math.max(halfX, halfZ);
      return Math.abs(localX) < footprintPadding + zone.sizeCells.x / 2 + zone.clearanceCells
        && Math.abs(localZ) < footprintPadding + zone.sizeCells.z / 2 + zone.clearanceCells;
    };
    expect(protectedPieces.length).toBeGreaterThan(5);
    expect(protectedPieces.every((primitive) => zones.every((zone) => !overlapsZone(primitive, zone)))).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("publishes narrow water ownership zones for river valleys", () => {
    const scene = generateScene({
      prompt: "弯曲河谷中的水文测量站，有瀑布、支流、深潭、样本实验室和通信塔",
      seed: "river-water-reservation-contract",
      size: "large",
      density: 0.76,
    }, "adaptive");
    const waterZones = (scene.terrainReservations ?? []).filter((zone) => zone.kind === "water");
    expect(scene.archetype).toBe("river-valley");
    expect(waterZones.length).toBeGreaterThan(8);
    expect(waterZones.some((zone) => zone.rotationY !== undefined && zone.sizeCells.z > zone.sizeCells.x)).toBe(true);
    expect(waterZones.some((zone) => zone.id === "river-deep-pool-reservation")).toBe(true);
  });

  it("keeps unfamiliar crater and rift facilities outside unstable terrain", () => {
    const cases = [
      {
        prompt: "巨大陨石撞击坑边缘的地震观测站，有样本实验室、通信塔、发电机棚和地下样本库",
        seed: "impact-facility-unstable-contract",
        archetype: "impact-crater",
        minimumZones: 5,
      },
      {
        prompt: "深裂谷西岸的地质研究站，有样本实验室、通信塔、发电机棚和地下样本库",
        seed: "rift-facility-unstable-contract",
        archetype: "rift",
        minimumZones: 8,
      },
    ] as const;
    for (const entry of cases) {
      const scene = generateScene({ prompt: entry.prompt, seed: entry.seed, size: "large", density: 0.78 }, "adaptive");
      const zones = (scene.terrainReservations ?? []).filter((zone) => zone.kind === "unstable");
      expect(scene.archetype).toBe(entry.archetype);
      expect(zones.length).toBeGreaterThanOrEqual(entry.minimumZones);
      expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building")).toBe(true);
      const protectedPieces = scene.primitives.filter((primitive) => ["building-pad", "generator-shed", "communications-tower"].some((tag) => primitive.tags?.includes(tag)) && !primitive.tags?.includes("vertical-route"));
      const overlapsZone = (primitive: typeof scene.primitives[number], zone: typeof zones[number]) => {
        const px = primitive.position.x / GRID_METERS;
        const pz = primitive.position.z / GRID_METERS;
        const halfX = primitive.size.x / GRID_METERS / 2;
        const halfZ = primitive.size.z / GRID_METERS / 2;
        const dx = px - zone.centerCells.x;
        const dz = pz - zone.centerCells.z;
        const cosine = Math.cos(zone.rotationY ?? 0);
        const sine = Math.sin(zone.rotationY ?? 0);
        const localX = dx * cosine - dz * sine;
        const localZ = dx * sine + dz * cosine;
        const footprintPadding = Math.max(halfX, halfZ);
        return Math.abs(localX) < footprintPadding + zone.sizeCells.x / 2 + zone.clearanceCells
          && Math.abs(localZ) < footprintPadding + zone.sizeCells.z / 2 + zone.clearanceCells;
      };
      expect(protectedPieces.length).toBeGreaterThan(5);
      expect(protectedPieces.every((primitive) => zones.every((zone) => !overlapsZone(primitive, zone)))).toBe(true);
      expect(scene.diagnostics.warnings).toHaveLength(0);
    }
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
    expect(tags.has("dirty-sample-bench")).toBe(true);
    expect(tags.has("clean-sample-bench")).toBe(true);
    expect(tags.has("clean-buffer")).toBe(true);
    const basementStairs = scene.primitives.filter((primitive) => primitive.shape === "stairs"
      && primitive.level === 3
      && primitive.tags?.includes("building-instance:wilderness-core-building"));
    expect(basementStairs).toHaveLength(2);
    expect(basementStairs.every((primitive) => primitive.tags?.includes("archive-access") && primitive.tags?.includes("stair-flight"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id === "wilderness-core-building-cellar-stair")).toBe(false);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("shaft-collar") && primitive.tags?.includes("top-portal"))).toBe(true);
    const basementFloorDatums = new Set(scene.primitives
      .filter((primitive) => primitive.level === 3
        && primitive.tags?.includes("building-instance:wilderness-core-building")
        && primitive.tags?.includes("floor"))
      .map((primitive) => primitive.position.y.toFixed(4)));
    expect(basementFloorDatums.size).toBe(1);
    expect(scene.viewProgram).toMatchObject({ version: 1, mode: "site", focusCells: building?.positionCells });
    expect(scene.viewProgram?.includeTags).toContain("site-program");
    expect(scene.diagnostics.warnings).toHaveLength(0);
    const alternateSeed = generateScene({ prompt, seed: "round48-field-station-b", size: "medium", density: 0.72 }, "adaptive");
    expect(alternateSeed.diagnostics.warnings).toHaveLength(0);
    expect(alternateSeed.primitives.some((primitive) => primitive.tags?.includes("room-connector") && primitive.tags?.includes("opening"))).toBe(true);
  });

  it("keeps polar ice-cap monitoring stations owned by wilderness terrain", () => {
    const prompt = "极地冰盖上的地震监测站，有钻芯实验室、通信桅杆、备用发电棚、防风入口和地下冰芯库";
    const scene = generateScene({ prompt, seed: "polar-site-ownership", size: "medium", density: 0.78 }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.sceneProgram?.domain).toBe("natural");
    expect(scene.archetype).toBe("ice");
    expect(scene.buildingInstances?.some((building) => building.id === "wilderness-core-building" && building.detailLevel === "full-interior")).toBe(true);
    expect(tags.has("ice-base-plate")).toBe(true);
    expect(tags.has("climate:polar")).toBe(true);
    expect(tags.has("polar-windbreak")).toBe(true);
    expect(tags.has("snow-fence")).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("does not let retrieval replace a named alpine parent with an unrelated water grammar", () => {
    const request = { prompt: "高山裸岩山脊上的地震监测站，有钻芯实验室和通信桅杆", seed: "alpine-site-ownership", size: "medium" as const, density: 0.72 };
    const composition = compileSceneComposition(request, "bge", ["water.meandering-channel", "water.waterfall"]);
    const scene = generateScene(request, "adaptive", undefined, undefined, composition);
    expect(composition.primaryDomain).toBe("generic");
    expect(composition.grammarId).toBe("grammar.generic-v1");
    expect(scene.sceneProgram?.domain).toBe("natural");
    expect(scene.archetype).toBe("mountain");
    expect(scene.compositionProgram?.semanticCoverage?.missing).not.toContain("主河道");
  });

  it("keeps an unfamiliar seismic monitoring station inside its natural parent", () => {
    const prompt = "高原泥炭湿地地震监测站，有钻芯实验室、样本清洗间、通信桅杆、备用发电棚、架高步道和地下岩芯库";
    const request = { prompt, seed: "seismic-parent-contract", size: "medium" as const, density: 0.74 };
    const scene = generateScene(request, "adaptive");
    const other = generateScene({ ...request, seed: "seismic-parent-contract-b" }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    const signature = (candidate: typeof scene) => candidate.primitives
      .filter((primitive) => primitive.tags?.some((tag) => tag === "wetland" || tag === "watercourse" || tag === "building-pad"))
      .map((primitive) => `${primitive.id}:${primitive.position.x.toFixed(2)}:${primitive.position.z.toFixed(2)}:${primitive.size.x.toFixed(2)}:${primitive.size.z.toFixed(2)}`)
      .join("|");
    expect(scene.sceneProgram?.domain).toBe("natural");
    expect(scene.archetype).toBe("swamp");
    expect(scene.buildingInstances?.some((building) => building.envelopeProgram?.variant.startsWith("field-"))).toBe(true);
    expect(tags.has("field-laboratory")).toBe(true);
    expect(tags.has("communications-tower")).toBe(true);
    expect(tags.has("generator-shed")).toBe(true);
    expect(tags.has("reserve-vault")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score).toBe(100);
    expect(scene.diagnostics.warnings).toHaveLength(0);
    expect(signature(scene)).not.toBe(signature(other));
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
