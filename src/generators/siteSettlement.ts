import type { GeneratedScene, GeneratorContext } from "../schema";
import { planSettlementSite, summarizeSiteProgram, type RoadProgram } from "../site-program";
import { instantiateBuildingModule } from "./buildingModule";
import { classifySettlementArchetype } from "./settlement";
import { FLOOR_SLAB_METERS, baseScene, box, connectRooms, corridor, createRoom, createRoute, cylinder, feetToMeters, primitive, stairConnection, stairs, tacticalFeature, water } from "./shared";

function roadPieces(road: RoadProgram, elevationAt: (x: number, z: number) => number = () => 0) {
  return road.points.slice(1).map((point, index) => {
    const previous = road.points[index];
    if (!previous) throw new Error(`Road ${road.id} has no start point`);
    return corridor(`site-${road.id}-${index + 1}`, 0, previous.x, previous.z, point.x, point.z, elevationAt((previous.x + point.x) / 2, (previous.z + point.z) / 2) + FLOOR_SLAB_METERS + 0.02, road.widthCells, road.hierarchy === "trail" ? "earth" : road.hierarchy === "quay" ? "stone" : "stone", ["road", `road:${road.hierarchy}`, `purpose:${road.purpose}`, "site-program", "standable"]);
  });
}

function addRoadJunctions(scene: GeneratedScene, program: ReturnType<typeof planSettlementSite>, elevationAt: (x: number, z: number) => number): void {
  for (const node of program.roadNodes.filter((candidate) => candidate.kind === "junction")) {
    const connected = node.roadIds.map((id) => program.roads.find((road) => road.id === id)).filter((road): road is RoadProgram => Boolean(road));
    const radius = Math.max(1.4, ...connected.map((road) => road.widthCells * 0.58));
    scene.primitives.push(cylinder(`site-${node.id}-junction`, 0, node.point.x, elevationAt(node.point.x, node.point.z) + FLOOR_SLAB_METERS + 0.025, node.point.z, radius * 2, 0.08, "stone", ["road", "road-junction", "standable", "site-program"]));
  }
}

function addBlockAndParcelSurfaces(scene: GeneratedScene, program: ReturnType<typeof planSettlementSite>, elevationAt: (x: number, z: number) => number): void {
  for (const block of program.blocks) {
    const y = elevationAt(block.center.x, block.center.z);
    scene.primitives.push(box(`site-${block.id}-surface`, 0, block.center.x, y + 0.035, block.center.z, Math.max(1, block.size.x - 0.24), 0.05, Math.max(1, block.size.z - 0.24), program.siteType === "village" || program.siteType === "mining-settlement" ? "earth" : "darkStone", ["block-surface", `district:${block.districtId}`, "site-program"]));
  }
  for (const parcel of program.parcels) {
    const y = elevationAt(parcel.center.x, parcel.center.z);
    scene.primitives.push(box(`site-${parcel.id}-yard`, 0, parcel.center.x, y + 0.07, parcel.center.z, parcel.size.x, 0.06, parcel.size.z, program.siteType === "village" || program.siteType === "mining-settlement" ? "earth" : "stone", ["parcel-yard", `parcel:${parcel.id}`, `block:${parcel.blockId}`, "site-program"] , parcel.rotationY));
  }
}

function addOpenSpaces(scene: GeneratedScene, program: ReturnType<typeof planSettlementSite>, elevationAt: (x: number, z: number) => number = () => 0): void {
  for (const space of program.openSpaces) {
    const spaceY = elevationAt(space.center.x, space.center.z);
    scene.primitives.push(box(`site-open-${space.id}`, 0, space.center.x, spaceY + FLOOR_SLAB_METERS + 0.03, space.center.z, space.size.x, FLOOR_SLAB_METERS, space.size.z, space.kind === "orchard" ? "moss" : space.kind === "farm" ? "earth" : "stone", ["floor", "open-space", `open-space:${space.kind}`, "site-program"]));
    if (space.kind === "farm") {
      for (let row = 0; row < 5; row += 1) scene.primitives.push(corridor(`farm-row-${row}`, 0, space.center.x - space.size.x * 0.42, space.center.z - space.size.z * 0.35 + row * space.size.z * 0.18, space.center.x + space.size.x * 0.42, space.center.z - space.size.z * 0.35 + row * space.size.z * 0.18, FLOOR_SLAB_METERS + 0.05, 0.5, "moss", ["farm-row", "agricultural"]));
    }
    if (space.kind === "orchard") {
      for (let index = 0; index < 9; index += 1) scene.primitives.push(cylinder(`orchard-tree-${index}`, 0, space.center.x - space.size.x * 0.32 + (index % 3) * space.size.x * 0.32, FLOOR_SLAB_METERS, space.center.z - space.size.z * 0.3 + Math.floor(index / 3) * space.size.z * 0.3, 0.6, feetToMeters(9 + index % 3), "wood", ["orchard", "cover", "blocks-sight"]));
    }
  }
}

function addFloatingIslandTerrain(scene: GeneratedScene, width: number, depth: number): (x: number, z: number) => number {
  const band = width / 3;
  const levels = [0, feetToMeters(10), feetToMeters(20)];
  for (let index = 0; index < 3; index += 1) {
    const x = band * (index + 0.5);
    const y = levels[index] ?? 0;
    const platformWidth = band - 2.4;
    scene.primitives.push(
      box(`floating-island-${index + 1}-top`, 0, x, y, depth / 2, platformWidth, FLOOR_SLAB_METERS, depth, "darkStone", ["floor", "terrain", "floating-island", "basalt", "standable", "site-program"]),
      box(`floating-island-${index + 1}-lobe`, 0, x + (index === 1 ? 1.4 : -1.1), y, depth * (index === 2 ? 0.68 : 0.34), platformWidth * 0.78, FLOOR_SLAB_METERS, depth * 0.24, "darkStone", ["floor", "terrain", "floating-island", "basalt", "standable", "site-program"]),
      primitive(`floating-island-${index + 1}-underside`, "cone", 0, x, y - feetToMeters(18), depth / 2, platformWidth * 0.84 * 1.524, feetToMeters(18), depth * 0.58 * 1.524, "rock", ["terrain", "floating-island", "basalt", "vertical-landmark", "site-program"]),
    );
  }
  const boundaryOne = band; const boundaryTwo = band * 2;
  scene.primitives.push(
    corridor("floating-suspension-bridge-1", 0, boundaryOne - 3.4, depth * 0.48, boundaryOne + 3.4, depth * 0.48, feetToMeters(10) + FLOOR_SLAB_METERS, 1.8, "wood", ["bridge", "suspension-bridge", "standable", "vertical-opening", "site-program"]),
    corridor("floating-suspension-bridge-2", 0, boundaryTwo - 3.4, depth * 0.52, boundaryTwo + 3.4, depth * 0.52, feetToMeters(20) + FLOOR_SLAB_METERS, 1.8, "wood", ["bridge", "suspension-bridge", "standable", "vertical-opening", "site-program"]),
    stairs("floating-rise-1", 0, boundaryOne - 1.4, FLOOR_SLAB_METERS, depth * 0.48, 1.8, feetToMeters(10), 5.8, "wood", ["bridge", "vertical-opening", "site-program"], Math.PI / 2),
    stairs("floating-rise-2", 0, boundaryTwo - 1.4, feetToMeters(10) + FLOOR_SLAB_METERS, depth * 0.52, 1.8, feetToMeters(10), 5.8, "wood", ["bridge", "vertical-opening", "site-program"], Math.PI / 2),
  );
  scene.routes.push(createRoute("floating-island-ascent", "vertical", [
    { x: boundaryOne - 3, z: depth * 0.48, y: 0 }, { x: boundaryOne + 3, z: depth * 0.48, y: feetToMeters(10) },
    { x: boundaryTwo - 3, z: depth * 0.52, y: feetToMeters(10) }, { x: boundaryTwo + 3, z: depth * 0.52, y: feetToMeters(20) },
  ], { purpose: "movement", traffic: 0.74, schedule: "all" }));
  scene.tactical.push(
    tacticalFeature("floating-bridge-choke-1", "chokepoint", boundaryOne, depth * 0.48, feetToMeters(10), 2, "The first suspension bridge is the only direct ascent to the middle island."),
    tacticalFeature("floating-radio-overwatch", "highGround", width * 0.84, depth * 0.5, feetToMeters(20), 4, "The highest basalt island dominates both lower approaches."),
  );
  return (x: number) => x < band ? 0 : x < band * 2 ? feetToMeters(10) : feetToMeters(20);
}

function addHarbor(scene: GeneratedScene, width: number, depth: number, features: readonly string[]): void {
  const waterZ = depth - 4.5;
  if (features.includes("fantasy-harbor")) {
    for (const [index, centerRatio, widthRatio, shoreOffset] of [[0, 0.17, 0.34, -1.2], [1, 0.5, 0.34, 0.4], [2, 0.83, 0.34, -0.5]] as const) {
      scene.primitives.push(water(`site-harbor-water-${index + 1}`, 0, width * centerRatio, -0.22, waterZ + shoreOffset / 2, width * widthRatio + 0.4, 0.36, 8 + shoreOffset, ["harbor-edge", "curved-coast", "coast", "site-program"]));
    }
  } else scene.primitives.push(water("site-harbor-water", 0, width / 2, -0.22, waterZ, width - 2, 0.36, 8, ["harbor-edge", "coast", "site-program"]));
  for (let index = 0; index < 6; index += 1) {
    const x = 5 + index * ((width - 10) / 5);
    const shoreZ = depth - 8 + Math.sin(index * 1.37) * 1.1;
    const endZ = depth - 1.1;
    scene.primitives.push(corridor(`harbor-dock-${index + 1}`, 0, x, shoreZ, x + (index % 2 === 0 ? -0.7 : 0.8), endZ, FLOOR_SLAB_METERS + 0.22, 1.8, "wood", ["dock", "harbor", "cargo-route", "standable", "site-program"]));
    scene.routes.push(createRoute(`harbor-dock-route-${index + 1}`, "alternate", [{ x, z: shoreZ, y: FLOOR_SLAB_METERS + 0.22 }, { x: x + (index % 2 === 0 ? -0.7 : 0.8), z: endZ, y: FLOOR_SLAB_METERS + 0.22 }], { purpose: "service", traffic: 0.72, schedule: "day" }));
  }
  scene.tactical.push(tacticalFeature("harbor-waterline-hazard", "hazard", width / 2, waterZ, -0.22, 5, "Six irregular docks create exposed cargo lanes and dangerous water-edge flanks."));
}

function addVillageLandmarks(scene: GeneratedScene, width: number, depth: number, features: readonly string[]): void {
  scene.primitives.push(cylinder("village-public-well", 0, width / 2, FLOOR_SLAB_METERS, depth / 2, 2.2, feetToMeters(3.2), "stone", ["well", "village-anchor", "cover", "site-program"]));
  const bridgeZ = depth * 0.42;
  scene.primitives.push(water("village-stream", 0, width * 0.16, -0.14, depth / 2, 3, 0.2, depth - 5, ["stream", "watercourse", "site-program"], 0), corridor("village-stone-bridge", 0, width * 0.16 - 3, bridgeZ, width * 0.16 + 3, bridgeZ, FLOOR_SLAB_METERS + 0.16, 2.2, "stone", ["bridge", "village-anchor", "standable"]));
  scene.tactical.push(tacticalFeature("village-bridge-choke", "chokepoint", width * 0.16, bridgeZ, FLOOR_SLAB_METERS, 2, "The stone bridge and public well anchor the village's organic road growth."));
  if (features.includes("wooden-wall")) {
    const wallHeight = feetToMeters(7);
    scene.primitives.push(
      box("village-palisade-north", 0, width / 2, 0, 1.3, width - 5, wallHeight, 0.28, "wood", ["village-wall", "palisade", "cover", "site-program", "opening"]),
      box("village-palisade-west", 0, 1.3, 0, depth / 2, 0.28, wallHeight, depth - 4, "wood", ["village-wall", "palisade", "cover", "site-program", "opening"]),
      box("village-palisade-east", 0, width - 1.3, 0, depth / 2, 0.28, wallHeight, depth - 4, "wood", ["village-wall", "palisade", "cover", "site-program", "opening"]),
    );
  }
}

function addUrbanDefences(scene: GeneratedScene, width: number, depth: number): void {
  const inset = 1.4;
  const wallY = feetToMeters(8);
  scene.primitives.push(
    box("site-city-north-wall", 0, width / 2, wallY, inset, width - 3, feetToMeters(16), 0.55, "darkStone", ["fortification", "city-wall", "cover", "site-program", "opening"]),
    box("site-city-west-wall", 0, inset, wallY, depth / 2, 0.55, feetToMeters(16), depth - 3, "darkStone", ["fortification", "city-wall", "cover", "site-program", "opening"]),
    cylinder("site-city-corner-tower", 0, inset, 0, inset, 4.2, feetToMeters(24), "darkStone", ["fortification", "corner-tower", "high-ground", "site-program"]),
  );
  scene.routes.push(createRoute("site-night-watch", "alternate", [{ x: inset + 2, z: inset + 1 }, { x: width * 0.35, z: inset + 1 }, { x: width * 0.7, z: inset + 1 }, { x: width - 3, z: inset + 2 }], { purpose: "movement", traffic: 0.3, schedule: "night" }));
}

function addMiningValley(scene: GeneratedScene, width: number, depth: number): void {
  const riverX = width * 0.28;
  for (let index = 0; index < 6; index += 1) {
    const z = depth * (0.12 + index * 0.14);
    const westHeight = feetToMeters(7 + (index % 3) * 4);
    const eastHeight = feetToMeters(10 + ((index + 1) % 3) * 5);
    scene.primitives.push(
      primitive(`mining-west-ridge-${index}`, index % 2 === 0 ? "cone" : "box", 0, width * (0.05 + (index % 2) * 0.035), 0, z, (5.5 + index % 3) * 1.524, westHeight, (5 + (index + 1) % 3) * 1.524, "rock", ["terrain", "valley-wall", "high-ground", "natural-profile", "site-program"], index * 0.21),
      primitive(`mining-east-ridge-${index}`, index % 3 === 0 ? "cone" : "box", 0, width * (0.91 - (index % 2) * 0.025), 0, z + (index % 2 ? 1.6 : -1.2), (6.5 + (index + 1) % 3) * 1.524, eastHeight, (5.5 + index % 3) * 1.524, "rock", ["terrain", "valley-wall", "high-ground", "natural-profile", "site-program"], -index * 0.17),
    );
  }
  scene.primitives.push(
    water("mining-river", 0, riverX, -0.18, depth * 0.52, 3.2, 0.22, depth * 0.8, ["river", "watercourse", "site-program"]),
    corridor("mining-loading-bridge", 0, riverX - 5, depth * 0.64, riverX + 6, depth * 0.64, FLOOR_SLAB_METERS + 0.24, 2.4, "wood", ["bridge", "loading-bridge", "cargo-route", "standable", "site-program"]),
    box("mining-portal-left", 0, width * 0.835, feetToMeters(2), depth * 0.16, 1.2, feetToMeters(12), 3.2, "darkStone", ["mine-entrance", "portal", "opening", "site-program"]),
    box("mining-portal-right", 0, width * 0.925, feetToMeters(2), depth * 0.16, 1.2, feetToMeters(12), 3.2, "darkStone", ["mine-entrance", "portal", "opening", "site-program"]),
    box("mining-portal-lintel", 0, width * 0.88, feetToMeters(10), depth * 0.16, width * 0.1, feetToMeters(3), 3.2, "darkStone", ["mine-entrance", "portal", "opening", "site-program"]),
    corridor("mining-tunnel-mouth", 0, width * 0.88, depth * 0.23, width * 0.88, depth * 0.05, FLOOR_SLAB_METERS + 0.04, 3.5, "darkStone", ["mine-entrance", "tunnel", "standable", "site-program"]),
  );
  scene.routes.push(
    createRoute("mining-river-flow", "waterflow", [{ x: riverX, z: depth * 0.16, y: -0.18 }, { x: riverX, z: depth * 0.5, y: -0.18 }, { x: riverX, z: depth * 0.86, y: -0.18 }], { purpose: "water", traffic: 0.7, schedule: "all" }),
    createRoute("mining-portal-route", "alternate", [{ x: width * 0.7, z: depth * 0.3 }, { x: width * 0.82, z: depth * 0.22 }, { x: width * 0.88, z: depth * 0.08 }], { purpose: "service", traffic: 0.7, schedule: "all" }),
  );
  scene.tactical.push(
    tacticalFeature("mining-bridge-choke", "chokepoint", riverX, depth * 0.64, FLOOR_SLAB_METERS, 2, "The loading bridge is the only cart-capable crossing."),
    tacticalFeature("mining-ridge-overwatch", "highGround", width * 0.9, depth * 0.42, feetToMeters(15), 3, "The waste-rock ridge overlooks the camp and mine approach."),
  );
}

function addIndustrialSite(scene: GeneratedScene, width: number, depth: number, features: readonly string[]): void {
  const yardZ = depth * 0.78;
  for (let track = 0; track < 3; track += 1) {
    scene.primitives.push(corridor(`industrial-rail-${track + 1}`, 0, 2, yardZ + track * 2.2, width - 2, yardZ + track * 2.2, FLOOR_SLAB_METERS + 0.08, 0.32, "metal", ["rail-yard", "rail-track", "industrial-route", "site-program"]));
  }
  scene.primitives.push(
    box("industrial-freight-platform", 0, width * 0.46, FLOOR_SLAB_METERS, yardZ - 2, width * 0.38, feetToMeters(3), 3.2, "darkStone", ["rail-yard", "loading-platform", "cover", "site-program"]),
    cylinder("industrial-storage-tank-1", 0, width * 0.78, FLOOR_SLAB_METERS, depth * 0.22, 5.2, feetToMeters(18), "metal", ["industrial-plant", "storage-tank", "cover", "site-program"]),
    cylinder("industrial-storage-tank-2", 0, width * 0.84, FLOOR_SLAB_METERS, depth * 0.27, 4.2, feetToMeters(14), "metal", ["industrial-plant", "storage-tank", "cover", "site-program"]),
    corridor("industrial-conveyor-bridge", 2, width * 0.22, depth * 0.3, width * 0.62, depth * 0.52, feetToMeters(16), 1.6, "metal", ["conveyor-network", "conveyor-bridge", "catwalk", "high-ground", "standable", "site-program"]),
    box("industrial-maintenance-level", 3, width * 0.5, -feetToMeters(10), depth * 0.5, width * 0.36, FLOOR_SLAB_METERS, depth * 0.22, "darkStone", ["floor", "underground-maintenance", "underground", "standable", "site-program"]),
    stairs("industrial-maintenance-stair", 3, width * 0.5, -feetToMeters(10), depth * 0.4, 1.8, feetToMeters(10), 5.4, "metal", ["underground-maintenance", "vertical-opening", "site-program"]),
  );
  scene.routes.push(
    createRoute("industrial-freight-route", "alternate", [{ x: 2, z: yardZ }, { x: width * 0.46, z: yardZ }, { x: width - 2, z: yardZ }], { purpose: "service", traffic: 0.88, schedule: "all" }),
    createRoute("industrial-catwalk-route", "alternate", [{ x: width * 0.22, z: depth * 0.3, y: feetToMeters(16) }, { x: width * 0.42, z: depth * 0.41, y: feetToMeters(16) }, { x: width * 0.62, z: depth * 0.52, y: feetToMeters(16) }], { purpose: "escape", traffic: 0.38, schedule: "all" }),
    createRoute("industrial-maintenance-route", "vertical", [{ x: width * 0.5, z: depth * 0.4, y: 0 }, { x: width * 0.5, z: depth * 0.5, y: -feetToMeters(10) }], { purpose: "service", traffic: 0.46, schedule: "all" }),
  );
  scene.tactical.push(
    tacticalFeature("industrial-yard-killzone", "hazard", width * 0.5, yardZ, 0, 5, "The open freight yard exposes movement between the factories and worker housing."),
    tacticalFeature("industrial-conveyor-overwatch", "highGround", width * 0.42, depth * 0.41, feetToMeters(16), 3, "The conveyor bridge provides an exposed elevated route across the district."),
  );
  if (!features.includes("underground-maintenance")) return;
  scene.rooms.push(createRoom("industrial-underground-room", "Underground maintenance and cable level", "service", 3, width * 0.5, depth * 0.5, width * 0.36, depth * 0.22, -feetToMeters(10)));
}

function addMountainTerraces(scene: GeneratedScene, width: number, depth: number): (x: number, z: number) => number {
  const first = depth * 0.38; const second = depth * 0.68;
  scene.primitives.push(
    box("monastery-lower-terrace", 0, width / 2, 0, first / 2, width * 0.88, FLOOR_SLAB_METERS, first, "rock", ["floor", "terrain", "mountain-terrace", "standable", "site-program"]),
    box("monastery-middle-terrace", 0, width / 2, feetToMeters(5), (first + second) / 2, width * 0.76, FLOOR_SLAB_METERS, second - first, "rock", ["floor", "terrain", "mountain-terrace", "standable", "site-program"]),
    box("monastery-upper-terrace", 0, width / 2, feetToMeters(10), (second + depth) / 2, width * 0.62, FLOOR_SLAB_METERS, depth - second, "rock", ["floor", "terrain", "mountain-terrace", "high-ground", "standable", "site-program"]),
    stairs("monastery-rise-1", 0, width * 0.48, 0, first, 2.2, feetToMeters(5), 5.2, "stone", ["mountain-terrace", "vertical-opening", "site-program"]),
    stairs("monastery-rise-2", 0, width * 0.52, feetToMeters(5), second, 2.2, feetToMeters(5), 5.2, "stone", ["mountain-terrace", "vertical-opening", "site-program"]),
    corridor("monastery-exterior-boardwalk", 0, width * 0.7, depth * 0.48, width * 0.82, depth * 0.82, feetToMeters(10), 1.6, "wood", ["external-boardwalk", "bridge", "high-ground", "standable", "site-program"]),
  );
  return (_x: number, z: number) => z < first ? 0 : z < second ? feetToMeters(5) : feetToMeters(10);
}

function addFloodedSite(scene: GeneratedScene, width: number, depth: number): void {
  scene.primitives.push(
    water("flooded-site-water-west", 0, width * 0.28, 0.03, depth * 0.52, width * 0.32, 0.16, depth * 0.72, ["flooded-site", "floodwater", "hazard", "site-program"]),
    water("flooded-site-water-east", 0, width * 0.72, 0.03, depth * 0.46, width * 0.28, 0.16, depth * 0.58, ["flooded-site", "floodwater", "hazard", "site-program"]),
    corridor("flooded-temporary-bridge", 0, width * 0.08, depth * 0.56, width * 0.9, depth * 0.42, feetToMeters(5) + FLOOR_SLAB_METERS, 1.5, "wood", ["temporary-bridge", "evacuation-route", "standable", "site-program"]),
  );
  scene.tactical.push(tacticalFeature("flooded-road-hazard", "hazard", width * 0.5, depth * 0.5, 0.03, 6, "Floodwater cuts the ground-level road network into exposed islands."));
}

function addElevatedRailMarket(scene: GeneratedScene, width: number, depth: number): void {
  const railZ = depth * 0.34;
  for (let index = 0; index < 8; index += 1) scene.primitives.push(cylinder(`elevated-rail-pier-${index}`, 0, width * (0.08 + index * 0.12), 0, railZ, 0.9, feetToMeters(18), "darkStone", ["elevated-rail", "viaduct", "cover", "site-program"]));
  scene.primitives.push(
    corridor("elevated-rail-deck", 2, width * 0.04, railZ, width * 0.96, railZ, feetToMeters(18), 3.2, "metal", ["elevated-rail", "viaduct", "roof-route", "standable", "site-program"]),
    box("elevated-market-carriage-1", 0, width * 0.28, FLOOR_SLAB_METERS, railZ + 4, 7, feetToMeters(9), 2.6, "metal", ["carriage-shop", "market-stall", "cover", "site-program"]),
    box("elevated-market-carriage-2", 0, width * 0.56, FLOOR_SLAB_METERS, railZ - 4, 7, feetToMeters(9), 2.6, "metal", ["carriage-shop", "market-stall", "cover", "site-program"]),
  );
  scene.tactical.push(tacticalFeature("elevated-market-underpass", "chokepoint", width * 0.5, railZ, 0, 3, "The viaduct piers divide the central market into defensible bays."));
}

function addWaterCity(scene: GeneratedScene, width: number, depth: number): void {
  type CanalPoint = { x: number; z: number };
  const main: CanalPoint[] = [
    { x: width * 0.39, z: depth * 0.03 },
    { x: width * 0.44, z: depth * 0.23 },
    { x: width * 0.41, z: depth * 0.43 },
    { x: width * 0.49, z: depth * 0.62 },
    { x: width * 0.46, z: depth * 0.79 },
    { x: width * 0.54, z: depth * 0.97 },
  ];
  const branches: CanalPoint[][] = [
    [main[1]!, { x: width * 0.26, z: depth * 0.3 }, { x: width * 0.03, z: depth * 0.27 }],
    [main[2]!, { x: width * 0.61, z: depth * 0.39 }, { x: width * 0.96, z: depth * 0.33 }],
    [main[4]!, { x: width * 0.31, z: depth * 0.74 }, { x: width * 0.04, z: depth * 0.82 }],
  ];
  const canalSegments = (id: string, points: CanalPoint[], canalWidth: number, kind: "main-canal" | "branch-canal") => {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!; const to = points[index]!;
      scene.primitives.push(corridor(`${id}-${index}`, 0, from.x, from.z, to.x, to.z, 0.025, canalWidth, "water", ["water-city", kind, "watercourse", "hazard", "site-program"]));
    }
  };
  canalSegments("water-city-main-canal", main, 4.8, "main-canal");
  branches.forEach((points, index) => canalSegments(`water-city-branch-${index + 1}`, points, 2.8 + index * 0.25, "branch-canal"));

  // Quays follow the canal as two discontinuous historical frontage paths.
  const westQuay = main.map((point, index) => ({ x: point.x - 4.2 - (index % 2) * 0.5, z: point.z }));
  const eastQuay = main.map((point, index) => ({ x: point.x + 4.2 + ((index + 1) % 2) * 0.5, z: point.z }));
  for (const [side, points] of [["west", westQuay], ["east", eastQuay]] as const) {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!; const to = points[index]!;
      scene.primitives.push(corridor(`water-city-${side}-quay-${index}`, 0, from.x, from.z, to.x, to.z, FLOOR_SLAB_METERS + 0.08, 1.6, "stone", ["water-city", "quay", "bank-route", "standable", "site-program"]));
    }
  }

  scene.primitives.push(
    corridor("water-city-stone-bridge", 0, main[2]!.x - 5, main[2]!.z, main[2]!.x + 5, main[2]!.z, FLOOR_SLAB_METERS + 0.24, 2.5, "stone", ["water-city", "stone-bridge", "bridge", "standable", "site-program"]),
    corridor("water-city-wood-bridge", 0, main[4]!.x - 4.6, main[4]!.z, main[4]!.x + 4.6, main[4]!.z, FLOOR_SLAB_METERS + 0.2, 1.5, "wood", ["water-city", "wood-bridge", "bridge", "standable", "site-program"]),
    box("water-city-market-dock", 0, main[3]!.x + 6.2, FLOOR_SLAB_METERS + 0.1, main[3]!.z, 6.5, FLOOR_SLAB_METERS, 4, "wood", ["water-city", "market-dock", "quay", "standable", "site-program"]),
  );
  scene.routes.push(createRoute("water-city-canal-route", "waterflow", main.map((point) => ({ ...point, y: 0.025 })), { purpose: "water", traffic: 0.72, schedule: "all" }));
}

function addImpactCraterSettlement(scene: GeneratedScene, width: number, depth: number): void {
  const cx = width * 0.5; const cz = depth * 0.5;
  const radiusX = width * 0.22; const radiusZ = depth * 0.23;
  scene.primitives.push(cylinder("impact-crater-basin", 0, cx, FLOOR_SLAB_METERS + 0.015, cz, Math.min(radiusX, radiusZ) * 1.42, 0.08, "darkStone", ["impact-crater", "crater-floor", "hazard", "standable", "site-program"]));
  const rimAngles = [0.02, 0.31, 0.7, 1.04, 1.52, 1.85, 2.29, 2.72, 3.08, 3.51, 3.95, 4.28, 4.78, 5.22, 5.72];
  for (const [index, angle] of rimAngles.entries()) {
    const radiusNoise = 0.88 + ((index * 7) % 5) * 0.045;
    const x = cx + Math.cos(angle) * radiusX * radiusNoise;
    const z = cz + Math.sin(angle) * radiusZ * radiusNoise;
    const height = feetToMeters(3.5 + ((index * 5) % 4) * 2.2);
    scene.primitives.push(box(`impact-crater-rim-${index + 1}`, 0, x, FLOOR_SLAB_METERS, z, 3.2 + ((index * 3) % 4) * 0.85, height, 2.4 + ((index * 5) % 3) * 0.9, "rock", ["impact-crater", "crater-rim", "slope", "high-ground", "cover", "site-program"], -angle + ((index % 3) - 1) * 0.12));
  }
  for (const [index, angle] of [Math.PI * 0.1, Math.PI * 0.92, Math.PI * 1.48].entries()) {
    const outer = { x: cx + Math.cos(angle) * (radiusX + 5), z: cz + Math.sin(angle) * (radiusZ + 5) };
    const inner = { x: cx + Math.cos(angle) * (radiusX * 0.45), z: cz + Math.sin(angle) * (radiusZ * 0.45) };
    scene.primitives.push(corridor(`impact-crater-ramp-${index + 1}`, 0, outer.x, outer.z, inner.x, inner.z, FLOOR_SLAB_METERS + 0.18, 2, "earth", ["impact-crater", "crater-ramp", "alternate-route", "standable", "site-program"]));
  }
  scene.primitives.push(
    cylinder("impact-crater-meteor-core", 0, cx - radiusX * 0.18, FLOOR_SLAB_METERS, cz + radiusZ * 0.12, 2.4, feetToMeters(7), "metal", ["impact-crater", "meteor-fragment", "landmark", "cover", "site-program"]),
    box("impact-crater-shatter-1", 0, cx + radiusX * 0.2, FLOOR_SLAB_METERS, cz - radiusZ * 0.12, 2.6, feetToMeters(2.2), 1.1, "rock", ["impact-crater", "meteor-fragment", "cover", "site-program"], 0.42),
    box("impact-crater-shatter-2", 0, cx - radiusX * 0.06, FLOOR_SLAB_METERS, cz - radiusZ * 0.28, 1.4, feetToMeters(1.8), 2.1, "rock", ["impact-crater", "meteor-fragment", "cover", "site-program"], -0.28),
  );
  scene.tactical.push(
    tacticalFeature("impact-crater-rim-high-ground", "highGround", cx + radiusX, cz, feetToMeters(7), 3, "The broken crater rim overlooks the settlement and basin."),
    tacticalFeature("impact-crater-basin-hazard", "hazard", cx, cz, 0, Math.min(radiusX, radiusZ) * 0.55, "The exposed impact basin is difficult ground with little cover."),
  );
}

function addGateDistrict(scene: GeneratedScene, width: number, depth: number): void {
  const gateX = width * 0.28;
  scene.primitives.push(
    cylinder("gate-district-west-tower", 0, gateX - 4, 0, 2.3, 5.2, feetToMeters(24), "darkStone", ["gate-district", "gate-tower", "high-ground", "site-program"]),
    cylinder("gate-district-east-tower", 0, gateX + 4, 0, 2.3, 5.2, feetToMeters(24), "darkStone", ["gate-district", "gate-tower", "high-ground", "site-program"]),
    box("gate-district-lintel", 0, gateX, feetToMeters(16), 2.3, 3.2, feetToMeters(8), 1.2, "darkStone", ["gate-district", "gatehouse", "opening", "site-program"]),
    corridor("gate-district-kill-lane", 0, gateX, 0, gateX, depth * 0.5, FLOOR_SLAB_METERS + 0.08, 3.5, "stone", ["gate-district", "kill-lane", "road", "standable", "site-program"]),
  );
}

function addWarDamage(scene: GeneratedScene, width: number, depth: number): void {
  for (let index = 0; index < 6; index += 1) {
    const x = width * (0.18 + (index % 3) * 0.28);
    const z = depth * (0.3 + Math.floor(index / 3) * 0.34);
    scene.primitives.push(box(`war-rubble-${index + 1}`, 0, x, FLOOR_SLAB_METERS, z, 2.2 + (index % 2), feetToMeters(2.5 + index % 3), 1.8, "rock", ["war-damaged", "rubble", "cover", "site-program"], index * 0.31));
  }
  scene.primitives.push(
    box("war-street-barricade", 0, width * 0.5, FLOOR_SLAB_METERS, depth * 0.5, 5.2, feetToMeters(5), 0.8, "wood", ["war-damaged", "temporary-barricade", "cover", "site-program"], 0.18),
    corridor("war-detour-alley", 0, width * 0.18, depth * 0.62, width * 0.44, depth * 0.76, FLOOR_SLAB_METERS + 0.08, 1.1, "earth", ["war-damaged", "detour", "lane", "standable", "site-program"]),
  );
}

function addVerticalSlum(scene: GeneratedScene, width: number, depth: number): void {
  const levels = [feetToMeters(12), feetToMeters(24), feetToMeters(36)];
  for (const [pierIndex, x] of [width * 0.28, width * 0.72].entries()) {
    scene.primitives.push(cylinder(`vertical-slum-pier-${pierIndex + 1}`, 0, x, 0, depth * 0.5, 8.5, feetToMeters(50), "darkStone", ["vertical-slum", "bridge-pier", "cover", "site-program"]));
  }
  for (const [levelIndex, levelY] of levels.entries()) {
    const z = depth * (0.3 + levelIndex * 0.19);
    scene.primitives.push(
      box(`vertical-slum-market-platform-${levelIndex + 1}`, levelIndex + 1, width * 0.5, levelY, z, width * 0.38, FLOOR_SLAB_METERS, 6.5, "wood", ["vertical-slum", "market-platform", "platform", "standable", "site-program"]),
      corridor(`vertical-slum-rope-bridge-${levelIndex + 1}`, levelIndex + 1, width * 0.3, z, width * 0.7, z, levelY + 0.08, 1.2, "wood", ["vertical-slum", "rope-bridge", "bridge", "standable", "site-program"]),
    );
    for (const [supportIndex, dx, dz] of [[0, -0.17, -0.34], [1, 0.17, -0.34], [2, -0.17, 0.34], [3, 0.17, 0.34]] as const) scene.primitives.push(cylinder(`vertical-slum-platform-support-${levelIndex + 1}-${supportIndex + 1}`, levelIndex + 1, width * (0.5 + dx), 0, z + dz * 6.5, 0.55, levelY, "wood", ["vertical-slum", "platform-support", "support", "site-program"]));
    const previousY = levelIndex === 0 ? 0 : levels[levelIndex - 1] ?? 0;
    const previousZ = levelIndex === 0 ? depth * 0.18 : depth * (0.3 + (levelIndex - 1) * 0.19);
    const climb = stairConnection(`vertical-slum-climb-${levelIndex + 1}`, levelIndex + 1,
      { xCells: width * 0.38, zCells: previousZ, yMeters: previousY },
      { xCells: width * 0.38, zCells: z, yMeters: levelY },
      1.15, "wood", ["vertical-slum", "building-stair", "vertical-opening", "standable", "site-program"]);
    scene.primitives.push(climb.primitive);
    scene.routes.push(createRoute(`vertical-slum-climb-route-${levelIndex + 1}`, "vertical", [
      { x: climb.bottom.xCells, z: climb.bottom.zCells, y: climb.bottom.yMeters },
      { x: climb.top.xCells, z: climb.top.zCells, y: climb.top.yMeters },
    ], { purpose: "escape", traffic: 0.32, schedule: "all" }));
  }
  scene.primitives.push(water("vertical-slum-public-pool", 0, width * 0.5, 0.04, depth * 0.78, 7, 0.18, 6, ["vertical-slum", "public-water", "site-program"]), box("vertical-slum-maintenance", 3, width * 0.5, -feetToMeters(8), depth * 0.5, width * 0.32, FLOOR_SLAB_METERS, 7, "metal", ["vertical-slum", "under-bridge-maintenance", "underground", "floor", "standable", "site-program"]));
}

function addColonyPort(scene: GeneratedScene, width: number, depth: number): void {
  scene.primitives.push(
    corridor("colony-airlock-road", 0, 1, depth * 0.5, width - 2, depth * 0.5, FLOOR_SLAB_METERS + 0.09, 4, "metal", ["colony-port", "airlock-road", "road", "standable", "site-program"]),
    cylinder("colony-airlock", 0, width * 0.1, FLOOR_SLAB_METERS, depth * 0.5, 7, feetToMeters(14), "metal", ["colony-port", "airlock", "entrance", "site-program"]),
    primitive("colony-greenhouse", "sphere", 0, width * 0.68, FLOOR_SLAB_METERS, depth * 0.24, 10, feetToMeters(12), 8, "warmLight", ["colony-port", "greenhouse", "landmark", "site-program"]),
    cylinder("colony-control-tower", 0, width * 0.82, FLOOR_SLAB_METERS, depth * 0.68, 5.5, feetToMeters(30), "metal", ["colony-port", "control-tower", "high-ground", "site-program"]),
    corridor("colony-external-boardwalk", 1, width * 0.58, depth * 0.2, width * 0.88, depth * 0.7, feetToMeters(14), 1.4, "metal", ["colony-port", "external-boardwalk", "bridge", "standable", "site-program"]),
    box("colony-life-support", 3, width * 0.5, -feetToMeters(10), depth * 0.5, width * 0.38, FLOOR_SLAB_METERS, depth * 0.18, "metal", ["colony-port", "life-support", "underground", "floor", "standable", "site-program"]),
  );
}

function addRiverCrossingSite(scene: GeneratedScene, width: number, depth: number): void {
  const riverX = width * 0.24; const bridgeZ = depth * 0.52;
  scene.primitives.push(
    water("site-river-crossing-water", 0, riverX, -0.14, depth / 2, 4.2, 0.18, depth * 0.92, ["river-crossing", "river", "watercourse", "site-program"]),
    corridor("site-river-stone-bridge", 0, riverX - 5, bridgeZ, riverX + 5, bridgeZ, FLOOR_SLAB_METERS + 0.18, 2.6, "stone", ["river-crossing", "stone-bridge", "bridge", "standable", "site-program"]),
    corridor("site-river-ford", 0, riverX - 3.5, depth * 0.76, riverX + 3.5, depth * 0.76, 0.02, 3.2, "rock", ["river-crossing", "ford", "alternate-route", "standable", "site-program"]),
    box("site-river-ambush-slope", 0, width * 0.78, feetToMeters(5), depth * 0.18, 9, feetToMeters(10), 7, "rock", ["terrain", "slope", "high-ground", "river-crossing", "site-program"]),
  );
  scene.routes.push(createRoute("site-river-flow", "waterflow", [{ x: riverX, z: depth * 0.08, y: -0.14 }, { x: riverX, z: depth * 0.5, y: -0.14 }, { x: riverX, z: depth * 0.9, y: -0.14 }], { purpose: "water", traffic: 0.68, schedule: "all" }));
  scene.tactical.push(
    tacticalFeature("site-river-bridge-choke", "chokepoint", riverX, bridgeZ, FLOOR_SLAB_METERS, 2, "The stone bridge carries the main road while the ford supports a risky flank."),
    tacticalFeature("site-river-slope-ambush", "highGround", width * 0.78, depth * 0.18, feetToMeters(10), 3, "The upper slope overlooks the road station and bridge approach."),
  );
}

export function generateSiteSettlement(context: GeneratorContext): GeneratedScene {
  const archetype = classifySettlementArchetype(context.request.prompt);
  const program = planSettlementSite({ request: context.request, archetype }, context.rng.fork("site-program"));
  const settlementTitle = program.requiredFeatures.includes("water-city") ? "The Waterwoven Quarter"
    : program.requiredFeatures.includes("impact-crater-settlement") ? "The Fallen-Star Village"
      : program.siteType === "harbor-district" ? "The Layered Quays"
        : program.siteType === "village" ? "The Living Crossroads"
          : program.siteType === "mining-settlement" ? "Orewater Camp"
            : program.morphology.growth === "organic" ? "The Accreted Ward" : "The Planned Ward";
  const scene = baseScene("settlement", settlementTitle, `${program.siteType} compiled as a ${program.morphology.era} ${program.morphology.roadPattern} settlement from terrain constraints, districts, hierarchical roads, frontage parcels and independently seeded buildings.`, context.request.seed, program.bounds, 4, [12, 10, 8, 10]);
  scene.archetype = archetype;
  scene.floorLabels = ["地面/1F", "主要上层", "屋顶", "B1"];
  scene.siteProgram = summarizeSiteProgram(program);
  const landDepth = program.siteType === "harbor-district" ? program.bounds.z - 8 : program.bounds.z;
  const isFloating = context.sceneProgram?.morphology.includes("floating-islands") ?? false;
  const isMountainMonastery = program.requiredFeatures.includes("mountain-monastery") || program.requiredFeatures.includes("hillside-district");
  const isFlooded = program.requiredFeatures.includes("flooded-site");
  const elevationAt = isFloating ? addFloatingIslandTerrain(scene, program.bounds.x, program.bounds.z) : isMountainMonastery ? addMountainTerraces(scene, program.bounds.x, program.bounds.z) : () => 0;
  if (!isFloating) scene.primitives.push(box("site-terrain-base", 0, program.bounds.x / 2, 0, landDepth / 2, program.bounds.x, FLOOR_SLAB_METERS, landDepth, program.siteType === "village" || program.siteType === "mining-settlement" || program.siteType === "town" ? "earth" : "darkStone", ["floor", "terrain", "site-program", `site:${program.siteType}`]));
  // Districts are planning ownership, not giant coloured floor decals. Their
  // identity is made legible by parcel use, landmarks and road hierarchy.
  addBlockAndParcelSurfaces(scene, program, elevationAt);
  for (const road of program.roads) scene.primitives.push(...roadPieces(road, elevationAt));
  addRoadJunctions(scene, program, elevationAt);
  addOpenSpaces(scene, program, elevationAt);
  if (program.siteType === "harbor-district") addHarbor(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (program.siteType === "village") addVillageLandmarks(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (!isFloating && (program.siteType === "city-district" || program.siteType === "town")) addUrbanDefences(scene, program.bounds.x, program.bounds.z);
  if (program.siteType === "mining-settlement") {
    addMiningValley(scene, program.bounds.x, program.bounds.z);
    scene.primitives.push(corridor("mining-cart-track", 0, 1, program.bounds.z * 0.28, program.bounds.x - 2, program.bounds.z * 0.72, FLOOR_SLAB_METERS + 0.08, 1.4, "metal", ["mine-cart-track", "industrial-route", "site-program"]));
    scene.primitives.push(box("mining-waste-slope", 0, program.bounds.x * 0.82, feetToMeters(5), program.bounds.z * 0.2, 9, feetToMeters(10), 8, "rock", ["waste-rock", "slope", "high-ground", "site-program"]));
  }
  if (program.requiredFeatures.includes("industrial-plant") || program.requiredFeatures.includes("rail-yard")) addIndustrialSite(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (isFlooded) addFloodedSite(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("elevated-rail")) addElevatedRailMarket(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("water-city")) addWaterCity(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("impact-crater-settlement")) addImpactCraterSettlement(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("gate-district")) addGateDistrict(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("war-damaged")) addWarDamage(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("vertical-slum")) addVerticalSlum(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("colony-port")) addColonyPort(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("river-crossing") && program.siteType !== "village" && program.siteType !== "mining-settlement" && program.siteType !== "harbor-district") addRiverCrossingSite(scene, program.bounds.x, program.bounds.z);

  for (const parcel of program.parcels) {
    const district = program.districts.find((candidate) => candidate.id === parcel.districtId);
    const siteElevation = isFlooded ? feetToMeters(5) : elevationAt(parcel.center.x, parcel.center.z);
    instantiateBuildingModule(scene, {
      id: `settlement-building-${parcel.id.replace("parcel-", "")}`,
      kind: parcel.buildingKind,
      x: parcel.center.x,
      z: parcel.center.z,
      width: parcel.buildingSize.x,
      depth: parcel.buildingSize.z,
      rotation: parcel.rotationY,
      district: district?.role ?? parcel.districtId,
      seed: parcel.buildingSeed,
      lod: parcel.lod,
      parcelId: parcel.id,
      frontageRoadId: parcel.frontageRoadId,
      entrance: parcel.entrance,
      baseY: siteElevation + FLOOR_SLAB_METERS,
      state: parcel.state,
    }, context.rng.fork(parcel.buildingSeed));
    scene.primitives.push(corridor(`parcel-access-${parcel.id}`, 0, parcel.entrance.x, parcel.entrance.z, parcel.center.x, parcel.center.z, siteElevation + FLOOR_SLAB_METERS + 0.06, parcel.lod === "full-interior" ? 1.4 : 1, program.siteType === "village" ? "earth" : "stone", ["parcel-access", "entrance-route", `parcel:${parcel.id}`, "site-program", "standable"]));
    if (isFlooded) {
      for (const [pierIndex, dx, dz] of [[0, -0.36, -0.36], [1, 0.36, -0.36], [2, -0.36, 0.36], [3, 0.36, 0.36]] as const) scene.primitives.push(cylinder(`flood-pier-${parcel.id}-${pierIndex}`, 0, parcel.center.x + parcel.size.x * dx, 0, parcel.center.z + parcel.size.z * dz, 0.55, siteElevation, "wood", ["stilt-foundation", "flooded-site", "site-program"]));
      scene.primitives.push(stairs(`flood-access-stair-${parcel.id}`, 0, parcel.entrance.x, 0, parcel.entrance.z, 1.2, siteElevation, 3.8, "wood", ["flooded-site", "vertical-opening", "site-program"], parcel.rotationY));
    }
  }

  const central = program.openSpaces[0];
  const plaza = createRoom("settlement-plaza-room", program.siteType === "village" ? "Village green and public well" : program.siteType === "harbor-district" ? "Fish market plaza" : "Central plaza", "circulation", 0, central?.center.x ?? program.bounds.x / 2, central?.center.z ?? program.bounds.z / 2, central?.size.x ?? 8, central?.size.z ?? 8);
  scene.rooms.push(plaza);
  const industrialUnderground = scene.rooms.find((room) => room.id === "industrial-underground-room");
  if (industrialUnderground) connectRooms(scene.rooms, plaza.id, industrialUnderground.id);
  const buildingRoots = scene.rooms.filter((room) => room.id.startsWith("settlement-building-") && room.id.endsWith("-room"));
  for (const [index, room] of buildingRoots.entries()) connectRooms(scene.rooms, index === 0 ? plaza.id : (buildingRoots[index - 1]?.id ?? plaza.id), room.id);

  for (const road of program.roads) scene.routes.push(createRoute(`route-${road.id}`, road.hierarchy === "arterial" ? "primary" : "alternate", road.points.map((point) => ({ ...point, y: elevationAt(point.x, point.z) })), { purpose: road.purpose === "cargo" || road.purpose === "service" ? "service" : "crowd", traffic: road.hierarchy === "arterial" ? 0.94 : road.hierarchy === "street" ? 0.86 : road.hierarchy === "lane" || road.hierarchy === "trail" ? 0.44 : 0.7, schedule: road.purpose === "patrol" ? "night" : road.purpose === "service" ? "all" : "day" }));
  const core = scene.buildingInstances?.filter((building) => building.detailLevel === "full-interior") ?? [];
  const wantsRoofRoute = ["屋顶", "房顶", "追逐", "roof", "rooftop", "chase"].some((term) => context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US").includes(term));
  if (wantsRoofRoute && core.length > 0) {
    const anchor = core[0];
    if (anchor) {
      const roofY = (anchor.baseYMeters ?? FLOOR_SLAB_METERS) + (anchor.exteriorHeightMeters ?? feetToMeters(20)) + 0.12;
      const roofSpan = Math.min(2, anchor.footprintCells.x * 0.2);
      scene.primitives.push(corridor(`site-roof-walkway-${anchor.id}`, 2,
        anchor.positionCells.x - roofSpan, anchor.positionCells.z,
        anchor.positionCells.x + roofSpan, anchor.positionCells.z,
        roofY, 1.2, "wood", ["roof-route", "roof-walkway", "high-ground", "standable", "site-program"]));
      scene.routes.push(createRoute("site-rooftop-pursuit", "alternate", [
        { x: anchor.positionCells.x - roofSpan, z: anchor.positionCells.z, y: roofY },
        { x: anchor.positionCells.x, z: anchor.positionCells.z, y: roofY },
        { x: anchor.positionCells.x + roofSpan, z: anchor.positionCells.z, y: roofY },
      ], { purpose: "escape", traffic: 0.35, schedule: "all" }));
    }
    for (let index = 1; index < core.length; index += 1) {
      const previous = core[index - 1]; const current = core[index];
      if (!previous || !current || Math.hypot(previous.positionCells.x - current.positionCells.x, previous.positionCells.z - current.positionCells.z) > 16) continue;
      const previousRoofY = (previous.baseYMeters ?? FLOOR_SLAB_METERS) + (previous.exteriorHeightMeters ?? feetToMeters(20)) + 0.12;
      const currentRoofY = (current.baseYMeters ?? FLOOR_SLAB_METERS) + (current.exteriorHeightMeters ?? feetToMeters(20)) + 0.12;
      if (Math.abs(previousRoofY - currentRoofY) > feetToMeters(5)) continue;
      scene.primitives.push(corridor(`site-roof-bridge-${index}`, 2, previous.positionCells.x, previous.positionCells.z, current.positionCells.x, current.positionCells.z, (previousRoofY + currentRoofY) / 2, 1.2, "wood", ["roof-route", "high-ground", "standable", "site-program"]));
    }
  }
  for (const zone of program.encounterZones) scene.tactical.push(tacticalFeature(`site-${zone.id}`, zone.kind === "high-ground" ? "highGround" : zone.kind, zone.center.x, zone.center.z, 0, zone.radiusCells, `SiteProgram ${zone.kind} derived from district and route relationships.`));
  scene.diagnostics.metrics.siteRoadLengthCells = program.diagnostics.roadLengthCells;
  scene.diagnostics.metrics.siteParcelCoverage = program.diagnostics.parcelCoverage;
  scene.diagnostics.metrics.siteBuildingCoverage = program.diagnostics.buildingCoverage;
  scene.diagnostics.metrics.siteFullInteriors = program.lodPolicy.fullInteriorCount;
  scene.diagnostics.metrics.siteJunctions = program.diagnostics.junctionCount;
  scene.diagnostics.metrics.siteBlocks = program.diagnostics.blockCount;
  scene.diagnostics.metrics.siteAverageParcelArea = program.diagnostics.averageParcelArea;
  scene.diagnostics.metrics.siteOpenSpaceRatio = program.diagnostics.openSpaceRatio;
  scene.diagnostics.metrics.siteCurvedRoadRatio = program.diagnostics.curvedRoadRatio;
  scene.diagnostics.metrics.siteNonRectangularBlockRatio = program.diagnostics.nonRectangularBlockRatio;
  scene.diagnostics.metrics.siteBuildingPrograms = scene.buildingInstances?.filter((building) => Boolean(building.interiorProgram)).length ?? 0;
  scene.diagnostics.metrics.siteFocusInteriorPrimitives = scene.primitives.filter((primitive) => primitive.tags?.includes("focus-interior")).length;
  return scene;
}
