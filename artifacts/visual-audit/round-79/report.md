# Round 79 visual audit

Date: 2026-08-10

## Scope

This round replaces several prompt-only wilderness facility labels with reusable
functional-space atoms that compile into constrained building geometry:

- `storage`
- `hangar`
- `fuel`
- `quarters`
- `chapel`
- `medical`
- strengthened `observation`

The parent wilderness domain remains responsible for terrain, elevation, routes,
water and unsafe zones. The embedded building remains responsible for its
envelope, rooms, functional fixtures, vertical circulation and roof platform.

## Test settings

The browser screenshots below use:

- prototype: adaptive
- scale: medium
- density: 20%
- 5 feet per grid cell

The automated catalog matrix additionally covers large scenes at 28%, 76% and
alternate Seeds.

## Scene A — mountain rescue clinic

Prompt:

> 高山峡谷中的沙暴救护所，有检伤区、病房、药品储藏室、屋顶信号台和地下净水库

Seed: `round-79-rescue-a`

Evidence:

- `rescue-overview-final.png`
- `rescue-1f-final.png`
- `rescue-b1-final.png`
- `rescue-roof-final.png`
- `rescue-low-final.png`

First-pass failures:

- the roof signal point read as pipes rather than a usable platform;
- the basement used one long stair which appeared to continue beyond the
  isolated B1 view.

Regression result:

- PASS: clinic remains embedded in authored mountain shelves;
- PASS: medical beds, treatment table and screens are physical geometry;
- PASS: medicine storage and basement supply/water equipment are visible;
- PASS: the roof signal deck is raised above the roof, supported, railed and
  reached through a roof opening;
- PASS: the basement access is folded into two flights with a landing;
- PASS: diagnostic score 97/100 with no geometry warning.

Remaining limitation:

- the overview is still intentionally low-detail at this scale; fixture reading
  requires the focused floor view.

## Scene B — coastal glider hangar

Prompt:

> 海岸悬崖中的风帆滑翔机库，有大型机库、维修车间、燃料库、机组宿舍和屋顶风向塔

Primary Seed: `round-79-hangar-a`

Variant Seed: `round-79-hangar-b`

Evidence:

- `hangar-overview-final.png`
- `hangar-1f-final.png`
- `hangar-upper-final.png`
- `hangar-b1-final.png`
- `hangar-roof-final.png`
- `hangar-low-final.png`
- `hangar-variant-overview.png`

First-pass failures:

- BGE retrieval could replace the explicit coastal-cliff parent with a floating
  island parent;
- the hangar wide door faced the wrong side;
- the hangar was too loosely related to the main building;
- the launch deck lacked a clear supported route;
- the roof wind tower was not readable;
- after the first repair, the medium scene exposed a new route-bounds warning:
  the wide annex could expand towards the nearest map edge.

Regression result:

- PASS: explicit `海岸悬崖` owns the parent terrain even when BGE retrieves
  floating/salt-island atoms;
- PASS: three wave-cut vertical cliff faces, sea level, tactical ledges and fall
  hazards are generated as terrain geometry;
- PASS: the hangar has a larger span and height than ordinary rooms;
- PASS: the main-building personnel door, hangar interior, wide exterior door
  and supported launch deck form one continuous route;
- PASS: fuel tanks, manifold, gantry, maintenance cradle, bunks and lockers are
  physical geometry;
- PASS: the roof wind-vane deck has supports, railing, hatch, ladder, mast,
  crossbar, arrow and tail;
- PASS: the annex now preserves its Seed-selected side unless that side would
  leave the map, then chooses the safer in-bounds side;
- PASS: the same Seed reproduces the same layout;
- PASS: `round-79-hangar-b` changes the mountain bands, footprint placement,
  building orientation and annex relationship rather than only decoration;
- PASS: diagnostic score improved from 90/100 with one route warning to 97/100
  with no warning.

Remaining limitation:

- an isolated 1F focus hides the parent cliff, so the launch-deck columns appear
  unusually long without their terrain context. The overview and low-angle
  views show that they terminate against the cliff/ground datum.

## Scene C — giant-forest pilgrim hospice

Prompt:

> 巨木森林中的朝圣者避难院，有小礼拜堂、宿舍、医务室、补给库和树冠瞭望台

Seed: `round-79-hospice-a`

Evidence:

- `hospice-overview-final.png`
- `hospice-1f-final.png`
- `hospice-upper-final.png`
- `hospice-b1-final.png`
- `hospice-roof-final.png`
- `hospice-low-final.png`

First-pass failures:

- the tree-canopy observation point was visually weak;
- basement circulation repeated the same long-stair problem.

Regression result:

- PASS: the shrine carrier remains inside a layered forest with irregular
  clearings, route contours and mixed tree structure;
- PASS: altar, pew rows and chapel screens form a recognizable sacred zone;
- PASS: bunks, lockers, medical beds and supply racks create separate functional
  spaces;
- PASS: the tree-canopy observation platform is raised, supported, railed and
  reachable;
- PASS: B1 uses folded vertical circulation;
- PASS: diagnostic score 97/100 with no geometry warning.

Remaining limitation:

- the upper accommodation is tactically valid but visually sparse compared with
  the denser ground-floor chapel and treatment spaces.

## Semantic and ownership repairs

- Added observation terms for signal decks, signal stations, wind towers,
  weather vanes and weather towers.
- Split underground storage from archive semantics:
  archives require record/archive language, fuel stores become `fuel`, and
  ordinary supply/water stores become `storage`.
- Added explicit coastal-cliff parent precedence over vector retrieval.
- Removed generic observation routes when an airship-specific roof replacement
  removes their geometry.

## Automated evidence

`npm run check`:

- 12 test files passed
- 239 tests passed

`npm run build`:

- TypeScript build passed
- Vite production build passed
- only the pre-existing bundle-size advisory remains

`git diff --check`:

- passed

## Self-audit conclusion

The three unfamiliar compound prompts no longer collapse to one generic
facility. Their parent terrains, carrier buildings, functional spaces and roof
landmarks are independently composed. Required facilities have geometry
evidence and affect routes, cover, hazards or high ground.

This round does not claim that every unknown facility noun is finished. The
remaining project-wide work is continued expansion of the atom catalog and
stronger visual variation for upper rooms, facade systems and highly unusual
mixed-domain prompts.
