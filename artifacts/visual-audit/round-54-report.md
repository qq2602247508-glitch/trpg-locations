# Round 54 visual audit — domain-gated erosion skirts

Date: 2026-08-09

## Scope

Round 54 tests a reusable perimeter-erosion atom for reducing the rectangular cake-base silhouette of exposed terrain. The audit deliberately treats domain rejection as a valid result: an atom may be geometrically sound but visually wrong for a particular landscape.

## Geometry and composition contract

- Perimeter candidates are limited to true outer map boundaries; internal holes and tactical voids do not receive a decorative border.
- Adjacent candidates with the same direction, elevation and material merge into longer triangular-prism runs.
- The high edge is aligned with the authoritative outer tactical cell boundary and slopes outward.
- Erosion skirts are non-standable facades and never create false traversal surfaces or 5-foot grid cells.
- `terrain.erosion-skirt` is opt-in and records vegetation-covered boundaries as an explicit failure case.

## Browser audit matrix

### Dry channel, initial light-material realization

Prompt: `干涸河床，弯曲冲沟、冲刷巨石、三处渡口、断裂沙洲和两侧侵蚀坡面`

Seed: `round53-dry-channel`

Density: 72%

Evidence:

- `dry-channel-skirt-overview.jpg`
- `dry-channel-skirt-low.jpg`

Result: fail. Light rock skirts read as isolated white trapezoid panels and detached buttresses.

### Dry channel, dark-material iteration

Same prompt, seed and density.

Evidence:

- `dry-channel-skirt-dark-overview.jpg`
- `dry-channel-skirt-dark-low.jpg`

Result: partial. Material hierarchy improved, but the high edge did not meet the map boundary and still read as separate supports.

### Dry channel, boundary-aligned regression

Same prompt, seed and density.

Evidence:

- `dry-channel-skirt-aligned-overview.jpg`
- `dry-channel-skirt-aligned-low.jpg`

Result: prototype pass. Twenty-two merged erosion runs align their high edges to the outer tactical cells and slope outward. The perimeter reads as a faceted eroded bank instead of a vertical rectangular wall. Corners and elevation changes remain segmented, so the atom is not yet production-ready.

### Forest, dark-skirt rejection

Prompt: `茂密森林，层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断`

Seed: `round53-forest-slope-b`

Density: 82%

Evidence:

- `forest-skirt-overview.jpg`
- `forest-skirt-low.jpg`

Result: fail. The dark skirt becomes a black V-shaped border and weakens the forest identity.

### Forest, earth-skirt rejection and rollback

Same prompt, seed and density.

Evidence:

- `forest-skirt-earth-overview.jpg`
- `forest-skirt-earth-low.jpg`
- `forest-skirt-reverted-low.jpg`

Result: rejected. Earth material changes the color but not the structural failure: it remains a regular brown ring. Forest opt-in was removed. The final rollback retains 294 internal natural-slope facades without adding a perimeter skirt. Forest boundaries require a different future atom based on roots, shrubs, fallen trunks and irregular understory transition.

## Automatic validation

- `npm run check`: 199/199 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Tests verify dry-channel erosion-skirt realization, non-standable semantics and greater outward run depth than internal slope facades.

## Honest remaining failures

- Dry-channel skirts still segment at corners and elevation transitions rather than forming a continuous sculpted bank.
- The atom is only provisionally accepted for exposed mineral terrain; it is deliberately disabled for forest.
- Forest, marsh, snow and urban edges each need separate designer atoms instead of sharing a universal perimeter treatment.
- Perimeter facades still use a triangular-prism vocabulary. Fractured rock, roots, talus and retaining-wall sub-atoms are required for stronger domain identity.
