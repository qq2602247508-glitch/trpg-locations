# Round 28 — compound motif selection and mangrove access audit

## Target

Remove domain-wide motif over-selection, stop generic harbor geometry from
overwriting the mangrove parent terrain, and make elevated mangrove buildings
use supported access.

## Prompt A

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round28-mangrove-a`
- Size: medium
- Density: 62%

Evidence:

- `round-28-mangrove-top-audit.png`
- `round-28-mangrove-stilts-low-zoom.png`

Passed:

- SceneProgram now reports `channel-cut + wetland-pools`, not `plain`.
- Composition dropped from four incorrectly selected motifs to two relevant motifs.
- Generic straight harbor docks no longer overwrite the mangrove parent terrain.
- Root boardwalk geometry is made from supported local legs.
- Raised buildings receive 5/10/15-foot bands, four stilt supports, and a real stair connection.
- Topology and automatic scene validation remain valid.

Not yet passed:

- The low-angle silhouette is still too sparse for a dense mangrove canopy.
- The major root paths remain visually pale and dominate the top view.
- Individual building functions are not yet legible from the settlement overview.

## Seed variation

- Seed: `round28-mangrove-b`
- Evidence: `round-28-mangrove-top-different-seed.png`

Passed:

- Building placement, shoreline edge, local water pockets, and route layout change.

Not yet passed:

- The parent boardwalk grammar remains recognizably the same three-loop family.

## Unknown combination

- Prompt: `潮汐红树林里的炼金学者港村，有根桥、树上实验屋、盐雾蒸馏塔、半淹档案库和水下温室`
- Seed: `round28-unknown-alchemist-port`
- Size: medium
- Density: 62%
- Evidence: `round-28-unknown-alchemist-port-top.png`

Passed:

- The prompt stays in the settlement + wetland composition path and does not
  fall back to a generic rectangular building or ordinary harbor.
- The parent tidal terrain and independent building modules remain intact.

Not yet passed:

- `树上实验屋`, `盐雾蒸馏塔`, `半淹档案库`, and `水下温室` are not yet
  distinct auditable functional modules. The generated result is structurally
  valid but semantically incomplete.

## Automated verification

- `npm run check`: 174/174 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

