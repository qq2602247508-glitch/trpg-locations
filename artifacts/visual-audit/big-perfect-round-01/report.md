# Big Perfect Round 01 visual audit

## Fixed baseline

- Pure forest prompts no longer become Silverfall Valley when they contain a minor stream. The forest owns the macro terrain; streams remain child hydrology.
- Forest settlements now use rolling 0/5/10-foot terrain and real forest belts around roads and parcels instead of replacing the forest with a bare village plate.
- Ice-crevasse settlements now contain a map-separating primary fracture, a branching secondary fracture, eroded vertical ice edges, supported crossing points and a reachable rift-bottom route. Semantic coverage is 100% for the fixed regression prompt.
- Hollow-tree settlements now have an overlapping, continuous bark shell, a true entrance gap, radial root buttresses, internal ring routes, spiral movement and a canopy level. The first detached-pole pass was rejected and iterated with the same seed.
- Enter-building focus was verified in the real browser. Non-full-interior LODs now isolate their BuildingProgram room graph instead of mixing exterior platforms and focus blueprints.
- A default-off local-model semantic button now forces schema-constrained local Qwen planning while preserving deterministic geometry generation and BGE-first automatic behavior.
- Semantic light atoms now convert bounded lantern/hearth/furnace/magical-light primitives into local day/night point lights.

## Evidence

- `regression-02/01-forest.png`: corrected forest parent.
- `regression-03/03-ice-correct-ui.png`: separated ice banks and branching fracture.
- `regression-03/04-hollow-tree-city.png`: rejected detached-rib pass.
- `regression-03/06-hollow-tree-city-shell.png`: accepted continuous tree shell.
- `regression-03/08-hollow-tree-building-focus-visible.png`: real full-interior focus.
- `regression-03/12-mass-building-program-focus.png`: rejected exterior/focus overlap.
- `regression-03/13-mass-building-focus-clean.png`: isolated on-demand room program.
- `regression-03/14-force-local-model-button.png`: default-off UI control.
- `regression-03/15-force-qwen-result.png`: real forced local-model run (18 seconds).
- `regression-03/18-semantic-light-atoms-night-full.png`: semantic lights in night mode.

## Self-review failures still open

- Full-interior settlement buildings still need richer type-specific doors, furniture and room adjacency; the guild focus remains simpler than standalone architecture.
- The hollow-tree canopy should become structurally stronger without hiding the interior behind oversized green spheres.
- The forced-Qwen regression proved invocation, but the unfamiliar hanging embassy still degraded to a river-valley title and generic morphology; model assistance cannot substitute for missing composition atoms.
- Night forest-village semantic coverage remained 0% for explicit lantern, bonfire and shrine-brazier requirements. Light transport works, but those requested fixtures need authored composition requirements and geometry.
- Browser density automation remained at 20% in the latest UI runs; high-density and changed-seed visual comparisons are still required.

## Automated verification

- `npm run check`: 266/266 tests passed.
- `npm run build`: passed.
- Production build retains the existing large-chunk warning; no new build failure was introduced.
