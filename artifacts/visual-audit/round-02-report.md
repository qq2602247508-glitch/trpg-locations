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
