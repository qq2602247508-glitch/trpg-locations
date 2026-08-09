# Round 55 visual audit — discontinuous forest-edge transition

Date: 2026-08-09

## Scope

Round 55 replaces the rejected universal forest perimeter skirt with a domain-specific ecological transition atom. It composes isolated anchor trees, outward roots, inside-edge thickets and occasional fallen logs without surrounding the map with a continuous band.

## Composition contract

- The atom is forest-only and does not emit `erosion-skirt` geometry.
- Edge clusters are discontinuous and leave large visual and traversal gaps.
- Each root group is anchored to a visible tree trunk and radiates at different angles.
- Root aprons are explicitly non-standable; they do not create false grid surfaces.
- Density controls the cluster target; a dedicated sub-seed controls placement and branching.
- Same Seed replays exactly, while a different Seed changes the edge-cluster signature and macro terrain.

## Browser audit matrix

Prompt: `茂密森林，层层绿色冠幕遮住天空，粗壮立柱之间有三处光斑空场，地面被藤蔓与倒伏长杆阻断`

Density: 82%

### First realization — parallel roots

Seed: `round53-forest-slope-b`

Evidence:

- `round-55/forest-edge-overview.jpg`
- `round-55/forest-edge-low.jpg`

Result: fail. The edge remained discontinuous, but roots appeared as bright parallel timber planks with weak attachment to the ecology.

### Same-Seed radial-root regression

Seed: `round53-forest-slope-b`

Evidence:

- `round-55/forest-edge-radial-overview.jpg`
- `round-55/forest-edge-radial-low.jpg`

Result: prototype pass. Anchor trunks, radial angle variation and inside thickets make the clusters read as localized tree-root transitions. No continuous border ring appears, and the low-angle view shows roots meeting their trunks rather than floating as an independent layer.

### Different-Seed structural regression

Seed: `round55-forest-edge-variant`

Evidence:

- `round-55/forest-edge-seed-variant-overview.jpg`
- `round-55/forest-edge-seed-variant-low.jpg`

Result: pass for determinism and seed sensitivity. The scene changes from 2,200 terrain cells / 611 elevation boundaries to 2,385 cells / 694 boundaries. Edge anchors and radial roots relocate with the new macro terrain rather than merely shuffling interior props.

## Automatic validation

- `npm run check`: 200/200 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- The contract checks root geometry, non-standable semantics, absence of forest erosion skirts, thicket population, deterministic replay and different-Seed signatures.

## Honest remaining failures

- Roots are still straight wedge primitives and lack continuous taper, secondary branching and bark irregularity.
- The forest edge is visually softer but does not fully replace the rectangular lower map base.
- Cluster placement avoids a universal ring but does not yet reserve named entrances before ecology placement; current reachability remains valid, but a formal entrance-clearance validator is still needed.
- Marsh, snowfield and urban boundaries need their own edge-transition atoms rather than reusing this forest solution.
