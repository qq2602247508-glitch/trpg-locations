# Regression 20 · forest root bridge and mine remnant realization

Date: 2026-08-13

## Scope

This round closes the two semantic-geometry warnings found in Regression 19:

- forest settlement prompts requesting `根桥`;
- mine prompts requesting `旧矿井口与矿车轨道`.

The existing wilderness root-bridge and site mine-remnant builders were already
available, but the settlement terrain and direct mine grammar did not publish
those semantics for the corresponding prompt paths.

## Implementation

- Added `root-bridge` to the site-program feature planner.
- Added a terrain-owned forest settlement root bridge with:
  - walkable bridge deck;
  - two root buttresses;
  - alternate route;
  - chokepoint tactical feature;
  - terrain-following endpoint heights.
- Extended the direct mine grammar with:
  - old mine mouth posts and lintel;
  - paired lower-level cart rails;
  - wooden sleepers;
  - explicit `mine-entrance` and `mine-cart-track` tags.
- Reused existing mine rooms, incline and cart loop instead of creating a
  parallel mine template.

## Regression tests

Added to `tests/generators.test.ts`:

- forest settlement root bridge realizes deck, buttresses and route;
- mine grammar realizes old mine mouth, paired rails and sleepers;
- both prompts remain valid and no longer report semantic geometry missing.

## Automated verification

- Full Vitest suite: **309/309 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Existing production chunk-size warnings remain; no new build error was added.

## Token-efficient tools

- RTK: full tests, build and Git checks.
- `token-ast-grep`: bounded structural lookup of generator and planner
  functions.
- `token-repomix`: strict four-file whitelist, **3,758 tokens**, below the
  12,000-token limit.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,258 real
  tokens**:
  - prompt: 3,759;
  - completion: 3,499.
- Promptfoo was used as quality evidence only; no token-saving claim was
  recorded.

## Browser evidence

Four deterministic large scenes were opened in real headless Chromium at
1720 × 1080. Final audit timestamp: **2026-08-13 12:17 Asia/Shanghai**.

| Scene | Validation | Visible evidence | Browser health |
|---|---|---|---|
| Ice research | valid, no warnings | 2 contracted bridges, observation platform and roof ladder | 0 network / console errors |
| Canyon embassy | valid, no warnings | canyon crossings, elevated structures and vertical connectors | 0 network / console errors |
| Forest village | valid, no warnings | 2 bridges, 19 routes, forest/canopy settlement | 0 network / console errors |
| Abandoned mine | valid, no warnings | old mine mouth, paired rails, sleepers and stair route; 51 primitives | 0 network / console errors |

Saved evidence:

- `browser-audit.json`
- `ice-overview.png`, `ice-low.png`
- `canyon-overview.png`, `canyon-low.png`
- `forest-overview.png`, `forest-low.png`
- `mine-overview.png`, `mine-low.png`

## Visual self-review

- Forest: settlement remains readable at low angle; root bridge and forest
  circulation are present without introducing a warning.
- Mine: the paired rails and sleepers are clearly visible in the low-angle view;
  the mine mouth frame anchors the upper approach. The scene remains sparse,
  but now communicates the requested mine infrastructure rather than only a
  generic stair layout.

No P0/P1 regression was found.

## Completion assessment

The long-running project advances from approximately **91% to 92%** because
both previously observed semantic warnings now have real geometry, routes,
tags, regression coverage and browser evidence. The Goal remains active:
broader semantic coverage, more generator adoption of composition contracts,
visual density/performance refinement and the remaining hard completion
checklist still require additional rounds.
