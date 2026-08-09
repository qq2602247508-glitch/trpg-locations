# Round 47 visual audit — field-station envelopes and cold-wetland terrain

Date: 2026-08-09

## Scope

This round continues the atom/module/motif/grammar architecture rather than
adding fixed complete maps. It addresses two failures left by Round 46:

- remote stations inherited generic `home`, `guild`, or `clinic` silhouettes;
- ice terrain was one slab, one lake, four shelves, and one fixed route, so
  density and Seed had little structural influence.

## Reusable implementation

### Site building profiles

`BuildingLot` can now carry a seeded site profile independently from its broad
settlement kind. The envelope planner provides multiple variants for:

- weather stations;
- quarantine stations;
- ranger stations;
- border outposts;
- unfamiliar field/research stations.

Each profile composes a primary work cabin with different combinations of
airlocks, treatment/sample wings, equipment bays, observation nodes and watch
blocks. Full-interior LOD consumes the same envelope parts and adds floors,
walls and roofs for the extensions instead of discarding the exterior program.

Station profiles also own purpose-specific room labels and material families:
weather operations, screened quarantine reception, field laboratory, ranger
ready room and border inspection are no longer generic living/guild rooms.

### Cold terrain atoms

The ice generator now has separate macro, meso and tactical random streams. It
creates:

- segmented frozen basins;
- wind-packed snow ridges;
- irregular thaw-pool fragments;
- raised multi-part ice shelves;
- secondary water-filled crevasses;
- density-gated alternate routes.

Density determines structural budgets; Seed determines positions, orientation,
dimensions and route shape. Explicit major fissures still cut the base slab into
two banks with vertical faces and supported crossing geometry.

Cold-wetland prompts now resolve as frozen terrain with wetland water semantics,
independent of whether `high mountain`, `permafrost`, or `wetland` appears first.

### Visual-audit URL contract

The local UI accepts optional `prompt`, `seed`, `density`, `size` and `kind`
query parameters. This exists for deterministic visual regression and does not
replace the normal controls. It was added because browser keyboard automation
did not dispatch range-slider state changes reliably; audit screenshots now
carry a visible 20% or 90% value before generation.

## Fixed-seed weather station

Prompt:

> 冻土湿地上的气象站，有架高栈道、通信塔、发电机棚、冰水裂沟和地下储备仓

Seed: `round47-weather-envelope`, size: medium, density: 62%.

Evidence:

- `weather-baseline-scene.png`
- `weather-fixed-overview.png`
- `weather-fixed-low-close.png`
- `weather-naturalized-low.png`

Result:

- the station is no longer a generic guild silhouette;
- the compound includes operations cabin, equipment wing, entrance/airlock and
  observation massing;
- metal station material is distinct from ice, rock and timber access;
- the major fissure, supported bridge, communications tower, generator shed and
  reserve vault remain physical geometry;
- ice description reports five ridges, four thaw pools, ten shelves and two
  secondary crevasses for this fixed request;
- diagnostics pass.

Remaining:

- the default overview camera is too distant for a small station;
- the station-focused room shell remains more rectilinear than its exterior
  envelope;
- snow ridges need a later continuous wind-field/contour treatment.

## Quarantine station

Prompt:

> 海岸红树林里的检疫站，有高脚建筑、隔离棚、潮汐码头、巡逻塔和秘密药品库

Seed: `round47-quarantine-envelope`, size: medium, density: 62%.

Evidence:

- `quarantine-overview.png`
- `quarantine-low.png`
- `quarantine-focus.png`

Result:

- wetland, channel, mangrove roots and station form one parent site;
- the wooden screened/treatment-wing envelope is visually different from the
  metal weather station;
- supported boardwalks, detached isolation ward, tidal dock and patrol tower are
  legible at low angle;
- focused 1F contains reception, treatment screen, wash stations and examination
  cot; the medicine cache is reached through the basement program;
- diagnostics pass.

Remaining:

- the focused interior needs smaller buffer rooms and a stronger airlock shape;
- dense trunks sometimes hide the station in the default overview.

## Density audit

Prompt:

> 冰原气象观测场，有冻融池、雪脊、冰缝和两条安全路线

Seed: `round47-ice-density`, size: medium.

Evidence:

- `ice-density-20-fixed.png`
- `ice-density-90-fixed.png`

The earlier `ice-density-20.png` and `ice-density-90.png` are rejected evidence:
the browser slider remained at 62% in both screenshots. They are retained only
as an audit trail and are not used to claim success.

Measured/visible change:

| Structure | 20% | 90% |
|---|---:|---:|
| Snow ridges | 3 | 7 |
| Thaw pools | 2 | 6 |
| Raised shelves | 6 | 12 |
| Secondary crevasses | 1 | 4 |
| Renderable primitives | 58 | 121 |
| Alternate ridge route | no | yes |

Both valid screenshots visibly display their density values and pass diagnostics.

Remaining:

- high density is a richer collection of meso features, but the ridges still
  read as several short bands rather than one coherent wind-eroded landform.

## Unfamiliar combination

Prompt:

> 高山冻土湿地上的无线电研究站，有样本实验室、通信塔、发电机棚、架高栈道和地下样本库

Seeds:

- `round47-unknown-field-station`
- `round47-unknown-field-station-b`

Evidence:

- `unknown-field-station-overview.png`
- `unknown-field-station-low.png`
- `unknown-field-station-focus.png`
- `unknown-field-station-seed-b.png`

Result:

- the combination does not fall back to a home envelope;
- a seeded `field-station` envelope composes laboratory, sample wing/equipment
  bay and observation node;
- communications tower, generator shed, raised access, field laboratory and
  specimen archive are physical geometry;
- changing Seed reshapes ridge direction, thaw pools, shelf clusters, approach
  and station arrangement while preserving required functions;
- diagnostics pass with no warnings.

Remaining:

- field-laboratory furniture needs a wash/clean buffer and more varied bench
  arrangements;
- focused exterior-to-interior room boundaries should inherit every envelope
  part more literally.

## Automated verification

- TypeScript and Vitest: `192/192` passed.
- Production build: passed.
- `git diff --check`: passed.
- Vite reports the existing chunk-size advisory for the renderer/worker; it is
  not a build failure and remains a later performance/code-splitting task.

## Round conclusion

Round 47 establishes reusable station silhouette profiles, cold-wetland domain
precedence, density-sensitive ice mesostructure and deterministic visual-audit
URLs. It does not claim that all station interiors or ice landforms have reached
final visual quality. The next iteration should prioritize continuous terrain
fields and envelope-derived room unions rather than more keyword fixtures.
