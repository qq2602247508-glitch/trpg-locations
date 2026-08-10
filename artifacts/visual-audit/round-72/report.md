# Round 72 — settlement mass-LOD silhouette audit

## Prompt

`深水城旧城区与河港交界，有弯曲街巷、石木混合民居、酒馆、神殿、仓库、塔楼、门廊、烟囱和码头装卸区`

- Size: large
- Density: 76%
- Regression seed: `round72-mass-city`
- Variation seed: `round72-mass-city-alt`

## Change under test

Low-cost settlement `mass` LOD buildings now retain seeded envelope parts and
also emit building-use silhouette landmarks:

- homes, taverns and manors: entrance porch plus chimney;
- shrines: nave buttresses;
- warehouses and factories: roof monitors;
- mills: visible wheel.

These landmarks are structural geometry and use the same building position,
rotation and seed as facade/full-interior LOD.

## Evidence

- `deepwater-mass-overview.png`
- `deepwater-mass-low.png`
- `deepwater-mass-low-close.png`
- `deepwater-mass-top.png`
- `deepwater-mass-alt-low.png`

## Self-audit

Passed:

- Mass buildings are no longer represented only by undecorated rectangular
  solids; porches, projecting additions, pitched roofs and vertical landmarks
  are visible at district distance.
- The top view still exposes irregular street and parcel relations.
- The alternate seed changes parcel placement, building heights, envelope
  variants and street-facing silhouettes.
- The same building envelope signature remains stable across mass, facade and
  full-interior LOD.
- 5-foot grid, deterministic replay and topology validation remain intact.

Still failing or incomplete:

- The settlement-wide camera initially frames the city too far away for a
  useful architectural audit.
- Several tall mass proxies still read as stacked blocks before their facade
  LOD is loaded.
- Harbor water and quays are clear, but the requested "旧城区与河港交界"
  transition is still weak; waterfront, market and old-town materials share
  too much visual language.
- The scene reports missing semantic geometry for curved main river,
  tributaries, docks and wharves. This prompt exposes a planner/coverage issue
  beyond the mass-LOD silhouette change.
- Porches are readable but too uniform in material and height. A later pass
  should vary stoops, arcades, covered galleries and service loading fronts by
  district rather than reusing one porch proportion.

## Automated verification

- `npm run check`: 223/223 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

