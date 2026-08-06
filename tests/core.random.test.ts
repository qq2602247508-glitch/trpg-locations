import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/core/random";
import { classifyInput, decomposeAdaptiveFeatures } from "../src/semantic/classify";

describe("SeededRandom", () => {
  it("replays exactly for the same seed", () => {
    const first = new SeededRandom("battlefield-42");
    const second = new SeededRandom("battlefield-42");

    const firstValues = [first.next(), first.int(-4, 9), first.float(2, 7), first.normal(), first.triangular(1, 5, 2)];
    const secondValues = [second.next(), second.int(-4, 9), second.float(2, 7), second.normal(), second.triangular(1, 5, 2)];

    expect(firstValues).toEqual(secondValues);
  });

  it("keeps named child streams independent of parent consumption", () => {
    const beforeConsumption = new SeededRandom("inn-seed").fork("rooms");
    const parent = new SeededRandom("inn-seed");
    parent.next();
    parent.shuffle(["a", "b", "c", "d"]);
    const afterConsumption = parent.fork("rooms");

    expect([beforeConsumption.next(), beforeConsumption.next(), beforeConsumption.next()])
      .toEqual([afterConsumption.next(), afterConsumption.next(), afterConsumption.next()]);
  });

  it("supports bounded distributions and zero-weight exclusions", () => {
    const rng = new SeededRandom("distribution");
    for (let index = 0; index < 40; index += 1) {
      const sampled = rng.triangular(-2, 6, 1);
      expect(sampled).toBeGreaterThanOrEqual(-2);
      expect(sampled).toBeLessThanOrEqual(6);
    }
    expect(rng.weightedPick(["never", "always"], [0, 1])).toBe("always");
    expect(rng.chooseWeighted([{ value: "never", weight: 0 }, { value: "always", weight: 1 }])).toBe("always");
  });
});
describe("local scene classification", () => {
  it("recognises fixed categories from Chinese and English local terms", () => {
    expect(classifyInput("A moonlit watchtower with a roof platform").kind).toBe("tower");
    expect(classifyInput("潮湿的下水道与排水沟").kind).toBe("sewer");
    expect(classifyInput("有中轴圣所和祭坛的神殿").kind).toBe("building");
    expect(classifyInput("深水城港区的市场与码头").kind).toBe("settlement");
    expect(classifyInput("冰原上的裂谷与高台").kind).toBe("wilderness");
  });

  it("uses stable composable adaptive traits for an unknown category", () => {
    const prompt = "被遗忘的机械花园，桥下有酸液与发光雕像";
    const first = classifyInput(prompt);
    const second = classifyInput(prompt);

    expect(first.kind).toBe("adaptive");
    expect(first.source).toBe("adaptive");
    expect(first.traits).toEqual(second.traits);
    expect(first.traits.anchors).toContain("bridge");
    expect(first.traits.hazards).toContain("acid");
    expect(decomposeAdaptiveFeatures(prompt).tags).toContain("anchor:bridge");
  });
});
