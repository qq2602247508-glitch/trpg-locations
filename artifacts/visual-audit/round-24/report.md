# Round 24 — mangrove local access material audit

## Change

All non-parent mangrove building access segments now use narrow wood/root
boardwalk geometry instead of the generic settlement stone material. Parent
root access remains limited to key harbor structures.

## Browser evidence

- Prompt: `隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口`
- Seed: `round24-wood-access`
- View: orthographic planning top view
- Screenshot: `round-24-mangrove-wood-top.jpg`
- Diagnostic: 97/100, semantic coverage 100%, 22 routes, 29 rooms.

## Self-check

- Passed: all local access geometry now belongs to the mangrove/root-boardwalk
  material family.
- Passed: no generic city-stone access is used for the mangrove parent site.
- Not passed: the top view still contains a dominant diagonal spine. This is
  now a route geometry/planning issue, not a material issue. The next pass must
  replace shared straight segments with separated tidal-bay loops and avoid
  aligning loop chords on the same diagonal.

## Automated gates

- `npm run check`: 172/172 passing.
- `npm run build`: passing.
- `git diff --check`: passing.
