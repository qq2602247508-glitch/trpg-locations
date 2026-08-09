# Round 52 visual audit — reusable interior fixture atoms

Date: 2026-08-09

## Scope

Round 52 addresses the empty-room failure exposed by the forest-cabin composite. It adds reusable, function-specific low-poly fixture groups to full-interior building modules while preserving tactical circulation.

## Prompt and fixed regression input

Prompt: `起伏阔叶森林中的猎人木屋，有门廊、柴棚、浅溪木桥、陷阱线、地下储藏室和树冠观察台`

Seed: `round51-forest-cabin`

Density: 68%

## Iteration results

### Basement

- Baseline `round-51/forest-cabin-b1.jpg`: reachable B1, but only one generic storage block.
- Failed first iteration `round-52/forest-cabin-b1-fixtures.jpg`: room was occupied, but racks were unreadable solid boxes.
- Final `round-52/forest-cabin-b1-fixtures-final.jpg`: two racks are built from uprights and three shelves; three crate masses and one barrel form searchable cover lanes without blocking the cellar stair.

Result: pass for topology and recognizable storage function. The props remain deliberately low-poly.

### Ground floor

- Baseline `round-51/forest-cabin-interior.jpg`: real walls, door and stair, but no readable domestic program.
- First iteration `round-52/forest-cabin-1f-fixtures.jpg`: hearth was visible, but the table overlapped the stair core.
- Low-angle failure evidence `round-52/forest-cabin-1f-fixtures-low.jpg`: the stair still dominated the room.
- Final `round-52/forest-cabin-1f-fixtures-final.jpg`: table and benches moved into a separate living zone; hearth/chimney and stair form separate visual and tactical groups.

Result: pass for the living zone. The rear work/service room remains visually sparse.

## Added fixture atoms

- Split-level cellar racks: uprights plus shelf boards.
- Crate cluster and barrel cover group.
- Domestic hearth and chimney.
- Table, legs and paired benches.
- Workbench and tool rack.
- Upper-level bunk.

The fixture tags are function-specific and participate in cover semantics. Duplicate semantic tags are removed at authoring time so validation does not need to repair generated scenes.

## Automated validation

- `npm run check`: 199/199 passed after one failed full-suite iteration exposed duplicate `underground` tags.
- `npm run build`: passed.
- `git diff --check`: passed.

## Remaining limitations

- The service room needs tools, hanging storage and investigation objects positioned for its own camera/readability.
- Fixture placement is currently archetype-driven; room-bound obstacle clearance should become a reusable placement solver.
- Clinic, shrine, warehouse and tower basements reuse the storage skeleton but need their own payload families.

