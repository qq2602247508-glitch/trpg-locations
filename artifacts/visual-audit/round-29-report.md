# Round 29 · Specialist building functions inside compound sites

Date: 2026-08-08

## Scope

This round added a reusable functional-module layer between a `SiteProgram`
parcel and the independent building generator. It was deliberately tested
against compound prompts instead of adding a dedicated alchemist-port scene.

Implemented module kinds:

- laboratory;
- distillation;
- archive;
- greenhouse;
- submerged room;
- observation;
- workshop.

Each module can add audited room-program entries, tagged geometry, tactical
features and routes. Prompt modifiers can alter the module rather than merely
select it:

- tree/canopy laboratory -> upper timber room, supports and branch access;
- half-flooded archive -> basement archive with water;
- submerged greenhouse -> basement cultivation room with water;
- underground fungal greenhouse -> basement greenhouse with fungal tags.

## Direct target

Prompt:

> 潮汐红树林里的炼金学者港村，有根桥、树上实验屋、盐雾蒸馏塔、半淹档案库和水下温室

Seed: `round29-alchemist-port-a`

Representative images:

- `alchemist-port-overview-v2.jpg`
- `elevated-laboratory-upper-v3.jpg`
- `half-flooded-archive-b1-v2.jpg`
- `submerged-greenhouse-b1-v3.jpg`
- `distillation-works-low-v3.jpg`

Passed:

- specialist requirements are assigned to separate building instances;
- the tree laboratory is on the upper floor and has supports, branch beams,
  an access route and laboratory fixtures;
- the flooded archive has real shelves, a basement floor and water geometry;
- the underwater greenhouse has visible water, cultivation beds, posts and
  a thin roof frame rather than one opaque fake-glass slab;
- distillation has tanks, receiver, pipe, maintenance deck and vertical access;
- focused-building grids no longer display unrelated buildings;
- focused B1 no longer keeps the whole-site ground plane as a false ceiling;
- low-angle mode preserves the current building focus;
- validation score returned to 98/100.

Still weak:

- the tree laboratory remains materially simple and compact;
- the archive needs stronger enclosure and water-depth cues;
- distillation pipe relationships remain visually weak;
- the mangrove boardwalk family changes less than the individual buildings.

## Seed variation

Prompt: same as direct target.

Seed: `round29-alchemist-port-b`

Image: `alchemist-port-seed-b-overview.jpg`

Passed:

- bounds changed from 300 x 245 ft to 285 x 230 ft;
- building locations, envelope variants, water edges, local roads and LOD
  assignments changed;
- validation remained 98/100.

Still weak:

- both seeds retain the same broad root-boardwalk family.

## Unfamiliar composition

Prompt:

> 火山灰峡谷里的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥

Seed: `round29-volcanic-alchemy-camp`

Before:

- incorrectly collapsed into one generic civic institution;
- parent volcanic terrain and settlement buildings disappeared.

After:

- domain: settlement;
- site type: mining-settlement;
- parent terrain: caldera;
- morphology: caldera + lava-flow + rift + ravine;
- 13 independent building instances;
- laboratory, archive, distillation, greenhouse and workshop modules;
- validation: 99/100.

Image: `unknown-volcanic-alchemy-camp-v2.jpg`

Still weak:

- lava is not visually dominant enough in the overview;
- the maintenance bridge is not yet a strong landmark;
- functional modules require focused views to be read clearly at this scale.

## Rendering and inspection fixes

- focused camera now frames authored building primitives, including external
  specialist modules;
- whole-site terrain base is hidden while inspecting one building;
- focused grid batches include only the selected building;
- ground and basement cutaway walls no longer hide the inspected room;
- low-angle camera uses selected-building scale rather than whole-site scale.

## Automated verification

```text
177/177 tests passed
npm run build passed
git diff --check passed
```

New regression coverage verifies:

- functional modules are structurally assigned to parcels;
- module geometry, rooms, routes and tactical features exist;
- same Seed replays deterministically;
- different Seeds move functional geometry;
- a mining camp remains the parent site rather than collapsing into a named
  child laboratory;
- caldera terrain and specialist modules coexist in the unfamiliar prompt.
