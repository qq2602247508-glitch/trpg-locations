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
