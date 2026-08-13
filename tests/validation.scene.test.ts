import { describe, expect, it } from "vitest";
import type { GeneratedScene } from "../src/schema";
import { validateScene } from "../src/validation/scene";

function validScene(): GeneratedScene {
  return {
    version: 1,
    kind: "tavern",
    title: "The Copper Cup",
    description: "A compact tavern encounter space.",
    seed: "copper-cup",
    gridFeet: 5,
    boundsCells: { x: 12, z: 10 },
    floors: 1,
    floorHeightFeet: [12],
    primitives: [{
      id: "floor",
      shape: "box",
      position: { x: 0, y: 0, z: 0 },
      size: { x: 12, y: 0.2, z: 10 },
      material: "wood",
      level: 0,
      tags: ["floor"],
    }],
    rooms: [{
      id: "common-room",
      name: "Common room",
      level: 0,
      center: { x: 0, y: 0, z: 0 },
      sizeCells: { x: 8, z: 6 },
      role: "public",
      connections: [],
    }],
    routes: [{
      id: "front-door",
      kind: "primary",
      points: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    }],
    tactical: [{
      id: "entry",
      kind: "entrance",
      position: { x: -1, y: 0, z: 0 },
      radiusCells: 1,
      note: "Front door",
    }],
    diagnostics: { valid: false, score: 0, warnings: [], repairs: [], metrics: {} },
    generationMs: 0,
  };
}

describe("validateScene", () => {
  it("returns a valid diagnostic copy without mutating a well-formed scene", () => {
    const scene = validScene();
    const original = structuredClone(scene);
    const result = validateScene(scene);

    expect(result.valid).toBe(true);
    expect(result.scene.diagnostics).toEqual(result.diagnostics);
    expect(result.score).toBeGreaterThan(60);
    expect(scene).toEqual(original);
  });

  it("repairs metadata, IDs, room topology, and minimal tactical metadata", () => {
    const scene = validScene();
    scene.gridFeet = 10 as 5;
    scene.floorHeightFeet = [];
    scene.primitives.push({ ...scene.primitives[0]!, id: "floor" });
    scene.rooms.push({
      id: "back-room",
      name: "Back room",
      level: 0,
      center: { x: 4, y: 0, z: 0 },
      sizeCells: { x: 4, z: 4 },
      role: "private",
      connections: ["missing-room"],
    });
    scene.routes = [];
    scene.tactical = [];

    const result = validateScene(scene);
    const repaired = result.scene;

    expect(result.valid).toBe(true);
    expect(repaired.gridFeet).toBe(5);
    expect(repaired.floorHeightFeet).toHaveLength(repaired.floors);
    expect(new Set(repaired.primitives.map((primitive) => primitive.id)).size).toBe(repaired.primitives.length);
    expect(repaired.routes.some((route) => route.kind === "primary")).toBe(true);
    expect(repaired.tactical.some((feature) => feature.kind === "entrance")).toBe(true);
    expect(repaired.rooms[0]?.connections).toContain("back-room");
    expect(repaired.rooms[1]?.connections).toContain("common-room");
    expect(result.repairs.length).toBeGreaterThan(0);
  });

  it("reports, rather than applies, repairs when repair is disabled", () => {
    const scene = validScene();
    scene.gridFeet = 10 as 5;

    const result = validateScene(scene, { repair: false });

    expect(result.valid).toBe(false);
    expect(result.scene.gridFeet).toBe(10);
    expect(result.repairs).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("flags metre-space route locations outside map bounds without moving geometry", () => {
    const scene = validScene();
    scene.boundsCells = { x: 2, z: 2 };
    scene.primitives[0]!.position = { x: 100, y: 0, z: -100 };
    scene.routes[0]!.points = [{ x: 100, y: 0, z: -100 }, { x: 101, y: 0, z: -100 }];
    scene.tactical[0]!.position = { x: 100, y: 0, z: -100 };

    const result = validateScene(scene);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Route front-door point 0 lies outside the reasonable metre-space bounds.");
    expect(result.scene.primitives[0]?.position).toEqual({ x: 100, y: 0, z: -100 });
  });

  it("repairs invalid timing while preserving legacy generationMs as total", () => {
    const scene = validScene();
    scene.generationMs = 12;
    scene.timing = { planningMs: -1, geometryMs: Number.NaN, totalMs: 2, transportMs: -4 };

    const result = validateScene(scene);

    expect(result.scene.timing).toEqual({
      planningMs: 0,
      geometryMs: 0,
      totalMs: 12,
      transportMs: 0,
    });
    expect(result.scene.generationMs).toBe(12);
    expect(result.repairs.some((repair) => repair.includes("timing"))).toBe(true);
  });

  it("accepts legacy scenes without timing", () => {
    const result = validateScene(validScene());
    expect(result.valid).toBe(true);
    expect(result.scene.timing).toBeUndefined();
  });

  it("preserves replay metadata on validated building manifests", () => {
    const scene = validScene();
    scene.primitives.push({
      id: "metadata-building-shell",
      shape: "box",
      position: { x: 4, y: 0, z: 4 },
      size: { x: 4, y: 4, z: 4 },
      material: "stone",
      level: 0,
      tags: ["independent-building-module"],
    });
    scene.buildingInstances = [{
      id: "metadata-building",
      archetype: "guild",
      seed: "metadata-building-seed",
      district: "research",
      positionCells: { x: 4, z: 4 },
      footprintCells: { x: 6, z: 5 },
      rotationY: 0,
      floors: 2,
      floorHeightFeet: [10, 10],
      detailLevel: "facade",
      siteProfile: "peat-clinic",
      state: "flooded",
      functionalModules: [{
        id: "submerged",
        kind: "submerged-room",
        label: "Half-flooded archive",
        levelRole: "basement",
        requiresWater: true,
        minimumFootprintCells: 16,
        tags: ["submerged", "flooded"],
      }],
    }];

    const result = validateScene(scene);

    expect(result.scene.buildingInstances?.[0]).toMatchObject({
      siteProfile: "peat-clinic",
      state: "flooded",
      functionalModules: [{
        id: "submerged",
        kind: "submerged-room",
        requiresWater: true,
        tags: ["submerged", "flooded"],
      }],
    });
  });
});
