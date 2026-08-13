# Regression 19 · composed traversal contracts

Date: 2026-08-13

## Scope

This regression establishes an explicit post-composition contract for authored
bridges, elevated platforms, stairs and ladders. It does not infer structural
obligations from broad legacy tags such as `bridge`, `platform`, `standable` or
`supported`, because those tags are also used by natural terrain, boardwalks and
older composition interfaces.

The new opt-in contracts are:

- `support-validation-required`: validate bridge endpoints or elevated-platform
  support continuity after composition.
- `route-destination-required`: validate that a stair or ladder with valid
  landings also participates in a nearby route spanning its vertical range.

The ice-crevasse bridges, observation platform and observation roof ladder now
publish these contracts.

## Implementation

- Added rotation-aware horizontal bridge endpoint calculation.
- Added tag-driven artificial bridge and elevated-platform classification.
- Added structural-support recognition for columns, bridge anchors, buttresses,
  tree trunks/supports, suspension rods and explicit support primitives.
- Bridge validation requires both endpoints to reach a walkable landing or
  structural anchor; route geometry remains evidence of traversal purpose but
  cannot hide a missing structural endpoint.
- Elevated-platform validation requires support continuity; tree platforms may
  use one trunk, while ordinary artificial decks require at least two supports.
- Explicit route-destination connectors require a nearby route that intersects
  the connector footprint and spans its vertical range.
- Natural, magical, floating and ordinary terrain structures retain their
  explicit exemptions.

## Regression tests

`tests/validation.geometry.test.ts` now proves:

- one-ended artificial bridges fail;
- bridges with two structural anchors pass;
- explicitly elevated unsupported platforms fail;
- explicit route-destination stairs fail without route evidence and pass after
  a vertical route is added;
- natural bridges and ordinary terrain platforms are not misclassified.

## Automated verification

- Full Vitest suite: **307/307 passed**.
- Production TypeScript/Vite build: **passed**.
- `git diff --check`: **passed**.
- Existing production chunk-size warnings remain; no new build error was added.

## Token-efficient tools

- RTK: full tests, production build, Git status/diff and noisy output.
- `token-ast-grep`: bounded structural lookup of validator functions.
- `token-repomix`: strict four-file whitelist, **7,109 tokens**, below the
  12,000-token limit. Earlier over-budget packs were discarded and not used.
- `token-promptfoo`: local Ollama semantic regression, **10/10**, **7,258 real
  tokens**:
  - prompt: 3,759;
  - completion: 3,499.
- Promptfoo was treated as quality evidence only; no token-saving claim was
  recorded.

## Browser evidence

Four deterministic large scenes were opened in a real headless Chromium browser
at 1720 × 1080. Each has overview and low-angle screenshots.

Final audit timestamp: **2026-08-13 11:38 Asia/Shanghai**.

| Scene | Validation | Traversal evidence | Browser health |
|---|---|---|---|
| Ice research | valid, no warnings | 2 bridges, 14 platform-tagged structures, 8 connectors; four explicit contract primitives | 0 network / console errors |
| Canyon embassy | valid, no warnings | canyon crossings, hanging/elevated structures and 10 connectors | 0 network / console errors |
| Forest village | valid, one semantic warning | dense forest village, canopy levels, 1 bridge and 42 connectors | 0 network / console errors |
| Abandoned mine | valid, one semantic warning | stair, upper/lower platforms and layered workings | 0 network / console errors |

Saved evidence:

- `browser-audit.json`
- `ice-overview.png`, `ice-low.png`
- `canyon-overview.png`, `canyon-low.png`
- `forest-overview.png`, `forest-low.png`
- `mine-overview.png`, `mine-low.png`

## Visual self-review

- Ice: crevasses, supported crossings, tactical grid routes, research structure
  and elevated observation silhouette are readable.
- Canyon: vertical relief, bridge crossings and valley-floor routes are clearly
  separated.
- Forest: settlement and canopy layering are coherent, but dense vegetation
  reduces distant platform legibility.
- Mine: stair and landing relationship is readable, but the scene remains
  visually sparse.

No P0/P1 regression was found. Two pre-existing/content-completeness P2 gaps
remain visible:

- forest reports `Semantic geometry missing: 根桥`;
- mine reports `Semantic geometry missing: 旧矿井口与矿车轨道`.

These gaps are recorded for a later semantic-realization regression and are not
claimed as fixed here.

## Completion assessment

The long-running project advances from approximately **90% to 91%** because a
tested, post-composition traversal-contract mechanism now exists and is used by
real production generators. The overall Goal remains active: the remaining
semantic-realization warnings, broader generator adoption, visual density and
the rest of the hard completion checklist still require additional rounds.
