# Round 50 visual audit — climate facades and local semantic routing

Date: 2026-08-09

## Scope

- Make ice terrain layers visually separable without per-cell mosaic noise.
- Give the same field facility different supported facade geometry in polar, wetland and alpine parents.
- Make local BGE capability retrieval select actual bounded generators.
- Keep composition diagnostics and wilderness geometry on one capability-domain decision.
- Verify same-Seed repair, different-Seed variation and unfamiliar language in the browser.

## Browser evidence

### Polar seismic station

Prompt: `极地冰盖上的地震监测站，有钻芯实验室、通信桅杆、备用发电棚、防风入口和地下冰芯库`

Seed: `round50-polar-station`, medium, density 78%

- Failure evidence: `polar-station-wrong-domain.jpg` — ice cap incorrectly lost to a generic institution.
- Final overview: `polar-station-overview-final.jpg`.
- Final 1F focus: `polar-station-focus-final.jpg`.
- Pass: natural parent ownership, eroded ice layers, full-interior child building, polar windbreak, insulated cladding, roof snow fence, roof-layer filtering, 100% semantic coverage.
- Remaining: station mass is small at scene scale; some ice shelves still read as broad grey plates.

### Wetland seismic station

Prompt: `热带泥炭湿地里的地震监测站，有样本实验室、通信桅杆、备用发电棚、架高步道和地下岩芯库`

Seed: `round50-wetland-station`, medium, density 78%

- Final overview: `wetland-station-overview-final.jpg`.
- Final 1F focus: `wetland-station-focus-final.jpg`.
- Pass: wetland parent, boardwalk, stilt foundation, four-point supported rain awning, laboratory and underground archive.
- Remaining: parent wetland elevation is still modest from a low angle.

### Alpine seismic station

Prompt: `高山裸岩山脊上的地震监测站，有钻芯实验室、通信桅杆、备用发电棚、挡风墙和地下岩芯库`

Seed: `round50-alpine-station`, medium, density 78%

- Failure evidence: `alpine-station-wrong-domain.jpg` — ridge synonyms initially failed natural ownership.
- Final overview: `alpine-station-overview.jpg`.
- Final low angle: `alpine-station-low.jpg`.
- Final 1F focus: `alpine-station-focus.jpg`.
- Pass: six mountain elevation bands, vertical cliff faces, summit facility, alpine stone buttresses and rear wind screen, 100% semantic coverage.
- Remaining: mountain grammar still relies on large shelves; facade buttresses need richer shapes than boxes.

### Unfamiliar BGE water description

Prompt: `雾中银阶沿两条分叉流线跌落，围住两处可渡点`

Seed: `round50-bge-water`, medium, density 66%

- Mismatch evidence: `bge-water-overview-mismatch.jpg` and `bge-water-low-mismatch.jpg` — geometry was river-valley while composition claimed rift.
- Final overview: `bge-water-overview-final.jpg`.
- Final low angle: `bge-water-low-final.jpg`.
- Pass: BGE selected `terrain.height-field`, `water.meandering-channel`, `water.tributary`, `water.waterfall`; both planners now compile river grammar and real river-valley geometry; 100% semantic coverage.
- Remaining: valley edges retain a terraced voxel profile.

### Unfamiliar BGE canopy description

Prompt: `层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断`

Seeds: `round50-bge-canopy` and `round50-bge-canopy-b`, medium, density 82%

- Seed A: `bge-forest-overview.jpg`, `bge-forest-low.jpg`.
- Seed B: `bge-forest-seed-b.jpg`.
- Pass: BGE selected height field, tree clusters, undergrowth and irregular clearing atoms; 216 clustered trees, three clearings, 12 fallen logs and four reachable canopy platforms. Changing the Seed changed map dimensions, terrain-cell count, vertical-face count, clearing positions and route structure.
- Remaining: tree silhouette vocabulary is too narrow and terrain relief is still subtle.

## Automatic verification

- `npm run check`: 196/196 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Production build warning retained: the generated worker/renderer chunks exceed 500 kB and should be code-split in a future performance pass.

## Honest acceptance

This round passes its bounded goals: climate facade geometry, natural-parent ownership expansion, layer-aware climate fixtures, BGE-to-geometry routing, shared capability-domain resolution, auditable capability display and browser evidence. It does not claim that forest atom visuals, alpine rock morphology or all unknown prompts are complete.
