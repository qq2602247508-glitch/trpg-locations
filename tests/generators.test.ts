import { describe, expect, it } from "vitest";
import { generateScene, generatorRegistry } from "../src/generators";
import { SeededRandom } from "../src/core/random";
import { instantiateBuildingModule } from "../src/generators/buildingModule";
import { baseScene, rectangularShell } from "../src/generators/shared";
import { GRID_METERS, type GeneratedScene, type GenerationRequest, type SceneKind, type SettlementBuildingKind } from "../src/schema";
import { floorBaseY, fogDensityForSpan, levelForY, overlayTouchesFloor, routeMatchesTime, spatialBatchKey } from "../src/render/SceneRenderer";

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
    expect(harbor.buildingInstances?.length).toBe(harbor.rooms.filter((room) => room.id.startsWith("settlement-building-")).length);
    expect(harbor.buildingInstances?.every((building) => building.detailLevel === "exterior-proxy" && building.seed.length > 0)).toBe(true);
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

  it("prefers a specific harbor grammar inside a named city", () => {
    const harborDistrict = generateScene({ ...request("settlement-deepwater-harbor"), prompt: "深水城港区的仓库、市场和码头", size: "large" }, "settlement");
    expect(harborDistrict.archetype).toBe("harbor");
    expect(hasTag(harborDistrict, "harbor-edge")).toBe(true);
  });

  it("propagates requested density into settlement building count and adds city defenses", () => {
    const sparse = generateScene({ ...request("settlement-density", "large", 0), prompt: "大型城市街区" }, "settlement");
    const dense = generateScene({ ...request("settlement-density", "large", 1), prompt: "大型城市街区" }, "settlement");
    const buildingCount = (scene: GeneratedScene) => scene.rooms.filter((room) => room.id.startsWith("settlement-building-")).length;
    expect(buildingCount(dense)).toBeGreaterThan(buildingCount(sparse));
    expect(hasTag(dense, "city-wall")).toBe(true);
    expect(hasTag(dense, "corner-tower")).toBe(true);
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
});
