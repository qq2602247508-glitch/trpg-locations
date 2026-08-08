import { describe, expect, it } from "vitest";
import { generateAtomTestScene } from "../src/composition";

describe("spatial atom browser fixtures", () => {
  it.each(["water.waterfall", "route.vertical", "ecology.ancient-tree", "route.bridge"])("builds a valid isolated %s fixture", (atomId) => {
    const first = generateAtomTestScene(atomId, "atom-fixture"); const replay = generateAtomTestScene(atomId, "atom-fixture");
    expect(first).toEqual(replay); expect(first.diagnostics.valid).toBe(true); expect(first.routes.length).toBeGreaterThan(0); expect(first.tactical.some((feature) => feature.kind === "entrance")).toBe(true);
  });
});
