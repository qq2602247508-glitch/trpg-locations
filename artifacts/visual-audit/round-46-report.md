# Round 46 visual audit — supported remote stations

Date: 2026-08-09

## Scope

This round extends the atom/module/motif architecture from forest cabins and
wetland ranger stations to unfamiliar supported remote facilities. It does not
introduce fixed complete maps for the audit prompts. The same station building,
raised-foundation, boardwalk, tower, service shed, underground reserve and
terrain atoms are composed by prompt semantics.

## Baseline failures

### Mangrove quarantine station

Prompt:

> 海岸红树林里的检疫站，有高脚建筑、隔离棚、潮汐码头、巡逻塔和秘密药品库

Seed: `round46-mangrove-quarantine-a`

Baseline screenshot: `mangrove-quarantine-baseline.png`

- incorrectly routed to a generic standalone civic building;
- no parent wetland;
- no mangrove roots or tidal channel;
- no supported dock, patrol tower or detached quarantine shed;
- semantic coverage 19%.

### Tundra weather station

Prompt:

> 冻土湿地上的气象站，有架高栈道、通信塔、发电机棚、冰水裂沟和地下储备仓

Seed: `round46-tundra-weather-a`

Baseline screenshot: `tundra-weather-baseline.png`

- routed to a mostly empty ice field;
- no building instance;
- no communications tower, generator shed or reserve vault;
- the requested fissure did not divide the map;
- semantic coverage 25%.

## Implemented reusable capabilities

- natural-context station ownership for quarantine, weather, research,
  observation, radio and border stations;
- mangrove prompts now select tidal wetland topology instead of matching the
  `树林` substring as a generic forest;
- non-smuggler mangroves no longer inherit smuggler-port requirements;
- raised foundations with structural piers, supported access stairs and
  boardwalks;
- detached quarantine ward, decontamination fixtures, treatment partition and
  secret medicine vault;
- weather instrument room, communications mast, generator shed and underground
  reserve store;
- water-filled ice fissure that replaces a monolithic ice slab with two real
  banks, visible cliff faces and one supported crossing;
- ice-specific terrain material instead of brown earth;
- wetland route detours around station structures;
- parent terrain room graphs now connect to the station rather than accidentally
  choosing a child service shed as their anchor.

## Fixed-seed visual results

### Mangrove quarantine station

Evidence:

- `mangrove-quarantine-fixed-overview.png`
- `mangrove-quarantine-fixed-low.png`
- `mangrove-quarantine-final-focus.png`

Result:

- wetland parent terrain, dry hummocks, channel, root clusters and supported
  boardwalks are visible;
- clinic is a selectable full-interior building;
- detached ward, tidal dock, lookout, stilt foundation and B1 medicine vault
  are geometry;
- focused 1F now includes reception, restricted screen, wash stations and an
  examination cot;
- diagnostics 98/100, semantic coverage 100%, no warnings.

Remaining:

- the main station still inherits the generic clinic envelope and should later
  receive a dedicated field-station facade grammar;
- the default low-angle camera remains too distant for small site buildings.

### Tundra weather station

Evidence:

- `tundra-weather-final-overview.png`
- `tundra-weather-fissure-low.png`

Result:

- ice palette is immediately distinct from temperate ground;
- a real open fissure divides north and south banks;
- water, vertical faces and a supported crossing are visible;
- weather building, communications tower, generator shed, raised access and
  underground reserve are realized;
- diagnostics 98/100, semantic coverage 100%, no warnings.

Remaining:

- the ice parent terrain still has fewer meso-scale shelves and snowdrift
  clusters than the mature forest/swamp generators;
- the low-angle camera should support a closer tactical landmark framing mode.

## Variation audit

- `mangrove-quarantine-seed-b.png`: dry-ground count changes from 1421 to 1384,
  hummock faces from 258 to 220, and water/land/root route arrangement visibly
  changes.
- `tundra-weather-seed-b.png`: fissure bend, floe cover, station approach and
  auxiliary placement change while the required functional graph remains.

## Unfamiliar combination

Prompt:

> 海岸盐沼湿地上的边防站，有高脚宿舍、瞭望塔、架高栈道、壕沟和地下补给库

Seed: `round46-salt-marsh-border`

Evidence: `salt-marsh-border-unknown.png`

The prompt composes the wetland parent, full-interior home/outpost module,
raised foundation, lookout, trench and reserve vault without falling back to a
plain box or unrelated standalone building. Diagnostics 98/100 and semantic
coverage 100%.

## Automated verification

- TypeScript and Vitest: `190/190` passed.
- Production build: passed.
- `git diff --check`: passed.

