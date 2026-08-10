# Round 80 — Functional-space atoms and wilderness/building composition audit

Date: 2026-08-10

## Scope

This round promoted reusable functional spaces into the bounded composition
catalog and verified that local lexical/BGE retrieval may select those spaces
without authoring geometry. It also repaired the composite boundary between a
parent wilderness route network and the complete footprint of an embedded
building, including wide hangar annexes and launch aprons.

## Implemented atoms

- `structure.storage-space`
- `structure.hangar-space`
- `structure.fuel-space`
- `structure.quarters-space`
- `structure.chapel-space`
- `structure.medical-space`
- `structure.observation-platform`
- `structure.workshop-space`
- Designer module: `module.functional-space-kit`

Each atom now records deterministic geometry, validation rules, visual
fixtures, failure conditions, tactical effects, and bilingual retrieval terms.

## Semantic safety changes

- BGE and lexical retrieval return only catalogued capability IDs.
- Exact local aliases are merged with embedding results instead of being
  discarded when BGE is available.
- Retrieval cache keys include the requested result limit.
- Explicit parent terrain suppresses incompatible macro capabilities, while
  still accepting child building capabilities.
- Completely unknown prompts can still use retrieved macro terrain
  capabilities.
- Natural-parent facility prompts now request semantic retrieval even when the
  parent domain is already known.
- Geometry, dimensions, routes and topology remain deterministic TypeScript
  output; the semantic layer never supplies coordinates.

## Composite route repair

The original failure was:

`Route wilderness-service-loop passes through solid wall wilderness-core-building-hangar-back-wall`

The final pass now:

1. Computes a rotation-aware cell-space AABB from every primitive tagged
   `building-instance:wilderness-core-building`.
2. Includes annexes, hangars, launch aprons and prompt-derived geometry.
3. Moves affected service routes onto the outside perimeter.
4. Rebuilds visible corridors or terrain-following stairs.
5. Preserves the route rather than deleting it.

## Browser audit A — unfamiliar mountain flight-yard

Prompt:

`高山峡谷中的翼港整备所，有宽阔翼舱、挥发储压舱、驻员休息舱和高空导风台`

Seed: `retrieved-functional-space-kit`

Size: medium

Density: 64%

### Before

`functional-space-overview.png`

- Failed: retrieval promoted an unrelated floating/forest macro composition.
- Failed: no embedded facility existed.
- Failed: only the mountain parent was visible.

### After

- `functional-space-overview-fixed.png`
- `functional-space-focused.png`
- `functional-space-b1.png`
- `functional-space-roof.png`
- `functional-space-route-debug.png`

Passed:

- Mountain parent remains the owner.
- A full-interior factory carrier is generated.
- Hangar, fuel, quarters and observation capabilities are present.
- Wide hangar and supported launch apron are visible.
- Basement storage has shelves, crates and a real stair connection.
- Roof signal platform has supports, railings, mast and wind vane.
- Service route no longer crosses the hangar back wall.
- Five-foot grid remains attached to standable surfaces.
- Same Seed reproduces the same scene statistics and spatial program.
- Alternate Seed `retrieved-functional-space-kit-b` changes elevation bands,
  route waypoints, terrain form and building placement.

Still weak:

- The focused low-angle view remains visually thin.
- Hangar gantry and fuel manifold need stronger material/shape separation.
- The complete-site camera makes the building small relative to the mountain.

## Browser audit B — unfamiliar frozen pilgrim relief station

Prompt:

`冻土峡湾里的巡礼救护站，有伤员病房、祈祷小堂、地下粮药库和屋顶信号台`

Seed: `round-80-pilgrim-relief`

Size: medium

Density: 64%

Evidence:

- `relief-overview-fixed.png`
- `relief-focused-fixed.png`
- `relief-b1-fixed.png`
- `relief-roof-fixed.png`

Passed:

- Ice remains the parent domain.
- The clinic is independently generated and grounded on the ice site.
- Treatment beds and medical partitions are physical geometry.
- Chapel, medical, storage and observation aliases are retrieved locally.
- Basement storage uses racks, shelves and searchable cover lanes.
- Roof signal platform is elevated, supported and reachable.
- Scene diagnostics report valid topology and 100% requested parent-site
  coverage.

Still weak:

- Chapel identity is not yet strong enough without the prompt/title.
- The medical/chapel boundary is readable as rooms, but material contrast is
  modest.
- The exterior silhouette still reads more as a compact station than a
  pilgrimage hospice.

## Automated verification

Final full run:

```text
243/243 tests passed
npm run build passed
git diff --check passed
```

The Vite build still reports its existing large-chunk advisory; it is not a
correctness failure.

## Round verdict

The functional-space catalog, local-first retrieval path and wilderness
building route interface are accepted for this round. Visual identity remains
an open quality track: future rounds should strengthen silhouette and
function-specific facade language rather than expanding metadata.
