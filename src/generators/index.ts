import { SeededRandom } from "../core/random";
import { classifyInput, type AdaptiveFeatures, type InputClassification } from "../semantic/classify";
import type { GeneratedScene, GenerationRequest, GeneratorContext, Room, SceneKind } from "../schema";
import { validateScene } from "../validation/scene";
import { generateCave } from "./cave";
import { generateSewer } from "./sewer";
import {
  CELL,
  FLOOR_SLAB_METERS,
  box,
  clamp,
  createRoute,
  feetToMeters,
  primitive,
  stairs,
  tacticalFeature,
  water,
} from "./shared";
import { generateTavern } from "./tavern";
import { generateTower } from "./tower";
import { generateBuilding } from "./building";
import { generateSettlement } from "./settlement";
import { generateWilderness } from "./wilderness";
import { applySceneProgram, planSceneProgramLocally, semanticHintsFromProgram, summarizeSceneProgram, type SceneProgram } from "../scene-program";

export type FixedSceneKind = Exclude<SceneKind, "adaptive">;
export type SceneGenerator = (context: GeneratorContext) => GeneratedScene;

/** Explicit registry: callers can choose a generator without prompt classification. */
export const generatorRegistry: Readonly<Record<FixedSceneKind, SceneGenerator>> = {
  tavern: generateTavern,
  tower: generateTower,
  sewer: generateSewer,
  cave: generateCave,
  building: generateBuilding,
  settlement: generateSettlement,
  wilderness: generateWilderness,
};

export const sceneGenerators = generatorRegistry;

export function getGenerator(kind: FixedSceneKind): SceneGenerator {
  return generatorRegistry[kind];
}

type AdaptiveModifier = "water" | "vertical" | "hazard" | "cover" | "light" | "anchor";

export interface AdaptivePlan {
  primary: FixedSceneKind;
  requestedModifiers: AdaptiveModifier[];
  appliedModifiers: AdaptiveModifier[];
  droppedModifiers: AdaptiveModifier[];
  traits: AdaptiveFeatures;
}

function isSceneKind(value: SceneKind | string): value is SceneKind {
  return value === "adaptive" || value === "tavern" || value === "tower" || value === "sewer" || value === "cave" || value === "building" || value === "settlement" || value === "wilderness";
}

function normalizeRequest(request: GenerationRequest): GenerationRequest {
  const size = request.size === "small" || request.size === "large" ? request.size : "medium";
  const density = Number.isFinite(request.density) ? clamp(request.density, 0, 1) : 0.5;
  return {
    prompt: request.prompt.trim() || "Unspecified tactical location",
    seed: request.seed.trim() || "default-scene-seed",
    size,
    density,
  };
}

function selectAdaptivePrimary(classification: InputClassification, rng: SeededRandom): FixedSceneKind {
  if (classification.kind !== "adaptive") return classification.kind;
  const { traits } = classification;
  // Explicit wilderness keywords (幽暗地域、河谷、裂谷、冰原等) must retain
  // the wilderness grammar. Previously `theme:wild` was checked earlier and
  // collapsed these prompts into the generic chamber cave generator.
  if (classification.categoryScores.wilderness > 0) return "wilderness";
  if (traits.verticality === "high" || traits.topology === "vertical") return "tower";
  if (traits.water === "major" || (traits.environment === "underground" && traits.water !== "none")) return "sewer";
  if (traits.environment === "underground" || traits.topology === "branching" || traits.theme === "wild") return "cave";
  if (traits.environment === "interior" || traits.theme === "cozy" || traits.topology === "open") return "tavern";
  if (traits.environment === "ruin" || traits.environment === "urban") return "building";
  if (traits.environment === "coastal") return "settlement";
  if (traits.environment === "wilderness") return "wilderness";

  return rng.weightedPick(
    ["tavern", "tower", "sewer", "cave", "building", "settlement", "wilderness"] as const,
    [
      traits.lighting === "bright" ? 4 : 2,
      traits.verticality === "medium" ? 3 : 1,
      traits.lighting === "dim" ? 2 : 1,
      traits.environment === "wilderness" ? 3 : 2,
      traits.theme === "mystic" ? 3 : 1,
      traits.theme === "neutral" ? 2 : 1,
      traits.cover === "dense" ? 3 : 1,
    ],
  );
}

function modifierRequests(traits: AdaptiveFeatures): AdaptiveModifier[] {
  const modifiers: AdaptiveModifier[] = [];
  if (traits.water !== "none") modifiers.push("water");
  if (traits.verticality !== "low") modifiers.push("vertical");
  if (traits.hazards.length > 0) modifiers.push("hazard");
  if (traits.cover === "dense") modifiers.push("cover");
  if (traits.lighting !== "bright") modifiers.push("light");
  if (traits.anchors.length > 0) modifiers.push("anchor");
  return modifiers;
}

function compositionBudget(request: GenerationRequest): number {
  const areaBudget = request.size === "small" ? 1 : request.size === "large" ? 3 : 2;
  const densityBudget = request.density < 0.42 ? 1 : request.density < 0.76 ? 2 : 3;
  return Math.min(areaBudget, densityBudget);
}

function firstPlayableRoom(scene: GeneratedScene): Room | undefined {
  return scene.rooms.find((room) => room.role !== "circulation") ?? scene.rooms[0];
}

function cellX(room: Room): number {
  return room.center.x / CELL;
}

function cellZ(room: Room): number {
  return room.center.z / CELL;
}

function applyWaterModifier(scene: GeneratedScene, room: Room, traits: AdaptiveFeatures): boolean {
  const width = Math.max(1.5, Math.min(4.5, room.sizeCells.x * 0.3));
  const length = Math.max(2.5, Math.min(9, room.sizeCells.z * 0.64));
  const x = cellX(room) - room.sizeCells.x * 0.18;
  const z = cellZ(room);
  const y = room.center.y + FLOOR_SLAB_METERS;
  scene.primitives.push(water("adaptive-water-feature", room.level, x, y, z, width, traits.water === "major" ? 0.38 : 0.2, length, ["adaptive", "water-feature"], Math.PI / 2));
  scene.routes.push(createRoute("adaptive-waterflow", "waterflow", [
    { x: x - length / 2, z, y },
    { x: x + length / 2, z, y: y - (traits.water === "major" ? 0.25 : 0.08) },
  ]));
  scene.tactical.push(tacticalFeature("adaptive-water-hazard", "hazard", x, z, room.center.y, Math.ceil(width / 2), traits.water === "major" ? "A deep current turns this space into a hazardous crossing." : "Standing water slows movement and conceals footing."));
  return true;
}

function applyVerticalModifier(scene: GeneratedScene, room: Room): boolean {
  const x = cellX(room) + Math.min(1.8, room.sizeCells.x * 0.18);
  const z = cellZ(room) - Math.min(1.5, room.sizeCells.z * 0.18);
  const baseY = room.center.y + FLOOR_SLAB_METERS;
  const rise = feetToMeters(8);
  scene.primitives.push(
    box("adaptive-observation-platform", room.level, x, baseY + rise, z, Math.max(2.2, room.sizeCells.x * 0.28), FLOOR_SLAB_METERS * 2, Math.max(2.2, room.sizeCells.z * 0.28), "stone", ["adaptive", "platform", "high-ground"]),
    stairs("adaptive-platform-stairs", room.level, (cellX(room) + x) / 2, baseY, (cellZ(room) + z) / 2, 1.4, rise, Math.max(3, room.sizeCells.z * 0.38), "stone", ["adaptive", "platform-access"]),
  );
  scene.routes.push(createRoute("adaptive-platform-route", "vertical", [
    { x: cellX(room), z: cellZ(room), y: baseY },
    { x, z, y: baseY + rise },
  ]));
  scene.tactical.push(tacticalFeature("adaptive-platform-vantage", "highGround", x, z, baseY + rise, 2, "A composited raised platform provides a defensible elevation change."));
  return true;
}

function applyHazardModifier(scene: GeneratedScene, room: Room, traits: AdaptiveFeatures): boolean {
  const label = traits.hazards[0] ?? "unstable ground";
  const x = cellX(room) - Math.min(1.6, room.sizeCells.x * 0.2);
  const z = cellZ(room) + Math.min(1.4, room.sizeCells.z * 0.18);
  scene.primitives.push(box("adaptive-hazard-zone", room.level, x, room.center.y + FLOOR_SLAB_METERS, z, Math.max(2, room.sizeCells.x * 0.26), 0.1, Math.max(2, room.sizeCells.z * 0.25), "hazard", ["adaptive", "hazard", label]));
  scene.tactical.push(tacticalFeature("adaptive-hazard", "hazard", x, z, room.center.y, 2, `Prompt-derived hazard: ${label}.`));
  return true;
}

function applyCoverModifier(scene: GeneratedScene, room: Room): boolean {
  const x = cellX(room) + Math.min(1.4, room.sizeCells.x * 0.2);
  const z = cellZ(room) + Math.min(1.3, room.sizeCells.z * 0.16);
  scene.primitives.push(
    box("adaptive-cover-cluster-a", room.level, x, room.center.y + FLOOR_SLAB_METERS, z, 1.25, 1.2, 1.25, "rock", ["adaptive", "cover"]),
    box("adaptive-cover-cluster-b", room.level, x - 1.35, room.center.y + FLOOR_SLAB_METERS, z + 0.8, 1.05, 0.9, 1.05, "rock", ["adaptive", "cover"]),
  );
  scene.tactical.push(tacticalFeature("adaptive-cover-cluster", "cover", x, z, room.center.y, 2, "Dense movable debris creates a new cover cluster."));
  return true;
}

function applyLightModifier(scene: GeneratedScene, room: Room, traits: AdaptiveFeatures): boolean {
  const x = cellX(room);
  const z = cellZ(room);
  const y = room.center.y + feetToMeters(traits.lighting === "dark" ? 4 : 6);
  scene.primitives.push(primitive("adaptive-light-source", "cone", room.level, x, y, z, 0.65, 1.25, 0.65, "warmLight", ["adaptive", "light", traits.lighting]));
  return true;
}

function applyAnchorModifier(scene: GeneratedScene, room: Room, traits: AdaptiveFeatures): boolean {
  const anchor = traits.anchors[0];
  if (!anchor) return false;
  const x = cellX(room) - Math.min(1, room.sizeCells.x * 0.12);
  const z = cellZ(room) - Math.min(1, room.sizeCells.z * 0.12);
  scene.primitives.push(primitive("adaptive-anchor", anchor === "well" ? "cylinder" : "box", room.level, x, room.center.y + FLOOR_SLAB_METERS, z, CELL * 1.4, anchor === "statue" ? feetToMeters(7) : feetToMeters(3), CELL * 1.4, anchor === "well" ? "stone" : "metal", ["adaptive", "anchor", anchor]));
  scene.tactical.push(tacticalFeature("adaptive-anchor-cover", "cover", x, z, room.center.y, 1, `Prompt-derived landmark: ${anchor}.`));
  return true;
}

function applyModifier(scene: GeneratedScene, modifier: AdaptiveModifier, room: Room, traits: AdaptiveFeatures): boolean {
  switch (modifier) {
    case "water":
      return applyWaterModifier(scene, room, traits);
    case "vertical":
      return applyVerticalModifier(scene, room);
    case "hazard":
      return applyHazardModifier(scene, room, traits);
    case "cover":
      return applyCoverModifier(scene, room);
    case "light":
      return applyLightModifier(scene, room, traits);
    case "anchor":
      return applyAnchorModifier(scene, room, traits);
  }
}

/**
 * Compose a base topology with prompt traits.  A fixed budget makes degradation
 * explicit and deterministic: small or sparse scenes retain the highest-value
 * modifiers instead of stretching every idea into an unreadable map.
 */
export function generateAdaptiveScene(
  context: GeneratorContext,
  suppliedClassification?: InputClassification,
): GeneratedScene {
  const classification = suppliedClassification ?? classifyInput(context.request.prompt);
  const primary = selectAdaptivePrimary(classification, context.rng.fork("primary-selection"));
  const base = generatorRegistry[primary]({
    request: context.request,
    rng: context.rng.fork(`base:${primary}`),
    semanticHints: classification.traits,
  });
  const requestedModifiers = modifierRequests(classification.traits);
  const budget = compositionBudget(context.request);
  const plannedModifiers = requestedModifiers.slice(0, budget);
  const droppedModifiers = requestedModifiers.slice(budget);
  const appliedModifiers: AdaptiveModifier[] = [];
  const room = firstPlayableRoom(base);

  if (room) {
    for (const modifier of plannedModifiers) {
      if (applyModifier(base, modifier, room, classification.traits)) appliedModifiers.push(modifier);
      else droppedModifiers.push(modifier);
    }
  } else {
    droppedModifiers.push(...plannedModifiers);
  }

  base.kind = "adaptive";
  base.title = `Adaptive · ${base.title}`;
  const appliedText = appliedModifiers.length > 0 ? appliedModifiers.join(", ") : "base topology only";
  const droppedText = droppedModifiers.length > 0 ? ` Degraded deterministically by omitting: ${droppedModifiers.join(", ")}.` : "";
  base.description = `${base.description} Adaptive composition uses ${primary} as the structural base with ${appliedText}.${droppedText}`;
  const marker = base.primitives[0];
  if (marker) marker.tags = [...new Set([...(marker.tags ?? []), "adaptive", `adaptive-base:${primary}`, ...classification.traits.tags])];
  return base;
}

/**
 * Public generation entry point.  It always validates/repairs the finished
 * scene, including adaptive compositions, before a renderer receives it.
 */
export function generateScene(request: GenerationRequest, requestedKind: SceneKind = "adaptive", suppliedClassification?: InputClassification, suppliedProgram?: SceneProgram): GeneratedScene {
  const normalized = normalizeRequest(request);
  const kind = isSceneKind(requestedKind) ? requestedKind : "adaptive";
  // Prompt semantics must influence deterministic variation even when the user
  // keeps the same explicit Seed. This preserves replayability while ensuring
  // “洞窟 + 水晶” and “洞窟 + 熔岩” do not collapse to the same layout.
  const promptKey = normalized.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const rootRng = new SeededRandom(`${normalized.seed}|prompt:${promptKey}`);
  const program = suppliedProgram ?? planSceneProgramLocally(normalized.prompt, kind);
  const primary = kind === "adaptive" ? program.primaryKind : kind;
  const semanticHints = suppliedClassification?.traits ?? semanticHintsFromProgram(program);
  const generated = generatorRegistry[primary]({
    request: normalized,
    // Fixed generators retain their established seed stream so adding the
    // semantic compiler does not silently reshuffle already-valid layouts.
    // Adaptive generation intentionally uses a program-owned stream because
    // the compiled primary domain is part of its public result.
    rng: rootRng.fork(kind === "adaptive" ? `program:${primary}` : `fixed:${kind}`),
    semanticHints,
    sceneProgram: program,
  });
  applySceneProgram(generated, program, rootRng.fork("scene-program-realization"));
  if (kind === "adaptive") {
    generated.kind = "adaptive";
    generated.title = `SceneProgram · ${generated.title}`;
    generated.description = `${generated.description} Compiled from ${program.regions.length} semantic regions for ${program.gameplay.mode} play.`;
  }
  const semanticSource = program.source === "ollama" || suppliedClassification?.source === "ollama" ? "ollama" : "local";
  const semanticModel = program.model ?? suppliedClassification?.semanticModel;
  generated.semantic = { source: semanticSource, ...(semanticModel ? { model: semanticModel } : {}) };
  generated.sceneProgram = summarizeSceneProgram(program);

  return validateScene(generated, { repair: true }).scene;
}

export { generateTavern } from "./tavern";
export { generateTower } from "./tower";
export { generateSewer } from "./sewer";
export { generateCave } from "./cave";
