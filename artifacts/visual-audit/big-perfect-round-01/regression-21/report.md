# Regression 21 · tactical surface-grid admission and mine platforms

Date: 2026-08-13

## Scope

This round closes a grid-coverage gap in the renderer and a missing semantic
tag in the direct mine grammar:

- support landings and buildable slabs were classified as tactical surfaces
  but could be discarded by a second renderer-only tag allow-list;
- the mine's upper platform and lower hub were real walkable surfaces but did
  not carry `standable`, so they received no 5-foot grid.

## Implementation

- Added `shouldRenderTacticalSurfaceGrid()` as the final renderer admission
  contract.
- Removed the duplicate broad surface-tag allow-list from the grid builder.
  `isTacticalGridSurface()` is now the single standability decision, while
  focus and visibility remain separate filters.
- Marked `mine-upper-platform` and `mine-lower-hub` as `standable`.
- Added regression coverage for support landings, buildable surfaces,
  decorative/water exclusions, and mine platform grid eligibility.

## Automated verification

- Full Vitest suite: **311/311 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- `token-ast-grep`: confirmed one renderer admission call site and the
  classification call path.
- `token-repomix`: four-file focused pack, **7,109 tokens**, below the
  12,000-token limit.
- `token-promptfoo`: **10/10**, **7,258 real tokens**:
  - prompt: 3,759;
  - completion: 3,499.
  Promptfoo is recorded as quality evidence only.

## Browser evidence

Real Chromium audit at 1720 × 1080, final timestamp
**2026-08-13 12:29 Asia/Shanghai**:

| Scene | Validation | Grid candidates | Stairs | Routes | Browser health |
|---|---:|---:|---:|---:|---|
| Ice research | valid, no warnings | 109 | 8 | 13 | 0 network / 0 console |
| Canyon crossing | valid, no warnings | 29 | 6 | 15 | 0 network / 0 console |
| Forest village | valid, no warnings | 2,380 | 45 | 21 | 0 network / 0 console |
| Abandoned mine | valid, no warnings | 2 | 1 | 3 | 0 network / 0 console |

Saved overview and low-angle screenshots for all four scenes beside this
report, plus `browser-audit.json`.

## Assessment

This round strengthens requirement 3: the renderer no longer silently drops
classified tactical surfaces, and the mine's actual platforms now qualify.
Water, lava, void and decorative surfaces remain excluded. The overall project
advances from approximately **92% to 93%**. The Goal remains active because
the broader connector/clearance matrix, complete building-entry modes,
forced-Ollama UI, multi-prompt/seed/size/density browser matrix and remaining
performance work are not yet fully proven.
