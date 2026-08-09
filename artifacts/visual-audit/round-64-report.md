# Round 64 Visual Audit — Coastal Cliff Settlement Composition

Date: 2026-08-09

## Prompt

`建在黑沙海岸悬崖上的鲸骨灯塔村，有潮池、吊脚木屋、风暴缆车、盐风仓库和地下海蚀洞`

Primary seed: `round64-whalebone-cliff`

Variation seed: `round64-whalebone-cliff-b`

Scale: medium

Density: 72%

## Baseline failure

- The prompt was routed to `natural · GENERIC`.
- It generated `The Tidal Coral Court` with no settlement buildings.
- The coastal-cliff settlement terrain generator never ran.
- The prompt's lighthouse village, stilt homes, warehouse, cableway, whale bones, and sea cave were absent.
- Diagnostic score was 70/100 with `Semantic geometry missing: 场地建筑`.

Baseline screenshot:

- `round-64/whalebone-baseline.png`

## Implemented changes

- Added lighthouse/coastal village vocabulary to settlement-parent detection.
- Added coastal-cliff recognition for black-sand coast and lighthouse-village phrasing.
- Reused independent `home`, `tower`, and `warehouse` building modules instead of authoring one fixed village scene.
- Added reusable coastal features:
  - whalebone spine, ribs, vertical bones, and skull landmark;
  - supported storm cableway with stations, pylons, and gondola;
  - raised stilt foundations and entry stairs for requested homes;
  - black-sand lower shelf;
  - shallow tide pools;
  - underground sea-cave floor graph, rock walls, pillars, tidal pool, stair, and route.
- Prevented settlement prompts containing cabins/lighthouses from receiving the wilderness-only embedded-building semantic requirement.
- Added reusable semantic coverage checks for coastal cliff, whalebone, cableway, stilt homes, tide pools, and sea cave.
- Added deterministic regression and different-seed structural-variation assertions.

## Final browser result

- Domain: `settlement`
- Site type: `village`
- Terrain: `coastal-cliff`
- Diagnostic score: 98/100
- Semantic coverage: 100%
- Routes: 10
- Fixed-seed result: 260 × 215 ft, 3,095 primitives
- Variation seed result: 240 × 205 ft, 2,772 primitives
- No diagnostic warnings.

## Visual review

### Passed

- The map visibly has four coastal elevation shelves and a sea edge.
- Black-sand shoreline and tide pools are visible in top and perspective views.
- Whale ribs form a large central landmark rather than a tiny decoration.
- The cableway has visible stations, pylons, and a suspended gondola.
- Requested homes are raised on physical supports and have stairs.
- The settlement contains independent warehouse, tower, homes, shrines, and tavern modules.
- B1 contains a distinct rock-enclosed sea cave with a tidal pool and access route.
- Different seeds change bounds and building placement, not only decorations.
- Fixed seed reproduces the same scene.

### Still imperfect

- The B1 all-site view also displays unrelated building basements, so the sea cave is readable but not isolated by the current floor-view UI.
- Whale ribs are deliberately stylized from reusable primitives and do not yet form curved bone meshes.
- The coastal settlement still uses the general village road planner; a future coastal contour-road grammar could improve route alignment along cliff shelves.
- The cable is represented by a narrow supported beam because the current primitive schema has no dedicated line/catenary primitive.

## Screenshots

- `round-64/whalebone-overview-final.png`
- `round-64/whalebone-top-final.png`
- `round-64/whalebone-low-final.png`
- `round-64/whalebone-b1-fixed.png`
- `round-64/whalebone-stilt-home-interior.png`
- `round-64/whalebone-top-variant-b.png`

## Automated verification

```text
12 test files passed
215 tests passed
npm run check passed
npm run build passed
git diff --check passed
```
