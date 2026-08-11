# Large perfect version backlog

This is a user-visible acceptance backlog, not a list of optional polish tasks.
Items remain open until the browser result and screenshots demonstrate the fix.

## Visual and spatial regressions recorded on 2026-08-11

- Some generated scenes have no usable 5-foot grid. Every standable surface,
  including terraces, stairs, roofs, platforms and interiors, must receive a
  readable surface-following grid without covering voids.
- Architectural transparency currently has cases where enabling it produces no
  useful difference. The mode must reveal rooms and circulation while retaining
  enough rear shell and floor context to read the building.
- Floating ladders and stairs remain in settlement/terrain compositions. Every
  vertical connector must have supported start and end landings, correct height,
  collision clearance and a valid destination.
- Tree canopies can detach from trunks. Vegetation assemblies need parent/anchor
  validation, terrain contact and a maximum allowed trunk-to-canopy gap.
- Some stairs intersect walls, floors or terrain. Connector geometry must be
  checked against the composed scene after terrain and building placement, not
  only inside the source generator.
- Hybrid prompts still fall back to a parent template and lose a requested
  domain. For example, `森林 村庄` must preserve a real forest structure around
  the settlement rather than becoming an ordinary village with sparse props.
- Very short prompts must remain valid inputs. A concise phrase such as `森林村庄`
  or `洪水歌剧院` must be decomposed into meaningful terrain, structure,
  state and gameplay atoms instead of taking a generic fallback route.

## Building focus and interior entry

The settlement building selector currently does not create a meaningful change
when `enter building` is used. The large quality phase must provide two explicit
and testable modes:

1. Embedded detail: a settlement building already contains a bounded tactical
   interior and zooming/focusing it exposes rooms, floors and connections.
2. Instanced detail: selecting a placeholder opens a separately generated,
   high-detail building scene while preserving a return path and settlement
   context.

The UI must state which mode each building uses. Entering a building must change
camera, visibility, current grid scope, floor controls and tactical markers; it
must not merely select the same exterior object.

## Forced local semantic planning

Add an explicit control such as `强制本地模型规划` next to the normal local-first
generation path.

- Normal mode remains deterministic local-first and model-optional.
- Forced mode must call the configured local Ollama planner and clearly report
  success, timeout, schema rejection or fallback.
- A schema-invalid model response must never go directly to geometry.
- The UI must expose whether the final SceneProgram came from local rules or
  Ollama; it must not silently pretend the model was used.
- Promptfoo regression cases must compare local-only and forced-model planning on
  unknown hybrid prompts before this mode is accepted.

## Mandatory visual acceptance

For each repaired issue, capture the same prompt and seed before/after, a second
seed, and a short unfamiliar prompt. Include overview, low-angle support view,
grid close-up and building interior/focus view where relevant. Reject the result
for any floating connector, unsupported vegetation assembly, missing requested
domain, no-op entry control, missing standable-surface grid or silent model
fallback.
