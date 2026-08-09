# Round 49 visual audit — terrain erosion, embedded facilities, and auditable camera focus

Date: 2026-08-09

## Scope

This round audited four linked failures: rectangular ice cover, flat symmetric snow ridges, natural-site facilities falling back to a generic institution, and focused top views that still framed the whole parent map.

## 1. Eroded ice field and density contract

Prompt: `被暴风侵蚀的永久冻土冰原，有破碎不规则冰盖边缘、连续弯曲雪脊、迎风坡与背风坡、融水池和次级裂缝`

- Seed: `round49-eroded-ice`
- Size: large
- Density comparison: 20% / 90%
- Evidence:
  - `ice-eroded-20-overview.jpg`
  - `ice-eroded-90-overview.jpg`
  - `ice-overview-final.jpg`
  - `ice-asymmetric-ridge-low-final.jpg`
- Passed:
  - one full rectangular ice slab was replaced by 8–12 seeded eroded plates and broken edge spurs;
  - density 20 generated 8 plates, 3 ridge systems, 2 thaw pools and 111 primitives;
  - density 90 generated 12 plates, 7 ridge systems, more fractures/routes and 248 primitives;
  - ridges have a high/narrow crest plus a lower/wider offset leeward layer;
  - `grammar.ice-field-v1` and `motif.eroded-ice-ridges` reach 100% semantic coverage;
  - the low-angle preset consumes an authored scene focus instead of framing the whole map.
- Remaining:
  - ice/snow materials are still prototype-flat and do not yet distinguish compacted snow, blue ice and wet fracture edges strongly enough.

## 2. Field station interior and focused top camera

Prompt: `高山永久冻土湿地无线电研究站，有野外实验室、样本处理翼、通信塔、发电机棚、架高栈道、地下标本库和冰水裂沟`

- Seed: `round48-field-station`
- Size: medium
- Density: 72%
- Evidence:
  - failed baseline: `field-station-focus-top.jpg`
  - corrected: `field-station-focus-top-fixed.jpg`
  - perspective: `field-station-focus.jpg`
- Passed:
  - focused top view now bounds the selected building and active floor;
  - dirty/clean sample benches, clean buffer, instrument console and wash sink are physical fixtures;
  - internal partition thickness was reduced from 0.22 to 0.13 cells.
- Remaining:
  - functional fixture contrast is low under the current transparency/material palette.

## 3. Mangrove quarantine station

Prompt: `海岸红树林里的检疫站，有高脚建筑、独立隔离棚、潮汐码头、巡逻塔、消毒区、四排病床和秘密药品库`

- Seed: `round49-quarantine-wards`
- Size: medium
- Density: 82%
- Evidence:
  - baseline: `quarantine-overview-baseline.jpg`
  - corrected: `quarantine-overview-fixed.jpg`
  - focused top: `quarantine-focus-top-fixed.jpg`
- Passed:
  - wetland, tidal channel, stilt building, detached ward and dock remain one spatial system;
  - four ward cots, screening gates, nurse counter, wash stations and underground medicine cache are physical geometry;
  - the tidal-dock route now joins the authored parcel entrance instead of crossing the wash-airlock wall;
  - score improved from 92 to 99 with no warnings.
- Remaining:
  - the focused plan needs a later material/UI pass so ward fixtures read faster without relying on tags.

## 4. Unfamiliar composite and seed variation

Prompt: `高原泥炭湿地地震监测站，有钻芯实验室、样本清洗间、通信桅杆、备用发电棚、架高步道和地下岩芯库`

- Seeds: `round49-seismic-a`, `round49-seismic-b`
- Size: medium
- Density: 74%
- Evidence:
  - failed fallback: `seismic-station-seed-a.jpg`
  - Seed A: `seismic-station-a-validated.jpg`
  - Seed B: `seismic-station-b-validated.jpg`
  - focused interior: `seismic-station-a-focus-top.jpg`
- Passed:
  - the failed `Civic institution Replanned` fallback was replaced by a wetland parent plus a child field-station BuildingProgram;
  - a reusable site-intent classifier recognizes natural parents and bounded field disciplines, including unknown `…监测站/实验站/测绘站` combinations;
  - communications mast, backup generation and underground sample storage are capability patterns, not full prompt templates;
  - both seeds reach 100% semantic coverage and score 99 without warnings;
  - Seed A/B change water bodies, dry islands, route geometry, facility position and 1,844/1,700 primitive compositions.
- Remaining:
  - building exterior style is still shared across too many scientific field facilities; later work should vary cladding, roof equipment and service-yard grammar by climate and era.

## Automated verification

- `npm run check`: 193/193 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Production build still reports the existing Vite warning for chunks over 500 kB; this round did not regress runtime validation.

## Self-audit conclusion

The round passes its structural goal: terrain owns the parent scene, facilities remain independent buildings with interiors, unknown monitoring disciplines no longer fall back to a generic institution, density changes meso structure, and the camera focus contract is visible in diagnostics and used by both top and low-angle audits. It does not claim final visual completion; material differentiation and field-facility facade variety remain open.
