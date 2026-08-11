import { describe, expect, it } from "vitest";
import { generateScene, generatorRegistry } from "../src/generators";
import { SeededRandom } from "../src/core/random";
import { instantiateBuildingModule } from "../src/generators/buildingModule";
import { baseScene, rectangularShell } from "../src/generators/shared";
import { GRID_METERS, type GeneratedScene, type GenerationRequest, type SceneKind, type SettlementBuildingKind } from "../src/schema";
import { floorBaseY, floorContextLevels, focusedCameraFactors, fogDensityForSpan, levelForY, overlayTouchesFloor, primitiveTouchesFloorContext, routeMatchesTime, spatialBatchKey } from "../src/render/SceneRenderer";
import { planSettlementSite } from "../src/site-program";

const request = (seed: string, size: GenerationRequest["size"] = "medium", density = 0.64): GenerationRequest => ({
  prompt: "A tactical location with routes, cover, height, and a meaningful encounter objective.",
  seed,
  size,
  density,
});

function hasTag(scene: GeneratedScene, tag: string): boolean {
  return scene.primitives.some((primitive) => primitive.tags?.includes(tag));
}

function hasRoomRole(scene: GeneratedScene, role: GeneratedScene["rooms"][number]["role"]): boolean {
  return scene.rooms.some((room) => room.role === role);
}

describe("scene generators", () => {
  it("maps diagnostic overlays to logical floors and filters single-floor views", () => {
    const scene = generateScene(request("overlay-floor-contract"), "tower");
    const bases = [0];
    for (let level = 1; level < scene.floors; level += 1) {
      bases.push((bases[level - 1] ?? 0) + (scene.floorHeightFeet[level - 1] ?? 10) * 0.3048);
    }
    for (const [level, baseY] of bases.entries()) {
      expect(levelForY(scene, baseY)).toBe(level);
    }
    expect(overlayTouchesFloor([0, 1], 0)).toBe(true);
    expect(overlayTouchesFloor([0, 1], 2)).toBe(false);
    expect(overlayTouchesFloor([2], "cut")).toBe(true);
    expect(overlayTouchesFloor([2], "roof")).toBe(true);
  });

  it("keeps the tactical grid aligned with every authored floor base", () => {
    const scene = generateScene(request("grid-floor-contract"), "tower");
    expect(scene.floors).toBeGreaterThanOrEqual(2);
    for (let level = 0; level < scene.floors; level += 1) {
      const baseY = floorBaseY(scene, level);
      expect(levelForY(scene, baseY)).toBe(level);
      expect(baseY).toBeCloseTo((level === 0 ? 0 : scene.floorHeightFeet.slice(0, level).reduce((sum, feet) => sum + feet, 0) * 0.3048));
    }
  });

  it("reduces fog density as generated maps grow", () => {
    expect(fogDensityForSpan(25)).toBe(0.009);
    expect(fogDensityForSpan(160)).toBeLessThan(0.003);
    expect(fogDensityForSpan(160)).toBeGreaterThanOrEqual(0.0014);
  });

  it("uses a genuinely lower and closer camera for focused-building mass inspection", () => {
    const overview = focusedCameraFactors("overview", false);
    const low = focusedCameraFactors("low", false);
    expect(low.horizontalDistance).toBeLessThan(overview.horizontalDistance);
    expect(low.verticalDistanceFactor).toBeLessThan(overview.verticalDistanceFactor);
    expect(low.verticalSpanFactor).toBeLessThan(overview.verticalSpanFactor);
    expect(low.targetHeightFraction).toBeLessThan(overview.targetHeightFraction);
    expect(focusedCameraFactors("low", true).spanScale).toBeLessThan(low.spanScale);
  });

  it("keeps small maps in one render batch region and partitions large districts", () => {
    const smallBounds = { minX: 0, maxX: 30, minZ: 0, maxZ: 30 };
    expect(spatialBatchKey({ x: 2, z: 2 }, smallBounds)).toBe("whole-scene");
    const cityBounds = { minX: 0, maxX: 160, minZ: 0, maxZ: 120 };
    expect(spatialBatchKey({ x: 5, z: 5 }, cityBounds)).not.toBe(spatialBatchKey({ x: 150, z: 110 }, cityBounds));
  });

  it("filters scheduled route layers without hiding all-day routes", () => {
    expect(routeMatchesTime("day", "day")).toBe(true);
    expect(routeMatchesTime("day", "night")).toBe(false);
    expect(routeMatchesTime("night", "night")).toBe(true);
    expect(routeMatchesTime("all", "night")).toBe(true);
  });

  it("keeps only explicitly linked cross-storey interface pieces in numeric floor context", () => {
    const linked = { level: 0, tags: ["maintenance-catwalk", "floor-context:3", "floor-context:3"] };
    const ordinary = { level: 0, tags: ["floor"] };
    expect(floorContextLevels(linked)).toEqual([3]);
    expect(primitiveTouchesFloorContext(linked, 0)).toBe(true);
    expect(primitiveTouchesFloorContext(linked, 3)).toBe(true);
    expect(primitiveTouchesFloorContext(linked, 2)).toBe(false);
    expect(primitiveTouchesFloorContext(ordinary, 3)).toBe(false);
  });

  it("registers each fixed topology", () => {
    expect(Object.keys(generatorRegistry).sort()).toEqual(["building", "cave", "dungeon", "settlement", "sewer", "tavern", "tower", "wilderness"]);
  });

  it.each(["tavern", "tower", "sewer", "cave", "dungeon", "building", "settlement", "wilderness"] as const)("is seed-reproducible and validated for %s", (kind) => {
    const first = generateScene(request(`repeatable-${kind}`), kind);
    const second = generateScene(request(`repeatable-${kind}`), kind);
    expect(first).toEqual(second);
    expect(first.kind).toBe(kind);
    expect(first.diagnostics.valid).toBe(true);
    expect(first.diagnostics.metrics.errorCount).toBe(0);
    expect(first.diagnostics.repairs).toEqual([]);
    expect(first.primitives.length).toBeGreaterThan(0);
    expect(first.rooms.length).toBeGreaterThan(1);
    expect(first.routes.some((route) => route.kind === "primary")).toBe(true);
    expect(first.tactical.some((feature) => feature.kind === "entrance")).toBe(true);
  });

  it("does not reduce all seeds to one fixed map", () => {
    const kinds: readonly Exclude<SceneKind, "adaptive">[] = ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness"];
    for (const kind of kinds) {
      const first = generateScene(request(`${kind}-variation-a`), kind);
      const second = generateScene(request(`${kind}-variation-b`), kind);
      expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    }
  });

  it("uses prompt semantics as a deterministic variation stream", () => {
    const seed = "same-seed-different-prompt";
    const crystal = generateScene({ ...request(seed), prompt: "幽暗洞窟，水晶桥和地下湖" }, "adaptive");
    const lava = generateScene({ ...request(seed), prompt: "幽暗洞窟，熔岩裂缝和崩塌矿道" }, "adaptive");
    expect(crystal).not.toEqual(lava);
    expect(crystal.diagnostics.valid).toBe(true);
    expect(lava.diagnostics.valid).toBe(true);
  });

  it("emits cleanly valid output across a small seed/scale matrix", () => {
    const kinds: readonly Exclude<SceneKind, "adaptive">[] = ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness"];
    const sizes: readonly GenerationRequest["size"][] = ["small", "medium", "large"];
    for (const kind of kinds) {
      for (const size of sizes) {
        for (let index = 0; index < 8; index += 1) {
          const scene = generateScene(request(`${kind}-${size}-matrix-${index}`, size, index / 7), kind);
          expect(scene.diagnostics.valid).toBe(true);
          expect(scene.diagnostics.repairs).toEqual([]);
        }
      }
    }
  });

  it("builds a tavern with public, service, guest, and vertical circulation spaces", () => {
    const scene = generateScene(request("tavern-contract", "large", 0.8), "tavern");
    expect(scene.floors).toBeGreaterThanOrEqual(1);
    expect(scene.floors).toBeLessThanOrEqual(3);
    expect(hasRoomRole(scene, "public")).toBe(true);
    expect(hasRoomRole(scene, "service")).toBe(true);
    expect(hasRoomRole(scene, "private")).toBe(true);
    expect(hasTag(scene, "stairs")).toBe(true);
    expect(scene.routes.some((route) => route.kind === "vertical")).toBe(true);
  });

  it("selects distinct building grammars without reducing them to a tavern shell", () => {
    const church = generateScene({ ...request("building-church"), prompt: "一座有中轴圣所和钟楼的教堂" }, "building");
    const manor = generateScene({ ...request("building-manor"), prompt: "有庭院、翼楼和家族厅的庄园" }, "building");
    const workshop = generateScene({ ...request("building-workshop"), prompt: "带熔炉、作业跨和上层猫道的工坊" }, "building");
    expect(church.diagnostics.valid && manor.diagnostics.valid && workshop.diagnostics.valid).toBe(true);
    expect(church.archetype).toBe("church");
    expect(manor.archetype).toBe("manor");
    expect(workshop.archetype).toBe("workshop");
    expect(church.primitives.some((primitive) => primitive.tags?.includes("altar"))).toBe(true);
    expect(manor.primitives.some((primitive) => primitive.tags?.includes("courtyard"))).toBe(true);
    expect(workshop.primitives.some((primitive) => primitive.tags?.includes("forge"))).toBe(true);
  });

  it("uses fortification and mining grammars with their own vertical/tactical logic", () => {
    const fortress = generateScene({ ...request("building-fortress"), prompt: "有门楼、角塔和墙头通道的堡垒", size: "large" }, "building");
    const mine = generateScene({ ...request("building-mine"), prompt: "有矿车巷道、竖井和上下作业层的矿井", size: "large" }, "building");
    expect(fortress.archetype).toBe("fortress");
    expect(mine.archetype).toBe("mine");
    expect(fortress.diagnostics.valid).toBe(true);
    expect(mine.diagnostics.valid).toBe(true);
    expect(hasTag(fortress, "curtain-wall")).toBe(true);
    expect(hasTag(fortress, "corner-tower")).toBe(true);
    expect(hasTag(mine, "cart-track")).toBe(true);
    expect(mine.routes.some((route) => route.kind === "vertical")).toBe(true);
  });

  it("uses distinct room graphs and fixtures for each dungeon style", () => {
    const styles = [
      ["crypt", "墓穴地牢", "sarcophagus"],
      ["temple", "神殿地牢", "altar"],
      ["mine", "矿井地牢", "ore-cart"],
      ["prison", "监狱地牢", "bars"],
      ["lair", "龙巢地牢", "hoard"],
      ["sewer", "下水道地牢", "channel"],
      ["arcane", "奥术法师地牢", "arcane-node"],
    ] as const;
    const signatures = new Set<string>();
    for (const [style, prompt, fixture] of styles) {
      const scene = generateScene({ ...request("dungeon-style-contract", "large", 0.8), prompt }, "dungeon");
      expect(scene.archetype).toBe(`dungeon:${style}`);
      expect(hasTag(scene, fixture)).toBe(true);
      expect(scene.diagnostics.valid).toBe(true);
      signatures.add(scene.rooms.slice(0, 8).map((room) => `${room.center.x.toFixed(1)},${room.center.z.toFixed(1)}`).join("|"));
    }
    expect(signatures.size).toBe(styles.length);
  });

  it.each([
    ["church", "教堂"],
    ["temple", "神殿"],
    ["manor", "庄园"],
    ["barracks", "兵营"],
    ["library", "图书馆"],
    ["workshop", "工坊"],
    ["warehouse", "仓库"],
    ["fortress", "堡垒"],
    ["mine", "矿井"],
  ] as const)("validates the %s building grammar across scale bands", (archetype, prompt) => {
    for (const size of ["small", "medium", "large"] as const) {
      const scene = generateScene({ ...request(`building-${archetype}-${size}`), prompt, size }, "building");
      expect(scene.archetype).toBe(archetype);
      expect(scene.diagnostics.valid).toBe(true);
      expect(scene.diagnostics.repairs).toEqual([]);
    }
  });

  it.each([
    ["hospital", "1920年代 CoC 医院"],
    ["planetarium", "天文馆与旋转穹顶"],
    ["museum", "CoC 博物馆与封闭档案室"],
    ["police", "1920年代 CoC 警察局与证物室"],
    ["school", "现代学校与中央操场"],
    ["hotel", "1920年代酒店与宴会厅"],
  ] as const)("validates the specialised %s grammar across scale bands", (archetype, prompt) => {
    for (const size of ["small", "medium", "large"] as const) {
      const scene = generateScene({ ...request(`special-building-${archetype}-${size}`, size, 0.72), prompt }, "building");
      expect(scene.archetype).toBe(archetype);
      expect(scene.diagnostics.valid).toBe(true);
      expect(scene.diagnostics.metrics.errorCount).toBe(0);
    }
  });

  it("makes institutional density structurally visible", () => {
    for (const prompt of ["医院", "天文馆", "博物馆", "警察局", "学校", "酒店"] as const) {
      const sparse = generateScene({ ...request(`building-density-${prompt}`, "large", 0), prompt }, "building");
      const dense = generateScene({ ...request(`building-density-${prompt}`, "large", 1), prompt }, "building");
      expect(dense.primitives.length).toBeGreaterThan(sparse.primitives.length);
      expect(sparse.diagnostics.valid && dense.diagnostics.valid).toBe(true);
    }
  });

  it("plans a settlement as roads, districts, landmarks, and independent building modules", () => {
    const harbor = generateScene({ ...request("settlement-harbor"), prompt: "繁忙港区的仓库、市场和码头", size: "large" }, "settlement");
    expect(harbor.diagnostics.valid).toBe(true);
    expect(harbor.archetype).toBe("harbor");
    expect(hasTag(harbor, "road")).toBe(true);
    expect(hasTag(harbor, "settlement-building")).toBe(true);
    expect(hasTag(harbor, "harbor-edge")).toBe(true);
    expect(harbor.rooms.some((room) => room.name.includes("plaza")) || harbor.rooms.some((room) => room.name.includes("Plaza"))).toBe(true);
    expect(harbor.routes.some((route) => route.kind === "primary")).toBe(true);
    expect(harbor.rooms.filter((room) => room.id.startsWith("settlement-building-")).length).toBeGreaterThanOrEqual(4);
    expect(harbor.primitives.filter((primitive) => primitive.tags?.includes("road")).length).toBeGreaterThanOrEqual(8);
    expect(harbor.routes.some((route) => route.purpose === "crowd" && (route.traffic ?? 0) > 0.8)).toBe(true);
    expect(harbor.routes.some((route) => route.purpose === "service")).toBe(true);
    expect(harbor.buildingInstances?.every((building) => harbor.rooms.some((room) => room.id === `${building.id}-room`))).toBe(true);
    expect(harbor.buildingInstances?.every((building) => ["mass", "facade", "full-interior"].includes(building.detailLevel) && building.seed.length > 0)).toBe(true);
    expect(harbor.buildingInstances?.filter((building) => building.detailLevel === "full-interior").length).toBeGreaterThanOrEqual(3);
    expect(harbor.primitives.some((primitive) => primitive.level === 1 && primitive.tags?.includes("upper-floor"))).toBe(true);
    expect(harbor.primitives.some((primitive) => primitive.level === 3 && primitive.tags?.includes("underground"))).toBe(true);
    expect(harbor.siteProgram?.siteType).toBe("harbor-district");
    expect(harbor.primitives.filter((primitive) => primitive.tags?.includes("dock")).length).toBe(6);
  });

  it("separates daytime crowds from night watch routes in walled settlements", () => {
    const city = generateScene({ ...request("settlement-time-layers", "large", 0.8), prompt: "有城墙、市场和巡逻的大型城市" }, "settlement");
    expect(city.routes.some((route) => route.schedule === "day" && route.purpose === "crowd")).toBe(true);
    expect(city.routes.some((route) => route.schedule === "night" && route.id.includes("night-watch"))).toBe(true);
    expect(city.routes.some((route) => route.schedule === "all")).toBe(true);
  });

  it("gives each settlement building archetype an independent seeded exterior grammar", () => {
    const kinds: readonly SettlementBuildingKind[] = ["home", "tavern", "shrine", "warehouse", "tower", "manor"];
    const signatures = new Set<string>();
    for (const [index, kind] of kinds.entries()) {
      const scene = baseScene("settlement", "Module test", "Independent module", `module-${kind}`, { x: 20, z: 20 }, 1, [10]);
      const instance = instantiateBuildingModule(scene, {
        id: `module-${kind}`,
        kind,
        x: 10,
        z: 10,
        width: kind === "warehouse" || kind === "manor" ? 9 : 6,
        depth: kind === "manor" ? 8 : 6,
        rotation: index * 0.11,
        district: "test",
        seed: `module-seed-${kind}`,
      }, new SeededRandom(`module-seed-${kind}`));
      expect(instance.archetype).toBe(kind);
      expect(instance.floorHeightFeet).toHaveLength(instance.floors);
      expect(scene.primitives.every((primitive) => primitive.tags?.includes("independent-building-module"))).toBe(true);
      signatures.add(scene.primitives.map((primitive) => primitive.tags?.find((tag) => tag.startsWith("module-part:")) ?? primitive.shape).join("|"));
    }
    expect(signatures.size).toBe(kinds.length);
  });

  it("keeps one seeded BuildingEnvelopeProgram across mass, facade, and full-interior LODs", () => {
    for (const kind of ["home", "tavern", "shrine", "warehouse", "manor"] as const) {
      const signatures = new Set<string>();
      for (const lod of ["mass", "facade", "full-interior"] as const) {
        const seed = `stable-envelope-${kind}`;
        const scene = baseScene("settlement", "Envelope test", "Stable envelope", seed, { x: 20, z: 20 }, 4, [10, 10, 10, 10]);
        const instance = instantiateBuildingModule(scene, { id: `${kind}-${lod}`, kind, x: 10, z: 10, width: 9, depth: 8, rotation: 0.18, district: "test", seed, lod }, new SeededRandom(seed));
        expect(instance.envelopeProgram?.partCount).toBeGreaterThanOrEqual(2);
        expect(scene.primitives.some((primitive) => primitive.tags?.includes("envelope-part"))).toBe(true);
        if (lod === "mass") {
          expect(scene.primitives.some((primitive) => primitive.tags?.includes("mass-silhouette"))).toBe(true);
          expect(scene.primitives.some((primitive) => primitive.tags?.includes("facade-landmark"))).toBe(true);
        }
        signatures.add(instance.envelopeProgram?.silhouetteSignature ?? "missing");
      }
      expect(signatures.size).toBe(1);
    }
  });

  it("derives frontage parcels from road-bounded blocks and changes the graph with density", () => {
    const prompt = "1920年代城市工业街区，有铁路货场、厂房、工人住宅、仓库和后巷";
    const make = (density: number) => {
      const generationRequest = { ...request(`r12-urban-${density}`, "large", density), prompt };
      return planSettlementSite({ request: generationRequest, archetype: "city" }, new SeededRandom(generationRequest.seed));
    };
    const sparse = make(0.2);
    const dense = make(0.95);
    expect(dense.roads.length).toBeGreaterThan(sparse.roads.length);
    expect(dense.diagnostics.roadLengthCells).toBeGreaterThan(sparse.diagnostics.roadLengthCells);
    expect(dense.blocks.length).toBeGreaterThan(sparse.blocks.length);
    expect(dense.parcels.length).toBeGreaterThan(sparse.parcels.length);
    expect(dense.roadNodes.some((node) => node.kind === "junction" && node.roadIds.length > 1)).toBe(true);
    expect(dense.blocks.every((block) => block.frontageRoadIds.length > 0)).toBe(true);
    for (const parcel of dense.parcels) {
      const block = dense.blocks.find((candidate) => candidate.id === parcel.blockId);
      expect(block).toBeDefined();
      expect(Math.abs(parcel.center.x - (block?.center.x ?? 0))).toBeLessThanOrEqual((block?.size.x ?? 0) / 2);
      expect(Math.abs(parcel.center.z - (block?.center.z ?? 0))).toBeLessThanOrEqual((block?.size.z ?? 0) / 2);
      expect(parcel.buildingSize.x).toBeLessThanOrEqual(parcel.size.x);
      expect(parcel.buildingSize.z).toBeLessThanOrEqual(parcel.size.z);
      expect(parcel.frontageRoadId.length).toBeGreaterThan(0);
    }
  });

  it("realizes special settlement morphologies as physical geometry", () => {
    const cases = [
      ["河道交错的水城街区，有主运河、支流、石桥和木桥", "main-canal"],
      ["被战争破坏的城市街区，有坍塌住宅、临时街垒、破损道路和绕行小巷", "war-damaged"],
      ["建在巨型桥墩之间的垂直贫民街区，有多层棚屋、吊桥和桥下维修区", "vertical-slum"],
      ["火星殖民地港口区，有气闸主路、温室、控制塔和地下生命维持层", "colony-port"],
      ["中世纪城门街区，城门到市场的主干路与城墙维护路线", "gate-district"],
    ] as const;
    for (const [prompt, tag] of cases) {
      const scene = generateScene({ ...request(`r12-special-${tag}`, "medium", 0.68), prompt }, "adaptive");
      expect(hasTag(scene, tag)).toBe(true);
      expect(scene.diagnostics.valid).toBe(true);
    }
  });

  it("prefers a specific harbor grammar inside a named city", () => {
    const harborDistrict = generateScene({ ...request("settlement-deepwater-harbor"), prompt: "深水城港区的仓库、市场和码头", size: "large" }, "settlement");
    expect(harborDistrict.archetype).toBe("harbor");
    expect(hasTag(harborDistrict, "harbor-edge")).toBe(true);
    expect(hasTag(harborDistrict, "main-canal")).toBe(false);
  });

  it("distinguishes a named fantasy harbor from a literal canal city", () => {
    const harbor = generateScene({ ...request("r12-deepwater-not-canal", "large", 0.78), prompt: "深水城港区，有弯曲海岸、六码头、沿岸货运大道和仓储街区" }, "adaptive");
    const canalCity = generateScene({ ...request("r12-literal-water-city", "large", 0.78), prompt: "河道交错的水城街区，有主运河、支流、石桥和木桥" }, "adaptive");
    expect(harbor.sceneProgram?.domain).toBe("settlement");
    expect(harbor.compositionProgram?.primaryDomain).toBe("settlement");
    expect(harbor.compositionProgram?.grammarId).toBe("grammar.settlement-compound-v1");
    expect(hasTag(harbor, "harbor-edge")).toBe(true);
    expect(hasTag(harbor, "main-canal")).toBe(false);
    expect(harbor.compositionProgram?.semanticCoverage?.missing).not.toContain("弯曲主河道");
    expect(harbor.compositionProgram?.semanticCoverage?.missing).not.toContain("支流网络");
    expect(canalCity.compositionProgram?.primaryDomain).toBe("river");
    expect(canalCity.compositionProgram?.grammarId).toBe("grammar.water-city-v1");
    expect(hasTag(canalCity, "main-canal")).toBe(true);
  });

  it("does not promote a named old-harbor district to a canal city just because it has docks", () => {
    const prompt = "深水城旧城区与河港交界，有弯曲街巷、石木混合民居、酒馆、神殿、仓库、塔楼、门廊、烟囱和码头装卸区";
    const scene = generateScene({ ...request("round72-mass-city", "large", 0.76), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.compositionProgram?.primaryDomain).toBe("settlement");
    expect(scene.compositionProgram?.grammarId).toBe("grammar.settlement-compound-v1");
    expect(scene.siteProgram?.siteType).toBe("harbor-district");
    expect(scene.siteProgram?.roadPattern).toBe("harbor-spine");
    expect(hasTag(scene, "main-canal")).toBe(false);
    expect(scene.diagnostics.warnings.some((warning) => warning.includes("弯曲主河道") || warning.includes("支流网络"))).toBe(false);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("keeps explicit city landmarks as independent building instances", () => {
    const prompt = "D&D 深水城港区，沿海崖和旧城坡地展开，有弯曲石板主街、鱼市码头、法师塔、神殿、酒馆、贫民巷、城墙门楼和跨运河石桥";
    const scene = generateScene({ ...request("round70-deepwater-landmarks", "medium", 0.62), prompt }, "adaptive");
    expect(scene.siteProgram?.siteType).toBe("harbor-district");
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "shrine")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "tavern")).toBe(true);
    expect(scene.buildingInstances?.every((building) => Boolean(building.buildingProgram))).toBe(true);
    const wizardTower = scene.buildingInstances?.find((building) => building.archetype === "tower");
    expect(wizardTower?.buildingProgram?.requiredFeatures).toContain("alchemy-laboratory");
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("spell-library"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("telescope"))).toBe(true);
    const spiralSteps = scene.primitives.filter((primitive) => primitive.tags?.includes("spiral-stair"));
    expect(spiralSteps.length).toBeGreaterThanOrEqual(((wizardTower?.floors ?? 1) - 1) * 18);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("stair-opening")).length).toBeGreaterThanOrEqual((wizardTower?.floors ?? 1) - 1);
    expect(scene.routes.some((route) => route.id.includes("wizard-spiral-route") && route.points.length >= (wizardTower?.floors ?? 1))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("cliff-upper-route"))).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("cliff-descent")).length).toBeGreaterThanOrEqual(2);
    expect(scene.routes.some((route) => route.id === "coastal-cliff-upper-route")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(80);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
    const sparseVariant = generateScene({ ...request("round71-deepwater-cliff-route", "medium", 0.2), prompt }, "adaptive");
    const sparseWizardTower = sparseVariant.buildingInstances?.find((building) => building.archetype === "tower");
    expect(sparseWizardTower?.buildingProgram?.requiredFeatures).toContain("alchemy-laboratory");
    expect(sparseVariant.primitives.filter((primitive) => primitive.tags?.includes("spiral-stair")).length).toBeGreaterThanOrEqual(((sparseWizardTower?.floors ?? 1) - 1) * 18);
    expect(sparseVariant.diagnostics.valid, sparseVariant.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("composes an unfamiliar mushroom farming village from reusable mine and building atoms", () => {
    const prompt = "建在旧矿井口的蘑菇农夫村庄，有木屋、菌类温室、矿车轨道、地下水井和石桥";
    const scene = generateScene({ ...request("round70-mine-mushroom-village", "medium", 0.62), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.compositionProgram?.primaryDomain).toBe("settlement");
    expect(scene.compositionProgram?.grammarId).toBe("grammar.settlement-compound-v1");
    expect(scene.compositionProgram?.semanticCoverage?.missing).not.toContain("森林");
    expect(scene.diagnostics.warnings.some((warning) => warning.includes("Semantic geometry missing: 森林"))).toBe(false);
    expect(scene.siteProgram?.siteType).toBe("village");
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("mine-entrance"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("mine-cart-track"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("underground-well"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("fungal") && primitive.tags?.includes("greenhouse"))).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "home")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("plans premodern settlements through an auditable organic morphology program", () => {
    const scene = generateScene({ ...request("r13-organic-waterdeep", "large", 0.76), prompt: "深水城旧港区，前现代弯曲街巷、码头、鱼市、酒馆、神殿与仓库" }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.roadPattern).toBe("harbor-spine");
    expect(scene.siteProgram?.curvedRoadRatio ?? 0).toBeGreaterThan(0.65);
    expect(scene.siteProgram?.nonRectangularBlockRatio ?? 0).toBeGreaterThan(0.65);
    expect(scene.buildingInstances?.every((building) => Boolean(building.buildingProgram))).toBe(true);
    expect(scene.buildingInstances?.every((building) => Boolean(building.interiorProgram))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("focus-interior"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("focus-cutaway"))).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("routes literal water cities and crater villages into distinct settlement compositions", () => {
    const waterCity = generateScene({ ...request("r13-water-city", "medium", 0.72), prompt: "河道水城，弯曲主运河、三条支流、石桥、木桥、水上市集、船坞与前现代不规则街巷" }, "adaptive");
    const craterVillage = generateScene({ ...request("r13-crater-village", "medium", 0.68), prompt: "陨石坑边缘村庄，房屋沿破碎环形坑缘生长，有三条下坑坡道、坠星碎片、木屋与神殿" }, "adaptive");
    expect(waterCity.sceneProgram?.domain).toBe("settlement");
    expect(waterCity.title).toContain("Waterwoven");
    expect(waterCity.siteProgram?.roadPattern).toBe("canal-banks");
    expect(waterCity.primitives.filter((primitive) => primitive.tags?.includes("main-canal")).length).toBeGreaterThanOrEqual(5);
    expect(waterCity.primitives.filter((primitive) => primitive.tags?.includes("branch-canal")).length).toBeGreaterThanOrEqual(6);
    expect(waterCity.primitives.filter((primitive) => primitive.tags?.includes("bank-route")).length).toBeGreaterThanOrEqual(8);
    expect(waterCity.routes.find((route) => route.id === "water-city-canal-route")?.points.length).toBeGreaterThanOrEqual(6);
    expect(craterVillage.sceneProgram?.domain).toBe("settlement");
    expect(craterVillage.title).toContain("Fallen-Star");
    expect(craterVillage.siteProgram?.roadPattern).toBe("radial-ring");
    expect(craterVillage.primitives.filter((primitive) => primitive.tags?.includes("crater-rim")).length).toBeGreaterThanOrEqual(12);
    expect(craterVillage.primitives.filter((primitive) => primitive.tags?.includes("crater-ramp")).length).toBe(3);
    expect(craterVillage.primitives.some((primitive) => primitive.tags?.includes("vertical-slum"))).toBe(false);
    expect(waterCity.diagnostics.valid && craterVillage.diagnostics.valid).toBe(true);
  });

  it("keeps crater bridge vocabulary subordinate to the crater parent terrain", () => {
    const scene = generateScene({ ...request("r15-crater-bridge-village", "medium", 0.78), prompt: "围绕古老陨石坑边缘生长的中世纪村庄，坑壁道路、坑底神龛、环形房屋组团、跨坑吊桥、矿工入口和危险坍塌区" }, "adaptive");
    expect(scene.terrainProgram?.kind).toBe("impact-crater");
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("suspension-bridge") && primitive.tags?.includes("impact-crater"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("basin-shrine"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("mine-entrance"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("crater-ring-road"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("vertical-slum"))).toBe(false);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("realizes requested impact fractures and ore piles as crater-owned geometry", () => {
    const prompt = "陨石坑中的山地小村庄，中央撞击坑、放射状裂缝、矿石堆、木屋、观测台和进入坑底的危险下坡路";
    const scene = generateScene({ ...request("round68-crater-village", "medium", 0.74), prompt }, "adaptive");
    expect(scene.terrainProgram?.kind).toBe("impact-crater");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("radial-fracture")).length).toBeGreaterThanOrEqual(20);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("ore-pile")).length).toBeGreaterThanOrEqual(5);
    expect(scene.terrainReservations?.filter((zone) => zone.id.startsWith("impact-radial-fracture-reservation-")).length).toBeGreaterThanOrEqual(20);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("realizes a settlement on two separated ice-crevasse banks", () => {
    const scene = generateScene({ ...request("r15-ice-crevasse-settlement", "medium", 0.82), prompt: "建在冰川巨大裂隙两侧的矮人聚落，有冰桥、岩石隧道、升降货梯、熔炉大厅、贴崖住宅、地下热泉和裂隙底部的废弃矿道" }, "adaptive");
    expect(scene.terrainProgram?.kind).toBe("ice-crevasse");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("rift-crossing")).length).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("cliff-descent") && primitive.tags?.includes("cargo-lift"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("hot-spring"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.material === "ice" && primitive.tags?.includes("rift-bank"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("forge-hall"))).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "blacksmith")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("preserves flexible ice-rift wording and forest settlement terrain", () => {
    const forest = generateScene({ ...request("big-perfect-forest-parent", "large", 0.9), prompt: "非常茂密的古老森林，有多层树冠、倒木、巨树根系、溪流、林间空地和树冠战斗平台" }, "adaptive");
    expect(forest.archetype).toBe("forest");
    expect(forest.title).toMatch(/Canopy|Mosswood/);
    expect(forest.primitives.filter((primitive) => primitive.tags?.includes("forest")).length).toBeGreaterThanOrEqual(100);

    const ice = generateScene({ ...request("big-perfect-ice-parent", "large", 0.78), prompt: "建在冰川巨大裂缝两侧的矮人聚落，有完全断开的深裂谷、冰桥、升降货梯和裂缝底部废弃矿道" }, "adaptive");
    expect(ice.terrainProgram?.kind).toBe("ice-crevasse");
    expect(ice.primitives.some((primitive) => primitive.tags?.includes("rift-bottom"))).toBe(true);
    expect(ice.primitives.filter((primitive) => primitive.tags?.includes("rift-crossing")).length).toBeGreaterThanOrEqual(2);

    const forestVillage = generateScene({ ...request("big-perfect-forest-village", "large", 0.82), prompt: "森林村庄，村庄嵌在高低起伏的密林中，有木屋、林间小径和溪桥" }, "adaptive");
    expect(forestVillage.terrainProgram?.kind).toBe("forest-clearing");
    expect(forestVillage.primitives.filter((primitive) => primitive.tags?.includes("tree-trunk")).length).toBeGreaterThanOrEqual(20);
    expect(forestVillage.primitives.filter((primitive) => primitive.tags?.includes("tree-canopy")).length).toBeGreaterThanOrEqual(20);
    expect(forestVillage.terrainProgram?.maximumElevationFeet).toBeGreaterThanOrEqual(10);
    expect(forestVillage.diagnostics.valid, forestVillage.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("compiles semantic parent terrain before placing settlement buildings", () => {
    const prompts = [
      { seed: "terrain-parent-river", prompt: "河道水城，弯曲主运河、三条支流、石桥、木桥和两岸街区", kind: "river", minimumRange: 15 },
      { seed: "terrain-parent-crater", prompt: "陨石坑村庄，房屋分布在坑底、环壁台地和坑缘，三条下坑坡道", kind: "impact-crater", minimumRange: 25 },
      { seed: "terrain-parent-caldera", prompt: "火山口村庄，熔岩沟、链桥、高处祭坛和环壁聚落", kind: "caldera", minimumRange: 25 },
      { seed: "terrain-parent-underdark", prompt: "幽暗地域村庄，多层岩台、裂谷、地下湖和两座桥", kind: "underdark", minimumRange: 20 },
      { seed: "terrain-parent-tower", prompt: "塔楼城市，城市分布在一个巨型塔楼结构上，有三层环形平台和塔顶神殿", kind: "megastructure", minimumRange: 60 },
    ] as const;
    for (const sample of prompts) {
      const scene = generateScene({ ...request(sample.seed, "medium", 0.66), prompt: sample.prompt }, "adaptive");
      expect(scene.sceneProgram?.domain).toBe("settlement");
      expect(scene.terrainProgram?.kind).toBe(sample.kind);
      expect(scene.settlementAdaptation?.terrainKind).toBe(sample.kind);
      expect(scene.settlementAdaptation?.roadMode).toBe(sample.kind === "river" ? "planned" : "terrain-owned");
      if (sample.kind === "river") {
        expect(scene.primitives.some((primitive) => primitive.tags?.includes("terrain-adapted") && primitive.tags?.includes("road"))).toBe(true);
        expect(scene.primitives.some((primitive) => primitive.tags?.includes("parcel-yard"))).toBe(true);
      }
      expect(scene.settlementAdaptation?.relocatedBuildings ?? 0).toBeGreaterThan(0);
      expect((scene.terrainProgram?.maximumElevationFeet ?? 0) - (scene.terrainProgram?.minimumElevationFeet ?? 0)).toBeGreaterThanOrEqual(sample.minimumRange);
      expect(scene.diagnostics.metrics.terrainAdaptedBuildings ?? 0).toBeGreaterThan(0);
      expect(scene.diagnostics.valid, `${sample.kind}: ${scene.diagnostics.warnings.join(" | ")}`).toBe(true);
    }
  });

  it("realizes semantic settlement requirements as terrain-owned geometry", () => {
    const caldera = generateScene({ ...request("terrain-owned-caldera", "medium", 0.64), prompt: "火山口村庄，熔岩沟、三条环壁坡道、链桥和高处祭坛" }, "adaptive");
    const underdark = generateScene({ ...request("terrain-owned-underdark", "medium", 0.64), prompt: "幽暗地域村庄，裂谷、地下湖、两座桥、菌林与石屋" }, "adaptive");
    const tower = generateScene({ ...request("terrain-owned-tower", "medium", 0.64), prompt: "塔楼城市，巨型塔楼结构、三层环形平台、吊桥、楼梯和塔顶神殿" }, "adaptive");
    expect(caldera.primitives.some((primitive) => primitive.tags?.includes("lava-flow") || primitive.tags?.includes("lava"))).toBe(true);
    expect(caldera.primitives.filter((primitive) => primitive.tags?.includes("crater-ramp")).length).toBe(3);
    expect(hasTag(caldera, "chain-bridge")).toBe(true);
    expect(hasTag(caldera, "high-altar")).toBe(true);
    expect(hasTag(underdark, "underground-lake")).toBe(true);
    expect(underdark.primitives.filter((primitive) => primitive.tags?.includes("ravine-bridge")).length).toBe(2);
    expect(hasTag(underdark, "cavern-wall")).toBe(true);
    expect(hasTag(tower, "tower-core")).toBe(true);
    expect(tower.primitives.filter((primitive) => primitive.tags?.includes("ring-route")).length).toBeGreaterThanOrEqual(30);
    expect(tower.primitives.filter((primitive) => primitive.tags?.includes("vertical-route")).length).toBeGreaterThanOrEqual(3);
  });

  it("replays semantic terrain deterministically while different seeds reshape it", () => {
    const prompt = "河道水城，弯曲主运河、三条支流、石桥、木桥、水上市集和前现代街巷";
    const first = generateScene({ ...request("r14-water-replay-a", "medium", 0.72), prompt }, "adaptive");
    const replay = generateScene({ ...request("r14-water-replay-a", "medium", 0.72), prompt }, "adaptive");
    const variation = generateScene({ ...request("r14-water-replay-b", "medium", 0.72), prompt }, "adaptive");
    const signature = (scene: GeneratedScene) => scene.primitives
      .filter((primitive) => primitive.tags?.includes("terrain-program"))
      .map((primitive) => [primitive.id, primitive.position.x, primitive.position.y, primitive.position.z]);
    expect(signature(replay)).toEqual(signature(first));
    expect(signature(variation)).not.toEqual(signature(first));
    expect(replay.settlementAdaptation).toEqual(first.settlementAdaptation);
  });

  it("supports vertical settlement platforms and connects their authored heights", () => {
    const scene = generateScene({ ...request("r13-supported-vertical", "medium", 0.7), prompt: "建在巨型桥墩之间的垂直贫民街区，有三层市场平台、吊桥、楼梯和桥下维修区" }, "adaptive");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("platform-support")).length).toBeGreaterThanOrEqual(12);
    expect(scene.terrainProgram?.kind).toBe("bridge-megastructure");
    expect(scene.settlementAdaptation?.relocatedBuildings).toBeLessThanOrEqual(9);
    expect(scene.settlementAdaptation?.verticalConnectionCount ?? 0).toBeGreaterThanOrEqual(3);
    expect(scene.routes.filter((route) => route.id.startsWith("vertical-slum-climb-route-")).length).toBe(3);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("keeps coastal, fossil-swamp and wreck settlements under terrain adaptation", () => {
    const samples = [
      { seed: "r14-coastal-parent", prompt: "海崖港镇，四层悬崖、灯塔、栈桥和维护道路", kind: "coastal-cliff", tag: "coastal-cliff" },
      { seed: "r14-bone-parent", prompt: "石化龙骨沼泽村庄，肋骨栈道、龙骨平台和地下骨髓祭坛", kind: "swamp-bone", tag: "spine-walkway" },
      { seed: "r14-wreck-parent", prompt: "坠毁飞艇残骸中的矿业村庄，断裂船体、主龙骨、悬挂平台和货运隧道", kind: "wreck-field", tag: "airship-wreck" },
    ] as const;
    for (const sample of samples) {
      const scene = generateScene({ ...request(sample.seed, "medium", 0.7), prompt: sample.prompt }, "adaptive");
      expect(scene.sceneProgram?.domain).toBe("settlement");
      expect(scene.terrainProgram?.kind).toBe(sample.kind);
      expect(scene.settlementAdaptation?.terrainKind).toBe(sample.kind);
      expect(scene.primitives.some((primitive) => primitive.tags?.includes(sample.tag))).toBe(true);
      expect(scene.diagnostics.valid, `${sample.kind}: ${scene.diagnostics.warnings.join(" | ")}`).toBe(true);
    }
  });

  it("composes an unfamiliar whalebone lighthouse village onto a coastal cliff", () => {
    const prompt = "建在黑沙海岸悬崖上的鲸骨灯塔村，有潮池、吊脚木屋、风暴缆车、盐风仓库和地下海蚀洞";
    const scene = generateScene({ ...request("round64-whalebone-cliff", "medium", 0.72), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram).toBeDefined();
    expect(scene.siteProgram?.siteType).toBe("village");
    expect(scene.siteProgram?.roadPattern).toBe("contour");
    expect(scene.settlementAdaptation?.roadMode).toBe("hybrid");
    expect(scene.terrainProgram?.kind).toBe("coastal-cliff");
    expect(hasTag(scene, "contour-road")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "home")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "warehouse")).toBe(true);
    expect(hasTag(scene, "whalebone")).toBe(true);
    expect(hasTag(scene, "storm-cableway")).toBe(true);
    expect(hasTag(scene, "sea-cave")).toBe(true);
    expect(hasTag(scene, "tide-pool")).toBe(true);
    expect(hasTag(scene, "stilt-foundation")).toBe(true);
    expect(hasTag(scene, "focus-cluster:sea-cave")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.level === 3 && primitive.tags?.includes("sea-cave"))).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
    expect(scene.diagnostics.warnings).toEqual([]);

    const variation = generateScene({ ...request("round64-whalebone-cliff-b", "medium", 0.72), prompt }, "adaptive");
    expect(variation.boundsCells).not.toEqual(scene.boundsCells);
    expect(variation.buildingInstances?.map((building) => building.positionCells)).not.toEqual(scene.buildingInstances?.map((building) => building.positionCells));
    expect(variation.diagnostics.valid).toBe(true);
  });

  it("promotes a cavern monastery compound to a site-scale composition", () => {
    const prompt = "建在潮汐洞穴群中的盐晶修道院，退潮时露出石路，涨潮时部分回廊被淹，有海蚀礼拜堂、僧侣居室、钟塔、藏经洞和悬崖逃生梯";
    const scene = generateScene({ ...request("round66-tidal-salt-monastery", "medium", 0.72), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram).toBeDefined();
    expect(scene.terrainProgram?.kind).toBe("underdark");
    expect(scene.compositionProgram?.grammarId).toBe("grammar.cave-network-v1");
    expect(scene.compositionProgram?.motifIds).toContain("motif.salt-crystal-cavern-monastery");
    expect(hasTag(scene, "salt-crystal")).toBe(true);
    expect(hasTag(scene, "cavern-tide-pool")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "shrine")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.some((tag) => tag.startsWith("focus-cluster:archive:")))).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("keeps a non-salt tidal cave monastery under the cave parent grammar", () => {
    const prompt = "建在潮汐洞穴群中的古老修道院，退潮时出现石路，涨潮时部分区域被淹，有海蚀礼拜堂、僧侣居室、钟塔、藏经洞、潮池庭院和悬崖逃生梯";
    const first = generateScene({ ...request("tidal-cave-monastery-76", "large", 0.78), prompt }, "adaptive");
    const repeat = generateScene({ ...request("tidal-cave-monastery-76", "large", 0.78), prompt }, "adaptive");
    const variation = generateScene({ ...request("tidal-cave-monastery-76-b", "large", 0.78), prompt }, "adaptive");

    expect(first.sceneProgram?.domain).toBe("natural");
    expect(first.archetype).toBe("cave");
    expect(first.compositionProgram?.primaryDomain).toBe("cave");
    expect(first.compositionProgram?.grammarId).toBe("grammar.cave-network-v1");
    expect(first.buildingInstances?.map((building) => building.archetype)).toEqual(expect.arrayContaining(["shrine", "home", "tower"]));
    for (const tag of ["cavern", "cave-passage", "sea-eroded-chapel", "monastic-quarters", "bell-tower", "archive", "cavern-tide-pool", "low-tide-stone", "cliff-escape-ladder"]) {
      expect(hasTag(first, tag), `missing ${tag}`).toBe(true);
    }
    expect(first.routes.some((route) => route.id === "tidal-monastery-low-tide-route")).toBe(true);
    expect(first.routes.some((route) => route.id === "tidal-monastery-cliff-escape-route" && route.kind === "vertical")).toBe(true);
    expect(first.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(first).toEqual(repeat);
    expect(variation.buildingInstances?.map((building) => building.positionCells)).not.toEqual(first.buildingInstances?.map((building) => building.positionCells));
    expect(first.diagnostics.valid, first.diagnostics.warnings.join(" | ")).toBe(true);
    expect(first.diagnostics.warnings).toEqual([]);
  });

  it("embeds an unfamiliar cave facility without replacing the cave topology", () => {
    const prompt = "潮汐海蚀洞中的废弃气象观测站，有潮池、盐风侵蚀的仪器室、地下避难库、岩架维修梯和退潮时可走的石脊";
    const scene = generateScene({ ...request("strange-cave-weather-station", "large", 0.7), prompt }, "adaptive");
    expect(scene.archetype).toBe("cave");
    expect(scene.compositionProgram?.primaryDomain).toBe("cave");
    expect(scene.buildingInstances?.some((building) => building.archetype === "tower")).toBe(true);
    expect(hasTag(scene, "embedded-building")).toBe(true);
    expect(hasTag(scene, "weather-operations")).toBe(true);
    expect(scene.routes.some((route) => route.id === "cave-embedded-building-route")).toBe(true);
    expect(scene.floors).toBe(4);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
    expect(scene.diagnostics.warnings).toEqual([]);
  });

  it("keeps a hillside noble district under settlement planning", () => {
    const scene = generateScene({ ...request("r12-hillside-settlement", "large", 0.62), prompt: "山坡贵族区，沿等高线道路、三座不同庄园、公共花园、守卫岗亭、仆从巷、山顶钟楼和下层商业街" }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.siteType).toBe("town");
    expect(hasTag(scene, "mountain-terrace")).toBe(true);
    expect(scene.buildingInstances?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("keeps a settlement as the parent site when its prompt names child buildings", () => {
    const prompt = "深水城港区，有不规则海岸、六码头、货运主路、仓储区、鱼市、酒馆、公会大厅、神殿、居民巷和巡逻岗楼";
    const scene = generateScene({ ...request("site-parent-over-buildings", "large", 0.8), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.siteType).toBe("harbor-district");
    expect(scene.buildingInstances?.some((building) => building.archetype === "tavern" || building.archetype === "guild")).toBe(true);
    expect(scene.buildingInstances?.some((building) => building.archetype === "shrine")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("realizes forest-village child terrain without replacing settlement planning", () => {
    const prompt = "森林村庄，茂密林带围绕不规则道路，中央空地、小木屋、林间浅溪、木桥和高低起伏的战术地形";
    const scene = generateScene({ ...request("forest-village-semantic-contract", "medium", 0.82), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.terrainKind).toBe("forest-clearing");
    expect(hasTag(scene, "forest")).toBe(true);
    expect(hasTag(scene, "tree-canopy")).toBe(true);
    expect(hasTag(scene, "stream")).toBe(true);
    expect(hasTag(scene, "wood-bridge")).toBe(true);
    expect(hasTag(scene, "stream-crossing")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("composes a full-interior cabin into wilderness terrain instead of replacing the forest", () => {
    const scene = generateScene({ ...request("forest-cabin-site", "medium", 0.68), prompt: "森林中的猎人木屋，有起居室、储藏间、阁楼、地窖、门廊和林间道路" }, "adaptive");
    expect(scene.archetype).toBe("forest");
    expect(scene.siteProgram?.siteType).toBe("wilderness-site");
    expect(scene.buildingInstances?.[0]?.detailLevel).toBe("full-interior");
    expect(scene.rooms.some((room) => room.name === "Root cellar")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("foundation"))).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-building-access")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("treats a streamside footbridge as a parent-terrain contract instead of a dry decorative slab", () => {
    const prompt = "深林中的猎人木屋，有林间空地、倒木防线、溪边木桥、树冠观察台和地下储藏室";
    const scene = generateScene({ ...request("forest-streamside-cabin", "large", 0.78), prompt }, "adaptive");
    expect(scene.archetype).toBe("forest");
    expect(hasTag(scene, "stream")).toBe(true);
    expect(hasTag(scene, "watercourse")).toBe(true);
    expect(hasTag(scene, "wood-bridge")).toBe(true);
    expect(hasTag(scene, "stream-crossing")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-forest-footbridge-route")).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("decomposes an unfamiliar rainforest weather outpost into terrain and reusable facility atoms", () => {
    const prompt = "被古老石环包围的雨林气象哨站，有泥泞上坡路、根桥、半地下档案室和树冠信号台";
    const scene = generateScene({ ...request("rainforest-weather-outpost", "medium", 0.66), prompt }, "adaptive");
    expect(scene.archetype).toBe("forest");
    expect(scene.siteProgram?.siteType).toBe("wilderness-site");
    expect(scene.buildingInstances?.[0]?.detailLevel).toBe("full-interior");
    expect(hasTag(scene, "weather-station-interior")).toBe(true);
    expect(hasTag(scene, "standing-stone-ring")).toBe(true);
    expect(hasTag(scene, "root-bridge")).toBe(true);
    expect(hasTag(scene, "archive")).toBe(true);
    expect(scene.rooms.some((room) => room.level === 3 && room.name.toLocaleLowerCase("en-US").includes("archive"))).toBe(true);
    expect(hasTag(scene, "canopy-observatory")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-forest-root-bridge-route")).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("keeps a hunter camp as an embedded forest facility rather than a town", () => {
    const prompt = "非常茂密的古老森林，起伏山脊、林间峡谷、巨石高地、倒木和隐蔽猎人营地";
    const scene = generateScene({ ...request("forest-hunter-camp-domain", "medium", 0.88), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("natural");
    expect(scene.archetype).toBe("forest");
    expect(scene.siteProgram?.siteType).toBe("wilderness-site");
    expect(scene.buildingInstances?.[0]?.archetype).toBe("home");
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(80);
    expect(hasTag(scene, "forest")).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("keeps a mountain monastery as a terrain-owned site and realizes its specialist facilities", () => {
    const prompt = "山顶无线电修道院与气象观测站，建在陡峭风化岩脊上，有环形回廊、礼拜堂、无线电室、档案密库、地下防空洞、屋顶天线和外部维护栈道";
    const scene = generateScene({ ...request("mountain-radio-monastery"), prompt }, "adaptive");
    expect(scene.archetype).toBe("mountain");
    expect(scene.buildingInstances?.[0]?.archetype).toBe("shrine");
    for (const tag of ["radio-console", "bunker", "antenna", "external-maintenance-walk"]) expect(hasTag(scene, tag)).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("treats a waterfall canyon as a river parent even when a facility mentions wet maps", () => {
    const prompt = "建在峡谷瀑布背后的测绘站与缆车维修所，有悬崖办公室、绞盘井、湿地图柜、地下避险室和跨瀑维护桥";
    const scene = generateScene({ ...request("waterfall-survey-station"), prompt }, "adaptive");
    expect(scene.archetype).toBe("river-valley");
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("waterfall"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("building-instance:wilderness-core-building"))).toBe(true);
    expect(scene.compositionProgram?.semanticCoverage?.score ?? 0).toBeGreaterThanOrEqual(90);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("lets river prompts, density and seed reshape the macro valley instead of only adding props", () => {
    const prompt = "蜿蜒峡谷河谷，主河从高处落入深潭，两条支流、河岸悬崖、浅滩和旧石桥";
    const sparse = generateScene({ ...request("river-macro-contract", "large", 0.2), prompt }, "adaptive");
    const dense = generateScene({ ...request("river-macro-contract", "large", 0.9), prompt }, "adaptive");
    const replay = generateScene({ ...request("river-macro-contract", "large", 0.9), prompt }, "adaptive");
    const alternate = generateScene({ ...request("river-macro-contract-alt", "large", 0.9), prompt }, "adaptive");
    const riverSignature = (scene: GeneratedScene) => scene.primitives
      .filter((primitive) => primitive.tags?.includes("watercourse") || primitive.tags?.includes("river-bank"))
      .map((primitive) => `${primitive.id}:${primitive.position.x.toFixed(2)}:${primitive.position.y.toFixed(2)}:${primitive.position.z.toFixed(2)}:${primitive.size.x.toFixed(2)}:${primitive.size.z.toFixed(2)}`)
      .join("|");
    const tributaryCount = (scene: GeneratedScene) => new Set(scene.primitives
      .filter((primitive) => primitive.id.startsWith("river-tributary-"))
      .map((primitive) => primitive.id.split("-").slice(0, 3).join("-"))).size;
    const crossingCount = (scene: GeneratedScene) => scene.primitives.filter((primitive) => primitive.tags?.includes("supported-crossing")).length;
    const dropFeet = (scene: GeneratedScene) => Number(scene.primitives.find((primitive) => primitive.id === "river-waterfall-face")?.tags?.find((tag) => tag.startsWith("drop-feet:"))?.split(":")[1]);

    expect(sparse.description).toContain("river-valley grammar");
    expect(dense.description).toContain("double-canyon");
    expect(tributaryCount(dense)).toBeGreaterThan(tributaryCount(sparse));
    expect(crossingCount(dense)).toBeGreaterThan(crossingCount(sparse));
    expect(dropFeet(dense)).toBeGreaterThanOrEqual(18);
    expect(dropFeet(dense)).toBeLessThanOrEqual(30);
    expect(dense).toEqual(replay);
    expect(riverSignature(alternate)).not.toBe(riverSignature(dense));
    expect(sparse.diagnostics.valid && dense.diagnostics.valid && alternate.diagnostics.valid).toBe(true);
  });

  it("realizes a braided reach as two watercourses around a standable tactical island", () => {
    const prompt = "宽阔冲积河谷，分汊河道围绕河中岛洲，有浅滩、倒木桥和下游跌水";
    const scene = generateScene({ ...request("river-braided-island", "large", 0.82), prompt }, "adaptive");
    expect(scene.archetype).toBe("river-valley");
    expect(hasTag(scene, "braided-channel")).toBe(true);
    expect(scene.rooms.some((room) => room.id === "river-floodplain-island")).toBe(true);
    expect(scene.tactical.some((feature) => feature.id === "river-island-high-ground")).toBe(true);
    expect(scene.routes.filter((route) => route.kind === "alternate").length).toBeGreaterThanOrEqual(2);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("turns wilderness density into additional physical service and escape routes", () => {
    const prompt = "森林中的猎人木屋，有起居室、地窖、门廊、柴堆和林间道路";
    const sparse = generateScene({ ...request("forest-cabin-density", "medium", 0.25), prompt }, "adaptive");
    const dense = generateScene({ ...request("forest-cabin-density", "medium", 0.9), prompt }, "adaptive");
    expect(dense.siteProgram?.roadCount ?? 0).toBeGreaterThan(sparse.siteProgram?.roadCount ?? 0);
    expect(dense.siteProgram?.roadLengthCells ?? 0).toBeGreaterThan((sparse.siteProgram?.roadLengthCells ?? 0) * 2);
    expect(dense.routes.some((route) => route.id === "wilderness-escape-route")).toBe(true);
    expect(hasTag(dense, "escape-route")).toBe(true);
    expect(sparse.diagnostics.valid && dense.diagnostics.valid).toBe(true);
  });

  it("composes a river-bank cabin, supported dock, and bank descent into one site", () => {
    const scene = generateScene({ ...request("river-cabin-site", "medium", 0.72), prompt: "森林河湾中的猎人小屋，有真实木屋内部、前廊、储藏间、烟囱、河边小码头、上坡兽径、林间掩体和屋后地下储藏窖" }, "adaptive");
    expect(scene.archetype).toBe("river-valley");
    expect(scene.buildingInstances?.some((building) => building.detailLevel === "full-interior")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("dock") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id === "wilderness-river-bank-descent" && primitive.tags?.includes("supported"))).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-dock-route")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("orients an unfamiliar hydrology outpost to either river axis and realizes every requested access structure", () => {
    const prompt = "峡谷瀑布旁的水文档案哨所，有悬崖办公室、地下洪水记录库、跨瀑维护桥、河边取样码头和上游逃生路";
    const scene = generateScene({ ...request("round-85-hydrology-outpost", "medium", 0.78), prompt }, "adaptive");
    const tags = new Set(scene.primitives.flatMap((primitive) => primitive.tags ?? []));
    expect(scene.archetype).toBe("river-valley");
    expect(scene.buildingInstances?.[0]?.detailLevel).toBe("full-interior");
    expect(tags.has("waterfall-maintenance-bridge")).toBe(true);
    expect(tags.has("sampling-dock")).toBe(true);
    expect(tags.has("archive")).toBe(true);
    expect(tags.has("upstream-escape-route")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-waterfall-maintenance-route")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-dock-route")).toBe(true);
    expect(scene.routes.some((route) => route.id === "wilderness-escape-route")).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("realizes mining infrastructure as terrain, water, bridge and portal geometry", () => {
    const scene = generateScene({ ...request("mining-valley-site", "medium", 0.74), prompt: "山谷矿业聚落，有矿井入口、仓库、铁匠铺、矿车轨道、废石坡和河上装卸桥" }, "adaptive");
    expect(scene.siteProgram?.siteType).toBe("mining-settlement");
    expect(hasTag(scene, "mine-entrance")).toBe(true);
    expect(hasTag(scene, "loading-bridge")).toBe(true);
    expect(hasTag(scene, "valley-wall")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("composes a three-band floating settlement from the SceneProgram morphology", () => {
    const scene = generateScene({ ...request("floating-radio-site", "medium", 0.76), prompt: "浮空玄武岩岛上的无线电观测城镇，有环形主路、无线电塔、旅店、维护仓库、悬索桥和地下避难所" }, "adaptive");
    expect(scene.sceneProgram?.morphology).toContain("floating-islands");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("floating-island")).length).toBeGreaterThanOrEqual(6);
    expect(hasTag(scene, "suspension-bridge")).toBe(true);
    const islandLevels = new Set(scene.primitives.filter((primitive) => primitive.id.endsWith("-top") && primitive.tags?.includes("floating-island")).map((primitive) => Math.round(primitive.position.y * 100)));
    expect(islandLevels.size).toBe(3);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("composes unfamiliar settlements from parent terrain and independent building modules", () => {
    const hollowTree = generateScene({ ...request("round16-hollow-tree-a", "medium", 0.62), prompt: "生长在一株巨大空心古树内部的魔法学者城市，有螺旋树干街道、枝干住宅、悬挂书库、树脂升降梯、根系档案库、树冠观测台和腐烂空洞危险区" }, "adaptive");
    expect(hollowTree.title).toContain("Hollow-Heart");
    expect(hasTag(hollowTree, "bark-wall")).toBe(true);
    expect(hasTag(hollowTree, "spiral-tree-street")).toBe(true);
    expect(hasTag(hollowTree, "root-archive")).toBe(true);
    expect(hollowTree.buildingInstances?.length ?? 0).toBeGreaterThanOrEqual(8);

    const mangrove = generateScene({ ...request("round16-mangrove-port-a", "medium", 0.62), prompt: "隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口" }, "adaptive");
    expect(mangrove.title).toContain("Rootbound");
    expect(hasTag(mangrove, "tidal-channel")).toBe(true);
    expect(hasTag(mangrove, "root-boardwalk")).toBe(true);
    expect(hasTag(mangrove, "underwater-entry")).toBe(true);
    expect(mangrove.buildingInstances?.some((building) => building.archetype === "warehouse")).toBe(true);
    expect(mangrove.primitives.some((primitive) => primitive.id.startsWith("site-harbor-water") || primitive.id.startsWith("harbor-dock-"))).toBe(false);
    expect(mangrove.primitives.filter((primitive) => primitive.id.startsWith("mangrove-root-boardwalk")).every((primitive) => {
      const rotation = primitive.rotationY ?? 0;
      const quarterTurns = Math.round(rotation / (Math.PI / 2));
      return Math.abs(rotation - quarterTurns * (Math.PI / 2)) < 1e-6;
    })).toBe(true);
    expect(hasTag(mangrove, "stilt-foundation")).toBe(true);
    expect(hasTag(mangrove, "stilt-stair")).toBe(true);
    expect(new Set(mangrove.buildingInstances?.map((building) => Math.round((building.baseYMeters ?? 0) * 100))).size).toBeGreaterThanOrEqual(3);

    const salt = generateScene({ ...request("round16-salt-monastery-a", "medium", 0.62), prompt: "漂浮在盐晶洞窟上方的修道院群，有三层盐晶浮岛、礼拜堂、僧侣居室、钟塔、悬索桥、盐雾花园和洞底潮池" }, "adaptive");
    expect(salt.title).toContain("Salt-Crystal");
    expect(hasTag(salt, "salt-crystal")).toBe(true);
    expect(hasTag(salt, "cavern-tide-pool")).toBe(true);
    expect(hasTag(salt, "suspension-bridge")).toBe(true);
    expect(new Set(salt.primitives.filter((primitive) => primitive.tags?.includes("floating-island") && primitive.id.endsWith("-top")).map((primitive) => Math.round(primitive.position.y * 100))).size).toBe(3);
    expect(hollowTree.diagnostics.valid).toBe(true);
    expect(mangrove.diagnostics.valid).toBe(true);
    expect(salt.diagnostics.valid).toBe(true);
  });

  it("assigns unfamiliar specialist functions to explicit reusable building modules", () => {
    const prompt = "潮汐红树林里的炼金学者港村，有根桥、树上实验屋、盐雾蒸馏塔、半淹档案库和水下温室";
    const program = planSettlementSite({ request: { ...request("functional-module-program", "medium", 0.7), prompt }, archetype: "village" }, new SeededRandom("functional-module-program"));
    const modules = program.parcels.flatMap((parcel) => parcel.functionalModules ?? []);
    expect(new Set(modules.map((module) => module.kind))).toEqual(new Set(["laboratory", "distillation", "archive", "greenhouse"]));
    expect(modules.find((module) => module.kind === "laboratory")?.levelRole).toBe("upper");
    expect(modules.find((module) => module.kind === "archive")?.requiresWater).toBe(true);
    expect(modules.find((module) => module.kind === "greenhouse")?.requiresWater).toBe(true);
    expect(program.parcels.filter((parcel) => (parcel.functionalModules?.length ?? 0) > 0).every((parcel) => parcel.lod === "full-interior" || parcel.lod === "facade")).toBe(true);
  });

  it("realizes specialist settlement functions as geometry, rooms, routes, and tactical space", () => {
    const prompt = "潮汐红树林里的炼金学者港村，有根桥、树上实验屋、盐雾蒸馏塔、半淹档案库和水下温室";
    const first = generateScene({ ...request("functional-module-scene-a", "medium", 0.72), prompt }, "adaptive");
    const replay = generateScene({ ...request("functional-module-scene-a", "medium", 0.72), prompt }, "adaptive");
    const second = generateScene({ ...request("functional-module-scene-b", "medium", 0.72), prompt }, "adaptive");
    for (const tag of ["function:laboratory", "function:distillation", "function:archive", "function:greenhouse"]) {
      expect(hasTag(first, tag)).toBe(true);
    }
    expect(first.rooms.some((room) => room.name === "Elevated research laboratory" && room.level === 1)).toBe(true);
    expect(first.rooms.some((room) => room.name === "Half-flooded secured archive")).toBe(true);
    expect(first.rooms.some((room) => room.name === "Submerged cultivation greenhouse")).toBe(true);
    expect(first.routes.some((route) => route.id.includes("distillation-route"))).toBe(true);
    expect(first.routes.some((route) => route.id.includes("laboratory-route"))).toBe(true);
    expect(hasTag(first, "archive-hatch")).toBe(true);
    expect(hasTag(first, "archive-access")).toBe(true);
    expect(hasTag(first, "exhaust-stack")).toBe(true);
    expect(first.routes.some((route) => route.id.includes("archive-route"))).toBe(true);
    expect(first.routes.some((route) => route.id.includes("greenhouse-route"))).toBe(true);
    expect(first.tactical.some((feature) => feature.id.includes("greenhouse-cover"))).toBe(true);
    expect(first.diagnostics.valid).toBe(true);
    expect(first).toEqual(replay);
    expect(first.primitives.filter((primitive) => primitive.tags?.includes("functional-module")).map((primitive) => primitive.position))
      .not.toEqual(second.primitives.filter((primitive) => primitive.tags?.includes("functional-module")).map((primitive) => primitive.position));
  });

  it("keeps an unfamiliar mining camp as the parent site instead of collapsing into one laboratory", () => {
    const prompt = "火山灰峡谷里的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥";
    const scene = generateScene({ ...request("unfamiliar-volcanic-alchemy-camp", "medium", 0.68), prompt }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("settlement");
    expect(scene.siteProgram?.siteType).toBe("mining-settlement");
    expect(scene.terrainProgram?.kind).toBe("caldera");
    expect(scene.buildingInstances?.length ?? 0).toBeGreaterThanOrEqual(5);
    for (const tag of ["function:laboratory", "function:archive", "function:distillation", "function:greenhouse", "function:workshop"]) {
      expect(hasTag(scene, tag)).toBe(true);
    }
    expect(hasTag(scene, "lava")).toBe(true);
    const maintenanceDeck = scene.primitives.find((primitive) => primitive.tags?.includes("terrain-bound-maintenance-bridge") && primitive.tags?.includes("bridge-deck"));
    expect(maintenanceDeck).toBeDefined();
    expect(maintenanceDeck?.tags).toContain("crosses:lava");
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("terrain-bound-maintenance-bridge") && primitive.tags?.includes("grounded-support")).length).toBeGreaterThanOrEqual(4);
    expect(scene.routes.some((route) => route.id === "terrain-maintenance-hazard-crossing")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("lava") && maintenanceDeck !== undefined
      && Math.hypot(primitive.position.x - maintenanceDeck.position.x, primitive.position.z - maintenanceDeck.position.z) < 3)).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("binds flooded specialist modules to water owned by the parent terrain", () => {
    const prompt = "潮汐红树林里的炼金学者港村，有根桥、树上实验屋、半淹档案库和水下温室";
    const scene = generateScene({ ...request("functional-parent-water", "medium", 0.72), prompt }, "adaptive");
    const waterAccess = scene.primitives.filter((primitive) => primitive.tags?.includes("terrain-bound-water-access"));
    expect(waterAccess.some((primitive) => primitive.tags?.includes("standable"))).toBe(true);
    expect(waterAccess.filter((primitive) => primitive.tags?.includes("grounded-support")).length).toBeGreaterThanOrEqual(2);
    expect(scene.routes.some((route) => route.id.startsWith("terrain-water-access-route-"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("propagates requested density into settlement building count and adds city defenses", () => {
    const sparse = generateScene({ ...request("settlement-density", "large", 0), prompt: "大型城市街区" }, "settlement");
    const dense = generateScene({ ...request("settlement-density", "large", 1), prompt: "大型城市街区" }, "settlement");
    const buildingCount = (scene: GeneratedScene) => scene.rooms.filter((room) => room.id.startsWith("settlement-building-")).length;
    expect(buildingCount(dense)).toBeGreaterThan(buildingCount(sparse));
    expect(dense.siteProgram?.roadLengthCells ?? 0).toBeGreaterThan(sparse.siteProgram?.roadLengthCells ?? 0);
    expect(hasTag(dense, "city-wall")).toBe(true);
    expect(hasTag(dense, "corner-tower")).toBe(true);
  });

  it("changes district count, bounds and LOD population across settlement scale bands", () => {
    const small = generateScene({ ...request("site-scale-structure", "small", 0.7), prompt: "深水城港区，有仓库、酒馆和神殿" }, "adaptive");
    const large = generateScene({ ...request("site-scale-structure", "large", 0.7), prompt: "深水城港区，有仓库、酒馆和神殿" }, "adaptive");
    expect(large.siteProgram?.districtCount ?? 0).toBeGreaterThan(small.siteProgram?.districtCount ?? 0);
    expect(large.diagnostics.metrics.boundsAreaCells ?? 0).toBeGreaterThan((small.diagnostics.metrics.boundsAreaCells ?? 0) * 2.5);
    expect(large.buildingInstances?.length ?? 0).toBeGreaterThan((small.buildingInstances?.length ?? 0) * 1.5);
    expect(large.siteProgram?.massCount ?? 0).toBeGreaterThan(small.siteProgram?.massCount ?? 0);
  });

  it("realizes flooded, elevated-rail and mountain-site requirements as geometry", () => {
    const flooded = generateScene({ ...request("site-state-flooded", "medium", 0.7), prompt: "被洪水淹没的河畔村庄，有高脚住宅、粮仓和临时木桥" }, "adaptive");
    const elevated = generateScene({ ...request("site-elevated-market", "medium", 0.78), prompt: "建在废弃高架铁路下的炼金市场村，有车厢商铺和中央广场" }, "adaptive");
    const mountain = generateScene({ ...request("site-mountain-monastery", "medium", 0.62), prompt: "山地修道院聚落，有礼拜堂、钟塔、外部栈道和地下墓穴" }, "adaptive");
    expect(hasTag(flooded, "stilt-foundation")).toBe(true);
    expect(hasTag(flooded, "temporary-bridge")).toBe(true);
    expect(hasTag(elevated, "elevated-rail")).toBe(true);
    expect(hasTag(elevated, "carriage-shop")).toBe(true);
    expect(hasTag(mountain, "mountain-terrace")).toBe(true);
    expect(hasTag(mountain, "external-boardwalk")).toBe(true);
    expect(flooded.diagnostics.valid && elevated.diagnostics.valid && mountain.diagnostics.valid).toBe(true);
  });

  it("backs requested settlement rooftop routes with standable geometry", () => {
    const scene = generateScene({ ...request("r11-required-11", "medium", 0.65), prompt: "建在废弃高架铁路下的炼金市场村，有车厢商铺、炼金工坊、住宅棚屋、地下排水层、屋顶栈道和中央交易广场。" }, "adaptive");
    expect(scene.routes.some((route) => route.id === "site-rooftop-pursuit")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("roof-walkway") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it.each([
    ["village", "村庄"],
    ["town", "城镇"],
    ["city", "深水城街区"],
    ["harbor", "港区码头"],
  ] as const)("validates the %s settlement planner across scale bands", (archetype, prompt) => {
    for (const size of ["small", "medium", "large"] as const) {
      const scene = generateScene({ ...request(`settlement-${archetype}-${size}`), prompt, size }, "settlement");
      expect(scene.archetype).toBe(archetype);
      expect(scene.diagnostics.valid).toBe(true);
      expect(scene.diagnostics.repairs).toEqual([]);
      expect(scene.rooms.filter((room) => room.id.startsWith("settlement-building-")).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("builds natural tactical spaces with terrain-specific route logic", () => {
    const river = generateScene({ ...request("wilderness-river"), prompt: "宽阔河谷与桥梁", size: "large" }, "wilderness");
    const mountain = generateScene({ ...request("wilderness-mountain"), prompt: "多层山地高台与登山路线", size: "large" }, "wilderness");
    expect(river.diagnostics.valid).toBe(true);
    expect(mountain.diagnostics.valid).toBe(true);
    expect(river.archetype).toBe("river-valley");
    expect(mountain.archetype).toBe("mountain");
    expect(hasTag(river, "watercourse")).toBe(true);
    expect(hasTag(mountain, "natural-ramp")).toBe(true);
    expect(mountain.tactical.some((feature) => feature.kind === "highGround")).toBe(true);
  });

  it.each([
    ["river-valley", "河谷与河流"],
    ["rift", "危险裂谷"],
    ["mountain", "陡峭山地"],
    ["ice", "破碎冰原"],
    ["ruin", "荒野遗迹"],
    ["underground-lake", "幽暗地域的地下湖"],
  ] as const)("validates the %s wilderness grammar across scale bands", (archetype, prompt) => {
    for (const size of ["small", "medium", "large"] as const) {
      const scene = generateScene({ ...request(`wilderness-${archetype}-${size}`), prompt, size }, "wilderness");
      expect(scene.archetype).toBe(archetype);
      expect(scene.diagnostics.valid).toBe(true);
      expect(scene.diagnostics.repairs).toEqual([]);
    }
  });

  it("composes woodland coverage over a continuous river topology", () => {
    const scene = generateScene({ ...request("forest-river-composition", "large", 0.82), prompt: "茂密森林和弯曲河流，有浅滩与古树" }, "wilderness");
    expect(scene.archetype).toBe("river-valley");
    expect(hasTag(scene, "watercourse")).toBe(true);
    expect(hasTag(scene, "woodland-cover")).toBe(true);
    expect(hasTag(scene, "old-bridge")).toBe(true);
    expect(scene.routes.some((route) => route.kind === "waterflow")).toBe(true);
  });

  it("uses a caldera and lava-flow topology for volcanic prompts without moss summits", () => {
    const scene = generateScene({ ...request("volcanic-morphology", "large", 0.76), prompt: "活火山，破碎火山口与向山脚流动的熔岩" }, "wilderness");
    expect(scene.archetype).toBe("volcanic");
    expect(hasTag(scene, "caldera-rim")).toBe(true);
    expect(hasTag(scene, "lava-flow")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("summit") && primitive.material === "moss")).toBe(false);
    expect(scene.tactical.some((feature) => feature.id === "volcanic-crater-hazard")).toBe(true);
  });

  it("builds cemetery morphology from paths, grave groups, mounds, and a sunken crypt", () => {
    const scene = generateScene({ ...request("burial-morphology", "medium", 0.7), prompt: "阴森墓地，墓丘、墓碑、陵墓和下沉墓穴" }, "wilderness");
    expect(scene.archetype).toBe("burial-ground");
    expect(hasTag(scene, "burial-mound")).toBe(true);
    expect(hasTag(scene, "tombstone")).toBe(true);
    expect(hasTag(scene, "mausoleum")).toBe(true);
    expect(hasTag(scene, "crypt-entry")).toBe(true);
  });

  it("cuts a continuous dry riverbed instead of falling back to mountain shelves", () => {
    const scene = generateScene({ ...request("dry-channel-morphology", "medium", 0.64), prompt: "干涸河床，冲刷巨石、沙洲和多处渡口" }, "wilderness");
    expect(scene.archetype).toBe("dry-riverbed");
    expect(hasTag(scene, "dry-riverbed")).toBe(true);
    expect(hasTag(scene, "eroded-bank")).toBe(true);
    expect(hasTag(scene, "scoured-boulder")).toBe(true);
    expect(hasTag(scene, "watercourse")).toBe(false);
    const slopes = scene.primitives.filter((primitive) => primitive.shape === "ramp" && primitive.tags?.includes("slope-facade"));
    const skirts = scene.primitives.filter((primitive) => primitive.shape === "ramp" && primitive.tags?.includes("erosion-skirt"));
    expect(slopes.length).toBeGreaterThan(40);
    expect(slopes.every((primitive) => primitive.size.y > 0 && primitive.rotationY !== undefined && !primitive.tags?.includes("standable"))).toBe(true);
    expect(skirts.length).toBeGreaterThanOrEqual(4);
    expect(skirts.every((primitive) => primitive.size.z > slopes[0]!.size.z && !primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.description).toContain("slope facades");
    expect(scene.description).toContain("perimeter skirts");
  });

  it("builds a salt wasteland parent for an embedded plague oratory", () => {
    const prompt = "盐碱荒原中的瘟疫隔离礼拜所，有露天净化庭、伤员病房、祈祷小堂、地下焚化燃料库和屋顶钟火信号台";
    const scene = generateScene({ ...request("salt-waste-oratory-contract", "medium", 0.71), prompt }, "adaptive");
    expect(scene.archetype).toBe("salt-waste");
    expect(scene.title).toBe("SceneProgram · The Saltbound Quarantine Oratory");
    expect(hasTag(scene, "salt-wasteland")).toBe(true);
    expect(hasTag(scene, "brine-basin")).toBe(true);
    expect(hasTag(scene, "salt-ridge")).toBe(true);
    expect(hasTag(scene, "decontamination-court")).toBe(true);
    expect(hasTag(scene, "chapel-floor")).toBe(true);
    expect(hasTag(scene, "ward-floor")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene.diagnostics.warnings).toEqual([]);
  });

  it("keeps giant fungi as standable tactical platforms", () => {
    const scene = generateScene({ ...request("fungal-platform-contract", "medium", 0.78), prompt: "幽暗蘑菇地，遍布超大蘑菇" }, "wilderness");
    expect(hasTag(scene, "giant-fungus")).toBe(true);
    expect(hasTag(scene, "fungus-cap-platform")).toBe(true);
    expect(scene.routes.some((route) => route.id.includes("giant-fungus-access"))).toBe(true);
  });

  it("builds a multi-level tower with an explicit silhouette and platforms", () => {
    const scene = generateScene(request("tower-contract", "medium", 0.58), "tower");
    expect(scene.floors).toBeGreaterThanOrEqual(3);
    expect(scene.routes.filter((route) => route.kind === "vertical").length).toBeGreaterThanOrEqual(scene.floors - 1);
    expect(hasTag(scene, "platform")).toBe(true);
    expect(hasTag(scene, "round") || hasTag(scene, "square")).toBe(true);
    expect(scene.tactical.some((feature) => feature.kind === "highGround")).toBe(true);
  });

  it("gives a direct wizard tower distinct functional floors and a reachable flat duel roof", () => {
    const prompt = "D&D 三层法师塔，真正的螺旋楼梯连接三层，底层炼金实验室，中层藏书室，顶层观星台和屋顶决战平台";
    const scene = generateScene({ ...request("wizard-tower-direct-contract", "medium", 0.62), prompt }, "adaptive");
    expect(scene.rooms.some((room) => room.name === "Alchemy laboratory")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Restricted library")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Spell observatory")).toBe(true);
    expect(hasTag(scene, "alchemy-laboratory")).toBe(true);
    expect(hasTag(scene, "bookcase")).toBe(true);
    expect(hasTag(scene, "telescope")).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("spiral-stair")).length).toBeGreaterThanOrEqual(54);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("roof-duel") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id.includes("wizard-roof-parapet") && primitive.tags?.includes("wall"))).toBe(true);
    expect(scene.routes.some((route) => route.id.includes("tower-spiral-2-roof-route"))).toBe(true);
    expect(scene.diagnostics.valid, scene.diagnostics.warnings.join(" | ")).toBe(true);
  });

  it("builds a sewer with channels, inspection paths, shafts, and downhill waterflow", () => {
    const scene = generateScene(request("sewer-contract", "large", 0.72), "sewer");
    expect(hasTag(scene, "main-channel")).toBe(true);
    expect(hasTag(scene, "branch-channel")).toBe(true);
    expect(hasTag(scene, "maintenance-way")).toBe(true);
    expect(hasTag(scene, "shaft")).toBe(true);
    expect(scene.routes.some((route) => route.kind === "vertical")).toBe(true);
    const waterflow = scene.routes.find((route) => route.kind === "waterflow");
    expect(waterflow).toBeDefined();
    expect(waterflow?.points.some((point, index, points) => index > 0 && point.y < (points[index - 1]?.y ?? point.y))).toBe(true);
  });

  it("builds a cave as a connected elevated chamber graph with ledges and danger", () => {
    const scene = generateScene(request("cave-contract", "large", 0.76), "cave");
    const naturalRooms = scene.rooms.filter((room) => room.role === "natural");
    const edgeCount = naturalRooms.reduce((sum, room) => sum + room.connections.filter((connection) => connection.startsWith("cave-chamber")).length, 0) / 2;
    expect(naturalRooms.length).toBeGreaterThanOrEqual(4);
    expect(edgeCount).toBeGreaterThanOrEqual(naturalRooms.length - 1);
    expect(hasTag(scene, "ledge")).toBe(true);
    expect(scene.tactical.some((feature) => feature.kind === "hazard")).toBe(true);
    expect(new Set(naturalRooms.map((room) => room.center.y)).size).toBeGreaterThan(1);
  });

  it("leaves visible entrance openings for enclosed structures", () => {
    for (const kind of ["tavern", "tower", "sewer"] as const) {
      const scene = generateScene(request(`${kind}-openings`, "medium", 0.6), kind);
      expect(hasTag(scene, "door-frame")).toBe(true);
      expect(scene.tactical.some((feature) => feature.kind === "entrance")).toBe(true);
    }
  });

  it("keeps unsplit rectangular west/east walls on the authored X boundaries", () => {
    const shell = rectangularShell("axis-contract", 0, 7, 5, 0, 14, 10, 3, "wood", "plaster");
    const west = shell.find((primitive) => primitive.id.endsWith("west-wall"));
    const east = shell.find((primitive) => primitive.id.endsWith("east-wall"));
    expect(west?.position.x).toBeCloseTo(0);
    expect(east?.position.x).toBeCloseTo(14 * GRID_METERS);
    expect(west?.position.z).toBeCloseTo(5 * GRID_METERS);
    expect(east?.position.z).toBeCloseTo(5 * GRID_METERS);
  });

  it("keeps round-tower wall long axes tangent to the radius", () => {
    let scene: GeneratedScene | undefined;
    for (let index = 0; index < 24; index += 1) {
      const candidate = generateScene(request(`round-orientation-${index}`), "tower");
      if (hasTag(candidate, "round")) {
        scene = candidate;
        break;
      }
    }
    expect(scene).toBeDefined();
    if (!scene) return;
    const centerX = scene.boundsCells.x * GRID_METERS / 2;
    const centerZ = scene.boundsCells.z * GRID_METERS / 2;
    const walls = scene.primitives.filter((primitive) => primitive.level === 0 && primitive.tags?.includes("round") && primitive.tags?.includes("wall"));
    expect(walls.length).toBeGreaterThanOrEqual(8);
    for (const wall of walls) {
      const radiusX = wall.position.x - centerX;
      const radiusZ = wall.position.z - centerZ;
      const rotation = wall.rotationY ?? 0;
      const longAxisX = Math.cos(rotation);
      const longAxisZ = -Math.sin(rotation);
      const normalizedDot = Math.abs(radiusX * longAxisX + radiusZ * longAxisZ) / Math.max(0.001, Math.hypot(radiusX, radiusZ));
      expect(normalizedDot).toBeLessThan(0.001);
    }
  });

  it("derives vertical route portals and stair geometry from the same endpoints", () => {
    for (const kind of ["tavern", "tower", "sewer"] as const) {
      const scene = generateScene(request(`${kind}-vertical-portals`, "large", 0.7), kind);
      for (const route of scene.routes.filter((candidate) => candidate.kind === "vertical")) {
        const bottom = route.points[0];
        const top = route.points[route.points.length - 1];
        expect(bottom).toBeDefined();
        expect(top).toBeDefined();
        if (!bottom || !top) continue;
        const midpointX = (bottom.x + top.x) / 2;
        const midpointZ = (bottom.z + top.z) / 2;
        const stair = scene.primitives.find((primitive) => (
          primitive.shape === "stairs"
          && primitive.tags?.includes("stair-connection")
          && Math.hypot(primitive.position.x - midpointX, primitive.position.z - midpointZ) < 0.01
          && Math.abs(primitive.position.y - bottom.y) < 0.01
        ));
        expect(stair).toBeDefined();
        expect(stair?.size.y).toBeCloseTo(top.y - bottom.y);
        expect(stair?.size.z).toBeCloseTo(Math.hypot(top.x - bottom.x, top.z - bottom.z));
      }
    }
  });

  it("keeps tavern guest rooms and tower footprints within intended scale bands", () => {
    for (const size of ["small", "medium", "large"] as const) {
      for (let index = 0; index < 12; index += 1) {
        const tavern = generateScene(request(`scale-tavern-${size}-${index}`, size, 0.65), "tavern");
        for (const room of tavern.rooms.filter((candidate) => candidate.name.startsWith("Guest room"))) {
          expect(room.sizeCells.x).toBeGreaterThanOrEqual(3);
          expect(room.sizeCells.z).toBeGreaterThanOrEqual(3);
          expect(room.sizeCells.x).toBeLessThanOrEqual(7);
          expect(room.sizeCells.z).toBeLessThanOrEqual(7);
        }
        const tower = generateScene(request(`scale-tower-${size}-${index}`, size, 0.65), "tower");
        expect(tower.boundsCells.x).toBeLessThanOrEqual(size === "large" ? 21 : size === "medium" ? 15 : 12);
      }
    }
  });

  it("compiles adaptive prompts through an auditable SceneProgram deterministically", () => {
    const adaptiveRequest: GenerationRequest = {
      prompt: "A flooded cave below a ruined watchtower, with an altar, collapse, dense rubble, and a dark upper platform.",
      seed: "adaptive-contract",
      size: "small",
      density: 0.3,
    };
    const scene = generateScene(adaptiveRequest, "adaptive");
    expect(scene.kind).toBe("adaptive");
    expect(scene.description).toContain("Compiled from");
    expect(scene.sceneProgram?.version).toBe(1);
    expect(scene.sceneProgram?.regionCount).toBeGreaterThanOrEqual(2);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("scene-program"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene).toEqual(generateScene(adaptiveRequest, "adaptive"));
  });

  it("routes composite outdoor prompts into dedicated industrial and tidal grammars", () => {
    const industrial = generateScene({ ...request("industrial-composite", "medium", 0.7), prompt: "废弃工业区，有高低厂房、输送桥、积水坑、锈蚀管道和可攀爬平台" }, "adaptive");
    expect(industrial.archetype).toBe("industrial-ruin");
    expect(industrial.primitives.some((primitive) => primitive.tags?.includes("factory"))).toBe(true);
    expect(industrial.primitives.some((primitive) => primitive.tags?.includes("conveyor-bridge"))).toBe(true);
    expect(industrial.diagnostics.valid).toBe(true);
    const coral = generateScene({ ...request("coral-composite", "medium", 0.7), prompt: "潮汐周期会改变路线的珊瑚庭院，有水位差、潮池、礁石掩体和高架木桥" }, "adaptive");
    expect(coral.archetype).toBe("coral-tide");
    expect(coral.primitives.some((primitive) => primitive.tags?.includes("tide-pool"))).toBe(true);
    expect(coral.primitives.some((primitive) => primitive.tags?.includes("wood-bridge"))).toBe(true);
    expect(coral.routes.some((route) => route.id === "coral-high-tide-route")).toBe(true);
    expect(coral.diagnostics.valid).toBe(true);
  });

  it("routes a coastal lighthouse into a dedicated round tower program", () => {
    const scene = generateScene({ ...request("lighthouse-audit-09"), prompt: "临海灯塔，螺旋交通、储藏层、守塔人住所、灯室和外部维护平台" }, "adaptive");
    expect(scene.title).toContain("Stormglass Lighthouse");
    expect(scene.floors).toBeGreaterThanOrEqual(4);
    expect(scene.rooms.some((room) => room.name === "Oil and signal storage")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Keeper's residence")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Lamp room")).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("spiral-stair")).length).toBeGreaterThanOrEqual(54);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("maintenance-gallery"))).toBe(true);
    expect(scene.routes.some((route) => route.id === "lighthouse-gallery-route")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("gives an industrial ruin measurable height bands and a reachable catwalk", () => {
    const scene = generateScene({ ...request("industrial-audit-09", "medium", 0.62), prompt: "现实废弃工业区，有三栋高低不同的厂房、锅炉车间、锈蚀管道、输送桥、积水坑、维护猫道和可攀爬平台" }, "adaptive");
    const factoryWalls = scene.primitives.filter((primitive) => primitive.id.includes("industrial-factory-") && primitive.tags?.includes("wall"));
    const heights = [...new Set(factoryWalls.map((primitive) => Math.round(primitive.size.y * 100) / 100))];
    expect(heights.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(3);
    expect(scene.primitives.some((primitive) => primitive.id === "industrial-catwalk-stair")).toBe(true);
    expect(scene.routes.some((route) => route.id === "industrial-catwalk-route")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("separates a tower's underground greenhouse from its ground-floor inspection layer", () => {
    const scene = generateScene({ ...request("tree-greenhouse-contract"), prompt: "被巨树贯穿的炼金塔，断裂楼层、悬桥、地下温室和树冠战斗平台" }, "adaptive");
    const greenhouse = scene.rooms.find((room) => room.name === "Underground alchemical greenhouse");
    expect(greenhouse).toBeDefined();
    expect(scene.floorLabels?.[greenhouse?.level ?? -1]).toBe("B1");
    expect(greenhouse?.level).toBe(scene.floors - 1);
    expect(greenhouse?.center.y).toBeLessThan(0);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("tree-canopy") && primitive.tags?.includes("standable"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("turns institutional room names into visible police partitions", () => {
    const scene = generateScene({ ...request("police-room-geometry"), prompt: "1920年代 CoC 警察局，接待台、拘留区、审讯室、证物室、档案室和后门车库" }, "adaptive");
    expect(scene.archetype).toBe("police");
    expect(scene.rooms.some((room) => room.name === "Interrogation room")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Case archives")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("room-partition"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("keeps an attached family crypt inside a manor instead of hijacking the domain", () => {
    const scene = generateScene({ ...request("manor-crypt-composite"), prompt: "D&D 庄园宅邸，有中央庭院、主楼、仆从翼、家族墓穴和屋顶伏击点" }, "adaptive");
    expect(scene.archetype).toBe("manor");
    expect(scene.rooms.some((room) => room.name === "Inner courtyard")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Family apartments")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("changes a manor's room graph geometry across seeds while replaying deterministically", () => {
    const prompt = "D&D 庄园宅邸，有不规则中央庭院、主楼、东西侧翼、仆从通道、家族墓穴和屋顶伏击点";
    const firstRequest = { ...request("manor-seed-a"), prompt };
    const secondRequest = { ...request("manor-seed-b"), prompt };
    const first = generateScene(firstRequest, "adaptive");
    const replay = generateScene(firstRequest, "adaptive");
    const second = generateScene(secondRequest, "adaptive");
    expect(first).toEqual(replay);
    expect(first.rooms.map((room) => [room.id, room.center.x, room.center.z, room.sizeCells.x, room.sizeCells.z]))
      .not.toEqual(second.rooms.map((room) => [room.id, room.center.x, room.center.z, room.sizeCells.x, room.sizeCells.z]));
    expect(first.diagnostics.valid).toBe(true);
    expect(second.diagnostics.valid).toBe(true);
  });

  it("composes an unfamiliar mixed-use building instead of falling back to wilderness or a box", () => {
    const scene = generateScene({ ...request("weather-monastery"), prompt: "COC 1920年代山顶气象修道院，有环形回廊、无线电室、档案密库、屋顶天线平台和地下防空洞" }, "adaptive");
    expect(scene.sceneProgram?.domain).toBe("building");
    expect(scene.buildingProgram?.topology).toBe("composite");
    expect(scene.rooms.some((room) => room.name === "Enclosed cloister garden")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Wireless observation room")).toBe(true);
    expect(scene.rooms.some((room) => room.name === "Underground air-raid shelter")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("antenna"))).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("radio-console"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("compiles an arcane academy into towers, specialist rooms, a roof bridge and a basement ritual level", () => {
    const scene = generateScene({ ...request("academy-program-r10"), prompt: "D&D 法师学院，中央讲堂、两座研究塔、炼金翼、图书馆、地下召唤室、屋顶连桥和秘密教授通道" }, "adaptive");
    expect(scene.archetype).toBe("school");
    for (const tag of ["lecture-hall", "research-tower", "alchemy-lab", "library", "summoning-circle", "roof-bridge", "secret-passage"]) expect(hasTag(scene, tag)).toBe(true);
    expect(scene.primitives.filter((primitive) => primitive.tags?.includes("tower-mass"))).toHaveLength(2);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("turns destructive and flooded prompt states into geometry while preserving a valid room graph", () => {
    const church = generateScene({ ...request("ruined-state-r10"), prompt: "破败教堂，坍塌耳堂、地下墓室和临时木桥" }, "adaptive");
    const museum = generateScene({ ...request("flood-state-r10"), prompt: "被洪水淹没的博物馆，半淹地下库房和屋顶逃生路线" }, "adaptive");
    expect(hasTag(church, "rubble")).toBe(true);
    expect(hasTag(church, "temporary-bridge")).toBe(true);
    expect(hasTag(museum, "flooded")).toBe(true);
    expect(church.diagnostics.valid && museum.diagnostics.valid).toBe(true);
  });

  it("keeps composed-building stair runs local instead of stretching a ramp between remote room centres", () => {
    const scene = generateScene({ ...request("compact-stairs-r10"), prompt: "建在旧火车站里的炼金公会，有站台大厅、实验车间、档案车厢、地下货运隧道、钟楼和屋顶输送桥" }, "adaptive");
    const stairs = scene.primitives.filter((primitive) => primitive.tags?.includes("building-stair"));
    expect(stairs.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...stairs.map((primitive) => primitive.size.z / GRID_METERS))).toBeLessThanOrEqual(6.6);
    expect(scene.archetype).toBe("workshop");
    expect(hasTag(scene, "station-platform")).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
  });

  it("uses real gable-prism roof geometry for sacred and hospitality massing", () => {
    const church = generateScene({ ...request("gable-church-r10"), prompt: "破败哥特式教堂，十字形中殿与两侧祷告室" }, "adaptive");
    const inn = generateScene({ ...request("gable-inn-r10"), prompt: "D&D 三层酒馆旅店与后院马厩" }, "adaptive");
    expect(church.primitives.filter((primitive) => primitive.shape === "gable" && primitive.tags?.includes("pitched-roof")).length).toBeGreaterThanOrEqual(3);
    expect(inn.primitives.some((primitive) => primitive.shape === "gable" && primitive.tags?.includes("domestic"))).toBe(true);
    expect(church.diagnostics.valid && inn.diagnostics.valid).toBe(true);
  });
});
