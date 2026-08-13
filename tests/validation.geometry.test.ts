import { describe, expect, it } from "vitest";
import { generateScene } from "../src/generators";
import { GRID_METERS, type GenerationRequest, type ScenePrimitive } from "../src/schema";
import { validateScene } from "../src/validation/scene";

const request: GenerationRequest = {
  prompt: "A tactical location with routes, cover, height, and a meaningful encounter objective.",
  seed: "geometry-p1-regression",
  size: "medium",
  density: 0.64,
};

function hasTag(primitive: ScenePrimitive, tag: string): boolean {
  return primitive.tags?.includes(tag) ?? false;
}

function hasError(result: ReturnType<typeof validateScene>, text: string): boolean {
  return result.errors.some((error) => error.includes(text));
}

describe("geometry-level P1 validation", () => {
  it("rejects vertical routes with no local stairs and no unsealed floor crossing evidence", () => {
    const scene = generateScene({ ...request, seed: "geometry-vertical" }, "tower");
    scene.primitives = scene.primitives.filter((primitive) => primitive.shape !== "stairs" && !hasTag(primitive, "shaft-access"));
    const vertical = scene.routes.find((route) => route.kind === "vertical");
    const first = vertical?.points[0];
    const last = vertical?.points[vertical.points.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first !== undefined && last !== undefined) {
      scene.primitives.push({
        id: "sealed-intermediate-floor",
        shape: "box",
        position: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, z: (first.z + last.z) / 2 },
        size: { x: GRID_METERS * 8, y: 0.2, z: GRID_METERS * 8 },
        material: "stone",
        level: 1,
        tags: ["floor", "solid"],
      });
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "no nearby stairs or shaft-access primitive")).toBe(true);
    expect(hasError(result, "crosses solid floor slab")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("does not let a stair alone excuse a solid intermediate floor slab", () => {
    const scene = generateScene({ ...request, seed: "geometry-sealed-stair" }, "tower");
    const vertical = scene.routes.find((route) => route.kind === "vertical");
    const first = vertical?.points[0];
    const last = vertical?.points[vertical.points.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first !== undefined && last !== undefined) {
      scene.primitives.push({
        id: "sealed-stair-floor",
        shape: "box",
        position: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, z: (first.z + last.z) / 2 },
        size: { x: GRID_METERS * 8, y: 0.2, z: GRID_METERS * 8 },
        material: "stone",
        level: 1,
        tags: ["floor", "solid"],
      });
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "without local vertical-opening or shaft evidence")).toBe(true);
  });

  it("requires doorway/opening evidence when a closed building claims room connections", () => {
    const scene = generateScene({ ...request, seed: "geometry-openings" }, "tavern");
    scene.primitives = scene.primitives.filter((primitive) => (
      !hasTag(primitive, "door-frame")
      && !hasTag(primitive, "opening")
      && !hasTag(primitive, "floor-opening")
      && !hasTag(primitive, "opening-frame")
      && !(primitive.tags?.some((tag) => tag.startsWith("opening:")) ?? false)
      && !primitive.id.includes("door-frame")
      && !primitive.id.includes("opening")
      && !primitive.id.includes("doorway")
    ));

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Closed building room connections")).toBe(true);
    expect(result.diagnostics.metrics.openingEvidenceCount).toBe(0);
  });

  it("does not accept an unrelated doorway as proof that a solid room-to-room wall is passable", () => {
    const scene = generateScene({ ...request, seed: "geometry-local-opening" }, "tavern");
    scene.rooms.push(
      {
        id: "sealed-room-a",
        name: "Sealed room A",
        level: 0,
        center: { x: 140, y: 0, z: 140 },
        sizeCells: { x: 4, z: 4 },
        role: "service",
        connections: ["sealed-room-b"],
      },
      {
        id: "sealed-room-b",
        name: "Sealed room B",
        level: 0,
        center: { x: 160, y: 0, z: 140 },
        sizeCells: { x: 4, z: 4 },
        role: "private",
        connections: ["sealed-room-a"],
      },
    );
    scene.primitives.push({
      id: "sealed-test-wall",
      shape: "box",
      position: { x: 150, y: 0, z: 140 },
      size: { x: 0.4, y: 3, z: 12 },
      material: "plaster",
      level: 0,
      tags: ["wall"],
    });

    const result = validateScene(scene);

    expect(result.diagnostics.metrics.openingEvidenceCount).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
    expect(hasError(result, "crosses solid wall sealed-test-wall")).toBe(true);
  });

  it("rejects an anchored canopy whose authored trunk is detached", () => {
    const scene = generateScene({
      ...request,
      prompt: "森林中的古老树冠，有树干、封闭林冠和树冠战斗平台",
      seed: "geometry-canopy-anchor",
    }, "adaptive");
    const canopy = scene.primitives.find((primitive) => primitive.tags?.includes("tree-canopy") && primitive.tags?.includes("canopy-layer"));
    const trunk = scene.primitives.find((primitive) => primitive.tags?.includes("tree-trunk") && primitive.tags?.some((tag) => tag.startsWith("tree-anchor:")));
    expect(canopy).toBeDefined();
    expect(trunk).toBeDefined();
    if (canopy && trunk) {
      const anchor = canopy.tags?.find((tag) => tag.startsWith("tree-anchor:"));
      canopy.tags = [...(canopy.tags ?? []), anchor ?? "tree-anchor:test"];
      trunk.position.x += GRID_METERS * 10;
      trunk.position.z += GRID_METERS * 10;
    }
    const result = validateScene(scene);
    expect(result.valid).toBe(false);
    expect(hasError(result, "has no attached trunk support")).toBe(true);
  });

  it("rejects a floor-backed route that cuts through a solid wall", () => {
    const scene = generateScene({ ...request, seed: "geometry-route-wall" }, "tower");
    const room = scene.rooms.find((candidate) => candidate.level === 0 && candidate.role === "public");
    expect(room).toBeDefined();
    if (room !== undefined) {
      const y = room.center.y + 0.18;
      scene.routes.push({
        id: "wall-crossing-route",
        kind: "alternate",
        points: [
          { x: room.center.x - GRID_METERS * 2, y, z: room.center.z },
          { x: room.center.x + GRID_METERS * 2, y, z: room.center.z },
        ],
      });
      scene.primitives.push({
        id: "test-route-wall",
        shape: "box",
        position: { x: room.center.x, y: room.center.y, z: room.center.z },
        size: { x: 0.3, y: 3, z: GRID_METERS * 4 },
        material: "stone",
        level: 0,
        tags: ["wall"],
      });
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Route wall-crossing-route passes through solid wall test-route-wall")).toBe(true);
  });

  it("rejects rising waterflow routes and waterflow with no water geometry", () => {
    const scene = generateScene({ ...request, seed: "geometry-water" }, "sewer");
    const waterflow = scene.routes.find((route) => route.kind === "waterflow");
    expect(waterflow).toBeDefined();
    const first = waterflow?.points[0];
    const second = waterflow?.points[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      waterflow!.points[1] = { ...second, y: first.y + GRID_METERS };
    }
    scene.primitives = scene.primitives.filter((primitive) => primitive.shape !== "water" && primitive.material !== "water" && !hasTag(primitive, "water"));

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Waterflow route")).toBe(true);
    expect(hasError(result, "without nearby water primitive evidence")).toBe(true);
  });

  it("rejects a waterflow whose only water primitive covers one short segment", () => {
    const scene = generateScene({ ...request, seed: "geometry-water-gap" }, "sewer");
    const waterflow = scene.routes.find((route) => route.kind === "waterflow");
    const first = waterflow?.points[0];
    expect(first).toBeDefined();
    scene.primitives = scene.primitives.filter((primitive) => primitive.shape !== "water" && primitive.material !== "water" && !hasTag(primitive, "water"));
    if (first !== undefined) {
      scene.primitives.push({
        id: "short-water-segment",
        shape: "water",
        position: { ...first },
        size: { x: GRID_METERS * 0.4, y: 0.2, z: GRID_METERS * 0.4 },
        material: "water",
        level: 0,
        tags: ["water"],
      });
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Waterflow route")).toBe(true);
    expect(hasError(result, "sample(s) without nearby water primitive evidence")).toBe(true);
  });

  it("rejects route points inside broad map bounds when no walkable surface supports them", () => {
    const scene = generateScene({ ...request, seed: "geometry-route-surface" }, "cave");
    const route = scene.routes.find((candidate) => candidate.kind === "primary" && candidate.points.length >= 3);
    expect(route).toBeDefined();
    if (route !== undefined) {
      route.points[1] = {
        x: scene.boundsCells.x * GRID_METERS - GRID_METERS * 0.1,
        y: route.points[1]?.y ?? 0,
        z: scene.boundsCells.z * GRID_METERS - GRID_METERS * 0.1,
      };
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "has no nearby walkable primitive evidence")).toBe(true);
  });

  it("rejects cave elevation changes when their natural ramp evidence is removed", () => {
    const scene = generateScene({ ...request, seed: "repeatable-cave" }, "cave");
    scene.primitives = scene.primitives.filter((primitive) => !hasTag(primitive, "natural-ramp") && !hasTag(primitive, "elevation-change"));

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "without natural-ramp or elevation-change evidence")).toBe(true);
    expect(result.diagnostics.metrics.geometryErrorCount).toBeGreaterThan(0);
  });

  it("rejects a site stair whose endpoints float away from all landings", () => {
    const scene = generateScene({
      ...request,
      prompt: "森林村庄，有高低起伏道路和木桥",
      seed: "geometry-floating-site-stair",
    }, "adaptive");
    scene.primitives.push({
      id: "detached-site-stair",
      shape: "stairs",
      position: { x: GRID_METERS * 9, y: GRID_METERS * 6, z: GRID_METERS * 9 },
      size: { x: GRID_METERS, y: GRID_METERS * 2, z: GRID_METERS * 4 },
      material: "wood",
      level: 1,
      tags: ["stairs", "site-program", "supported", "cliff-descent"],
    });

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Stair detached-site-stair has a floating lower endpoint")).toBe(true);
    expect(hasError(result, "Stair detached-site-stair has a floating upper endpoint")).toBe(true);
  });

  it("rejects a detached ladder even when it carries generic shaft-access tags", () => {
    const scene = generateScene({
      ...request,
      prompt: "悬崖哨塔和维修梯",
      seed: "geometry-floating-ladder",
    }, "adaptive");
    scene.primitives.push({
      id: "detached-maintenance-ladder",
      shape: "box",
      position: { x: GRID_METERS * 24, y: GRID_METERS * 20, z: GRID_METERS * 24 },
      size: { x: 0.45, y: GRID_METERS * 4, z: 0.18 },
      material: "metal",
      level: 1,
      tags: ["ladder", "climbable", "shaft-access", "vertical-route"],
    });

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Ladder detached-maintenance-ladder has a floating lower endpoint")).toBe(true);
    expect(hasError(result, "Ladder detached-maintenance-ladder has a floating upper endpoint")).toBe(true);
  });

  it("rejects a supported stair whose run crosses a solid wall without an opening", () => {
    const scene = generateScene({ ...request, seed: "geometry-stair-wall" }, "tower");
    scene.primitives.push(
      {
        id: "connector-lower-landing",
        shape: "box",
        position: { x: GRID_METERS * 5, y: 0, z: GRID_METERS * 5 },
        size: { x: GRID_METERS * 4, y: 0.3, z: GRID_METERS * 4 },
        material: "stone",
        level: 0,
        tags: ["floor", "platform"],
      },
      {
        id: "connector-upper-landing",
        shape: "box",
        position: { x: GRID_METERS * 5, y: GRID_METERS * 3, z: GRID_METERS * 11 },
        size: { x: GRID_METERS * 4, y: 0.3, z: GRID_METERS * 4 },
        material: "stone",
        level: 1,
        tags: ["floor", "platform"],
      },
      {
        id: "blocked-connector-stair",
        shape: "stairs",
        position: { x: GRID_METERS * 5, y: 0, z: GRID_METERS * 8 },
        size: { x: GRID_METERS, y: GRID_METERS * 3, z: GRID_METERS * 6 },
        material: "stone",
        level: 0,
        tags: ["stairs", "vertical-opening"],
      },
      {
        id: "connector-blocking-wall",
        shape: "box",
        position: { x: GRID_METERS * 5, y: GRID_METERS * 1.5, z: GRID_METERS * 8 },
        size: { x: GRID_METERS * 4, y: GRID_METERS * 3, z: 0.35 },
        material: "stone",
        level: 0,
        tags: ["wall"],
      },
    );

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Stair blocked-connector-stair crosses solid wall connector-blocking-wall")).toBe(true);
  });

  it("rejects an artificial bridge whose far endpoint has no landing or anchor", () => {
    const scene = generateScene({ ...request, seed: "geometry-bridge-endpoint" }, "cave");
    scene.primitives.push(
      {
        id: "test-bridge",
        shape: "box",
        position: { x: 100, y: 8, z: 100 },
        size: { x: 12, y: 0.2, z: 2 },
        material: "wood",
        level: 1,
        tags: ["floor", "bridge", "standable", "supported-crossing", "support-validation-required"],
      },
      {
        id: "test-bridge-first-anchor",
        shape: "box",
        position: { x: 94, y: 4, z: 100 },
        size: { x: 2, y: 8, z: 3 },
        material: "stone",
        level: 0,
        tags: ["bridge-anchor", "structural-support"],
      },
    );

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Bridge test-bridge has a floating second endpoint")).toBe(true);
  });

  it("accepts an artificial bridge with structural anchors at both endpoints", () => {
    const scene = generateScene({ ...request, seed: "geometry-supported-bridge" }, "cave");
    scene.primitives.push(
      {
        id: "supported-test-bridge",
        shape: "box",
        position: { x: 100, y: 8, z: 100 },
        size: { x: 12, y: 0.2, z: 2 },
        material: "wood",
        level: 1,
        tags: ["floor", "bridge", "standable", "supported-crossing", "support-validation-required"],
      },
      ...[94, 106].map((x, index): ScenePrimitive => ({
        id: `supported-test-bridge-anchor-${index + 1}`,
        shape: "box",
        position: { x, y: 4, z: 100 },
        size: { x: 2, y: 8, z: 3 },
        material: "stone",
        level: 0,
        tags: ["bridge-anchor", "structural-support"],
      })),
    );

    const result = validateScene(scene);

    expect(hasError(result, "Bridge supported-test-bridge")).toBe(false);
  });

  it("rejects a contracted production ice bridge moved away from its banks and anchors", () => {
    const scene = generateScene({
      ...request,
      prompt: "破碎冰原上的地下研究设施，有冰裂缝和冰桥",
      seed: "geometry-production-ice-bridge",
      size: "large",
    }, "wilderness");
    const bridge = scene.primitives.find((primitive) => (
      hasTag(primitive, "support-validation-required")
      && hasTag(primitive, "natural-ice-bridge")
    ));
    expect(bridge).toBeDefined();
    if (bridge !== undefined) {
      bridge.position.x += GRID_METERS * 40;
      bridge.position.z += GRID_METERS * 40;
    }

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, `Bridge ${bridge?.id} has a floating first endpoint`)).toBe(true);
    expect(hasError(result, `Bridge ${bridge?.id} has a floating second endpoint`)).toBe(true);
  });

  it("rejects an explicit elevated platform without structural continuity", () => {
    const scene = generateScene({ ...request, seed: "geometry-platform-support" }, "cave");
    scene.primitives.push({
      id: "unsupported-observation-platform",
      shape: "box",
      position: { x: 120, y: 12, z: 120 },
      size: { x: 8, y: 0.2, z: 6 },
      material: "wood",
      level: 2,
      tags: ["floor", "platform", "observation-platform", "standable", "support-validation-required"],
    });

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Elevated platform unsupported-observation-platform has no sufficient structural support continuity")).toBe(true);
  });

  it("requires explicit vertical-route connectors to connect to a nearby route", () => {
    const scene = generateScene({ ...request, seed: "geometry-route-purpose" }, "cave");
    scene.primitives.push(
      {
        id: "route-purpose-lower",
        shape: "box",
        position: { x: 140, y: 4, z: 140 },
        size: { x: 5, y: 0.2, z: 5 },
        material: "stone",
        level: 1,
        tags: ["floor", "platform", "standable"],
      },
      {
        id: "route-purpose-upper",
        shape: "box",
        position: { x: 140, y: 8, z: 148 },
        size: { x: 5, y: 0.2, z: 5 },
        material: "stone",
        level: 2,
        tags: ["floor", "platform", "standable"],
      },
      {
        id: "route-purpose-stair",
        shape: "stairs",
        position: { x: 140, y: 4, z: 144 },
        size: { x: 2, y: 4, z: 8 },
        material: "stone",
        level: 1,
        tags: ["stairs", "vertical-route", "route-destination-required", "vertical-opening"],
      },
    );

    const withoutRoute = validateScene(scene);
    expect(hasError(withoutRoute, "Stair route-purpose-stair has no nearby route destination evidence")).toBe(true);

    scene.routes.push({
      id: "route-purpose-evidence",
      kind: "vertical",
      points: [
        { x: 140, y: 4, z: 140 },
        { x: 140, y: 8, z: 148 },
      ],
    });
    const withRoute = validateScene(scene);
    expect(hasError(withRoute, "Stair route-purpose-stair has no nearby route destination evidence")).toBe(false);
  });

  it("does not impose artificial support rules on natural bridges or ordinary platforms", () => {
    const scene = generateScene({ ...request, seed: "geometry-natural-bridge" }, "cave");
    scene.primitives.push(
      {
        id: "natural-rock-bridge",
        shape: "box",
        position: { x: 170, y: 12, z: 170 },
        size: { x: 14, y: 1, z: 3 },
        material: "rock",
        level: 2,
        tags: ["floor", "bridge", "natural-bridge", "standable"],
      },
      {
        id: "ordinary-terrain-platform",
        shape: "box",
        position: { x: 190, y: 12, z: 190 },
        size: { x: 8, y: 1, z: 8 },
        material: "rock",
        level: 2,
        tags: ["floor", "platform", "terrain", "standable"],
      },
    );

    const result = validateScene(scene);

    expect(hasError(result, "Bridge natural-rock-bridge")).toBe(false);
    expect(hasError(result, "Elevated platform ordinary-terrain-platform")).toBe(false);
  });

  it("rejects a detached tree canopy while accepting its grounded trunked neighbors", () => {
    const scene = generateScene({
      ...request,
      prompt: "森林村庄，茂密林带和林间道路",
      seed: "geometry-detached-canopy",
    }, "adaptive");
    scene.primitives.push({
      id: "detached-tree-canopy",
      shape: "sphere",
      position: { x: GRID_METERS * 12, y: GRID_METERS * 8, z: GRID_METERS * 12 },
      size: { x: GRID_METERS * 3, y: GRID_METERS * 2, z: GRID_METERS * 3 },
      material: "moss",
      level: 1,
      tags: ["forest", "tree", "tree-canopy", "canopy-layer"],
    });

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(hasError(result, "Tree canopy detached-tree-canopy has no attached trunk support")).toBe(true);
  });
});
