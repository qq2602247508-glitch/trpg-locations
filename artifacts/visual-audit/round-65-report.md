# Round 65 · Coastal contour settlement and focused sea cave

## Target

Prompt:

> 建在黑沙海岸悬崖上的鲸骨灯塔村，有潮池、吊脚木屋、风暴缆车、盐风仓库和地下海蚀洞

Fixed seed: `round65-whalebone-contour`  
Variant seed: `round65-whalebone-cliff-b`  
Scale: 中型 · 地点  
Density: 72%  
Grid: 1 cell = 5 ft / 1.524 m

## Changes

- Coastal-cliff now uses a hybrid ownership contract:
  - `SettlementTerrain` owns cliff terraces, docks, lighthouse, cableway,
    whalebone landmark and sea cave.
  - `SiteProgram` owns three contour streets and two switchback routes.
  - Other semantic terrains remain terrain-owned and do not receive a generic
    road web.
- Added `roadMode: "hybrid"` to the site-program summary.
- Sea-cave geometry is tagged `focus-cluster:sea-cave`.
- Numeric basement camera, model batches and standable-surface grids use the
  largest coherent focus cluster for inspection.
- Planning isolation hides tactical surface grids while showing only the
  selected road/block/building category.
- Low-angle inspection uses the active floor/focus-cluster bounds instead of
  the whole settlement bounds.

## Browser evidence

| View | Seed | Evidence |
|---|---|---|
| Full settlement overview | `round65-whalebone-contour` | [contour-overview-final.png](./round-65/contour-overview-final.png) |
| Orthographic top | `round65-whalebone-contour` | [contour-top-final.png](./round-65/contour-top-final.png) |
| Roads-only planning | `round65-whalebone-contour` | [contour-roads-clean.png](./round-65/contour-roads-clean.png) |
| Settlement low angle | `round65-whalebone-contour` | [contour-settlement-low-final.png](./round-65/contour-settlement-low-final.png) |
| B1 sea-cave top | `round65-whalebone-contour` | [sea-cave-b1-top-final.png](./round-65/sea-cave-b1-top-final.png) |
| B1 sea-cave low angle | `round65-whalebone-contour` | [sea-cave-b1-low-fixed.png](./round-65/sea-cave-b1-low-fixed.png) |
| Variant top | `round65-whalebone-cliff-b` | [contour-variant-b-top-final.png](./round-65/contour-variant-b-top-final.png) |

## Self-audit

- Hidden title still communicates a cliff settlement: three elevation bands,
  contour roads, docks/waterline, raised buildings and elevated landmark
  structures remain visible.
- The road graph is no longer a generic radial/rectilinear web. The
  roads-only screenshot shows three separate contour bands with west/east
  switchbacks.
- The B1 view is now a coherent sea-cave cluster rather than a whole-settlement
  basement overview. Its grid follows the cave floor and entry stair.
- The low-angle B1 view now frames the cave instead of reducing it to a distant
  pixel cluster.
- Fixed and variant seeds produce different bounds (245×230 ft vs 245×205 ft)
  and different building/road placement.
- Remaining visual weakness: cave wall primitives are still broad stylized
  rock masses rather than a curved cave ceiling, and the cableway cable is
  intentionally hard-edged under the current primitive schema. These are
  queued for the next atomic terrain pass.

## Automated checks

```text
npm run check       12 files / 215 tests passed
npm run build       passed
git diff --check    passed
```
