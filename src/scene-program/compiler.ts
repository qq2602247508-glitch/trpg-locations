import type { SeededRandom } from "../core/random";
import { CELL, FLOOR_SLAB_METERS, box, feetToMeters, primitive, tacticalFeature } from "../generators/shared";
import type { GeneratedScene, Room, SemanticGenerationHints } from "../schema";
import type { SceneProgram } from "./schema";

export function semanticHintsFromProgram(program: SceneProgram): SemanticGenerationHints {
  const environment = program.domain === "natural" ? "wilderness" : program.domain === "settlement" ? "urban" : program.domain === "infrastructure" ? "underground" : program.domain === "hybrid" ? "wilderness" : "interior";
  const topology = program.topology === "radial" || program.topology === "network" ? "branching" : program.topology;
  const verticality = program.regions.some((region) => region.elevation === "vertical" || region.elevation === "high") ? "high" : program.regions.some((region) => region.elevation === "raised" || region.elevation === "sunken") ? "medium" : "low";
  const water = program.morphology.includes("channel-cut") || program.landmarks.some((item) => /river|lake|water|河|湖|水/i.test(item)) ? "major" : program.morphology.includes("wetland-pools") ? "minor" : "none";
  const cover = program.coverage.includes("dense") || program.coverage.includes("woodland") || program.coverage.includes("wreck-field") || program.coverage.includes("dragon-bones") ? "dense" : program.coverage.includes("sparse") ? "sparse" : "moderate";
  const theme = program.coverage.includes("ash") || program.coverage.includes("grave-markers") ? "grim" : program.coverage.includes("industrial-equipment") ? "industrial" : program.coverage.includes("woodland") || program.coverage.includes("fungal") ? "wild" : "neutral";
  return {
    environment,
    topology,
    verticality,
    water,
    lighting: program.ruleset === "coc" || theme === "grim" ? "dim" : "bright",
    cover,
    theme,
    anchors: [...new Set([...program.landmarks, ...program.regions.flatMap((region) => region.features)])].slice(0, 8),
    hazards: [...new Set([...program.hazards, ...program.regions.flatMap((region) => region.hazards)])].slice(0, 8),
    tags: [
      `program:scene-v${program.version}`,
      `domain:${program.domain}`,
      `ruleset:${program.ruleset}`,
      `era:${program.era}`,
      `gameplay:${program.gameplay.mode}`,
      ...program.morphology.map((item) => `morphology:${item}`),
      ...program.coverage.map((item) => `coverage:${item}`),
    ],
  };
}

function roomPosition(room: Room): { x: number; z: number; y: number } {
  return { x: room.center.x / CELL, z: room.center.z / CELL, y: room.center.y };
}

/** Realizes cross-domain plan semantics after a domain generator has authored
 * its core topology. This pass may annotate existing topology and place small
 * non-blocking clues, but it must never invent geometry-dependent routes: only
 * the domain generator knows the actual walkable surfaces and openings. */
export function applySceneProgram(scene: GeneratedScene, program: SceneProgram, rng: SeededRandom): void {
  const playableRooms = scene.rooms.filter((room) => room.role !== "circulation");
  const rooms = playableRooms.length > 0 ? playableRooms : scene.rooms;
  const marker = scene.primitives[0];
  if (marker) marker.tags = [...new Set([...(marker.tags ?? []), "scene-program", `program-domain:${program.domain}`, `program-ruleset:${program.ruleset}`, ...program.morphology.map((item) => `program-morphology:${item}`), ...program.coverage.map((item) => `program-coverage:${item}`)])];

  for (const [index, region] of program.regions.entries()) {
    const room = rooms[index % Math.max(1, rooms.length)];
    if (!room) continue;
    const position = roomPosition(room);
    if (region.function === "hazard" || region.hazards.length > 0) {
      scene.tactical.push(tacticalFeature(`program-region-${region.id}-hazard`, "hazard", position.x, position.z, position.y, Math.max(1, Math.ceil(region.scale * 5)), `${region.label}: ${region.hazards.join(", ") || "planned hazard"}.`));
    } else if (region.elevation === "high" || region.elevation === "raised" || region.elevation === "vertical") {
      scene.tactical.push(tacticalFeature(`program-region-${region.id}-highground`, "highGround", position.x, position.z, position.y, Math.max(1, Math.ceil(region.scale * 5)), `${region.label} is a planned elevated region.`));
    } else if (region.function === "landmark" || region.function === "investigation") {
      scene.tactical.push(tacticalFeature(`program-region-${region.id}-landmark`, region.function === "investigation" ? "secret" : "cover", position.x, position.z, position.y, Math.max(1, Math.ceil(region.scale * 4)), `${region.label}: ${region.features.join(", ")}.`));
    }
  }

  if (program.gameplay.mode === "investigation" || program.ruleset === "coc") {
    const evidence = program.gameplay.evidence.length > 0 ? program.gameplay.evidence : ["physical trace", "document trail"];
    for (const [index, label] of evidence.slice(0, Math.min(6, rooms.length || 2)).entries()) {
      const room = rooms[(index * 2 + 1) % Math.max(1, rooms.length)];
      if (!room) continue;
      const position = roomPosition(room);
      const offsetX = rng.float(-Math.min(1.5, room.sizeCells.x * 0.16), Math.min(1.5, room.sizeCells.x * 0.16));
      const offsetZ = rng.float(-Math.min(1.5, room.sizeCells.z * 0.16), Math.min(1.5, room.sizeCells.z * 0.16));
      scene.primitives.push(primitive(`program-evidence-${index}`, "box", room.level, position.x + offsetX, position.y + FLOOR_SLAB_METERS, position.z + offsetZ, 0.32, 0.18, 0.32, "warmLight", ["scene-program", "evidence", `evidence:${label}`]));
      scene.tactical.push(tacticalFeature(`program-evidence-feature-${index}`, "secret", position.x + offsetX, position.z + offsetZ, position.y, 1, `Investigation evidence: ${label}.`));
    }
  }

  if (program.gameplay.mode === "chase" && scene.routes.length > 0) {
    for (const [index, route] of scene.routes.entries()) {
      if (route.kind === "waterflow" || route.kind === "vertical") continue;
      route.purpose = index === 0 ? "escape" : "movement";
      route.traffic = index === 0 ? 1 : 0.72;
    }
  }

  if (program.coverage.includes("evidence") && program.ruleset !== "coc") {
    const room = rooms[0];
    if (room) {
      const position = roomPosition(room);
      scene.primitives.push(box("program-clue-cache", room.level, position.x, position.y + FLOOR_SLAB_METERS, position.z, 1.1, feetToMeters(2), 0.8, "wood", ["scene-program", "evidence", "cover"]));
    }
  }
}
