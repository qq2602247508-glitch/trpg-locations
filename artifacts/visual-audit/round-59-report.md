# Round 59 — Capability Catalog Truthfulness and Visual Audit

Date: 2026-08-09

## Scope

- Reconcile the capability catalog with geometry that actually exists.
- Add bounded cave and floating-island composition domains.
- Verify unfamiliar compound prompts through lexical/BGE capability retrieval.
- Use browser screenshots to reject false maturity claims.

## Automated verification

- `npm run check`: 12 test files, 210 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Visual test 1 — floating islands

Prompt:

> 三层破碎浮空岩岛群，岛屿有暴露底面、风剪深渊、悬索桥、垂直升降路线和上层观测平台

Seed: `round59-floating-b`  
Size: large  
Density: 78%

Screenshots:

- `floating-overview.jpg`
- `floating-low-angle.jpg`

Passed:

- The floating-island parent now wins over the secondary word “深渊”.
- Three real elevation bands are present.
- The scene reports three floors at 20 / 20 / 20 feet.
- Void gaps and two vertical routes exist.
- Semantic coverage is 100%; diagnostics score is 99/100.
- Generation remains fast at about 9 ms in the audited run.

Failed:

- Low-angle island thickness is still too weak.
- The long vertical connector reads as a straight structural bar.
- Suspension-bridge support and guardrails are not visually explicit enough.

Decision:

- Keep `terrain.floating-island` at `prototype`, despite topology passing.

## Visual test 2 — cave chamber network

Prompt:

> 层叠岩窟中的回声腔群，多个洞室由狭窄通道和天然坡道连接，有黑水池、断裂岩架、隐藏挤压通道和高处伏击台

Seed: `round59-cave-a`  
Size: large  
Density: 74%

Before:

- `cave-overview.jpg`
- `cave-low-angle.jpg`

After adding chamber shells, passage side walls and passage roofs:

- `cave-improved-overview.jpg`
- `cave-improved-low-angle.jpg`

Passed:

- Eight chambers form a connected graph with a loop.
- Nine routes remain valid.
- Multiple elevations, a water hazard and ledges exist.
- Geometry increased from 47 to 275 primitives while audited generation remained about 4 ms.
- Semantic coverage is 100%; diagnostics score is 99/100.

Failed:

- Chamber walls still read partly as a ring of stone columns.
- Natural erosion silhouettes need more variation.
- A continuous cave ceiling is not yet established.
- The automatic low-angle camera is too distant for an interior cavern audit.

Decision:

- Keep `terrain.cave-chamber` at `prototype`, despite topology passing.

## Visual test 3 — damaged and flooded museum

Prompt:

> 被植物侵入且部分坍塌的哥特博物馆，有独立中央展厅、两翼展馆、真实门窗、淹水地下库房、断裂玻璃穹顶、临时木桥和屋顶逃生路线

Seed: `round59-museum-a`  
Size: large  
Density: 72%

Screenshots:

- `museum-overview.jpg`
- `museum-1f.jpg`
- `museum-b1.jpg`
- `museum-roof.jpg`

Passed:

- Real room cells, wings, doors, basement access and separated layers exist.
- B1 contains real water geometry rather than a color-only state.
- Collapse generates removed walls, rubble, a temporary bridge and an alternate route.

Failed:

- Overgrowth remains sparse pillar-like geometry.
- The flooded collection basement lacks enough museum-specific contents.
- The roof is still a complete rectangular platform.
- Broken dome fragments read as flat bars.
- Windows are facade plates rather than full wall-cut openings.
- Overall massing remains too flat in the cutaway view.

Decisions:

- Keep `state.overgrowth`, `structure.wall-opening` and `structure.roof-system` at `prototype`.
- Keep `state.flood` and `state.collapse` as `validated` because they make measurable physical topology changes and preserve routes, while their visual treatment remains a future improvement target.

## Catalog changes

Promoted to validated with geometry evidence:

- `terrain.ravine`
- `ecology.root-network`
- `structure.room-cell`
- `state.collapse`
- `state.flood`

Moved from planned to truthful prototype:

- `terrain.cave-chamber`
- `terrain.floating-island`
- `structure.roof-system`
- `structure.wall-opening`
- `state.overgrowth`

The quality gate now rejects both `validated` and `production-ready` atoms whose builder still starts with `planned:`.

## Semantic and routing changes

- Added `cave` and `floating` density domains.
- Added bounded cave-network and floating-stack modules, motifs and grammars.
- Added unfamiliar aliases such as 岩窟、溶洞、浮空岩岛、悬空石盘.
- BGE remains a bounded ranker over registered capability cards and cannot author coordinates.
- An unresolved adaptive prompt may route retrieved cave/floating capabilities to existing deterministic generators.
- Added regression coverage so “浮空岩岛 + 深渊” remains a floating parent instead of becoming a rift.
- Added Chinese flood synonyms: 淹水、水淹、半淹.

## Next quality targets

1. Build tapered, coherent floating-island undersides and supported bridge/guardrail atoms.
2. Replace ring-like cave walls with contour-driven eroded shells and local ceilings.
3. Implement true window wall cuts with sill/header geometry.
4. Fragment institutional roof programs into multiple masses and routes.
5. Turn overgrowth into root/vegetation networks with explicit climb and alternate-route ports.
6. Add museum-specific basement fixtures that remain legible under flood state.
