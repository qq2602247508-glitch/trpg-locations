# Round 78 — Unknown Wilderness Facility Composition

Date: 2026-08-10

## Scope

This round validates a generic composition path:

```text
unknown facility noun
→ use
→ requested functional spaces
→ object/process theme
→ reusable BuildingProgram carrier
→ natural parent terrain
```

It deliberately does not add three fixed complete scenes. The deterministic
planner composes existing terrain and building grammars with prompt-derived
functional modules and small theme atom kits.

## Scene A — Abandoned clock repair works in a swamp

- Prompt: `沼泽中的废弃钟表修复所，有机械工坊、零件档案室、屋顶信号平台和地下防潮库`
- Seed A: `round-78-clock-repair-a`
- Seed B: `round-78-clock-repair-b`
- Size: medium
- Density: 20%
- Parent: swamp
- Building carrier: factory

Evidence:

- `swamp-clock-repair-overview.png`
- `swamp-clock-repair-interior-fixed.png`
- `swamp-clock-repair-seed-b.png`

Passed:

- swamp owns the macro topology;
- supported boardwalks reroute around the building;
- repair bench, gears, parts storage and drive shaft are real geometry;
- abandonment removes a facade/roof section and creates a rubble breach;
- Seed B changes the wetland title, bank/channel structure, building envelope
  and access-boardwalk relationship rather than only moving props.

Remaining limitation:

- the clockwork kit is readable in focused interior view but still small in the
  whole-site overview.

## Scene B — Paleontological specimen hall in a mountain canyon

- Prompt: `高山峡谷中的古生物标本馆，有标本处理室、收藏档案库、屋顶骨架观察台和地下储藏室`
- Seed: `round-78-specimen-a`
- Size: medium
- Density: 20%
- Parent: mountain
- Building carrier: guild

Evidence:

- `mountain-specimen-overview.png`
- `mountain-specimen-interior.png`

Passed:

- the building is seated on a real mountain shelf;
- the parent ravine, height bands and access stairs remain intact;
- preparation table, display plinth, fossil skull and rib sequence are real
  geometry;
- archive, laboratory and roof-observation requirements are represented as
  functional modules rather than metadata.

Remaining limitation:

- fossil displays require focused interior inspection to read clearly.

## Scene C — Airship mooring tower on an ice field

- Prompt: `冰原上的飞艇系留塔，有维护车间、气囊仓、屋顶系留平台和地下燃料库`
- Seed: `round-78-airship-a`
- Size: large
- Density: 72%
- Parent: ice
- Building carrier: tower

Evidence:

- `airship-overview-fixed.png`
- `airship-ground-theme-final.png`
- `airship-basement-theme-final.png`
- `airship-roof-final.png`
- `airship-low-angle-final.png`

Initial failures found by visual audit:

- a 3–5 floor tower only emitted two physical floors;
- the observation platform used the declared total height and therefore floated
  above the actual roof;
- only one stair flight existed;
- ground and basement spaces still read as generic guard/storage rooms.

Fixes and final passes:

- every declared above-grade floor now emits its own floor ring, wall shell and
  stacked stair flight;
- upper slabs contain real central stair openings;
- the roof height is derived from the last emitted physical floor;
- the generic gable/observation kit is replaced with one reinforced flat
  mooring deck;
- a real roof stair, landing route and hatch connect the top floor to the deck;
- mast, tether arms and twin winches form the roof objective;
- maintenance drums and a gas-cell cradle divide the ground workshop;
- three fuel tanks and a manifold make the basement a visible hazard;
- the ice field remains the parent terrain and the compound remains reachable.

Remaining limitation:

- focused cutaway mode intentionally hides front/east shell pieces, so the
  complete exterior overview is still required to judge the final silhouette.

## Domain ownership regression

The first full-suite run exposed three routing regressions. Generic facility
recognition was broad enough to steal:

- a salt-crystal cavern monastery compound from settlement planning;
- a salt-crystal floating monastery motif;
- a COC 1920s weather monastery building from the building domain.

The fix now requires an explicit natural parent-child relation for unknown
custom facility nouns. Mature cavern-monastery compound routing is evaluated
before single embedded-facility routing. Known stations and cabins retain their
existing deterministic contracts.

Regression coverage confirms:

- salt-crystal cavern monastery → settlement compound;
- ordinary tidal cave monastery → cave-owned natural composition;
- mountain radio monastery explicitly built on a weathered ridge → natural
  embedded facility;
- COC 1920s summit weather monastery without an embedding relation → building.

## Automated verification

```text
npm run check
12 test files passed
234 tests passed

npm run build
TypeScript passed
Vite production build passed

git diff --check
passed
```

Vite still reports the pre-existing advisory that several generated chunks are
larger than 500 kB. It is not a correctness failure, but remains a performance
follow-up.

