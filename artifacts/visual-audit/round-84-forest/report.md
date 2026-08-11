# Round 84 — Forest parent terrain and embedded-building audit

Date: 2026-08-11

## Fixed-seed target

- Prompt: `深林中的猎人木屋，有林间空地、倒木防线、溪边木桥、树冠观察台和地下储藏室`
- Seed: `round-84-forest`
- Size: large
- Density: 78%

### Failure found from the first browser render

The child building layer recognized `溪边木桥`, but the parent forest only
recognized the narrower tokens `浅溪 / 溪流 / 小溪`. It could therefore emit a
footbridge while omitting the stream that should support its meaning.

The building-pad clutter pass could also erase stream segments because water
still carried a `forest` tag. That left a waterflow route without nearby water
geometry.

### Repairs

- Added streamside and footbridge language to the forest parent contract.
- Added explicit semantic requirements for the stream and timber crossing.
- Preserved hydrology while clearing trees and brush around an embedded
  building.
- Added `bridge`, `wood-bridge`, and `stream-crossing` evidence to the actual
  crossing geometry.
- Reduced implicit canopy platforms and disabled automatic canopy bridge
  networks. A multi-tree skyway now requires an explicit canopy-network prompt.

### Result

- 410 × 345 ft
- 4 logical layers
- 5,162 walkable terrain cells
- 1,101 elevation boundaries
- 584 natural slope facades
- 208 clustered trees
- 2 reachable canopy platforms
- shallow stream and supported footbridge
- full-interior cabin with B1 storage
- diagnostic score: 97 / 100
- semantic coverage: 100%
- warnings: 0

Evidence:

- `baseline-overview.png`
- `fixed-overview.png`
- `final-overview.png`
- `fixed-cabin-1f.png`
- `fixed-cabin-b1.png`
- `alt-overview.png`

## Seed variation

- Prompt: same as fixed target
- Seed: `round-84-forest-alt`
- Size: large
- Density: 78%

The alternate seed changed:

- scene bounds from 410 × 345 ft to 420 × 335 ft;
- walkable cells from 5,162 to 5,125;
- elevation boundaries from 1,101 to 1,280;
- slope facades from 584 to 732;
- species distribution;
- clearing placement, ridge forms, stream bend, building position, and routes.

## Unfamiliar-combination target

- Prompt: `被古老石环包围的雨林气象哨站，有泥泞上坡路、根桥、半地下档案室和树冠信号台`
- Seed: `round-84-stranger`
- Size: medium
- Density: 66%

### Failure found from the first browser render

`雨林` reached the forest generator through semantic retrieval, but
`气象哨站` was not recognized as a weather facility. The first result contained
only forest terrain: no independent building, archive, or signal platform.

### Repairs

- Added rainforest/jungle as deterministic forest-parent language.
- Generalized weather facilities to `气象哨站 / 气象哨所 / weather outpost`.
- Preserved the forest as parent terrain and instantiated a full-interior
  weather building as the child.
- Added reusable standing-stone-ring and supported root-bridge atoms.
- Merged prompt-owned archive/observation semantics into a known weather
  profile instead of letting generic profile labels overwrite them.
- Added tree-canopy signal-platform language.

### Result

- 275 × 220 ft
- 4 logical layers
- 2,226 walkable terrain cells
- 498 elevation boundaries
- 183 clustered trees
- full-interior weather outpost
- real half-underground archive geometry and stair access
- standing-stone ring
- supported root bridge and alternate route
- reachable canopy signal/observation platform
- diagnostic score: 98 / 100
- semantic coverage: 100%
- warnings: 0

Evidence:

- `stranger-overview.png`
- `stranger-b1.png`

## Visual self-audit

Passed:

- Forest reads as a layered woodland rather than a flat green plate with sparse
  trunks.
- The stream now exists whenever the prompt asks for a streamside timber
  crossing.
- The child building no longer deletes parent hydrology.
- The fixed and alternate seeds visibly change macro relief and site layout.
- The unfamiliar weather-outpost phrase no longer falls back to terrain-only
  output.
- Cabin/outpost interiors and B1 geometry are real and selectable.
- No automatic criss-cross canopy highway is emitted for a single observation
  platform request.

Still open:

- The low-angle whole-map camera remains too distant for useful forest-cliff
  inspection.
- The fixed cabin 1F is functional but still visually sparse.
- Standing stones and root bridge need richer silhouette variants across future
  seeds.
- Forest material differentiation can improve without reintroducing noisy
  per-cell color variation.
