# Round 14 visual audit — terrain / settlement fusion

Date: 2026-08-08

All captures were generated in the real Three.js browser UI at `127.0.0.1:5241`, with adaptive subject, medium scale and 62% density unless noted. The audit loop was baseline → code change → same-seed replay → low-angle/top/route inspection → further correction.

## Architecture verified

The pipeline is now `SiteProgram → TerrainProgram → SettlementAdaptationProgram → roads/platforms → independently generated buildings`. Semantic parent terrains own their navigable surfaces; ordinary flat parcel decals and generic street overlays are suppressed for these sites. Each placed building still carries its independent interior BuildingProgram and can be focused in the UI.

## Representative scenarios

| Scenario | Seed | Evidence | Passed | Remaining |
| --- | --- | --- | --- | --- |
| River canal city: curved main canal, three branches, stone/wood bridges, market and premodern lanes | `r14-water-city`, `r14-water-variation-b` | `water-city-clean.png`, `water-city-seed-b-overview.png`, `water-city-seed-b-routes.png` | Continuous water hierarchy, stepped fall, bank routes, bridges, buildings constrained to banks; second seed changes channel/building composition | Medium density leaves a broad quiet foreground bank |
| Impact-crater village with three descent ramps | `r14-crater-village` | `crater-village-clean.png`, `crater-village-low-angle.png` | Depressed basin, broken rim, basin/rim/outer building bands and three breaches are visually legible | Meteor fragment remains deliberately abstract |
| Volcanic caldera village with lava, chain bridge and altar | `r14-volcano-village` | `volcano-village-clean.png` | True caldera relief; generic floating road fragments removed; lava outlet, bridge and high altar are geometric | Lava outlet is small at whole-site scale |
| Underdark shelf village with ravine, lake and two bridges | `r14-underdark-lake` | `underdark-visible-lake-overview.png`, `underdark-visible-lake-low-angle.png`, `underdark-lake-emissive-top.png` | Cave boundary, five shelf elevations, ravine, two crossing structures, fungal cover and a real depressed lake surface exist | Dark-water contrast is still subtle in the default overview; top/route views read it more reliably |
| City on a giant tower, three ring platforms and crown | `r14-tower-stack` | `tower-city-rings.png`, `tower-city-low-angle.png` | One central load-bearing core, lower/middle/upper rings, radial bridges, three vertical stair connections and buildings at authored heights | Upper ring is visually crowded at 62% density |
| Vertical slum between giant bridge piers | `r14-supported-vertical` | `vertical-slum-ravine-overview.png`, `vertical-slum-ravine-low-angle.png` | Central ravine now cuts through the site; three supported market decks, rope bridges, piers and vertical connections are real geometry; building cap reduced to nine | Market decks are intentionally broad and remain visually dominant |
| Four-tier sea-cliff port | `r14-seacliff-port` | `sea-cliff-port-fixed.png` | Settlement remains the parent despite lighthouse wording; four cliff bands, docks, shelf buildings, lighthouse and switchback maintenance route are present | Cliff bands use stepped grid geometry rather than smoothed rock meshes |
| Forest hunter cabin | `r14-forest-settlement` | `forest-settlement-fixed.png` | Forest/river terrain remains parent; cabin is a focusable full-interior building with cellar and access route | One major cabin, not a dense hamlet, for the tested medium prompt |
| Fossil dragonbone swamp fishing village | `r14-dragonbone-swamp` | `dragonbone-swamp-fixed.png` | Unknown combination no longer falls back to cemetery/default town; marsh channels, spine/rib walkways, skull platform and marrow altar shape placement | Bone silhouette remains stylized |
| 1920s mining camp in crashed airship wreck | `r14-airship-mining` | `airship-mining-fixed.png` | Unknown combination remains a settlement; broken hulls, keel, tail fin, hanging platform, mine portal and freight layer replace the former intersecting slabs | Airship wreck is readable as an abstract tactical hull rather than a detailed vehicle model |

## Self-review answers

1. Parent terrain now visibly changes routes, buildable space and building elevation: pass.
2. Semantic sites no longer receive the generic flat town road/parcel layer: pass.
3. Buildings are placed onto terrain-owned support surfaces instead of floating at global Y=0: pass in tested semantic scenes.
4. Required bridges, ramps, lakes, lava, platforms and vertical routes are geometric: pass.
5. Same seed deterministic replay: covered automatically and visually replayed.
6. Different seed changes terrain and settlement composition: pass for water city.
7. Unknown combinations avoid generic fallback: pass for fossil-swamp and airship-wreck prompts.
8. Terrain-owned grid follows elevation surfaces: pass; stepped voxels remain a deliberate performance trade-off.
9. Floating stair/platform regression: pass in the audited bridge and tower sites; supports and endpoint heights are authored.
10. Theme readability without title: strong for tower city, crater, water city, sea cliff and dragonbone; moderate for dark underground lake and abstract airship hull.

## Known next-stage work

- Improve dark underground-water contrast without making all water emissive or arcade-like.
- Add lower-LOD rock skirts/smoothed cliff walls while preserving the 5-foot playable surface grid.
- Give very large semantic settlements sparse-background facade LOD buildings without reintroducing box-only city clutter.
- Add dedicated tactical silhouettes for wreck types beyond the current airship grammar.
