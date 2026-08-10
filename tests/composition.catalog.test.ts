import { describe, expect, it } from "vitest";
import { SPATIAL_ATOMS, auditAtomQuality, auditSemanticCoverage, catalogMaturity, compileSceneComposition } from "../src/composition";
import { generateScene } from "../src/generators";
import { GRID_METERS } from "../src/schema";

describe("five-layer composition catalog", () => {
  it("keeps production-ready atoms behind a non-trivial quality gate", () => {
    const ready = SPATIAL_ATOMS.filter((entry) => entry.status === "production-ready");
    expect(ready.length).toBeGreaterThan(5);
    expect(ready.map(auditAtomQuality).every((result) => result.ready && result.issues.length === 0)).toBe(true);
    const maturity = catalogMaturity();
    expect(maturity.validated + maturity["production-ready"]).toBeGreaterThan(maturity.planned);
    expect(SPATIAL_ATOMS.filter((entry) => entry.status === "validated" || entry.status === "production-ready")
      .every((entry) => !entry.geometryBuilder.startsWith("planned:"))).toBe(true);
  });

  it("only promotes atoms that have deterministic geometry evidence", () => {
    const upgraded = [
      "terrain.ravine",
      "ecology.root-network",
      "structure.room-cell",
      "state.collapse",
      "state.flood",
    ];
    for (const id of upgraded) {
      const entry = SPATIAL_ATOMS.find((atom) => atom.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.status, id).toBe("validated");
      expect(entry?.geometryBuilder.startsWith("planned:"), id).toBe(false);
      expect(auditAtomQuality(entry!).ready, id).toBe(true);
    }

    const rift = generateScene({ prompt: "弯曲裂谷把两岸完全切开，有深层裂谷底、两座桥和下降路线", seed: "atom-ravine-proof", size: "medium", density: 0.72 }, "adaptive");
    expect(rift.primitives.some((primitive) => primitive.tags?.includes("rift-bottom"))).toBe(true);
    expect(rift.primitives.filter((primitive) => primitive.tags?.includes("rift-crossing"))).toHaveLength(2);
    expect(rift.routes.some((route) => route.id === "rift-bottom-route")).toBe(true);

    const cave = generateScene({ prompt: "多腔体洞穴，有相邻通道、岩架、危险区和不同高度", seed: "atom-cave-proof", size: "large", density: 0.76 }, "cave");
    expect(cave.rooms.filter((room) => room.id.startsWith("cave-chamber-")).length).toBeGreaterThanOrEqual(4);
    expect(cave.primitives.some((primitive) => primitive.tags?.includes("ledge"))).toBe(true);
    expect(new Set(cave.rooms.filter((room) => room.id.startsWith("cave-chamber-")).map((room) => room.center.y)).size).toBeGreaterThan(1);

    const floating = generateScene({ prompt: "三层破碎浮空岛屿，有暴露底面、岛间深渊和垂直交通", seed: "atom-floating-proof", size: "medium", density: 0.74 }, "adaptive");
    const floatingLevels = new Set(floating.primitives.filter((primitive) => primitive.tags?.includes("floating-island")).map((primitive) => Math.round(primitive.position.y * 10)));
    expect(floatingLevels.size).toBeGreaterThanOrEqual(3);
    expect(floating.primitives.some((primitive) => primitive.tags?.includes("vertical-face"))).toBe(true);
    expect(floating.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(2);

    const tree = generateScene({ prompt: "巨大空心古树内部的学者聚落，有根桥、根系档案库和可攀爬根台", seed: "atom-root-proof", size: "medium", density: 0.68 }, "adaptive");
    expect(tree.primitives.some((primitive) => primitive.tags?.includes("root-archive"))).toBe(true);
    expect(tree.primitives.some((primitive) => primitive.tags?.includes("root-bridge") || primitive.tags?.includes("spiral-tree-street"))).toBe(true);

    const building = generateScene({ prompt: "被植物侵入且部分坍塌的哥特博物馆，有独立展厅、门窗、淹水地下库房和屋顶逃生路线", seed: "atom-building-proof", size: "medium", density: 0.72 }, "adaptive");
    const tags = new Set(building.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(building.rooms.length).toBeGreaterThanOrEqual(6);
    expect(tags.has("program-room")).toBe(true);
    expect(tags.has("door-frame")).toBe(true);
    expect(tags.has("window")).toBe(true);
    expect(tags.has("pitched-roof") || tags.has("parapet")).toBe(true);
    expect(tags.has("rubble")).toBe(true);
    expect(tags.has("temporary-bridge")).toBe(true);
    expect(tags.has("flooded")).toBe(true);
    expect(tags.has("overgrowth")).toBe(true);
    expect(building.routes.some((route) => route.id === "temporary-collapse-route")).toBe(true);
    expect(building.diagnostics.valid).toBe(true);

    expect(SPATIAL_ATOMS.find((atom) => atom.id === "structure.wall-opening")?.status).toBe("prototype");
    expect(SPATIAL_ATOMS.find((atom) => atom.id === "structure.roof-system")?.status).toBe("prototype");
    expect(SPATIAL_ATOMS.find((atom) => atom.id === "terrain.cave-chamber")?.status).toBe("prototype");
    expect(SPATIAL_ATOMS.find((atom) => atom.id === "terrain.floating-island")?.status).toBe("prototype");
    expect(SPATIAL_ATOMS.find((atom) => atom.id === "state.overgrowth")?.status).toBe("prototype");
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

  it("routes retrieved cave and floating atoms into existing deterministic generators", () => {
    const floatingRequest = { prompt: "悬空石盘之间的风剪聚落", seed: "bge-floating-domain", size: "medium" as const, density: 0.68 };
    const floatingComposition = compileSceneComposition(floatingRequest, "bge", ["terrain.floating-island", "route.vertical", "route.bridge"]);
    expect(floatingComposition.primaryDomain).toBe("floating");
    expect(floatingComposition.grammarId).toBe("grammar.floating-stack-v1");
    const floating = generateScene(floatingRequest, "wilderness", undefined, undefined, floatingComposition);
    expect(floating.archetype).toBe("floating-islands");
    expect(floating.primitives.some((primitive) => primitive.tags?.includes("vertical-face"))).toBe(true);

    const caveRequest = { prompt: "层叠岩腹中的回声腔群", seed: "bge-cave-domain", size: "large" as const, density: 0.7 };
    const caveComposition = compileSceneComposition(caveRequest, "bge", ["terrain.cave-chamber", "route.surface-trail", "route.vertical"]);
    expect(caveComposition.primaryDomain).toBe("cave");
    expect(caveComposition.grammarId).toBe("grammar.cave-network-v1");
    const cave = generateScene(caveRequest, "adaptive", undefined, undefined, caveComposition);
    expect(cave.archetype).toBe("cave");
    expect(cave.rooms.filter((room) => room.id.startsWith("cave-chamber-")).length).toBeGreaterThanOrEqual(4);
  });

  it("does not let a secondary abyss word steal a floating-island parent", () => {
    const request = { prompt: "三层破碎浮空岩岛群，岛屿有暴露底面、风剪深渊、悬索桥和垂直升降路线", seed: "floating-parent-precedence", size: "large" as const, density: 0.78 };
    const program = compileSceneComposition(request);
    expect(program.primaryDomain).toBe("floating");
    expect(program.grammarId).toBe("grammar.floating-stack-v1");
    const scene = generateScene(request, "adaptive");
    expect(scene.archetype).toBe("floating-islands");
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("builds coherent floating-island mass and supported suspension crossings", () => {
    const prompt = "三层破碎浮空岩岛群，岛屿有暴露底面、风剪深渊、悬索桥、垂直升降路线和上层观测平台";
    const request = { prompt, seed: "round60-floating-mass", size: "large" as const, density: 0.78 };
    const scene = generateScene(request, "adaptive");
    const surfaces = scene.primitives.filter((primitive) => primitive.id.includes("-surface-") && primitive.tags?.includes("floating-island"));
    const undersides = scene.primitives.filter((primitive) => primitive.tags?.includes("island-underside"));
    expect(undersides.length).toBe(surfaces.length);
    expect(new Set(undersides.map((primitive) => Math.round(primitive.size.y * 100))).size).toBeGreaterThanOrEqual(8);
    expect(new Set(undersides.filter((primitive) => primitive.tags?.includes("vertical-face")).map((primitive) => primitive.level))).toEqual(new Set([0, 1, 2]));
    const underbellyMasses = scene.primitives.filter((primitive) => primitive.tags?.includes("island-underbelly-mass"));
    expect(underbellyMasses.length).toBeGreaterThanOrEqual(9);
    expect(Math.min(...underbellyMasses.map((primitive) => primitive.position.y))).toBeGreaterThan(0);
    for (const underside of undersides) {
      const surface = surfaces.find((candidate) => candidate.id === underside.id.replace("-underside-", "-surface-"));
      expect(surface, underside.id).toBeDefined();
      expect(underside.position.y + underside.size.y).toBeCloseTo(surface!.position.y, 5);
    }
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("bridge-pylon")).length).toBeGreaterThanOrEqual(4);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("bridge-guardrail")).length).toBeGreaterThanOrEqual(12);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("suspension-chain")).length).toBeGreaterThanOrEqual(10);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("bridge-landing") && primitive.tags?.includes("standable") && primitive.tags?.includes("supported")).length).toBeGreaterThanOrEqual(4);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("lift-guide")).length).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("lift-chain")).length).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("lift-platform") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.routes.some((route) => route.id === "floating-chain-lift-route" && route.kind === "vertical")).toBe(true);

    const replay = generateScene(request, "adaptive");
    const signature = (candidate: typeof scene) => candidate.primitives
      .filter((primitive) => primitive.tags?.includes("island-underside"))
      .map((primitive) => [primitive.id, primitive.position.y, primitive.size.y]);
    const layoutSignature = (candidate: typeof scene) => {
      const firstSurfaceByIsland = new Map<string, [number, number]>();
      for (const primitive of candidate.primitives) {
        if (!primitive.id.includes("-surface-") || !primitive.tags?.includes("floating-island")) continue;
        const islandId = primitive.id.split("-surface-")[0]!;
        if (!firstSurfaceByIsland.has(islandId)) firstSurfaceByIsland.set(islandId, [primitive.position.x, primitive.position.z]);
      }
      return [...firstSurfaceByIsland.entries()].map(([islandId, [x, z]]) => [islandId, x, z]);
    };
    expect(signature(replay)).toEqual(signature(scene));

    const variant = generateScene({ ...request, seed: "round60-floating-variant" }, "adaptive");
    expect(signature(variant)).not.toEqual(signature(scene));
    expect(layoutSignature(variant)).not.toEqual(layoutSignature(scene));
    expect(variant.diagnostics.valid).toBe(true);
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

  it("gives dense water cities enough independent landmark interiors", () => {
    const scene = generateScene({
      prompt: "深水城河道水城，曲折主河、三条支流、石桥、木桥、水上市集、船坞、沿岸不规则街巷、神殿、巡逻塔和屋顶连桥",
      seed: "water-city-landmark-budget",
      size: "large",
      density: 0.78,
    }, "adaptive");
    const site = scene.siteProgram;
    expect(site?.parcelCount).toBeGreaterThanOrEqual(30);
    expect(site?.fullInteriorCount).toBeGreaterThanOrEqual(5);
    expect(scene.buildingInstances?.filter((building) => building.detailLevel === "full-interior").length).toBeGreaterThanOrEqual(5);
    expect(scene.buildingInstances?.some((building) => building.archetype === "shrine")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    const landmarkTags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(landmarkTags.has("bell-tower")).toBe(true);
    expect(landmarkTags.has("patrol-platform")).toBe(true);
    expect(landmarkTags.has("market-canopy-support")).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("roof-bridge")).length).toBeGreaterThanOrEqual(1);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("roof-bridge-landing")).length).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("roof-bridge-railing")).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps an unfamiliar salt-marsh academy village as a composite settlement", () => {
    const scene = generateScene({
      prompt: "建在盐沼旧水闸上的天文学院村镇，有潮汐沟渠、旋转观星穹顶、木栈桥、学生宿舍、泵房、钟塔和地下档案库",
      seed: "salt-marsh-academy-village",
      size: "medium",
      density: 0.68,
    }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.roadPattern).toBe("canal-banks");
    expect(scene.terrainProgram?.kind).toBe("river");
    expect(scene.buildingInstances?.some((building) => building.archetype === "guild")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "factory")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("archive"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("terrain-adapted") && primitive.tags?.includes("road"))).toBe(true);
    expect(scene.diagnostics.warnings).toHaveLength(0);
  });

  it("keeps a tidal mill alchemy town in the settlement domain", () => {
    const scene = generateScene({
      prompt: "建在旧潮汐磨坊群之间的炼金水镇，有泄洪渠、染坊、钟塔、木制水轮、屋顶货运桥、地下试剂库和河上巡逻岗",
      seed: "tidal-alchemy-town",
      size: "medium",
      density: 0.68,
    }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.roadPattern).toBe("canal-banks");
    expect(scene.terrainProgram?.kind).toBe("river");
    expect(scene.buildingInstances?.some((building) => building.archetype === "mill")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "factory")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("water-city"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("archive"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("roof-bridge"))).toBe(true);
    expect(scene.compositionProgram?.grammarId).toBe("grammar.water-city-v1");
    expect(scene.compositionProgram?.semanticCoverage?.score).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.warnings).toHaveLength(0);
    expect(scene.diagnostics.valid).toBe(true);
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

  it("honors explicit floor count and shelter geometry in a volcanic field station", () => {
    const prompt = "建在火山熔岩台地边缘的1920年代地质观测站，有玄武岩支撑基座、两层实验楼、地下避难所、熔岩沟、维修栈桥和屋顶观测平台";
    const scene = generateScene({ prompt, seed: "volcanic-two-floor-station", size: "large", density: 0.78 }, "adaptive");
    const building = scene.buildingInstances?.find((entry) => entry.id === "wilderness-core-building");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("volcanic");
    expect(building?.floors).toBe(2);
    expect(building?.floorHeightFeet).toHaveLength(2);
    expect(building?.detailLevel).toBe("full-interior");
    expect(tags.has("basalt-foundation")).toBe(true);
    expect(tags.has("field-laboratory")).toBe(true);
    expect(tags.has("bunker")).toBe(true);
    expect(tags.has("field-observation")).toBe(true);
    expect(tags.has("volcanic-maintenance-bridge")).toBe(true);
    expect(tags.has("lava-flow")).toBe(true);
    expect(scene.floorLabels).toContain("2F实验与通信层");
    expect(tags.has("radio-console")).toBe(true);
    expect(tags.has("chart-table")).toBe(true);
    expect(tags.has("instrument-rack")).toBe(true);
    const archiveFlights = scene.primitives.filter((primitive) => primitive.tags?.includes("archive-access") && primitive.tags?.includes("stair-flight"));
    expect(archiveFlights).toHaveLength(2);
    expect(Math.max(...archiveFlights.map((primitive) => primitive.size.y))).toBeLessThanOrEqual(1.84);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("stairwell-wall") && primitive.tags?.includes("structural-support"))).toHaveLength(3);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("landing-support") && primitive.tags?.includes("structural-support"))).toHaveLength(2);
    expect(scene.routes.some((route) => route.id === "volcanic-station-inspection-route")).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("uses volcanic density to change macro terrain structure, not only props", () => {
    const prompt = "火山熔岩台地，有破碎火山口、熔岩沟、黑曜石脊和战术玄武岩高台";
    const sparse = generateScene({ prompt, seed: "volcanic-density-contract", size: "large", density: 0.2 }, "adaptive");
    const dense = generateScene({ prompt, seed: "volcanic-density-contract", size: "large", density: 0.78 }, "adaptive");
    const count = (scene: typeof sparse, tag: string) => scene.primitives.filter((entry) => entry.tags?.includes(tag)).length;
    const terrainSignature = (scene: typeof sparse) => scene.primitives
      .filter((entry) => entry.tags?.includes("volcanic") || entry.tags?.includes("lava-flow") || entry.tags?.includes("obsidian-ridge"))
      .map((entry) => `${entry.id}:${entry.position.x.toFixed(2)}:${entry.position.z.toFixed(2)}:${entry.size.x.toFixed(2)}:${entry.size.z.toFixed(2)}`)
      .join("|");
    expect(count(dense, "lava-flow")).toBeGreaterThan(count(sparse, "lava-flow"));
    expect(count(dense, "obsidian-ridge")).toBeGreaterThanOrEqual(count(sparse, "obsidian-ridge"));
    expect(terrainSignature(dense)).not.toBe(terrainSignature(sparse));
    expect(sparse.diagnostics.warnings).toHaveLength(0);
    expect(dense.diagnostics.warnings).toHaveLength(0);
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

  it.each([
    {
      prompt: "原始森林山脊上的废弃天文台，有观星穹顶、校准室、地下星图档案库和树冠维护栈道",
      seed: "forest-observatory-contract",
      archetype: "forest",
      buildingKind: "guild",
      variantPrefix: "observatory-",
      required: ["star-dome", "instrument-lab", "darkroom-archive"],
      geometryTags: ["telescope", "chart-archive"],
    },
    {
      prompt: "火山裂谷中的黑铁铸造所，有熔炉大厅、淬火池、矿石库和跨越熔岩沟的检修桥",
      seed: "volcanic-forge-contract",
      archetype: "rift",
      buildingKind: "blacksmith",
      variantPrefix: "forge-",
      required: ["forge-hall", "smelter", "ore-store"],
      geometryTags: ["furnace", "quench-bay"],
    },
    {
      prompt: "冰原裂缝边缘的废弃疗养站，有病房、治疗室、地下锅炉房和防风入口",
      seed: "ice-sanatorium-contract",
      archetype: "ice",
      buildingKind: "clinic",
      variantPrefix: "sanatorium-",
      required: ["sanatorium-reception", "patient-ward", "boiler-archive"],
      geometryTags: ["patient-ward", "boiler"],
    },
  ] as const)("builds a distinct $variantPrefix profile inside its natural parent", ({ prompt, seed, archetype, buildingKind, variantPrefix, required, geometryTags }) => {
    const scene = generateScene({ prompt, seed, size: "large", density: 0.76 }, "adaptive");
    const alternate = generateScene({ prompt, seed: `${seed}-b`, size: "large", density: 0.76 }, "adaptive");
    const building = scene.buildingInstances?.find((entry) => entry.id === "wilderness-core-building");
    const tagSet = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    const signature = (candidate: typeof scene) => candidate.primitives
      .filter((primitive) => primitive.tags?.some((tag) => tag === "terrain" || tag === "building-pad" || tag.startsWith("site-profile:")))
      .map((primitive) => `${primitive.id}:${primitive.position.x.toFixed(2)}:${primitive.position.z.toFixed(2)}:${primitive.size.x.toFixed(2)}:${primitive.size.z.toFixed(2)}`)
      .join("|");
    expect(scene.archetype).toBe(archetype);
    expect(scene.sceneProgram?.domain).toBe("natural");
    expect(building?.archetype).toBe(buildingKind);
    expect(building?.detailLevel).toBe("full-interior");
    expect(building?.envelopeProgram?.variant.startsWith(variantPrefix)).toBe(true);
    expect(building?.buildingProgram?.requiredFeatures).toEqual(expect.arrayContaining([...required]));
    for (const tag of geometryTags) expect(tagSet.has(tag)).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-building-access")).toBe(true);
    expect(scene.rooms.some((room) => room.id === "wilderness-core-building-room")).toBe(true);
    expect(scene.diagnostics.warnings, scene.diagnostics.warnings.join("\n")).toHaveLength(0);
    expect(alternate.diagnostics.warnings, alternate.diagnostics.warnings.join("\n")).toHaveLength(0);
    expect(signature(alternate)).not.toBe(signature(scene));
  });

  it.each([
    {
      prompt: "沼泽中的废弃钟表修复所，有机械工坊、零件档案室、屋顶信号平台和地下防潮库",
      seed: "custom-clock-repair",
      archetype: "swamp",
      kind: "factory",
      features: ["workshop", "archive", "observation", "prompt-derived-space"],
    },
    {
      prompt: "高山峡谷中的古生物标本馆，有标本处理室、收藏档案库、屋顶骨架观察台和地下储藏室",
      seed: "custom-specimen-hall",
      archetype: "mountain",
      kind: "guild",
      features: ["laboratory", "archive", "observation", "prompt-derived-space"],
    },
    {
      prompt: "冰原上的飞艇系留塔，有维护车间、气囊仓、屋顶系留平台和地下燃料库",
      seed: "custom-airship-mooring",
      archetype: "ice",
      kind: "tower",
      features: ["workshop", "archive", "observation", "prompt-derived-space"],
    },
  ] as const)("composes an unknown facility noun from semantic spaces: $seed", ({ prompt, seed, archetype, kind, features }) => {
    const sparse = generateScene({ prompt, seed, size: "large", density: 0.28 }, "adaptive");
    const dense = generateScene({ prompt, seed, size: "large", density: 0.86 }, "adaptive");
    const alternate = generateScene({ prompt, seed: `${seed}-b`, size: "large", density: 0.86 }, "adaptive");
    const building = dense.buildingInstances?.find((entry) => entry.id === "wilderness-core-building");
    const tags = new Set(dense.primitives.flatMap((primitive) => primitive.tags ?? []));
    const structuralSignature = (scene: typeof dense) => scene.primitives
      .filter((primitive) => primitive.tags?.some((tag) => tag === "terrain" || tag === "building-pad" || tag === "prompt-derived-space"))
      .map((primitive) => `${primitive.id}:${primitive.position.x.toFixed(2)}:${primitive.position.z.toFixed(2)}:${primitive.size.x.toFixed(2)}:${primitive.size.z.toFixed(2)}`)
      .join("|");
    expect(dense.archetype).toBe(archetype);
    expect(dense.sceneProgram?.domain).toBe("natural");
    expect(building?.archetype).toBe(kind);
    expect(building?.detailLevel).toBe("full-interior");
    expect(building?.buildingProgram?.requiredFeatures).toEqual(expect.arrayContaining([...features]));
    expect(tags.has("prompt-derived-space")).toBe(true);
    expect(tags.has("building-state:abandoned")).toBe(prompt.includes("废弃"));
    expect(dense.routes.some((route) => route.id === "wilderness-building-access")).toBe(true);
    expect(dense.diagnostics.warnings, dense.diagnostics.warnings.join("\n")).toHaveLength(0);
    expect(sparse.diagnostics.warnings, sparse.diagnostics.warnings.join("\n")).toHaveLength(0);
    expect(alternate.diagnostics.warnings, alternate.diagnostics.warnings.join("\n")).toHaveLength(0);
    expect(structuralSignature(alternate)).not.toBe(structuralSignature(dense));
    expect(structuralSignature(sparse)).not.toBe(structuralSignature(dense));
    if (archetype === "swamp") {
      const reedCount = (scene: typeof dense) => scene.primitives.filter((primitive) => primitive.tags?.includes("reed")).length;
      expect(reedCount(dense)).toBeGreaterThan(reedCount(sparse));
    } else {
      expect(dense.primitives.length).not.toBe(sparse.primitives.length);
    }
    if (seed === "custom-airship-mooring") {
      const deck = dense.primitives.find((primitive) => primitive.id === "wilderness-custom-airship-mooring-deck");
      const expectedRoofY = (building?.baseYMeters ?? 0) + (building?.exteriorHeightMeters ?? 0);
      expect(deck?.position.y).toBeCloseTo(expectedRoofY, 5);
      expect(dense.primitives.some((primitive) => primitive.id === "wilderness-core-building-gable-roof")).toBe(false);
      expect(dense.primitives.some((primitive) => primitive.tags?.includes("gas-cell-store"))).toBe(true);
      expect(dense.primitives.some((primitive) => primitive.tags?.includes("fuel-bunker"))).toBe(true);
      expect(dense.primitives.filter((primitive) => primitive.tags?.includes("stacked-stair")).length).toBeGreaterThanOrEqual((building?.floors ?? 1) - 1);
      expect(dense.routes.some((route) => route.id === "wilderness-custom-airship-roof-route")).toBe(true);
    }
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
