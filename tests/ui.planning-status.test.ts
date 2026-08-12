import { describe, expect, it } from "vitest";
import type { GeneratedScene } from "../src/schema";
import { planningSourcePresentation } from "../src/ui/planningStatus";

const sceneWithStatus = (status: NonNullable<GeneratedScene["semantic"]>["status"], fallback?: "rule") => ({
  semantic: { source: status === "ollama-success" ? "ollama" as const : "local" as const, status, model: "test-model", ...(fallback ? { fallback } : {}) },
});

describe("planning source presentation", () => {
  it("keeps deterministic, forced-working and successful planning explicit", () => {
    expect(planningSourcePresentation()).toMatchObject({ state: "deterministic", label: "确定性规则规划" });
    expect(planningSourcePresentation(undefined, true, true)).toMatchObject({ state: "working", label: "Ollama 规划中" });
    expect(planningSourcePresentation(sceneWithStatus("ollama-success"))).toMatchObject({ state: "success", label: "Ollama 规划成功" });
  });

  it.each([
    ["ollama-timeout", "timeout", "Ollama 超时 · 规则回退"],
    ["ollama-schema-rejected", "schema-rejected", "Ollama Schema 拒绝 · 规则回退"],
    ["ollama-invalid-json", "invalid-json", "Ollama JSON 无效 · 规则回退"],
    ["ollama-http-error", "http-error", "Ollama 连接失败 · 规则回退"],
  ] as const)("shows %s without hiding the deterministic fallback", (status, state, label) => {
    expect(planningSourcePresentation(sceneWithStatus(status, "rule"))).toMatchObject({ state, label });
  });
});
