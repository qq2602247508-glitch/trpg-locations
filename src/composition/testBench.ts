import { SeededRandom } from "../core/random";
import type { GeneratedScene } from "../schema";
import { validateScene } from "../validation/scene";
import { baseScene, box, connectRooms, corridor, createRoom, createRoute, cylinder, feetToMeters, primitive, stairConnection, stairRoute, tacticalFeature, water } from "../generators/shared";
import { capabilityById } from "./catalog";

/** Browser-visible isolated fixtures for high-value atom geometry and ports. */
export function generateAtomTestScene(atomId: string, seed = "atom-audit"): GeneratedScene {
  const rng = new SeededRandom(`${seed}|${atomId}`); const card = capabilityById(atomId);
  const scene = baseScene("wilderness", `Atom Audit · ${card?.label ?? atomId}`, `Isolated spatial-atom fixture for ${atomId}. Orange surfaces are traversal/support evidence; dark volumes are blockers.`, seed, { x: 28, z: 24 }, 1, [40]);
  scene.archetype = `atom:${atomId}`;
  if (atomId === "water.waterfall") {
    scene.primitives.push(box("atom-upper-bank", 0, 8, 0, 8, 12, feetToMeters(10), 12, "rock", ["floor", "terrain", "support-surface", "upper-bank"]), box("atom-far-bridge-bank", 0, 22, 0, 6, 10, feetToMeters(10), 7, "rock", ["floor", "terrain", "support-surface", "upper-bank"]), box("atom-lower-bank", 0, 21, 0, 17, 10, 0.35, 11, "rock", ["floor", "terrain", "support-surface", "lower-bank"]), water("atom-upper-water", 0, 12, feetToMeters(10), 10, 5, 0.24, 7, ["waterfall", "upper-water"]), box("atom-waterfall-face", 0, 15.5, 0, 12, 0.35, feetToMeters(10), 5, "water", ["waterfall", "vertical-water", "hazard"]), water("atom-deep-pool", 0, 19, -0.15, 14, 8, 0.55, 8, ["waterfall", "deep-pool", "hazard"]));
    scene.primitives.push(corridor("atom-waterfall-bridge", 0, 13, 6, 18, 6, feetToMeters(10.2), 1.5, "wood", ["bridge", "supported", "port:bank-a", "port:bank-b"]));
    scene.rooms.push(createRoom("atom-upper", "Upper water source", "natural", 0, 8, 8, 12, 12, feetToMeters(10)), createRoom("atom-basin", "Waterfall basin", "combat", 0, 20, 15, 10, 10)); connectRooms(scene.rooms, "atom-upper", "atom-basin");
    scene.routes.push(createRoute("atom-waterfall-crossing", "primary", [{ x: 4, z: 6, y: feetToMeters(10) }, { x: 13, z: 6, y: feetToMeters(10.2) }, { x: 18, z: 6, y: feetToMeters(10.2) }, { x: 25, z: 6, y: feetToMeters(10) }]), createRoute("atom-waterflow", "waterflow", [{ x: 9, z: 10, y: feetToMeters(10) }, { x: 15.5, z: 12, y: feetToMeters(10) }, { x: 19, z: 14, y: 0 }]));
    scene.tactical.push(tacticalFeature("atom-waterfall-hazard", "hazard", 16, 12, feetToMeters(5), 2, "Ten-foot vertical water drop with an upper source and lower basin."));
  } else if (atomId === "route.vertical" || atomId === "structure.spiral-stair") {
    scene.primitives.push(box("atom-lower-floor", 0, 8, 0, 12, 12, 0.35, 18, "stone", ["floor", "support-surface", "grid-surface"]), box("atom-upper-floor", 0, 21, feetToMeters(15), 12, 10, 0.35, 18, "stone", ["floor", "support-surface", "grid-surface", "upper-floor"]));
    const stair = stairConnection("atom-stair", 0, { xCells: 12, zCells: 12, yMeters: 0.35 }, { xCells: 17, zCells: 12, yMeters: feetToMeters(15) + 0.35 }, 1.6, "wood", ["vertical-route", "vertical-opening", "port:bottom", "port:top", "supported"]); scene.primitives.push(stair.primitive); scene.routes.push(stairRoute("atom-stair-route", stair));
    scene.rooms.push(createRoom("atom-lower", "Lower landing", "circulation", 0, 8, 12, 12, 18), createRoom("atom-upper", "Upper landing", "combat", 0, 21, 12, 10, 18, feetToMeters(15))); connectRooms(scene.rooms, "atom-lower", "atom-upper");
    scene.tactical.push(tacticalFeature("atom-stair-high", "highGround", 21, 12, feetToMeters(15), 2, "The upper landing is physically connected to the lower support surface."));
  } else if (atomId === "ecology.ancient-tree") {
    scene.primitives.push(box("atom-forest-ground", 0, 14, 0, 12, 26, 0.35, 22, "moss", ["floor", "terrain", "support-surface"]));
    const x = 14; const z = 12; const platformY = feetToMeters(18); scene.primitives.push(cylinder("atom-giant-tree", 0, x, 0.35, z, 2.8, feetToMeters(48), "wood", ["giant-tree", "support", "sight-blocker"]), primitive("atom-tree-canopy", "sphere", 0, x, feetToMeters(38), z, feetToMeters(30), feetToMeters(18), feetToMeters(30), "moss", ["canopy"]), cylinder("atom-canopy-platform", 0, x, platformY, z, 3.8, feetToMeters(1), "wood", ["floor", "canopy-platform", "high-ground", "support-surface"]));
    const stair = stairConnection("atom-tree-ascent", 0, { xCells: 9, zCells: 15, yMeters: 0.35 }, { xCells: 12.5, zCells: 13, yMeters: platformY + 0.35 }, 1.2, "wood", ["vertical-route", "vertical-opening", "supported", "port:ground", "port:platform"]); scene.primitives.push(stair.primitive); scene.routes.push(stairRoute("atom-tree-route", stair));
    scene.rooms.push(createRoom("atom-root-zone", "Root support zone", "natural", 0, x, z, 10, 10), createRoom("atom-canopy-zone", "Canopy combat platform", "combat", 0, x, z, 7, 7, platformY)); connectRooms(scene.rooms, "atom-root-zone", "atom-canopy-zone"); scene.tactical.push(tacticalFeature("atom-tree-highground", "highGround", x, z, platformY, 3, "Reachable canopy platform supported by a giant trunk."));
  } else {
    scene.primitives.push(box("atom-left-support", 0, 6, 0, 12, 10, feetToMeters(5), 20, "rock", ["floor", "terrain", "support-surface", "port:a"]), box("atom-right-support", 0, 22, 0, 12, 10, feetToMeters(8), 20, "rock", ["floor", "terrain", "support-surface", "port:b"]), corridor("atom-compatible-bridge", 0, 10.5, 12, 17.5, 12, feetToMeters(8.2), 2, "wood", ["bridge", "supported", "port:a", "port:b", "standable"]));
    for (let index = 0; index < 5; index += 1) scene.primitives.push(primitive(`atom-blocker-${index}`, "sphere", 0, rng.float(3, 25), feetToMeters(5), rng.float(3, 21), feetToMeters(2.5), feetToMeters(3), feetToMeters(2.5), "darkStone", ["blocked-volume", "cover"]));
    scene.rooms.push(createRoom("atom-left", "Input support", "natural", 0, 6, 12, 10, 20, feetToMeters(5)), createRoom("atom-right", "Output support", "combat", 0, 22, 12, 10, 20, feetToMeters(8))); connectRooms(scene.rooms, "atom-left", "atom-right"); scene.routes.push(createRoute("atom-primary", "primary", [{ x: 2, z: 12, y: feetToMeters(5) }, { x: 14, z: 12, y: feetToMeters(8.2) }, { x: 26, z: 12, y: feetToMeters(8) }])); scene.tactical.push(tacticalFeature("atom-bridge-choke", "chokepoint", 14, 12, feetToMeters(8.2), 2, "The atom fixture connects two explicit support ports."));
  }
  scene.tactical.push(tacticalFeature("atom-entry", "entrance", 2, 12, 0, 1, "Atom audit entry."));
  const validated = validateScene(scene, { repair: true }).scene; validated.diagnostics.metrics.atomFixture = 1; return validated;
}
