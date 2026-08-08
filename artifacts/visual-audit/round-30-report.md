# Round 30 · Parent-terrain relationship and focused inspection

Date: 2026-08-08

## Scope

This round did not add a complete scene template. It strengthened the
relationship contract between parent terrain and specialist site modules:

- terrain compilers now expose typed crossing candidates;
- caldera, river, ice-crevasse and underdark terrain can provide hazard
  crossings with endpoint elevations and a computed deck height;
- an industrial/conveyor request consumes the first terrain crossing candidate
  instead of placing an unrelated generic catwalk;
- the volcanic maintenance bridge is segmented, has two grounded gantries,
  guardrails, a connected service pipe, a route and a tactical chokepoint;
- lava cells receive an explicit surface layer and `lava-flow` tags;
- water-requiring modules search for parent water and receive a supported
  water-access deck and route;
- building focus now keeps only the selected building and owned parcel context,
  preventing nearby parent terrain from occluding the interior;
- the density label is synchronized on both `input` and `change`, and again
  before generation.

## Visual audit matrix

### 1. Unfamiliar volcanic composition

Prompt:

> 火山灰峡谷里的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥

Seed: `round30-volcanic-bridge-a`  
Size: medium  
Density: 62%  
Program: `mining-settlement`, `caldera`, `grammar.volcanic-v1`

![Volcanic camp overview](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/volcanic-camp-overview-a-v2.jpg)

![Volcanic camp low angle](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/volcanic-camp-low-a.jpg)

![Volcanic camp top view](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/volcanic-camp-top-a.jpg)

Passed:

- parent caldera remains present instead of collapsing into a laboratory;
- lava now forms a continuous, brighter surface layer;
- settlement buildings sit on caldera rim/shelves;
- the maintenance crossing is backed by a typed lava crossing candidate,
  endpoint supports and a route;
- 5-foot grid remains present.

Still weak:

- the bridge is still thin at whole-site scale and needs a dedicated close
  inspection or stronger landmark treatment;
- density visual comparison was not accepted in this browser pass because
  automated range-keyboard interaction changed the property without reliably
  updating the visible label.

### 2. Parent water and specialist modules

Prompt:

> 潮汐红树林里的炼金学者港村，有根桥、树上实验屋、半淹档案库和水下温室

Seeds: `round30-mangrove-water-a`, `round30-mangrove-water-b`  
Size: medium  
Density: 62%

![Mangrove overview A](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/mangrove-overview-a.jpg)

![Mangrove focused building](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/mangrove-focused-laboratory-v2.jpg)

![Elevated laboratory upper floor](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/mangrove-laboratory-upper-v2.jpg)

![Submerged module B1](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/mangrove-b1-candidate.jpg)

![Mangrove overview B](/Users/inagi/我的/500-软件测试/510-软件/trpg-locations/artifacts/visual-audit/round-30/mangrove-overview-b.jpg)

Passed:

- focus view no longer includes the giant parent canopy/water volume;
- upper laboratory shows real walls, vessels, support columns and an exterior
  platform;
- B1 view shows water, cultivation surface, frame and vertical support;
- water-required modules now receive parent-water access geometry and routes;
- Seed B changes bounds, building positions and water-edge arrangement.

Still weak:

- the broad mangrove boardwalk family remains similar across Seeds;
- archive water depth and distillation pipe readability need a future close
  pass.

## Automated checks

```text
178 tests passed
npm run build passed
git diff --check passed
```

## Acceptance status

This round is a stable intermediate stage, not the end of the architecture.
The parent-terrain relationship and focused-view blockers are fixed and
visually rechecked. The next round should make the hazard bridge a stronger
landmark, improve macro Seed divergence for mangrove roots, and run a reliable
interactive low/high density browser comparison.
