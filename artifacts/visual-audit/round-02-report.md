# Visual audit · 2026-08-08

## Baseline failures

The previous three screenshots (industrial ruin, manor, wizard tower) showed a
semantic title change without a room-to-geometry contract. Buildings collapsed
to a shell, floors were copied, and tower stairs were not spiral.

## Round 01/02 observations

- `round-01/manor-overview.png`: the new room graph produces separate north,
  west, east and rear wings around an open courtyard. Walls and room floors are
  visible in ghost mode. Remaining issue: default cut view still shows stacked
  upper slabs together; a floor-specific inspection is needed for combat use.
- `round-02-wizard-tower-1f.png`: a real radial flight of 18 individual steps
  is visible around the stair void. The prompt now produces exactly three floors
  when it says 三层, with Alchemy laboratory, Restricted library, Spell
  observatory and Roof duel platform rooms in the program. The overview remains
  visually dense when all floors are shown.
- `round-02-fortress.png`: gate kill zone, two corner tower rooms, courtyard,
  keep, wall walk and armory are separate spatial regions rather than one
  rectangle. The elevated wall walk still needs a stronger low-angle visual
  pass.
- `round-02-hospital.png`: public front, west/east clinical wings, enclosed
  courtyard, service core, upper ward and roof route are visible. Hospital beds
  and morgue/autopsy geometry were added after this capture and require the next
  screenshot.

All code checks pass after these changes. This report is not a completion claim;
the next gate is multi-view visual regression plus stranger prompts and density
comparison.

## Round 04–06 observations

- `round-04-dungeon/1f.png`, `2f.png`, and `3f.png` show visibly different
  envelopes: a broad entry network, a tighter middle hazard graph, and a
  separated deep objective arrangement. The floor selector now retains the
  5-foot grid on each selected floor.
- `round-05-asylum/small-overview.png` and `large-overview.png` confirm that
  the same unfamiliar hospital composition changes footprint, room dimensions,
  and fixture count between size bands. The earlier single-floor captures were
  intentionally rejected as an invalid comparison because 3F remained selected
  from the dungeon audit.
- `round-06-fixed-buildings/police.png` visibly separates public arrival,
  interview/records, evidence/detention, courtyard and rear secure circulation.
- `round-06-fixed-buildings/temple.png` visibly separates the nave, sanctuary,
  west/east prayer chambers, vestry, crypt descent and bell route. This is a
  distinct cruciform composition, not the manor or dungeon shell.

The remaining visual debt is explicit: some overview views still read better in
floor-specific mode than in the all-floor cut, and the fortress wall walk and
some institution-specific fixtures need a low-angle/close tactical pass.
