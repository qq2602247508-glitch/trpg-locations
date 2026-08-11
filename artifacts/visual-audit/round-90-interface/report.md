# Round 90 — building / terrain interface audit

Date: 2026-08-11

## Scope

- Prove the previously failing glacier Seed B still contains its full embedded building after Worker-equivalent local retrieval adds medical, chapel, fuel, storage and bridge capabilities.
- Make a focused B1 sea-cave view retain only its explicitly linked surface catwalk context instead of hiding the interface or stacking the whole ground floor.
- Recheck the older forest-building and river-valley capabilities after the interface changes.

## Renderer contract

`floor-context:<level>` is now an explicit reusable cross-storey contract. A primitive carrying this tag remains on its authored floor, and a ghosted duplicate is shown only while the target numeric floor is inspected. It does not make unrelated geometry from the source floor visible. `focus-cluster:*` keeps the linked context and destination space inside one camera/grid inspection cluster.

## Browser evidence

### Coastal rescue station

Prompt: `海岸悬崖上的滑翔救难站，有宽门机库、绞盘库、医务室、屋顶信号台和通往海蚀洞的维护栈道。`

Seed: `round-88-coastal-signal-hangar-a`  
Size: medium  
Density: 20%

- `01-coastal-overview.jpg`: complete site overview.
- `02-coastal-b1-linked-context.jpg`: first B1 regression showing cave, descent and linked catwalk.
- `03-coastal-b1-low.jpg`: low-angle interface inspection.
- `04-coastal-b1-supported.jpg`: final B1 regression after the catwalk supports received the same explicit context contract.

Passed:

- B1 no longer becomes an isolated cave with its surface access removed.
- The surface catwalk is not duplicated into ordinary unrelated basement views.
- The catwalk, descent and cave share one focus cluster and the catwalk grid remains visible.
- The site still contains open sea, a cliff edge, a full-interior rescue building and a real cave room.

Still imperfect:

- The isolated B1 presentation makes the long catwalk visually sparse against the dark background; its thin supports are structurally present but not prominent.
- Cave wall forms are deliberately low-poly and still read more like grouped rock masses than a finished cavern shell.

### Glacier pilgrimage radio clinic

Prompt: `黑冰川裂缝旁的巡礼无线电救护站，有伤员舱、祷告室、地下燃料库、测风塔和跨冰隙担架桥。`

Seed: `round-88-glacier-pilgrim-radio-b`  
Size: medium  
Density: 84%

- `05-glacier-seed-b-overview.jpg`: previously failing Worker-equivalent Seed B, now with the building visible in the ice field.
- `06-glacier-seed-b-1f.jpg`: focused ground-floor rooms and vertical circulation.
- `07-glacier-seed-b-b1.jpg`: underground fuel/storage level with tanks, racks, walls and stair access.

Passed:

- The building survives the full retrieved capability set instead of disappearing after medical-space retrieval.
- The 1F plan has real walls, doors, fixtures and stairs.
- B1 contains actual fuel tanks, storage racks, ventilation and a two-flight route back to the surface.
- The crevasse parent terrain remains visible in the overview.

Still imperfect:

- The B1 ventilation-to-surface element and far wall create a sharp edge near the right side of the current camera framing.
- Exterior overview readability would benefit from a closer landmark-oriented camera preset.

### Forest building regression

Prompt: `密林坡地里的草药巡护院，有诊疗木屋、干燥棚、地下根窖、树冠瞭望台和跨溪根桥。`

Seed: `round-88-forest-herbal-hospice-b`  
Size: medium  
Density: 84%

- `09-forest-building-overview.jpg`

Passed:

- Dense multi-height canopy, understory, terrain bands, route clearings and the independent building remain visibly composed.
- The result has not regressed to a flat green slab with a few trees.

### River density regression

Prompt: `蜿蜒峡谷河谷，主河从高处落入深潭，两条支流、河岸悬崖、浅滩和旧石桥。`

Seed: `river-macro-contract-alt`  
Size: medium

- `10-river-high-density.jpg`: density 90%; three tributaries and a denser double-canyon bank structure.
- `11-river-low-density.jpg`: density 25%; one tributary and a simpler asymmetric gorge.

Passed:

- Density changes river topology and cliff composition, not only decorations.
- Both variants preserve the descending river, waterfall basin, bank faces and crossings.

## Automated verification

- Targeted renderer/interface regression: 135 passed.
- Full project check before final artifact capture: 264 passed across 13 test files.
- Production build: passed.
- `git diff --check`: passed.

## Round decision

Round 90 passes the functional interface and regression gates. The remaining work is visual polish rather than loss of topology: cliff/cave surfacing, isolated-interface presentation, and the B1 camera edge artifact are candidates for the final polish round.
