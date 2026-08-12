import type { GeneratedScene } from "../schema";

export type PlanningSourceState = "deterministic" | "working" | "success" | "timeout" | "schema-rejected" | "invalid-json" | "http-error";

export interface PlanningSourcePresentation {
  state: PlanningSourceState;
  label: string;
  detail: string;
}

export function planningSourcePresentation(
  scene?: Pick<GeneratedScene, "semantic">,
  forced = false,
  working = false,
): PlanningSourcePresentation {
  if (working && forced) {
    return {
      state: "working",
      label: "Ollama 规划中",
      detail: "正在请求受 SceneProgram Schema 约束的本地模型。",
    };
  }
  const semantic = scene?.semantic;
  const model = semantic?.model ? ` · ${semantic.model}` : "";
  switch (semantic?.status) {
    case "ollama-success":
      return {
        state: "success",
        label: "Ollama 规划成功",
        detail: `SceneProgram Schema 已通过${model}；几何仍由确定性生成器构筑。`,
      };
    case "ollama-timeout":
      return {
        state: "timeout",
        label: "Ollama 超时 · 规则回退",
        detail: `本地模型未在时限内返回${model}；当前场景来自确定性规则。`,
      };
    case "ollama-schema-rejected":
      return {
        state: "schema-rejected",
        label: "Ollama Schema 拒绝 · 规则回退",
        detail: `模型响应不符合 SceneProgram v1${model}；未采用模型内容。`,
      };
    case "ollama-invalid-json":
      return {
        state: "invalid-json",
        label: "Ollama JSON 无效 · 规则回退",
        detail: `模型没有返回可解析 JSON${model}；当前场景来自确定性规则。`,
      };
    case "ollama-http-error":
      return {
        state: "http-error",
        label: "Ollama 连接失败 · 规则回退",
        detail: `本地模型服务不可用${model}；当前场景来自确定性规则。`,
      };
    default:
      return {
        state: "deterministic",
        label: forced ? "等待强制 Ollama 规划" : "确定性规则规划",
        detail: forced
          ? "已开启强制模式；下次生成会明确显示模型结果或回退原因。"
          : "当前场景由本地规则与 BGE 构筑，未静默调用生成式模型。",
      };
  }
}
