import { describe, expect, it } from "vitest";
import { generateScene, generatorRegistry } from "../src/generators";
import { rectangularShell } from "../src/generators/shared";
import { GRID_METERS, type GeneratedScene, type GenerationRequest, type SceneKind } from "../src/schema";
import { levelForY, overlayTouchesFloor } from "../src/render/SceneRenderer";

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

  it("registers each fixed topology", () => {
    expect(Object.keys(generatorRegistry).sort()).toEqual(["cave", "sewer", "tavern", "tower"]);
  });

  it.each(["tavern", "tower", "sewer", "cave"] as const)("is seed-reproducible and validated for %s", (kind) => {
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
    const kinds: readonly Exclude<SceneKind, "adaptive">[] = ["tavern", "tower", "sewer", "cave"];
    for (const kind of kinds) {
      const first = generateScene(request(`${kind}-variation-a`), kind);
      const second = generateScene(request(`${kind}-variation-b`), kind);
      expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    }
  });

  it("emits cleanly valid output across a small seed/scale matrix", () => {
    const kinds: readonly Exclude<SceneKind, "adaptive">[] = ["tavern", "tower", "sewer", "cave"];
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

  it("composes adaptive traits and degrades excess modifiers deterministically", () => {
    const adaptiveRequest: GenerationRequest = {
      prompt: "A flooded cave below a ruined watchtower, with an altar, collapse, dense rubble, and a dark upper platform.",
      seed: "adaptive-contract",
      size: "small",
      density: 0.3,
    };
    const scene = generateScene(adaptiveRequest, "adaptive");
    expect(scene.kind).toBe("adaptive");
    expect(scene.description).toContain("Adaptive composition");
    expect(scene.description).toContain("Degraded deterministically");
    expect(scene.primitives.some((primitive) => primitive.tags?.includes("adaptive"))).toBe(true);
    expect(scene.diagnostics.valid).toBe(true);
    expect(scene).toEqual(generateScene(adaptiveRequest, "adaptive"));
  });
});
