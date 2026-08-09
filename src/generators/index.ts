import { SeededRandom } from "../core/random";
import { auditSemanticCoverage, compileSceneComposition, summarizeComposition, type SceneCompositionProgram } from "../composition";
import { classifyInput, type AdaptiveFeatures, type InputClassification } from "../semantic/classify";
import type { GeneratedScene, GenerationRequest, GeneratorContext, Room, SceneKind } from "../schema";
import { validateScene } from "../validation/scene";
import { generateCave } from "./cave";
import { generateDungeon } from "./dungeon";
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
import { generateSiteSettlement } from "./siteSettlement";
import { generateWilderness } from "./wilderness";
import { shouldComposeWildernessFacility } from "../semantic/siteIntent";
import { applySceneProgram, planSceneProgramLocally, semanticHintsFromProgram, summarizeSceneProgram, type SceneProgram } from "../scene-program";

export type FixedSceneKind = Exclude<SceneKind, "adaptive">;
export type SceneGenerator = (context: GeneratorContext) => GeneratedScene;

/** Explicit registry: callers can choose a generator without prompt classification. */
export const generatorRegistry: Readonly<Record<FixedSceneKind, SceneGenerator>> = {
  tavern: generateTavern,
  tower: generateTower,
  sewer: generateSewer,
  cave: generateCave,
  dungeon: generateDungeon,
  building: generateBuilding,
  settlement: generateSiteSettlement,
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
  return value === "adaptive" || value === "tavern" || value === "tower" || value === "sewer" || value === "cave" || value === "dungeon" || value === "building" || value === "settlement" || value === "wilderness";
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
export function generateScene(request: GenerationRequest, requestedKind: SceneKind = "adaptive", suppliedClassification?: InputClassification, suppliedProgram?: SceneProgram, suppliedComposition?: SceneCompositionProgram): GeneratedScene {
  const normalized = normalizeRequest(request);
  const kind = isSceneKind(requestedKind) ? requestedKind : "adaptive";
  // Prompt semantics must influence deterministic variation even when the user
  // keeps the same explicit Seed. This preserves replayability while ensuring
  // “洞窟 + 水晶” and “洞窟 + 熔岩” do not collapse to the same layout.
  const promptKey = normalized.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const rootRng = new SeededRandom(`${normalized.seed}|prompt:${promptKey}`);
  const composition = suppliedComposition ?? compileSceneComposition(normalized);
  let program = suppliedProgram ?? planSceneProgramLocally(normalized.prompt, kind);
  let primary = kind === "adaptive" ? program.primaryKind : kind;
  const programText = normalized.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const explicitBuildingNouns = ["精神病院", "医院", "警察局", "警局", "博物馆", "酒店", "旅店", "教堂", "神殿", "庄园", "宅邸", "堡垒", "要塞", "发电站", "修道院", "学院", "火车站", "hospital", "sanatorium", "police station", "museum", "hotel", "church", "temple", "manor", "fortress", "power station", "monastery", "academy", "railway station"];
  const hasExplicitBuilding = explicitBuildingNouns.some((term) => programText.includes(term));
  const strongSettlementNouns = ["城镇", "村镇", "村庄", "村落", "渔猎村", "市场村", "聚居地", "街区", "港区", "港口区", "港镇", "营地", "采矿营地", "矿业营地", "贵族区", "贫民区", "商业区", "住宅区", "殖民地区", "深水城", "水城", "运河城", "塔楼城市", "巨塔城市", "城市分布在", "聚落", "小镇", "town", "village", "market village", "district", "harbor", "port town", "camp", "mining camp", "water city", "canal city", "tower city", "megastructure city", "settlement"];
  const hasStrongSettlement = strongSettlementNouns.some((term) => programText.includes(term));
  // A named village/town/city remains the parent even when one child happens
  // to be a cabin, observatory, shrine, or field station. Composite wilderness
  // ownership applies only when the prompt describes a lone embedded facility.
  const wildernessBuildingOwnsSite = !hasStrongSettlement && shouldComposeWildernessFacility(programText);
  const industrialDistrictOwnsSite = programText.includes("工业区") && !["废弃工业区", "工业遗址", "industrial ruin"].some((term) => programText.includes(term));
  const ownsSite = !wildernessBuildingOwnsSite && (hasStrongSettlement || industrialDistrictOwnsSite || (!hasExplicitBuilding && ["城市", "city"].some((term) => programText.includes(term))));
  // Parent-site ownership is a hard schema constraint, not a model opinion.
  // A semantic provider may notice "crypt" or "chapel" inside a monastery
  // settlement, but those are child programs and cannot replace the site.
  if (kind === "adaptive" && ownsSite && program.domain !== "settlement") {
    program = planSceneProgramLocally(normalized.prompt, kind);
    primary = "settlement";
  }
  if (kind === "adaptive" && wildernessBuildingOwnsSite && primary !== "dungeon" && primary !== "settlement") {
    // Parent terrain ownership is a schema invariant. An optional semantic
    // model may call a seismic or ecological station an institution, but it
    // cannot discard the plateau, bog, forest, glacier or volcanic parent.
    program = planSceneProgramLocally(normalized.prompt, kind);
    primary = "wilderness";
  }
  if (kind === "adaptive" && primary !== "dungeon" && primary !== "settlement" && !ownsSite && hasExplicitBuilding) primary = "building";
  // Multi-storey hospitality prompts need the same auditable room graph as
  // institutions: cellar, attic, service stair and roof pursuit cannot be
  // represented by the compact encounter-only tavern grammar.
  if (kind === "adaptive" && primary === "tavern" && ["三层", "three-storey", "three story", "酒窖", "cellar", "屋顶", "roof"].some((term) => programText.includes(term))) primary = "building";
  // When local wording is unresolved, bounded capability retrieval may still
  // identify a real cave graph or floating-island stack. It selects an
  // existing deterministic generator; it never authors coordinates.
  if (kind === "adaptive" && program.morphology.includes("plain")) {
    if (composition.primaryDomain === "cave") primary = "cave";
    if (composition.primaryDomain === "floating") primary = "wilderness";
  }
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
    compositionProgram: composition,
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

  const validated = validateScene(generated, { repair: true }).scene;
  const semanticCoverage = auditSemanticCoverage(validated, composition);
  validated.compositionProgram = summarizeComposition(composition, semanticCoverage);
  const geometryIntegrity = validated.diagnostics.valid ? 100 : Math.max(0, 100 - validated.diagnostics.warnings.length * 12);
  const spatialCoherence = validated.diagnostics.valid ? 100 : Math.max(20, 90 - validated.diagnostics.warnings.length * 15);
  const tacticalQuality = Math.min(100, 38 + validated.routes.length * 7 + validated.tactical.length * 5);
  const visualIdentity = semanticCoverage.score;
  const variationQuality = Math.round(Math.min(100, 45 + composition.density.structuralComplexity * 35 + composition.density.routeComplexity * 20));
  const performanceQuality = validated.primitives.length < 4500 ? 100 : validated.primitives.length < 7500 ? 85 : 65;
  Object.assign(validated.diagnostics.metrics, { geometryIntegrity, semanticCoverage: semanticCoverage.score, spatialCoherence, tacticalQuality, visualIdentity, variationQuality, performanceQuality });
  const compositeScore = Math.round(geometryIntegrity * 0.22 + semanticCoverage.score * 0.22 + spatialCoherence * 0.18 + tacticalQuality * 0.12 + visualIdentity * 0.1 + variationQuality * 0.08 + performanceQuality * 0.08);
  validated.diagnostics.score = Math.min(validated.diagnostics.score, compositeScore);
  if (semanticCoverage.missing.length > 0) {
    validated.diagnostics.warnings.push(`Semantic geometry missing: ${semanticCoverage.missing.join(", ")}.`);
    validated.diagnostics.score = Math.min(validated.diagnostics.score, 55 + Math.round(semanticCoverage.score * 0.45));
  }
  const compositionOwnsGeneratedDomain = ({ forest: "forest", river: "river-valley", volcanic: "volcanic", crater: "impact-crater", rift: "rift", floating: "floating-islands", cave: "cave" } as Record<string, string | undefined>)[composition.primaryDomain] === validated.archetype;
  if (compositionOwnsGeneratedDomain && semanticCoverage.coveredCritical < semanticCoverage.totalCritical) validated.diagnostics.valid = false;
  return validated;
}

export { generateTavern } from "./tavern";
export { generateTower } from "./tower";
export { generateSewer } from "./sewer";
export { generateCave } from "./cave";
export { generateDungeon } from "./dungeon";
