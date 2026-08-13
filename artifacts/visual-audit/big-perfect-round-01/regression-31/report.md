# Regression 31 · worker/renderer bundle split

## Result

Passed on August 13, 2026.

The generation worker now loads the generator, SceneProgram planner,
composition, BGE retrieval, and site-intent modules on demand. Vite is
configured for ES workers so those imports become browser-loadable chunks.
Three.js and OrbitControls are isolated into their own client chunk.

### Build evidence

| Artifact | Before | After |
|---|---:|---:|
| generation worker | 744.10 kB | 2.66 kB |
| SceneRenderer | 568.80 kB | 45.66 kB |
| Three.js + controls | bundled into renderer | 523.67 kB |

The remaining `three` chunk is dependency-owned and still exceeds Vite's
500 kB advisory threshold; the application renderer and worker are no longer
monolithic. No warning was hidden by changing the warning limit.

## Runtime evidence

- Full test suite: 333/333 passed.
- Production build: passed.
- `git diff --check`: passed.
- Promptfoo local semantic regression: 24/24 passed, 0 failed, 0 errors.
- Regression 30 exact prompt `森林村庄`: 4/4 browser cases passed with
  scene-valid, geometry errors 0, warnings 0, network failures 0, and console
  errors 0. Each case produced overview, low-angle, grid-close, and
  focused-building screenshots.
- Regression 26 ordinary rules and forced Ollama browser cases both generated
  valid scenes after the split. Forced Ollama visibly entered the model mode;
  the audit recorded `ollama-timeout` with explicit `fallback: rule`, rather
  than a silent fallback.
- The forced-model screenshot is
  `../regression-26/forced-ollama.png`.

## Remaining risks

- The isolated Three.js dependency chunk is still 523.67 kB minified.
- The long-running Goal remains active until the complete ten-item audit,
  final cross-domain screenshot matrix, and all performance requirements are
  proven together.
