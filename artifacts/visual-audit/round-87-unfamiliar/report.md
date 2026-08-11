# Round 87 — unfamiliar landform and embedded-facility audit

## Scope

This round tests whether an unfamiliar natural parent keeps ownership of the scene, whether its meaning becomes physical geometry, and whether the embedded building remains independently generated and connected. It does not add one complete hard-coded scene.

## Prompts and evidence

### Travertine hydrology station

Prompt: `石灰华阶地中的钟表水文所，有水位井、机械档案室、取样平台、地下校准室和跨溪维修桥。`

- Baseline: `round-87-travertine.png` — incorrectly routed to the forest grammar.
- Same Seed, dense overview: `travertine-high-overview-final.png` — Seed `round-87-travertine-final`, density 84%, score 98/100.
- Same Seed, dense low angle: `travertine-high-low-angle-v2.png`.
- Same Seed, sparse: `travertine-low-same-seed.png` — density 28%, score 97/100.
- Alternate Seed: `travertine-high-alt-seed-final-v2.png` — Seed `round-87-travertine-alt`, density 84%, score 98/100, no warnings.

Passed:

- Parent is `mountain`, never forest.
- Three to seven standable calcite terraces are generated from density.
- Each terrace owns a shallow mineral pool and adjacent-level cascade geometry.
- Dry rim route remains available.
- Vertical mountain switchbacks are sampled before placement; each individual terrace moves away from an existing vertical route.
- The hydrology building retains its field-station envelope, rooms, basement and exterior access.
- Alternate Seed changes the parent shelf graph, terrace positions and building envelope.

### Tafoni entomology signal station

Prompt: `风蚀蜂巢岩台上的昆虫学信号站，有标本处理室、气象桅杆、地下样本库和跨沟缆桥。`

- Baseline: `round-87-honeycomb.png` — mountain parent and building survived, but no honeycomb geometry; score 66/100.
- Dense overview: `tafoni-high-overview-final.png` — Seed `round-87-tafoni-final`, density 88%, score 98/100.
- Dense low angle: `tafoni-high-low-angle-v6.png`.
- Same Seed, sparse: `tafoni-low-same-seed.png` — density 26%, score 97/100.
- Alternate Seed: `tafoni-high-alt-seed.png` — Seed `round-87-tafoni-alt`, density 88%, score 98/100.

Passed:

- Parent remains mountain terrain.
- Large weathered walls expose two staggered rows of recessed cavities on both faces.
- Rock ribs, lintels, supported aprons, ladders and standable wall caps are physical geometry.
- Density changes wall count and cavity count; Seed changes position, width, height and grouping.
- The building is generated independently on the high shelf and remains connected to the site.
- A dedicated low camera frames the atom rather than hiding it behind the whole mountain.

Known limitation:

- The cavity rows are intentionally legible but still more regular than natural tafoni. A future micro-detail pass can add local erosion noise without changing the validated support and route contract.

### Unfamiliar controls

- `round-87-peat.png`: acid-fog peatland telegraph aid station — correctly remains swamp; score 98/100.
- `round-87-aurora.png`: obsidian ice-cap aurora chapel observatory — correctly remains ice; score 98/100.

These controls prove that adding the two new mountain atoms did not replace existing wetland or ice parent ownership.

## Interface defect found during visual regression

Alternate travertine Seed initially reported:

`Route wilderness-core-building-hangar-route passes through solid wall wilderness-core-building-envelope-sample-store-east without nearby opening evidence.`

The generic functional-wing route now cuts a real doorway through every envelope wall crossed by the service segment. A second regression then exposed a mountain switchback intersecting a mineral terrace; per-terrace route sampling now relocates the relevant terrace and keeps cascades connected across lateral offsets. The exact browser Seed now scores 98/100 with no warnings.

## Automated evidence

- `npm run check`: 12/12 files, 255/255 tests passed.
- `npm run build`: passed; existing Vite large-chunk warnings only.
- `git diff --check`: passed.
- Same Seed is deterministic.
- Alternate Seed changes macro and meso signatures.
- Density changes structural counts, not only props.

## Round decision

Round 87 passes its routing, geometry, density, Seed and building-interface gates. The broader project remains active: Round 88 must run a cross-domain interface matrix and final regression rather than treating these two atoms as universal natural-language coverage.
