# Regression 17 · Forced Ollama Source UI Audit

Date: 2026-08-12

## Starting state

- Strict long-term completion: approximately 88%.
- Baseline commit: `72cbfdd fix: adapt focus cutaway to camera`.
- Baseline gates: 294/294 tests, production build passed, no known P0/P1 in regression-16.

## Target

Make forced local Ollama planning outcomes persistently visible in the main UI:

- successful schema-constrained planning;
- timeout;
- SceneProgram schema rejection;
- invalid JSON;
- local service / HTTP failure;
- deterministic rule fallback source.

The UI must not imply that the model authored geometry.

## Root cause

The generation layer already stored distinct semantic statuses on the generated scene, but the UI exposed them only as one optional item in a diagnostics list capped at four entries. A forced-model failure could therefore be technically recorded yet practically invisible to the user.

## Fix

- Added a dedicated planning-source card directly beneath the forced local-model control.
- Added stable machine-readable `data-state` values.
- Added explicit states for deterministic, working, success, timeout, schema rejection, invalid JSON and HTTP failure.
- Failure states explicitly state that the current scene comes from deterministic rules.
- Success explicitly states that SceneProgram Schema passed and geometry is still produced by the deterministic generator.
- Kept the existing diagnostics detail as secondary evidence.
- Centralized labels and details in a pure `planningSourcePresentation` function.

The model boundary remains unchanged: Ollama can provide only a parsed SceneProgram. It cannot directly produce coordinates, meshes or renderer geometry.

## Automated verification

- Full Vitest suite: **299/299 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Presentation tests cover deterministic, working, success, timeout, schema rejection, invalid JSON and HTTP failure.
- Existing GenerationClient and SceneProgram tests remain green.

The production build still reports chunks larger than 500 kB.

## Token-efficient tools

- RTK: full tests, production build and Git checks.
- `token-ast-grep`: structural verification of the single presentation function and UI call site.
- `token-repomix`: strict four-file whitelist, **3,005 tokens**, below the 12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,267 real tokens**:
  - prompt: 3,759;
  - completion: 3,508.
- Promptfoo is quality evidence only; no token-saving claim was recorded.

## Browser evidence

The browser matrix disabled Worker before application startup so each forced request passed through the real in-thread GenerationClient path. Only the external `/api/chat` response was controlled.

Prompt:

`陌生的地下研究设施，有实验室、逃生路线和秘密档案室`

Evidence:

- `ollama-success.png`
- `ollama-schema-rejected.png`
- `ollama-http-fallback.png`
- `ollama-timeout-fallback.png`
- `browser-audit.json`

Verified results:

- success:
  - visible `Ollama 规划成功`;
  - semantic source `ollama`;
  - SceneProgram source `ollama`;
  - valid three-region parsed plan;
- schema rejection:
  - visible `Ollama Schema 拒绝 · 规则回退`;
  - semantic source `local`;
  - fallback `rule`;
  - SceneProgram source `local`;
- HTTP failure:
  - visible `Ollama 连接失败 · 规则回退`;
  - semantic source `local`;
  - fallback `rule`;
- timeout:
  - real 16-second AbortController timeout;
  - visible `Ollama 超时 · 规则回退`;
  - semantic source `local`;
  - fallback `rule`.

Every scene remained valid with no diagnostics warnings. The source cards are fully visible and visually distinguish success from fallback states. No P0/P1 was found.

## Remaining gaps

- Complete support, collision, clearance and destination validation for all vertical movement structures.
- Building entry and return mechanics for embedded and independent interiors.
- Global ownership of every valid 5 ft grid surface.
- Broader multi-prompt and multi-seed browser matrix.
- Bundle-size and dynamic-cutaway rebuild performance optimization.

Strict overall completion advances from approximately **88% to 89%**. The long-running Goal remains active.
