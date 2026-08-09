# Round 58 — Composite Terrain Ownership Audit

Date: 2026-08-09

## Scope

This round upgrades the contract between parent wilderness terrain and embedded
building programs. Water, lava, void, and unstable terrain now publish explicit
reservation zones before child facilities, service sheds, towers, semantic
landmarks, and loose tactical props are placed.

## Implemented

- Added oriented `TerrainReservationZone.rotationY`.
- Added reusable linear and radial terrain-reservation helpers.
- River valleys publish reservations for the main river, tributaries, waterfall
  basin, and prompt-authored waterfall pools.
- Volcanic terrain publishes reservations for the crater lake, main outlet, and
  lava branches.
- Infernal terrain publishes a reserved lava fissure.
- Rift terrain publishes a continuous segmented unstable corridor.
- Impact craters publish an unstable inner basin and radial fracture seams.
- Added exact rotated-zone versus axis-aligned footprint testing for building
  placement.
- Added a cached spatial index for supported terrain. A large Silverfall Valley
  generation dropped from about 5959 ms to 70 ms in the local diagnostic run.
- Expanded natural-parent vocabulary for rifts and impact craters while
  preserving named villages, towns, and cities as settlement parents.
- Added a volcanic facade profile with basalt heat shielding, a cooled service
  apron, and cooling/exhaust vents.
- Added a short supported basalt inspection bridge and a nearby standable
  caldera observation platform for unfamiliar volcanic research facilities.

## Regression prompts

### Volcanic workshop

Prompt:

> 活火山破碎火山口边缘的地热观测工坊，有样本实验室、通信塔、发电机棚、地下冷却样本库、两条熔岩沟和玄武岩检修桥

Seed: `volcanic-workshop-reservation`

Automated contract:

- volcanic parent retained;
- four or more lava reservations;
- independent guild/field-station BuildingProgram;
- basalt heat shield and cooled apron;
- building pad, generator shed, and communications tower outside lava zones;
- maintenance bridge shorter than 15 cells;
- standable observation platform;
- no diagnostics warnings.

### River ownership

Prompt:

> 弯曲河谷中的水文测量站，有瀑布、支流、深潭、样本实验室和通信塔

Seed: `river-water-reservation-contract`

Automated contract:

- river-valley parent retained;
- oriented river/tributary ownership zones;
- deep plunge-pool reservation;
- child facility placement remains on supported bank terrain.

### Impact and rift facilities

Prompts:

> 巨大陨石撞击坑边缘的地震观测站，有样本实验室、通信塔、发电机棚和地下样本库

> 深裂谷西岸的地质研究站，有样本实验室、通信塔、发电机棚和地下样本库

Automated contract:

- explicit natural parent retained;
- unstable terrain reservations published;
- facility, generator, and communications pieces avoid unstable zones;
- no diagnostics warnings.

## Automated verification

```text
npm run check
12 test files passed
205 tests passed

npm run build
passed

git diff --check
passed
```

## Visual audit history

The following images record rejected intermediate bridge iterations:

- `volcanic-workshop-a-overview.jpg`
- `volcanic-workshop-a-bridge-overview.jpg`
- `volcanic-workshop-a-bridge-low.jpg`
- `volcanic-workshop-a-bridge-top.jpg`

The long bridge in those images was rejected because it connected the station to
a remote random basalt shelf and read as an arbitrary straight span.

## Visual audit blocker

The revised short bridge and nearby observation platform have not yet received a
new browser screenshot. The in-app Browser connected successfully, but its URL
policy blocked navigation to `http://127.0.0.1:5241/` and explicitly prohibited
using another browser-control surface as a workaround.

Therefore:

- the old long-bridge images are not accepted as evidence for the new geometry;
- Round 58 visual validation remains open;
- the first action after local-browser access returns is to regenerate the same
  prompt and Seed, then capture overview, top, low-angle, 1F, B1, and a changed
  Seed overview;
- no claim of completed visual acceptance is made in this report.
