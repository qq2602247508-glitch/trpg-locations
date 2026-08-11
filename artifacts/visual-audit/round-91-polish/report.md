# Round 91 — coastal and cave visual polish

Date: 2026-08-11

Prompt: `海岸悬崖上的滑翔救难站，有宽门机库、绞盘库、医务室、屋顶信号台和通往海蚀洞的维护栈道。`

Seed: `round-88-coastal-signal-hangar-a`  
Size: medium  
Density: 20%

## Iteration evidence

- `01-coastal-naturalized-overview.jpg`: first overview after adding irregular rock-surface lobes and removing the redundant second coastal-cliff pass.
- `02-coastal-naturalized-low.jpg`: failed generic inland low-angle preset; it still hid the waterline behind the plateau.
- `03-coastal-waterline-low.jpg`: final waterline-oriented low-angle preset, looking from open sea toward the authored cliff.
- `04-sea-cave-b1-polished.jpg`: first cave-shell revision; cave mouth improved, but retaining the complete catwalk made the cave too small.
- `05-sea-cave-interface-tail.jpg`: final B1 view after splitting the catwalk into an ordinary surface segment and an explicit cross-floor interface tail.

## Passed

- The coast is now rendered by a continuous blocking cliff core plus overlapping irregular rock surfaces, rather than only a row of retaining-wall boxes.
- The older redundant three-box coastal theme pass is suppressed whenever the authored open-sea layer already owns the coast.
- The low-angle audit preset detects an open-sea/cliff pair and frames the site from the waterline, making sea, cliff height, tide access, building and maintenance deck readable together.
- The sea cave has a narrower mouth, side shell, back wall, entrance columns, tide pool, rock cover, real stair descent and tactical grid.
- The complete catwalk remains visible on the surface floor, while B1 receives only the final 28% interface tail and its last structural support.
- B1 camera fitting is no longer dominated by the full surface catwalk; the cave is large enough to inspect.
- The explicit `floor-context:*` contract remains generic and is not tied to the words “sea cave” inside the renderer.

## Remaining visual limits

- The procedural cliff is intentionally low-poly; some rock lobes remain visibly oval at close range.
- The isolated B1 view omits the surrounding parent cliff by design, so it is a tactical floor inspection rather than a cinematic cave exterior.
- Materials remain the project’s lightweight procedural palette; texture/normal-map fidelity is outside this completion round.

## Verification

- Targeted interface/generator tests: 135 passed.
- Full project check: 264 passed across 13 test files.
- Production build: passed.
- `git diff --check`: passed.

## Decision

The previously planned Round 90/91 scope is complete: the failed glacier facility is restored, old forest/river capabilities are preserved, density changes river topology, cross-floor interfaces remain readable, and the coastal/cave presentation has a dedicated audited view. Further work belongs to the later “large perfect atom library / material fidelity” phase rather than the earlier agreed completion standard.
