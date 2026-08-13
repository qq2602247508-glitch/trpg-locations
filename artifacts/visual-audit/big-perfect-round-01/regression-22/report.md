# Regression 22 · forced Ollama planning source visibility

Date: 2026-08-13

## Scope

This round verifies the user-visible boundary of forced local semantic
planning. The local Ollama endpoint was intentionally not started and no
model was downloaded. The browser therefore exercised the explicit failure
path rather than silently treating a forced request as deterministic success.

## Browser acceptance

Real Chromium at 1720 × 1080 with the unknown composite prompt:

`倒挂在峡谷下方的陌生使馆，有索桥、悬挂平台、地下档案库和双向逃生路线`

Observed sequence:

1. Default mode showed `确定性规则规划`.
2. Clicking the forced-model control changed `aria-pressed` to `true` and
   showed `等待强制 Ollama 规划`.
3. Submitting the same prompt showed a model attempt and then:
   `Ollama Schema 拒绝 · 规则回退`.
4. The generated scene remained `diagnostics.valid=true` and the top-level
   status remained `校验通过`.

The final semantic record was:

```json
{
  "source": "local",
  "model": "qwen3.6:35b-mlx",
  "status": "ollama-schema-rejected",
  "fallback": "rule"
}
```

This proves that invalid model content is not passed directly to geometry and
that the fallback source is visible. Browser health was 0 network failures and
0 console errors.

## Saved evidence

- `browser-audit.json`
- `rules-overview.png`
- `forced-working.png`
- `forced-fallback.png`

## Remaining gap

The runtime/UI path is verified. Promptfoo still needs a maintained comparison
configuration that explicitly contrasts deterministic/local planning with the
forced Ollama provider on the same unknown composite prompts. The Goal remains
active.
