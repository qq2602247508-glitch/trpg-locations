import { describe, expect, it } from "vitest";
import { GenerationClient } from "../src/workers/GenerationClient";

describe("GenerationClient", () => {
  it("falls back to lazy in-thread generation when Worker is unavailable", async () => {
    const client = new GenerationClient();
    const scene = await client.generate({
      prompt: "一座带侧门和楼梯的小型神殿",
      seed: "generation-client-fallback",
      size: "small",
      density: 0.5,
    }, "building");
    expect(scene.archetype).toBe("temple");
    expect(scene.diagnostics.valid).toBe(true);
    client.dispose();
  });
});
