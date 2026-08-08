import type { GeneratedScene, GeneratorContext } from "../schema";
import { planSettlementSite, summarizeSiteProgram, type RoadProgram } from "../site-program";
import { instantiateBuildingModule } from "./buildingModule";
import { classifySettlementArchetype } from "./settlement";
import { compileSettlementTerrain, type SettlementTerrain } from "./settlementTerrain";
import { FLOOR_SLAB_METERS, baseScene, box, connectRooms, corridor, createRoom, createRoute, cylinder, feetToMeters, primitive, stairConnection, stairs, tacticalFeature, water } from "./shared";

function roadPieces(road: RoadProgram, terrain: SettlementTerrain) {
  return road.points.slice(1).flatMap((point, index) => {
    const previous = road.points[index];
    if (!previous) throw new Error(`Road ${road.id} has no start point`);
    const length = Math.hypot(point.x - previous.x, point.z - previous.z);
    const steps = Math.max(1, Math.ceil(length / 2.5));
    return Array.from({ length: steps }, (_, step) => {
      const t0 = step / steps; const t1 = (step + 1) / steps;
      const from = { x: previous.x + (point.x - previous.x) * t0, z: previous.z + (point.z - previous.z) * t0 };
      const to = { x: previous.x + (point.x - previous.x) * t1, z: previous.z + (point.z - previous.z) * t1 };
      const mx = (from.x + to.x) / 2; const mz = (from.z + to.z) / 2;
      const surface = terrain.surfaceAt(mx, mz);
      if (surface === "water" || surface === "lava" || surface === "void") return undefined;
      return corridor(`site-${road.id}-${index + 1}-${step + 1}`, 0, from.x, from.z, to.x, to.z, terrain.elevationAt(mx, mz) + FLOOR_SLAB_METERS + 0.02, road.widthCells, road.hierarchy === "trail" ? "earth" : "stone", ["road", `road:${road.hierarchy}`, `purpose:${road.purpose}`, "site-program", "standable", "terrain-adapted"]);
    }).filter((piece): piece is NonNullable<typeof piece> => Boolean(piece));
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

function addFloatingIslandTerrain(scene: GeneratedScene, width: number, depth: number, saltCrystal = false): (x: number, z: number) => number {
  const islands = [
    { x: width * 0.2, z: depth * 0.7, y: 0, w: width * 0.31, d: depth * 0.34 },
    { x: width * 0.5, z: depth * 0.27, y: feetToMeters(30), w: width * 0.29, d: depth * 0.3 },
    { x: width * 0.82, z: depth * 0.63, y: feetToMeters(65), w: width * 0.26, d: depth * 0.28 },
  ];
  for (const [index, island] of islands.entries()) {
    const material = saltCrystal ? "ice" : "darkStone";
    const ledgeOffsets = [
      { x: -island.w * 0.12, z: island.d * 0.08, w: 0.82, d: 0.78 },
      { x: island.w * 0.13, z: -island.d * 0.09, w: 0.74, d: 0.84 },
      { x: island.w * 0.02, z: island.d * 0.18, w: 0.62, d: 0.58 },
    ];
    scene.primitives.push(
      box(`floating-island-${index + 1}-top`, index, island.x, island.y, island.z, island.w, FLOOR_SLAB_METERS, island.d, material, ["floor", "terrain", "floating-island", saltCrystal ? "salt-crystal" : "basalt", "standable", "site-program"]),
      primitive(`floating-island-${index + 1}-underside`, "cone", index, island.x, island.y - feetToMeters(saltCrystal ? 30 : 22), island.z, island.w * 0.48 * 1.524, feetToMeters(saltCrystal ? 30 : 22), island.d * 0.46 * 1.524, "rock", ["terrain", "floating-island", saltCrystal ? "salt-crystal" : "basalt", "vertical-landmark", "site-program"]),
    );
    for (const [ledgeIndex, ledge] of ledgeOffsets.entries()) {
      scene.primitives.push(box(`floating-island-${index + 1}-ledge-${ledgeIndex + 1}`, index, island.x + ledge.x, island.y - feetToMeters(2 + ledgeIndex * 2.5), island.z + ledge.z, island.w * ledge.w, feetToMeters(4.5), island.d * ledge.d, ledgeIndex % 2 === 0 ? material : "rock", ["terrain", "floating-island", "vertical-face", saltCrystal ? "salt-crystal" : "basalt", "site-program"]));
    }
    if (saltCrystal) {
      for (let spike = 0; spike < 7; spike += 1) {
        const angle = spike * 0.89 + index;
        const radius = Math.min(island.w, island.d) * (0.28 + (spike % 3) * 0.09);
        scene.primitives.push(primitive(`salt-crystal-${index + 1}-${spike + 1}`, "cone", index, island.x + Math.cos(angle) * radius, island.y + feetToMeters(1.5), island.z + Math.sin(angle) * radius, 0.45 + (spike % 3) * 0.18, feetToMeters(4 + spike % 4 * 2), 0.45 + (spike % 2) * 0.16, spike % 2 === 0 ? "ice" : "warmLight", ["salt-crystal", "vertical-landmark", "cover", "site-program"]));
      }
    }
  }
  for (const bridgeIndex of [0, 1]) {
    const from = islands[bridgeIndex]!;
    const to = islands[bridgeIndex + 1]!;
    for (let segment = 0; segment < 9; segment += 1) {
      const t0 = segment / 9;
      const t1 = (segment + 1) / 9;
      const sag = Math.sin(Math.PI * ((t0 + t1) / 2)) * feetToMeters(3);
      scene.primitives.push(corridor(
        `floating-suspension-bridge-${bridgeIndex + 1}-${segment + 1}`,
        bridgeIndex,
        from.x + (to.x - from.x) * t0,
        from.z + (to.z - from.z) * t0,
        from.x + (to.x - from.x) * t1,
        from.z + (to.z - from.z) * t1,
        from.y + (to.y - from.y) * ((t0 + t1) / 2) - sag + FLOOR_SLAB_METERS,
        1.45,
        "wood",
        ["bridge", "suspension-bridge", "vertical-route", "standable", "vertical-opening", "shaft-access", "site-program"],
      ));
    }
  }
  if (saltCrystal) {
    scene.primitives.push(
      water("salt-cavern-tide-pool", 3, width * 0.52, -feetToMeters(12), depth * 0.58, width * 0.72, 0.3, depth * 0.58, ["salt-crystal", "cavern-tide-pool", "watercourse", "hazard", "site-program"]),
      primitive("salt-cavern-column-west", "cone", 3, width * 0.12, -feetToMeters(16), depth * 0.25, 5.8, feetToMeters(54), 5.8, "ice", ["salt-crystal", "cavern-column", "vertical-landmark", "site-program"]),
      primitive("salt-cavern-column-east", "cone", 3, width * 0.9, -feetToMeters(16), depth * 0.36, 6.4, feetToMeters(62), 6.4, "ice", ["salt-crystal", "cavern-column", "vertical-landmark", "site-program"]),
      primitive("salt-cavern-column-north", "cone", 3, width * 0.55, -feetToMeters(16), depth * 0.05, 4.6, feetToMeters(48), 4.6, "rock", ["salt-crystal", "cavern-column", "vertical-landmark", "site-program"]),
      box("salt-cavern-pool-rim-west", 3, width * 0.18, -feetToMeters(10), depth * 0.58, 1.4, feetToMeters(5), depth * 0.42, "rock", ["salt-crystal", "cavern-tide-pool", "vertical-face", "site-program"]),
      box("salt-cavern-pool-rim-east", 3, width * 0.86, -feetToMeters(10), depth * 0.58, 1.4, feetToMeters(5), depth * 0.42, "rock", ["salt-crystal", "cavern-tide-pool", "vertical-face", "site-program"]),
    );
  }
  scene.routes.push(createRoute("floating-island-ascent", "vertical", [
    { x: islands[0]!.x, z: islands[0]!.z, y: 0 }, { x: islands[1]!.x, z: islands[1]!.z, y: feetToMeters(30) },
    { x: islands[1]!.x, z: islands[1]!.z, y: feetToMeters(30) }, { x: islands[2]!.x, z: islands[2]!.z, y: feetToMeters(65) },
  ], { purpose: "movement", traffic: 0.74, schedule: "all" }));
  scene.tactical.push(
    tacticalFeature("floating-bridge-choke-1", "chokepoint", islands[1]!.x, islands[1]!.z, feetToMeters(30), 2, "The first suspension bridge is the only direct ascent to the middle island."),
    tacticalFeature("floating-radio-overwatch", "highGround", islands[2]!.x, islands[2]!.z, feetToMeters(65), 4, saltCrystal ? "The highest salt-crystal island exposes the monastery bell tower and both bridge approaches." : "The highest basalt island dominates both lower approaches."),
  );
  return (x: number, z: number) => {
    let nearest = islands[0]!;
    let best = Number.POSITIVE_INFINITY;
    for (const island of islands) {
      const distance = Math.hypot(x - island.x, z - island.z);
      if (distance < best) { best = distance; nearest = island; }
    }
    return nearest.y;
  };
}

function addHollowTreeCity(scene: GeneratedScene, width: number, depth: number): void {
  const cx = width * 0.5;
  const cz = depth * 0.5;
  const outer = Math.min(width, depth) * 0.4;
  const inner = outer * 0.7;
  const trunkHeight = feetToMeters(58);
  for (let index = 0; index < 24; index += 1) {
    if (index === 4 || index === 5) continue;
    const angle = (Math.PI * 2 * index) / 24;
    const x = cx + Math.cos(angle) * (outer + 0.4);
    const z = cz + Math.sin(angle) * (outer + 0.4);
    const taper = 1 + Math.sin(index * 1.7) * 0.22;
    const lean = Math.sin(index * 1.19) * 0.12;
    scene.primitives.push(box(`hollow-tree-bark-${index + 1}`, 0, x, trunkHeight / 2 + feetToMeters(index % 3), z, 1.9 * taper, trunkHeight * (0.84 + (index % 4) * 0.045), 7.2 * taper, "wood", ["hollow-tree", "bark-wall", "vertical-face", "cover", "site-program"], angle + Math.PI / 2 + lean));
    if (index % 2 === 1) {
      const branchAngle = angle + (index % 4 - 1.5) * 0.22;
      scene.primitives.push(corridor(`hollow-tree-branch-${index + 1}`, 2, x, z, x + Math.cos(branchAngle) * 7, z + Math.sin(branchAngle) * 7, feetToMeters(36 + index % 3 * 5), 1.15, "wood", ["hollow-tree", "branch-bridge", "cover", "standable", "site-program"]));
    }
    if (index % 2 === 0) scene.primitives.push(cylinder(`hollow-tree-root-${index + 1}`, 0, x, FLOOR_SLAB_METERS, z, 1.1, feetToMeters(8 + index % 3 * 3), "wood", ["hollow-tree", "root-buttress", "cover", "site-program"]));
  }
  for (const [level, yFeet] of [0, 15, 35, 55].entries()) {
    const y = feetToMeters(yFeet) + FLOOR_SLAB_METERS;
    const radius = inner * (level === 0 ? 0.84 : level === 1 ? 0.66 : level === 2 ? 0.5 : 0.34);
    scene.primitives.push(corridor(`hollow-tree-ring-walk-${level + 1}`, level, cx - radius, cz, cx + radius, cz, y, 1.35, "wood", ["hollow-tree", "ring-walk", "standable", "site-program"]));
    scene.routes.push(createRoute(`hollow-tree-ring-route-${level + 1}`, level === 0 ? "primary" : "alternate", [
      { x: cx - radius, z: cz, y }, { x: cx, z: cz - radius * 0.72, y }, { x: cx + radius, z: cz, y },
    ], { purpose: "movement", traffic: 0.62, schedule: "all" }));
  }
  for (let step = 0; step < 28; step += 1) {
    const t = step / 27;
    const angle = -Math.PI * 0.4 + t * Math.PI * 4.2;
    const radius = inner * (0.72 - t * 0.22);
    const y = feetToMeters(2 + t * 50) + FLOOR_SLAB_METERS;
    scene.primitives.push(box(`hollow-tree-spiral-step-${step + 1}`, Math.floor(t * 4), cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius, 1.7, 0.22, 1.05, "wood", ["hollow-tree", "spiral-tree-street", "vertical-route", "standable", "site-program"], angle));
  }
  scene.routes.push(createRoute("hollow-tree-spiral-route", "vertical", [
    { x: cx + Math.cos(-Math.PI * 0.4) * inner * 0.72, z: cz + Math.sin(-Math.PI * 0.4) * inner * 0.72, y: feetToMeters(2) },
    { x: cx, z: cz - inner * 0.5, y: feetToMeters(27) },
    { x: cx + Math.cos(Math.PI * 3.8) * inner * 0.5, z: cz + Math.sin(Math.PI * 3.8) * inner * 0.5, y: feetToMeters(52) },
  ], { purpose: "movement", traffic: 0.72, schedule: "all" }));
  scene.primitives.push(
    primitive("hollow-tree-canopy-platform", "cylinder", 3, cx, feetToMeters(56), cz, inner * 0.33, 0.35, inner * 0.33, "moss", ["hollow-tree", "canopy-observatory", "high-ground", "standable", "site-program"]),
    box("hollow-tree-root-archive", 3, cx, -feetToMeters(10), cz + outer * 0.45, inner * 0.46, FLOOR_SLAB_METERS, inner * 0.3, "wood", ["hollow-tree", "root-archive", "underground", "standable", "site-program"]),
    stairs("hollow-tree-root-stairs", 4, cx, -feetToMeters(10), cz + outer * 0.28, 1.7, feetToMeters(10), 5.6, "wood", ["hollow-tree", "root-archive", "vertical-route", "vertical-opening", "shaft-access", "site-program"]),
  );
  for (let crown = 0; crown < 12; crown += 1) {
    const crownAngle = (Math.PI * 2 * crown) / 12 + 0.12;
    scene.primitives.push(primitive(
      `hollow-tree-canopy-crown-${crown + 1}`,
      "sphere",
      3,
      cx + Math.cos(crownAngle) * outer * 0.78,
      feetToMeters(58 + crown % 3 * 2),
      cz + Math.sin(crownAngle) * outer * 0.78,
      4.2 + crown % 3 * 0.65,
      feetToMeters(7 + crown % 2 * 2),
      4 + crown % 2 * 0.8,
      "moss",
      ["hollow-tree", "canopy", "blocks-sight", "site-program"],
    ));
  }
  scene.routes.push(createRoute("hollow-tree-root-descent", "vertical", [{ x: cx, z: cz, y: 0 }, { x: cx, z: cz + outer * 0.45, y: -feetToMeters(10) }], { purpose: "service", traffic: 0.34, schedule: "all" }));
  scene.tactical.push(
    tacticalFeature("hollow-tree-canopy-highground", "highGround", cx, cz, feetToMeters(56), 4, "The canopy observatory is the highest firing position inside the hollow trunk."),
    tacticalFeature("hollow-tree-rotten-void", "hazard", cx + outer * 0.55, cz - outer * 0.22, feetToMeters(18), 3, "A rotten opening in the bark creates a vertical fall hazard and alternate sightline."),
  );
}

function addMangroveSmugglerPort(scene: GeneratedScene, width: number, depth: number): void {
  const channelZ = depth * 0.52;
  const tidalSpine = [
    [width * 0.08, depth * 0.63],
    [width * 0.25, depth * 0.48],
    [width * 0.43, depth * 0.58],
    [width * 0.62, depth * 0.43],
    [width * 0.81, depth * 0.54],
    [width * 0.95, depth * 0.4],
  ] as const;
  for (let segment = 1; segment < tidalSpine.length; segment += 1) {
    const from = tidalSpine[segment - 1]!;
    const to = tidalSpine[segment]!;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const rotation = Math.atan2(to[1] - from[1], to[0] - from[0]);
    scene.primitives.push(water(
      `mangrove-main-channel-${segment}`,
      0,
      (from[0] + to[0]) / 2,
      -0.2,
      (from[1] + to[1]) / 2,
      length + 4,
      0.34,
      8.2,
      ["mangrove", "tidal-channel", "watercourse", "hazard", "site-program"],
      rotation,
    ));
  }
  scene.primitives.push(
    water("mangrove-tidal-branch-west", 0, width * 0.22, -0.16, depth * 0.27, 3.4, 0.25, depth * 0.42, ["mangrove", "tidal-channel", "watercourse", "site-program"]),
    water("mangrove-tidal-branch-east", 0, width * 0.78, -0.16, depth * 0.72, 3.8, 0.25, depth * 0.38, ["mangrove", "tidal-channel", "watercourse", "site-program"]),
  );
  const boardwalks = [
    [[width * 0.08, depth * 0.24], [width * 0.2, depth * 0.14], [width * 0.34, depth * 0.22], [width * 0.28, depth * 0.4], [width * 0.08, depth * 0.24]],
    [[width * 0.34, depth * 0.68], [width * 0.48, depth * 0.56], [width * 0.66, depth * 0.68], [width * 0.58, depth * 0.82], [width * 0.34, depth * 0.68]],
    [[width * 0.66, depth * 0.22], [width * 0.78, depth * 0.12], [width * 0.94, depth * 0.28], [width * 0.84, depth * 0.44], [width * 0.66, depth * 0.22]],
  ] as const;
  for (const [index, points] of boardwalks.entries()) {
    for (let segment = 1; segment < points.length; segment += 1) {
      const from = points[segment - 1]!;
      const to = points[segment]!;
      scene.primitives.push(corridor(`mangrove-root-boardwalk-${index + 1}-${segment}`, 0, from[0], from[1], to[0], to[1], FLOOR_SLAB_METERS + 0.7, 1.2, "wood", ["mangrove", "root-boardwalk", "standable", "site-program"]));
    }
    scene.routes.push(createRoute(`mangrove-boardwalk-route-${index + 1}`, "alternate", points.map(([x, z]) => ({ x, z, y: FLOOR_SLAB_METERS + 0.7 })), { purpose: "service", traffic: 0.58, schedule: "all" }));
  }
  scene.primitives.push(corridor("mangrove-ferry-bridge-west", 0, width * 0.34, depth * 0.68, width * 0.28, depth * 0.4, FLOOR_SLAB_METERS + 0.7, 0.9, "wood", ["mangrove", "root-boardwalk", "bridge", "standable", "site-program"]));
  scene.routes.push(createRoute("mangrove-ferry-route", "alternate", [
    { x: width * 0.34, z: depth * 0.68, y: FLOOR_SLAB_METERS + 0.7 },
    { x: width * 0.28, z: depth * 0.4, y: FLOOR_SLAB_METERS + 0.7 },
  ], { purpose: "movement", traffic: 0.36, schedule: "all" }));
  for (let index = 0; index < 30; index += 1) {
    const x = width * (0.1 + ((index * 0.173) % 0.8));
    const z = depth * (0.12 + ((index * 0.287) % 0.74));
    scene.primitives.push(
      cylinder(`mangrove-root-pillar-${index + 1}`, 0, x, 0, z, 0.55 + (index % 3) * 0.18, feetToMeters(7 + index % 4 * 2), "wood", ["mangrove", "prop-root", "cover", "standable", "site-program"]),
      primitive(`mangrove-canopy-${index + 1}`, "sphere", 2, x + Math.sin(index) * 1.2, feetToMeters(12 + index % 3 * 2), z + Math.cos(index) * 1.2, 2.2 + (index % 3) * 0.42, 1.35, 2.1 + (index % 2) * 0.4, "moss", ["mangrove", "canopy", "blocks-sight", "site-program"]),
    );
  }
  scene.primitives.push(
    corridor("mangrove-wreck-dock", 0, width * 0.72, channelZ, width * 0.72, depth * 0.88, FLOOR_SLAB_METERS + 0.9, 1.8, "wood", ["mangrove", "smuggler-dock", "wreck-field", "standable", "site-program"]),
    box("mangrove-underwater-entry", 0, width * 0.2, -feetToMeters(4), channelZ, 3.4, feetToMeters(5), 2.2, "darkStone", ["mangrove", "underwater-entry", "portal", "hazard", "site-program"]),
    cylinder("mangrove-patrol-tower", 1, width * 0.84, feetToMeters(9), depth * 0.3, 1.6, feetToMeters(18), "wood", ["mangrove", "patrol-tower", "high-ground", "site-program"]),
  );
  scene.tactical.push(
    tacticalFeature("mangrove-channel-choke", "chokepoint", width * 0.5, channelZ, -0.2, 3, "The tidal channel divides the village and forces movement onto exposed root boardwalks."),
    tacticalFeature("mangrove-tower-overwatch", "highGround", width * 0.84, depth * 0.3, feetToMeters(18), 2, "The patrol tower watches the smuggler dock and both boardwalk approaches."),
  );
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
      : program.requiredFeatures.includes("volcanic-settlement") ? "The Cinder-Rim Village"
        : program.requiredFeatures.includes("ice-crevasse-settlement") ? "The Blue-Deep Hold"
        : program.requiredFeatures.includes("underdark-settlement") ? "The Deep-Shelf Enclave"
          : program.requiredFeatures.includes("tower-city") ? "The Many-Ring Tower City"
            : program.requiredFeatures.includes("vertical-slum") ? "The Pier-Hung Market"
              : program.requiredFeatures.includes("bone-swamp-settlement") ? "The Fossil-Marsh Village"
        : program.requiredFeatures.includes("airship-wreck-settlement") ? "The Fallen Airframe Camp"
      : program.requiredFeatures.includes("hollow-tree-city") ? "The Hollow-Heart Canopy"
        : program.requiredFeatures.includes("mangrove-smuggler-port") ? "The Rootbound Smuggler Port"
          : program.requiredFeatures.includes("salt-crystal-monastery") ? "The Salt-Crystal Ascendancy"
      : program.siteType === "harbor-district" ? "The Layered Quays"
        : program.siteType === "village" ? "The Living Crossroads"
          : program.siteType === "mining-settlement" ? "Orewater Camp"
            : program.morphology.growth === "organic" ? "The Accreted Ward" : "The Planned Ward";
  const authoredFloors = program.requiredFeatures.includes("hollow-tree-city") ? 5 : 4;
  const scene = baseScene("settlement", settlementTitle, `${program.siteType} compiled as a ${program.morphology.era} ${program.morphology.roadPattern} settlement from terrain constraints, districts, hierarchical roads, frontage parcels and independently seeded buildings.`, context.request.seed, program.bounds, authoredFloors, program.requiredFeatures.includes("hollow-tree-city") ? [12, 10, 10, 10, 10] : [12, 10, 8, 10]);
  scene.archetype = archetype;
  scene.floorLabels = program.requiredFeatures.includes("hollow-tree-city")
    ? ["根部/1F", "树干下层", "树干上层", "树冠", "根系档案库"]
    : ["地面/1F", "主要上层", "屋顶", "B1"];
  const terrain = compileSettlementTerrain(program, context.request.prompt, context.rng.fork("settlement-terrain"));
  program.terrain.kind = terrain.summary.kind;
  program.terrain.buildableRatio = terrain.summary.buildableRatio;
  program.terrain.elevationBandsFeet = terrain.summary.elevationBandsFeet;
  scene.siteProgram = summarizeSiteProgram(program);
  scene.terrainProgram = terrain.summary;
  const landDepth = program.siteType === "harbor-district" ? program.bounds.z - 8 : program.bounds.z;
  const isFloating = (context.sceneProgram?.morphology.includes("floating-islands") ?? false) || program.requiredFeatures.includes("salt-crystal-monastery");
  const isHollowTree = program.requiredFeatures.includes("hollow-tree-city");
  const isMangrovePort = program.requiredFeatures.includes("mangrove-smuggler-port");
  const isMountainMonastery = program.requiredFeatures.includes("mountain-monastery") || program.requiredFeatures.includes("hillside-district");
  const isFlooded = program.requiredFeatures.includes("flooded-site");
  const legacySpecialElevation = isFloating || isMountainMonastery;
  const elevationAt = isFloating ? addFloatingIslandTerrain(scene, program.bounds.x, program.bounds.z, program.requiredFeatures.includes("salt-crystal-monastery")) : isMountainMonastery ? addMountainTerraces(scene, program.bounds.x, program.bounds.z) : terrain.elevationAt;
  if (!legacySpecialElevation) terrain.render(scene);
  else if (!isFloating) scene.primitives.push(box("site-terrain-base", 0, program.bounds.x / 2, 0, landDepth / 2, program.bounds.x, FLOOR_SLAB_METERS, landDepth, "earth", ["floor", "terrain", "site-program", `site:${program.siteType}`]));
  if (isHollowTree) addHollowTreeCity(scene, program.bounds.x, program.bounds.z);
  if (isMangrovePort) addMangroveSmugglerPort(scene, program.bounds.x, program.bounds.z);
  // Districts are planning ownership, not giant coloured floor decals. Their
  // identity is made legible by parcel use, landmarks and road hierarchy.
  const semanticTerrain = ["river", "impact-crater", "caldera", "ice-crevasse", "underdark", "megastructure", "bridge-megastructure", "coastal-cliff", "swamp-bone", "wreck-field"].includes(terrain.summary.kind) || isFloating || isHollowTree || isMangrovePort;
  if (!semanticTerrain) addBlockAndParcelSurfaces(scene, program, elevationAt);
  if (!semanticTerrain) {
    for (const road of program.roads) scene.primitives.push(...roadPieces(road, legacySpecialElevation ? { ...terrain, elevationAt, surfaceAt: () => "ground" } : terrain));
    addRoadJunctions(scene, program, elevationAt);
  }
  if (!semanticTerrain) addOpenSpaces(scene, program, elevationAt);
  if (program.siteType === "harbor-district" && terrain.summary.kind !== "coastal-cliff") addHarbor(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (program.siteType === "village" && !semanticTerrain) addVillageLandmarks(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (!isFloating && !semanticTerrain && (program.siteType === "city-district" || program.siteType === "town")) addUrbanDefences(scene, program.bounds.x, program.bounds.z);
  if (program.siteType === "mining-settlement" && !semanticTerrain) {
    addMiningValley(scene, program.bounds.x, program.bounds.z);
    scene.primitives.push(corridor("mining-cart-track", 0, 1, program.bounds.z * 0.28, program.bounds.x - 2, program.bounds.z * 0.72, FLOOR_SLAB_METERS + 0.08, 1.4, "metal", ["mine-cart-track", "industrial-route", "site-program"]));
    scene.primitives.push(box("mining-waste-slope", 0, program.bounds.x * 0.82, feetToMeters(5), program.bounds.z * 0.2, 9, feetToMeters(10), 8, "rock", ["waste-rock", "slope", "high-ground", "site-program"]));
  }
  if (program.requiredFeatures.includes("industrial-plant") || program.requiredFeatures.includes("rail-yard")) addIndustrialSite(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (isFlooded) addFloodedSite(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("elevated-rail")) addElevatedRailMarket(scene, program.bounds.x, program.bounds.z);
  // Water, impact, volcanic, underdark and megastructure parents are now
  // realized by TerrainProgram before any road or building is emitted.
  if (program.requiredFeatures.includes("gate-district")) addGateDistrict(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("war-damaged")) addWarDamage(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("vertical-slum")) addVerticalSlum(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("colony-port")) addColonyPort(scene, program.bounds.x, program.bounds.z);
  if (program.requiredFeatures.includes("river-crossing") && program.siteType !== "village" && program.siteType !== "mining-settlement" && program.siteType !== "harbor-district") addRiverCrossingSite(scene, program.bounds.x, program.bounds.z);

  const nearestBuildable = (x: number, z: number, clearance: number): { x: number; z: number; elevationFeet?: number } | undefined => {
    if (legacySpecialElevation || terrain.buildableAt(x, z, clearance)) return { x, z };
    for (let radius = 1; radius <= 12; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const candidate = { x: x + dx, z: z + dz };
        if (terrain.buildableAt(candidate.x, candidate.z, clearance)) return candidate;
      }
    }
    return undefined;
  };
  let adaptedBuildings = 0;
  const mangroveBuildingNodes = [
    [program.bounds.x * 0.18, program.bounds.z * 0.48],
    [program.bounds.x * 0.32, program.bounds.z * 0.62],
    [program.bounds.x * 0.47, program.bounds.z * 0.46],
    [program.bounds.x * 0.62, program.bounds.z * 0.58],
    [program.bounds.x * 0.78, program.bounds.z * 0.42],
    [program.bounds.x * 0.88, program.bounds.z * 0.56],
  ] as const;
  const mangroveRootWaypoints = [
    [program.bounds.x * 0.1, program.bounds.z * 0.18],
    [program.bounds.x * 0.24, program.bounds.z * 0.31],
    [program.bounds.x * 0.36, program.bounds.z * 0.47],
    [program.bounds.x * 0.39, program.bounds.z * 0.67],
    [program.bounds.x * 0.54, program.bounds.z * 0.52],
    [program.bounds.x * 0.7, program.bounds.z * 0.34],
    [program.bounds.x * 0.66, program.bounds.z * 0.18],
    [program.bounds.x * 0.78, program.bounds.z * 0.31],
    [program.bounds.x * 0.91, program.bounds.z * 0.51],
  ] as const;
  for (const parcel of program.parcels) {
    if (terrain.summary.kind === "bridge-megastructure" && adaptedBuildings >= 9) continue;
    if (isMangrovePort && adaptedBuildings >= Math.max(12, Math.round(program.parcels.length * 0.68))) continue;
    const district = program.districts.find((candidate) => candidate.id === parcel.districtId);
    const clearance = Math.min(2, Math.max(parcel.buildingSize.x, parcel.buildingSize.z) * 0.18);
    const semanticPlacement = semanticTerrain ? terrain.placementFor(adaptedBuildings, program.parcels.length, parcel.center, clearance) : undefined;
    const mangroveNode = isMangrovePort ? mangroveBuildingNodes[adaptedBuildings % mangroveBuildingNodes.length] : undefined;
    const mangroveSide = isMangrovePort ? (adaptedBuildings % 2 === 0 ? -1 : 1) : 0;
    const mangrovePlacement: { x: number; z: number; elevationFeet?: number } | undefined = mangroveNode ? {
      x: mangroveNode[0] + mangroveSide * (4.5 + (adaptedBuildings % 3) * 1.3),
      z: mangroveNode[1] + Math.sin(adaptedBuildings * 1.7) * 2.2,
    } : undefined;
    const placement = mangrovePlacement ?? semanticPlacement ?? nearestBuildable(parcel.center.x, parcel.center.z, clearance);
    if (!placement) continue;
    const siteElevation = isFlooded ? feetToMeters(5) : placement.elevationFeet === undefined ? elevationAt(placement.x, placement.z) : feetToMeters(placement.elevationFeet);
    instantiateBuildingModule(scene, {
      id: `settlement-building-${parcel.id.replace("parcel-", "")}`,
      kind: parcel.buildingKind,
      x: placement.x,
      z: placement.z,
      width: parcel.buildingSize.x,
      depth: parcel.buildingSize.z,
      rotation: parcel.rotationY,
      district: district?.role ?? parcel.districtId,
      seed: parcel.buildingSeed,
      lod: parcel.lod,
      parcelId: parcel.id,
      frontageRoadId: parcel.frontageRoadId,
      entrance: placement,
      baseY: siteElevation + FLOOR_SLAB_METERS,
      state: parcel.state,
    }, context.rng.fork(parcel.buildingSeed));
    adaptedBuildings += 1;
    const useParentRootAccess = isMangrovePort && (adaptedBuildings < 3 || (parcel.lod === "full-interior" && adaptedBuildings < 5));
    if (useParentRootAccess) {
      const rootAnchor = mangroveRootWaypoints.reduce((best, candidate) => {
        const bestDistance = Math.hypot(placement.x - best[0], placement.z - best[1]);
        const candidateDistance = Math.hypot(placement.x - candidate[0], placement.z - candidate[1]);
        return candidateDistance < bestDistance ? candidate : best;
      }, mangroveRootWaypoints[0]!);
      const midpoint = {
        x: (rootAnchor[0] + placement.x) / 2 + Math.sin(adaptedBuildings * 1.4) * 1.2,
        z: (rootAnchor[1] + placement.z) / 2 + Math.cos(adaptedBuildings * 1.4) * 1.2,
      };
      const accessY = siteElevation + FLOOR_SLAB_METERS + 0.06;
      const accessTags = ["parcel-access", "entrance-route", `parcel:${parcel.id}`, "site-program", "standable", "terrain-adapted", "root-boardwalk"];
      scene.primitives.push(
        corridor(`parcel-access-${parcel.id}-root`, 0, rootAnchor[0], rootAnchor[1], midpoint.x, midpoint.z, FLOOR_SLAB_METERS + 0.7, 0.72, "wood", accessTags),
        corridor(`parcel-access-${parcel.id}-door`, 0, midpoint.x, midpoint.z, placement.x, placement.z, accessY, 0.72, "wood", accessTags),
      );
      scene.routes.push(createRoute(`parcel-root-route-${parcel.id}`, "alternate", [
        { x: rootAnchor[0], z: rootAnchor[1], y: FLOOR_SLAB_METERS + 0.7 },
        { x: midpoint.x, z: midpoint.z, y: FLOOR_SLAB_METERS + 0.7 },
        { x: placement.x, z: placement.z, y: accessY },
      ], { purpose: "service", traffic: 0.46, schedule: "all" }));
    } else {
      scene.primitives.push(corridor(
        `parcel-access-${parcel.id}`,
        0,
        placement.x - 1.4,
        placement.z,
        placement.x,
        placement.z,
        siteElevation + FLOOR_SLAB_METERS + 0.06,
        parcel.lod === "full-interior" ? 1.4 : 1,
        program.siteType === "village" ? "earth" : "stone",
        ["parcel-access", "entrance-route", `parcel:${parcel.id}`, "site-program", "standable", "terrain-adapted"],
      ));
    }
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

  if (!semanticTerrain) for (const road of program.roads) scene.routes.push(createRoute(`route-${road.id}`, road.hierarchy === "arterial" ? "primary" : "alternate", road.points.map((point) => ({ ...point, y: elevationAt(point.x, point.z) })), { purpose: road.purpose === "cargo" || road.purpose === "service" ? "service" : "crowd", traffic: road.hierarchy === "arterial" ? 0.94 : road.hierarchy === "street" ? 0.86 : road.hierarchy === "lane" || road.hierarchy === "trail" ? 0.44 : 0.7, schedule: road.purpose === "patrol" ? "night" : road.purpose === "service" ? "all" : "day" }));
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
  scene.diagnostics.metrics.terrainBuildableRatio = terrain.summary.buildableRatio;
  scene.diagnostics.metrics.terrainElevationRangeFeet = terrain.summary.maximumElevationFeet - terrain.summary.minimumElevationFeet;
  scene.diagnostics.metrics.terrainAdaptedBuildings = adaptedBuildings;
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
  const bridgeCount = scene.primitives.filter((primitive) => primitive.tags?.some((tag) => tag === "bridge" || tag.includes("bridge"))).length;
  const verticalConnectionCount = scene.primitives.filter((primitive) => primitive.tags?.some((tag) => tag === "vertical-route" || tag === "vertical-opening")).length;
  scene.settlementAdaptation = {
    version: 1,
    terrainKind: terrain.summary.kind,
    roadMode: semanticTerrain ? "terrain-owned" : "planned",
    relocatedBuildings: adaptedBuildings,
    supportSurfaceCount: terrain.summary.supportSurfaces,
    bridgeCount,
    verticalConnectionCount,
    elevationRangeFeet: terrain.summary.maximumElevationFeet - terrain.summary.minimumElevationFeet,
  };
  return scene;
}
