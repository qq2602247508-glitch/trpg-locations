# Regression 12 · Composite Scene Identity and Route Envelope Audit

Date: 2026-08-12

## Goal

This round targeted unfamiliar composite prompts that previously lost their requested identity:

- a flooded opera house;
- an embassy under a dry canyon with a rope bridge and cliff lift;
- an underground ice research facility used as a control scene.

The round also closed a visual P1 discovered during review: the ice facility's escape route crossed a solid side wall.

## Implemented fixes

### Flooded opera house

- Added a dedicated opera BuildingProgram with foyer, auditorium, orchestra pit, stage, backstage, dressing room, prop cellar, balcony and roof escape spaces.
- Added visible seating, music stands, proscenium/stage geometry, backstage scenery, dressing fixtures and prop storage.
- Preserved the title `The Drowned Orpheum` and flooded state.

### Dry-canyon embassy

- Added the diplomatic semantic theme for embassy, consulate, visa archive, suspended office and reception language.
- Classified explicitly dry canyons as `rift` while preserving river/waterfall canyons as `river-valley`.
- Added reception and archive fixtures, suspended office, bridge-under escape platform, structural rods and a supported two-rail cliff lift.
- Connected the escape room to the core building room.

### Building-envelope route repair

- Included `wilderness-escape-route` in parent-route building-envelope rerouting.
- Rebuilt route primitives while preserving `escape-route` and `upstream-escape-route` tags.
- Kept route points inside valid metre-space bounds.
- Selected only complete in-bounds envelope sides instead of clamping an invalid side onto the map edge, which could erase the apron and make stairs cut through walls.
- Added a regression asserting that the ice research escape route remains connected, valid and free of the original wall-crossing warning.

## Chromium evidence

| Scene | Title / archetype | Valid | Primitives | Rooms | Routes | Floors | Draw calls | Triangles | FPS |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Flooded opera | The Drowned Orpheum / museum | yes | 138 | 9 | 8 | 4 | 20 | 2,030 | 120 |
| Canyon embassy | The Split Earth / rift | yes | 8,650 | 15 | 12 | 4 | 103 | 79,810 | 120 |
| Ice research, fixed rerun | Whiteglass Expanse / ice | yes | 339 | 14 | 15 | 4 | 73 | 6,618 | 75 |

The original 21-image matrix recorded zero network failures and zero console errors. The fixed ice rerun showed `校验通过`, diagnostic score 99/100, and no route-through-solid-wall warning. Its isolated SwiftShader Chromium emitted browser-level software-rendering diagnostics, but no application JavaScript exception was observed.

## Visual review

Initial image review found:

- flooded opera transparent view: identity and room hierarchy readable; one detached-looking foreground slab remains P2;
- flooded opera B1: pass;
- canyon embassy low/building-focus: identity readable; subject scale and occlusion remain P2;
- ice overview: route support/readability concerns at P2;
- ice B1: a visible route/side-wall intersection, classified P1.

After the route-envelope fix, the ice overview, B1 and building-focus views were regenerated. Direct pixel review confirmed that the right-side orange route now follows the exterior envelope and no longer enters the solid green side wall. No P0/P1 remains. The building-focus camera is still heavily occluded by the envelope, retained as a P2 framing issue.

Evidence:

- `ice-research-fixed-audit.json`
- `ice-research-overview-fixed.png`
- `ice-research-floor-3-fixed.png`
- `ice-research-building-focus-fixed.png`
- original three-scene matrix: `visual-matrix-audit.json`

## Automated gates

- Targeted generator tests before route repair: 142/142.
- Final full Vitest suite: 291/291.
- Production build: passed.
- `git diff --check`: passed.
- Promptfoo local Ollama semantic regression: 10/10, 7,267 real tokens:
  - prompt: 3,759
  - completion: 3,508
- Promptfoo was recorded as quality evidence only; no token-saving claim was made.

## Four token-efficient tools

- RTK: compressed test, build and Git output.
- `token-ast-grep`: bounded structural location of generator/test structures and route repair work.
- `token-repomix`: final five-file whitelist only, with a 12,000-token hard budget; no whole-repository pack.
- `token-promptfoo`: local Ollama semantic regression; real usage reported without inventing savings.

## Remaining long-term Goal gaps

- Remove the opera foreground detached-slab P2.
- Improve canyon embassy and ice building-focus framing/occlusion.
- Continue broad multi-seed visual auditing for unsupported route endpoints, tactical-grid ownership and focused-building transparency.
- Continue performance and bundle-size work; the production build still reports chunks over 500 kB.

Strict overall completion advances from 81% to approximately 84% for this round. The long-running Goal remains active.
