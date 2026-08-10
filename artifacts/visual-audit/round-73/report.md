# Round 73 — parent-domain and forest-density audit

## Deepwater harbor regression

Prompt:

`深水城旧城区与河港交界，有弯曲街巷、石木混合民居、酒馆、神殿、仓库、塔楼、门廊、烟囱和码头装卸区`

- Seed: `round72-mass-city`
- Size: large
- Density: 76%
- Screenshot: `deepwater-parent-fixed.png`

Problem found:

The composition compiler treated the proper name `深水城` as the generic
morphology word `水城`. The additional word `码头` reinforced the mistake, so
the parent settlement was audited against a canal-city contract even though
the site planner correctly produced a harbor-spine district. This generated
false missing requirements for a meandering main canal and tributary network.

Fix:

- Strip the proper name `深水城` before testing literal water-city morphology.
- A dock, quay or waterwheel is now a child facility and cannot independently
  replace a named settlement's parent domain.
- Only explicit water-city language such as `河道水城`, `运河城`,
  `水上市集`, `water city` or `canal city` selects
  `grammar.water-city-v1`.
- A named harbor district now retains
  `grammar.settlement-compound-v1`.

Passed:

- SceneProgram parent domain: `settlement`.
- Composition parent domain: `settlement`.
- Grammar: `grammar.settlement-compound-v1`.
- Site type: `harbor-district`.
- Road pattern: `harbor-spine`.
- No false main-canal or tributary semantic warning.
- The same fixed seed preserves the previously audited geometry.

Still incomplete:

- Settlement semantic coverage is currently 0% when the prompt contains only
  broad harbor/old-town concepts. The false critical requirements are gone,
  but a future pass should introduce settlement-owned requirements for docks,
  old-town streets, market frontage and named building functions.
- The default overview camera remains too distant for architectural review.

## Forest density regression

Prompt:

`非常茂密的古老森林，有封闭林冠、三处不规则林间空地、浅溪、倒木、巨树根台和可攀登的树冠战斗平台`

- Seed: `round72-forest-dense`
- Size: large
- Dense: 100%
- Sparse comparison: 25%
- Screenshots:
  - `forest-dense-overview.png`
  - `forest-dense-low.png`
  - `forest-sparse-low.png`

Passed:

- Dense forest produces 253 clustered trees, 153 undergrowth attempts,
  14 fallen logs and four reachable canopy platforms.
- Low-angle view shows a real trunk/canopy layer rather than a flat green
  plane with scattered poles.
- Density changes forest topology: dense and sparse versions differ in relief
  bands, tree coverage, sightlines and clearing enclosure.
- Three irregular clearings, shallow stream, routes and high-ground platforms
  remain readable.
- Semantic coverage is 100%; topology and reachability pass.

Still incomplete:

- The dense overview is visually busy; route and canopy-platform overlays
  need a clearer tactical inspection mode.
- The outer terrain cut exposes a dark vertical boundary that reads like a
  display plinth rather than a natural continuation.
- Canopy platforms are easier to identify in sparse view than under the dense
  crown layer.

## Automated verification

- `npm run check`: 224/224 tests passed.
- Explicit regression tests now distinguish Waterdeep harbor districts from
  literal canal cities.

