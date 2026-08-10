import type { BuildingInstance, GeneratedScene, GeneratorContext, ScenePrimitive } from "../schema";
import { planSettlementSite, summarizeSiteProgram, type RoadProgram } from "../site-program";
import { instantiateBuildingModule } from "./buildingModule";
import { classifySettlementArchetype } from "./settlement";
import { compileSettlementTerrain, type SettlementTerrain, type TerrainCrossingCandidate } from "./settlementTerrain";
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
      const contourRoad = terrain.summary.kind === "coastal-cliff";
      return corridor(`site-${road.id}-${index + 1}-${step + 1}`, 0, from.x, from.z, to.x, to.z, terrain.elevationAt(mx, mz) + FLOOR_SLAB_METERS + 0.02, road.widthCells, contourRoad ? "earth" : road.hierarchy === "trail" ? "earth" : "stone", ["road", `road:${road.hierarchy}`, `purpose:${road.purpose}`, "site-program", "standable", "terrain-adapted", ...(contourRoad ? ["contour-road", "cliff-route"] : [])]);
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

/**
 * A settlement may contain many unrelated cellars. Explicit functional
 * modules (archives, submerged rooms, greenhouses, laboratories) need a
 * coherent inspection target instead of shrinking every basement into one
 * unreadable overview. Group each authored module by building instance; the
 * renderer can then select the largest cluster on the numeric basement view.
 */
function tagFunctionalInspectionClusters(scene: GeneratedScene): void {
  const groups = new Map<string, ScenePrimitive[]>();
  for (const primitive of scene.primitives) {
    if (primitive.level !== 3) continue;
    const functionTag = primitive.tags?.find((tag) => tag.startsWith("function:"));
    const buildingTag = primitive.tags?.find((tag) => tag.startsWith("building-instance:"));
    if (!functionTag || !buildingTag) continue;
    const key = `${functionTag}|${buildingTag}`;
    const group = groups.get(key) ?? [];
    group.push(primitive);
    groups.set(key, group);
  }
  for (const [key, primitives] of groups) {
    if (primitives.length < 3) continue;
    const [functionTag, buildingTag] = key.split("|");
    const functionName = functionTag?.slice("function:".length) || "module";
    const buildingName = buildingTag?.slice("building-instance:".length) || "building";
    const clusterTag = `focus-cluster:${functionName}:${buildingName}`;
    for (const primitive of primitives) primitive.tags = [...new Set([...(primitive.tags ?? []), clusterTag])];
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

function orthogonalRelay(from: { x: number; z: number }, to: { x: number; z: number }, index: number): { x: number; z: number } {
  // Parent-terrain access is a constructed boardwalk, not a sightline-spanning
  // road.  Split diagonal links into two short orthogonal legs so the top view
  // reads as local circulation around water/root obstacles.
  const xFirst = (index + Math.round((from.x + to.z) * 10)) % 2 === 0;
  return xFirst ? { x: to.x, z: from.z } : { x: from.x, z: to.z };
}

function addOrthogonalAccess(
  scene: GeneratedScene,
  id: string,
  from: { x: number; z: number; y: number },
  to: { x: number; z: number; y: number },
  index: number,
  width: number,
  material: "wood" | "stone" | "earth" = "wood",
  tags: string[] = [],
): { x: number; z: number; y: number }[] {
  const relay = orthogonalRelay(from, to, index);
  const points = [
    from,
    { ...relay, y: from.y },
    to,
  ];
  for (let segment = 1; segment < points.length; segment += 1) {
    const previous = points[segment - 1]!;
    const current = points[segment]!;
    if (Math.hypot(current.x - previous.x, current.z - previous.z) < 0.05) continue;
    scene.primitives.push(corridor(
      `${id}-${segment}`,
      0,
      previous.x,
      previous.z,
      current.x,
      current.z,
      (previous.y + current.y) / 2,
      width,
      material,
      [...tags, "orthogonal-relay"],
    ));
  }
  return points;
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

function addMangroveSmugglerPort(scene: GeneratedScene, width: number, depth: number, density: number, rng: GeneratorContext["rng"]): void {
  // The wetland is a parent terrain grammar, not a fixed decorative layer.
  // This macro stream chooses a different channel topology per seed while
  // keeping every branch connected to the central tidal basin.
  const macro = rng.fork("mangrove-macro");
  const channelZ = depth * macro.float(0.42, 0.62);
  const channelX = width * macro.float(0.44, 0.58);
  const branchBand = Math.min(5, Math.max(2, 2 + Math.round(density * 2)));
  const branchCount = Math.min(5, Math.max(2, branchBand + macro.int(-1, 1)));
  const tidalBranches = Array.from({ length: branchCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const startX = side < 0 ? width * macro.float(0.04, 0.18) : width * macro.float(0.82, 0.96);
    const endX = side < 0 ? width * macro.float(0.3, 0.46) : width * macro.float(0.54, 0.7);
    const startZ = depth * macro.float(0.22, 0.78);
    const midZ = channelZ + depth * macro.float(-0.15, 0.15);
    const endZ = channelZ + depth * macro.float(-0.08, 0.08);
    return [[startX, startZ], [width * macro.float(side < 0 ? 0.2 : 0.7, side < 0 ? 0.38 : 0.8), midZ], [endX, endZ]] as const;
  });
  for (const [branchIndex, branch] of tidalBranches.entries()) {
    for (let segment = 1; segment < branch.length; segment += 1) {
      const from = branch[segment - 1]!;
      const to = branch[segment]!;
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const rotation = Math.atan2(to[1] - from[1], to[0] - from[0]);
      scene.primitives.push(water(
        `mangrove-tidal-branch-${branchIndex + 1}-${segment}`,
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
  }
  scene.primitives.push(
    water("mangrove-central-tidal-bay", 0, channelX, -0.24, channelZ, width * macro.float(0.2, 0.3), 0.28, depth * macro.float(0.18, 0.27), ["mangrove", "tidal-channel", "tidal-bay", "watercourse", "hazard", "site-program"]),
    water("mangrove-tidal-branch-west", 0, width * macro.float(0.16, 0.28), -0.16, depth * macro.float(0.18, 0.34), 3.4, 0.25, depth * macro.float(0.32, 0.5), ["mangrove", "tidal-channel", "watercourse", "site-program"]),
    water("mangrove-tidal-branch-east", 0, width * macro.float(0.72, 0.86), -0.16, depth * macro.float(0.62, 0.82), 3.8, 0.25, depth * macro.float(0.3, 0.46), ["mangrove", "tidal-channel", "watercourse", "site-program"]),
  );
  const loopBand = Math.min(5, Math.max(2, 2 + Math.round(density * 2)));
  const loopCount = Math.min(5, Math.max(2, loopBand + macro.int(-1, 1)));
  const boardwalks = Array.from({ length: loopCount }, (_, index) => {
    const cx = width * macro.float(0.14, 0.86);
    const cz = depth * macro.float(0.18, 0.82);
    const rx = width * macro.float(0.08, 0.2);
    const rz = depth * macro.float(0.08, 0.2);
    const points = Array.from({ length: 6 }, (_, pointIndex) => {
      const angle = (Math.PI * 2 * pointIndex) / 5 + macro.float(-0.2, 0.2);
      return [cx + Math.cos(angle) * rx, cz + Math.sin(angle) * rz] as const;
    });
    points.push(points[0]!);
    return points;
  });
  for (const [index, points] of boardwalks.entries()) {
    const walkPoints: Array<{ x: number; z: number }> = [{ x: points[0]![0], z: points[0]![1] }];
    for (let segment = 1; segment < points.length; segment += 1) {
      const from = walkPoints[walkPoints.length - 1]!;
      const to = { x: points[segment]![0], z: points[segment]![1] };
      const relay = orthogonalRelay(from, to, index + segment);
      // Keep the authored loop shape, but express every long turn as short
      // supported legs. This prevents a single diagonal boardwalk from
      // visually becoming the settlement's main axis in the top view.
      walkPoints.push(relay, to);
    }
    for (let segment = 1; segment < walkPoints.length; segment += 1) {
      const from = walkPoints[segment - 1]!;
      const to = walkPoints[segment]!;
      if (Math.hypot(to.x - from.x, to.z - from.z) < 0.05) continue;
      scene.primitives.push(corridor(`mangrove-root-boardwalk-${index + 1}-${segment}`, 0, from.x, from.z, to.x, to.z, FLOOR_SLAB_METERS + 0.7, 1.2, "wood", ["mangrove", "root-boardwalk", "standable", "site-program", "orthogonal-relay"]));
    }
    scene.routes.push(createRoute(`mangrove-boardwalk-route-${index + 1}`, "alternate", walkPoints.map(({ x, z }) => ({ x, z, y: FLOOR_SLAB_METERS + 0.7 })), { purpose: "service", traffic: 0.58, schedule: "all" }));
  }
  const ferryFrom = { x: width * macro.float(0.26, 0.44), z: depth * macro.float(0.58, 0.78) };
  const ferryTo = { x: width * macro.float(0.18, 0.36), z: depth * macro.float(0.3, 0.5) };
  const ferryPoints = addOrthogonalAccess(
    scene,
    "mangrove-ferry-bridge-west",
    { ...ferryFrom, y: FLOOR_SLAB_METERS + 0.7 },
    { ...ferryTo, y: FLOOR_SLAB_METERS + 0.7 },
    17,
    0.9,
    "wood",
    ["mangrove", "root-boardwalk", "bridge", "standable", "site-program"],
  );
  scene.routes.push(createRoute("mangrove-ferry-route", "alternate", ferryPoints, { purpose: "movement", traffic: 0.36, schedule: "all" }));
  const rootCount = 18 + Math.round(density * 26) + macro.int(-3, 3);
  for (let index = 0; index < rootCount; index += 1) {
    const x = width * macro.float(0.06, 0.94);
    const z = depth * macro.float(0.08, 0.92);
    scene.primitives.push(
      cylinder(`mangrove-root-pillar-${index + 1}`, 0, x, 0, z, 0.55 + (index % 3) * 0.18, feetToMeters(7 + index % 4 * 2), "wood", ["mangrove", "prop-root", "cover", "standable", "site-program"]),
      primitive(`mangrove-canopy-${index + 1}`, "sphere", 2, x + Math.sin(index) * 1.2, feetToMeters(12 + index % 3 * 2), z + Math.cos(index) * 1.2, 2.2 + (index % 3) * 0.42, 1.35, 2.1 + (index % 2) * 0.4, "moss", ["mangrove", "canopy", "blocks-sight", "site-program"]),
    );
  }
  scene.primitives.push(
    corridor("mangrove-wreck-dock", 0, width * macro.float(0.6, 0.84), channelZ, width * macro.float(0.58, 0.86), depth * macro.float(0.78, 0.94), FLOOR_SLAB_METERS + 0.9, 1.8, "wood", ["mangrove", "smuggler-dock", "wreck-field", "standable", "site-program"]),
    box("mangrove-underwater-entry", 0, width * macro.float(0.12, 0.3), -feetToMeters(4), channelZ, 3.4, feetToMeters(5), 2.2, "darkStone", ["mangrove", "underwater-entry", "portal", "hazard", "site-program"]),
    cylinder("mangrove-patrol-tower", 1, width * macro.float(0.72, 0.9), feetToMeters(9), depth * macro.float(0.18, 0.38), 1.6, feetToMeters(18), "wood", ["mangrove", "patrol-tower", "high-ground", "site-program"]),
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

function addMineRemnantAtoms(scene: GeneratedScene, width: number, depth: number, features: readonly string[]): void {
  const portalX = width * 0.86;
  const portalZ = depth * 0.13;
  const trackEnd = { x: width * 0.55, z: depth * 0.43 };
  scene.primitives.push(
    box("mine-remnant-portal-left", 0, portalX - 1.65, 0, portalZ, 0.72, feetToMeters(9), 2.6, "darkStone", ["mine-remnant", "mine-entrance", "portal", "opening", "site-program"]),
    box("mine-remnant-portal-right", 0, portalX + 1.65, 0, portalZ, 0.72, feetToMeters(9), 2.6, "darkStone", ["mine-remnant", "mine-entrance", "portal", "opening", "site-program"]),
    box("mine-remnant-portal-lintel", 0, portalX, feetToMeters(7), portalZ, 4.05, feetToMeters(2.2), 2.6, "darkStone", ["mine-remnant", "mine-entrance", "portal", "opening", "site-program"]),
    corridor("mine-remnant-track-left", 0, portalX - 0.55, portalZ + 0.8, trackEnd.x - 0.55, trackEnd.z, FLOOR_SLAB_METERS + 0.08, 0.18, "metal", ["mine-remnant", "mine-cart-track", "rail", "site-program"]),
    corridor("mine-remnant-track-right", 0, portalX + 0.55, portalZ + 0.8, trackEnd.x + 0.55, trackEnd.z, FLOOR_SLAB_METERS + 0.08, 0.18, "metal", ["mine-remnant", "mine-cart-track", "rail", "site-program"]),
  );
  const trackLength = Math.hypot(trackEnd.x - portalX, trackEnd.z - (portalZ + 0.8));
  const sleeperCount = Math.max(5, Math.floor(trackLength / 1.5));
  for (let index = 0; index <= sleeperCount; index += 1) {
    const t = index / sleeperCount;
    const x = portalX + (trackEnd.x - portalX) * t;
    const z = portalZ + 0.8 + (trackEnd.z - portalZ - 0.8) * t;
    scene.primitives.push(box(`mine-remnant-sleeper-${index + 1}`, 0, x, FLOOR_SLAB_METERS + 0.04, z, 1.7, 0.12, 0.28, "wood", ["mine-remnant", "mine-cart-track", "rail-sleeper", "site-program"], Math.atan2(trackEnd.x - portalX, trackEnd.z - portalZ)));
  }
  scene.routes.push(createRoute("mine-remnant-cart-route", "alternate", [
    { x: portalX, z: portalZ, y: FLOOR_SLAB_METERS },
    { x: width * 0.72, z: depth * 0.27, y: FLOOR_SLAB_METERS },
    { x: trackEnd.x, z: trackEnd.z, y: FLOOR_SLAB_METERS },
  ], { purpose: "service", traffic: 0.46, schedule: "all" }));
  scene.tactical.push(tacticalFeature("mine-remnant-portal-choke", "chokepoint", portalX, portalZ, 0, 1.5, "The old mine mouth and paired rails form a readable service approach and ambush threshold."));

  if (!features.includes("underground-well")) return;
  const wellX = width * 0.33;
  const wellZ = depth * 0.62;
  const shaftY = -feetToMeters(12);
  const ring = 1.9;
  scene.primitives.push(
    box("underground-well-ring-north", 0, wellX, FLOOR_SLAB_METERS, wellZ - ring / 2, ring + 0.5, feetToMeters(2.5), 0.35, "stone", ["underground-well", "well-rim", "cover", "site-program"]),
    box("underground-well-ring-south", 0, wellX, FLOOR_SLAB_METERS, wellZ + ring / 2, ring + 0.5, feetToMeters(2.5), 0.35, "stone", ["underground-well", "well-rim", "cover", "site-program"]),
    box("underground-well-ring-west", 0, wellX - ring / 2, FLOOR_SLAB_METERS, wellZ, 0.35, feetToMeters(2.5), ring, "stone", ["underground-well", "well-rim", "cover", "site-program"]),
    box("underground-well-ring-east", 0, wellX + ring / 2, FLOOR_SLAB_METERS, wellZ, 0.35, feetToMeters(2.5), ring, "stone", ["underground-well", "well-rim", "cover", "site-program"]),
    box("underground-well-shaft-bottom", 3, wellX, shaftY, wellZ, 1.5, FLOOR_SLAB_METERS, 1.5, "darkStone", ["underground-well", "shaft-bottom", "underground", "standable", "site-program"]),
    stairs("underground-well-ladder", 3, wellX + 0.62, shaftY, wellZ, 0.72, feetToMeters(12), 1.4, "wood", ["underground-well", "vertical-route", "ladder", "standable", "site-program"]),
    cylinder("underground-well-winch-post-a", 0, wellX - 1.2, FLOOR_SLAB_METERS, wellZ, 0.18, feetToMeters(7), "wood", ["underground-well", "winch", "support", "site-program"]),
    cylinder("underground-well-winch-post-b", 0, wellX + 1.2, FLOOR_SLAB_METERS, wellZ, 0.18, feetToMeters(7), "wood", ["underground-well", "winch", "support", "site-program"]),
    corridor("underground-well-winch-beam", 0, wellX - 1.2, wellZ, wellX + 1.2, wellZ, feetToMeters(7), 0.2, "wood", ["underground-well", "winch", "support", "site-program"]),
  );
  scene.routes.push(createRoute("underground-well-route", "vertical", [
    { x: wellX + 0.62, z: wellZ, y: FLOOR_SLAB_METERS },
    { x: wellX + 0.62, z: wellZ, y: shaftY },
  ], { purpose: "service", traffic: 0.18, schedule: "all" }));
  scene.tactical.push(tacticalFeature("underground-well-hazard", "hazard", wellX, wellZ, shaftY, 1.2, "The accessible well shaft creates a vertical escape route and a dangerous open drop."));
}

function addTerrainBoundMaintenanceBridge(scene: GeneratedScene, crossing: TerrainCrossingCandidate): void {
  const dx = crossing.to.x - crossing.from.x;
  const dz = crossing.to.z - crossing.from.z;
  const span = Math.max(0.001, Math.hypot(dx, dz));
  const normal = { x: -dz / span, z: dx / span };
  const deckY = feetToMeters(crossing.deckElevationFeet) + FLOOR_SLAB_METERS;
  const segmentCount = Math.max(5, Math.ceil(crossing.spanCells / 2.2));
  const commonTags = ["conveyor-network", "maintenance-bridge", "terrain-bound-maintenance-bridge", "hazard-crossing", `crosses:${crossing.hazard}`, "standable", "high-ground", "site-program"];
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const t0 = segment / segmentCount;
    const t1 = (segment + 1) / segmentCount;
    const from = { x: crossing.from.x + dx * t0, z: crossing.from.z + dz * t0 };
    const to = { x: crossing.from.x + dx * t1, z: crossing.from.z + dz * t1 };
    scene.primitives.push(
      corridor(`terrain-maintenance-bridge-deck-${segment + 1}`, 1, from.x, from.z, to.x, to.z, deckY, 2.25, "metal", [...commonTags, "bridge-deck", "wide-crossing"]),
      corridor(`terrain-maintenance-bridge-rail-a-${segment + 1}`, 1, from.x + normal.x * 0.96, from.z + normal.z * 0.96, to.x + normal.x * 0.96, to.z + normal.z * 0.96, deckY + feetToMeters(3.8), 0.16, "metal", [...commonTags, "guardrail"]),
      corridor(`terrain-maintenance-bridge-rail-b-${segment + 1}`, 1, from.x - normal.x * 0.96, from.z - normal.z * 0.96, to.x - normal.x * 0.96, to.z - normal.z * 0.96, deckY + feetToMeters(3.8), 0.16, "metal", [...commonTags, "guardrail"]),
    );
  }
  for (const [side, point] of [["a", crossing.from], ["b", crossing.to]] as const) {
    const groundY = feetToMeters(point.elevationFeet);
    const supportHeight = Math.max(feetToMeters(5), deckY + feetToMeters(5) - groundY);
    for (const lateral of [-0.98, 0.98]) {
      scene.primitives.push(cylinder(
        `terrain-maintenance-bridge-gantry-${side}-${lateral < 0 ? "left" : "right"}`,
        1,
        point.x + normal.x * lateral,
        groundY,
        point.z + normal.z * lateral,
        0.34,
        supportHeight,
        "metal",
        [...commonTags, "bridge-anchor", "support", "grounded-support"],
      ));
    }
    scene.primitives.push(corridor(
      `terrain-maintenance-bridge-gantry-beam-${side}`,
      1,
      point.x + normal.x * 1.18,
      point.z + normal.z * 1.18,
      point.x - normal.x * 1.18,
      point.z - normal.z * 1.18,
      deckY + feetToMeters(5),
      0.28,
      "metal",
      [...commonTags, "gantry-beam"],
    ));
  }
  scene.primitives.push(
    primitive("terrain-maintenance-bridge-warning-beacon", "cylinder", 1, crossing.midpoint.x, deckY + feetToMeters(4.8), crossing.midpoint.z, 0.22, feetToMeters(1.2), 0.22, "warmLight", [...commonTags, "bridge-beacon", "landmark"]),
  );
  scene.primitives.push(corridor(
    "terrain-maintenance-bridge-service-pipe",
    1,
    crossing.from.x,
    crossing.from.z,
    crossing.to.x,
    crossing.to.z,
    deckY - feetToMeters(2.2),
    0.28,
    "hazard",
    [...commonTags, "service-pipe", "connected-equipment"],
  ));
  scene.routes.push(createRoute("terrain-maintenance-hazard-crossing", "alternate", [
    { x: crossing.from.x, z: crossing.from.z, y: deckY },
    { x: crossing.midpoint.x, z: crossing.midpoint.z, y: deckY },
    { x: crossing.to.x, z: crossing.to.z, y: deckY },
  ], { purpose: "service", traffic: 0.42, schedule: "all" }));
  scene.tactical.push(
    tacticalFeature("terrain-maintenance-bridge-chokepoint", "chokepoint", crossing.midpoint.x, crossing.midpoint.z, deckY, 2, `The supported maintenance bridge is the exposed crossing over ${crossing.hazard}.`),
    tacticalFeature("terrain-maintenance-bridge-overwatch", "highGround", crossing.midpoint.x, crossing.midpoint.z, deckY, 2, "The gantry deck overlooks both hazard banks but offers little lateral escape."),
  );
}

function addIndustrialSite(scene: GeneratedScene, width: number, depth: number, features: readonly string[], terrainCrossing?: TerrainCrossingCandidate): void {
  const yardZ = depth * 0.78;
  for (let track = 0; track < 3; track += 1) {
    scene.primitives.push(corridor(`industrial-rail-${track + 1}`, 0, 2, yardZ + track * 2.2, width - 2, yardZ + track * 2.2, FLOOR_SLAB_METERS + 0.08, 0.32, "metal", ["rail-yard", "rail-track", "industrial-route", "site-program"]));
  }
  scene.primitives.push(
    box("industrial-freight-platform", 0, width * 0.46, FLOOR_SLAB_METERS, yardZ - 2, width * 0.38, feetToMeters(3), 3.2, "darkStone", ["rail-yard", "loading-platform", "cover", "site-program"]),
    cylinder("industrial-storage-tank-1", 0, width * 0.78, FLOOR_SLAB_METERS, depth * 0.22, 5.2, feetToMeters(18), "metal", ["industrial-plant", "storage-tank", "cover", "site-program"]),
    cylinder("industrial-storage-tank-2", 0, width * 0.84, FLOOR_SLAB_METERS, depth * 0.27, 4.2, feetToMeters(14), "metal", ["industrial-plant", "storage-tank", "cover", "site-program"]),
    box("industrial-maintenance-level", 3, width * 0.5, -feetToMeters(10), depth * 0.5, width * 0.36, FLOOR_SLAB_METERS, depth * 0.22, "darkStone", ["floor", "underground-maintenance", "underground", "standable", "site-program"]),
    stairs("industrial-maintenance-stair", 3, width * 0.5, -feetToMeters(10), depth * 0.4, 1.8, feetToMeters(10), 5.4, "metal", ["underground-maintenance", "vertical-opening", "site-program"]),
  );
  scene.routes.push(
    createRoute("industrial-freight-route", "alternate", [{ x: 2, z: yardZ }, { x: width * 0.46, z: yardZ }, { x: width - 2, z: yardZ }], { purpose: "service", traffic: 0.88, schedule: "all" }),
    createRoute("industrial-maintenance-route", "vertical", [{ x: width * 0.5, z: depth * 0.4, y: 0 }, { x: width * 0.5, z: depth * 0.5, y: -feetToMeters(10) }], { purpose: "service", traffic: 0.46, schedule: "all" }),
  );
  scene.tactical.push(
    tacticalFeature("industrial-yard-killzone", "hazard", width * 0.5, yardZ, 0, 5, "The open freight yard exposes movement between the factories and worker housing."),
  );
  if (terrainCrossing !== undefined) {
    addTerrainBoundMaintenanceBridge(scene, terrainCrossing);
  } else {
    scene.primitives.push(corridor("industrial-conveyor-bridge", 2, width * 0.22, depth * 0.3, width * 0.62, depth * 0.52, feetToMeters(16), 1.6, "metal", ["conveyor-network", "conveyor-bridge", "catwalk", "high-ground", "standable", "site-program"]));
    scene.routes.push(createRoute("industrial-catwalk-route", "alternate", [{ x: width * 0.22, z: depth * 0.3, y: feetToMeters(16) }, { x: width * 0.42, z: depth * 0.41, y: feetToMeters(16) }, { x: width * 0.62, z: depth * 0.52, y: feetToMeters(16) }], { purpose: "escape", traffic: 0.38, schedule: "all" }));
    scene.tactical.push(tacticalFeature("industrial-conveyor-overwatch", "highGround", width * 0.42, depth * 0.41, feetToMeters(16), 3, "The conveyor bridge provides an exposed elevated route across the district."));
  }
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

function buildingLocalPoint(building: BuildingInstance, localX: number, localZ: number): { x: number; z: number } {
  const cosine = Math.cos(building.rotationY);
  const sine = Math.sin(building.rotationY);
  return {
    x: building.positionCells.x + localX * cosine + localZ * sine,
    z: building.positionCells.z - localX * sine + localZ * cosine,
  };
}

function roofHeight(building: BuildingInstance): number {
  return (building.baseYMeters ?? FLOOR_SLAB_METERS) + (building.exteriorHeightMeters ?? feetToMeters(20)) + 0.14;
}

function roofEdgeTowards(building: BuildingInstance, target: BuildingInstance): { x: number; z: number } {
  const dx = target.positionCells.x - building.positionCells.x;
  const dz = target.positionCells.z - building.positionCells.z;
  const cosine = Math.cos(building.rotationY);
  const sine = Math.sin(building.rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  const halfX = Math.max(1.2, building.footprintCells.x * 0.34);
  const halfZ = Math.max(1.2, building.footprintCells.z * 0.34);
  const scale = Math.min(
    Math.abs(localX) < 0.001 ? Number.POSITIVE_INFINITY : halfX / Math.abs(localX),
    Math.abs(localZ) < 0.001 ? Number.POSITIVE_INFINITY : halfZ / Math.abs(localZ),
  );
  return buildingLocalPoint(building, localX * scale, localZ * scale);
}

/**
 * Compiles a legible landmark layer after independently seeded buildings have
 * been placed. Every landmark is attached to an actual building roof or
 * facade, so the settlement planner can reuse the same grammar on a different
 * canal shape without falling back to fixed world coordinates.
 */
function addWaterCityLandmarks(scene: GeneratedScene, prompt: string): void {
  const buildings = scene.buildingInstances ?? [];
  if (buildings.length === 0) return;
  const normalized = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const wantsRoofBridge = ["屋顶连桥", "屋顶桥", "屋顶货运桥", "货运屋顶桥", "房顶连桥", "roof bridge", "rooftop bridge", "rooftop cargo bridge"].some((term) => normalized.includes(term));
  const landmarkTags = ["water-city", "water-city-landmark", "site-program", "supported"];

  const shrine = buildings.find((building) => building.archetype === "shrine");
  if (shrine) {
    const baseY = shrine.baseYMeters ?? FLOOR_SLAB_METERS;
    const existingRoof = roofHeight(shrine);
    const tower = buildingLocalPoint(shrine, 0, -shrine.footprintCells.z * 0.22);
    const towerDiameter = Math.max(2.2, Math.min(shrine.footprintCells.x, shrine.footprintCells.z) * 0.3);
    const towerHeight = Math.max(feetToMeters(24), (shrine.exteriorHeightMeters ?? feetToMeters(18)) * 1.32);
    scene.primitives.push(
      cylinder(`${shrine.id}-water-city-bell-tower`, 1, tower.x, baseY, tower.z, towerDiameter, towerHeight, "stone", [...landmarkTags, "sacred-landmark", "bell-tower", "vertical-landmark", `building-instance:${shrine.id}`]),
      primitive(`${shrine.id}-water-city-bell-spire`, "cone", 2, tower.x, baseY + towerHeight, tower.z, towerDiameter * 1.524, Math.max(feetToMeters(8), towerHeight * 0.34), towerDiameter * 1.524, "roof", [...landmarkTags, "sacred-landmark", "bell-spire", "roof", `building-instance:${shrine.id}`]),
      box(`${shrine.id}-water-city-processional-landing`, 0, shrine.positionCells.x, baseY + FLOOR_SLAB_METERS + 0.04, shrine.positionCells.z + shrine.footprintCells.z * 0.42, Math.max(3, shrine.footprintCells.x * 0.48), FLOOR_SLAB_METERS, 1.8, "stone", [...landmarkTags, "sacred-landmark", "processional-landing", "standable", `building-instance:${shrine.id}`], shrine.rotationY),
    );
    for (const [index, side] of [-1, 1].entries()) {
      const buttress = buildingLocalPoint(shrine, side * shrine.footprintCells.x * 0.34, -shrine.footprintCells.z * 0.08);
      scene.primitives.push(box(`${shrine.id}-water-city-buttress-${index + 1}`, 0, buttress.x, baseY, buttress.z, 0.55, Math.max(feetToMeters(8), existingRoof - baseY), 1.15, "stone", [...landmarkTags, "sacred-landmark", "buttress", "structural-support", `building-instance:${shrine.id}`], shrine.rotationY));
    }
    scene.tactical.push(tacticalFeature(`${shrine.id}-water-city-bell-overwatch`, "highGround", tower.x, tower.z, baseY + towerHeight, 2, "The attached bell tower marks the sacred axis and overlooks both canal banks."));
  }

  const patrolTower = buildings.find((building) => building.archetype === "tower");
  if (patrolTower) {
    const roofY = roofHeight(patrolTower);
    const platformSize = Math.max(3, Math.min(patrolTower.footprintCells.x, patrolTower.footprintCells.z) * 0.72);
    scene.primitives.push(
      box(`${patrolTower.id}-water-city-patrol-platform`, 2, patrolTower.positionCells.x, roofY, patrolTower.positionCells.z, platformSize, FLOOR_SLAB_METERS, platformSize, "darkStone", [...landmarkTags, "patrol-tower", "patrol-platform", "roof-platform", "standable", "high-ground", `building-instance:${patrolTower.id}`], patrolTower.rotationY),
      cylinder(`${patrolTower.id}-water-city-signal-mast`, 2, patrolTower.positionCells.x, roofY + FLOOR_SLAB_METERS, patrolTower.positionCells.z, 0.28, feetToMeters(13), "wood", [...landmarkTags, "patrol-tower", "signal-mast", "vertical-landmark", `building-instance:${patrolTower.id}`]),
      box(`${patrolTower.id}-water-city-roof-hatch`, 2, patrolTower.positionCells.x, roofY + FLOOR_SLAB_METERS, patrolTower.positionCells.z + platformSize * 0.18, 0.9, feetToMeters(2.5), 0.9, "wood", [...landmarkTags, "patrol-tower", "roof-hatch", "vertical-opening", "cover", `building-instance:${patrolTower.id}`], patrolTower.rotationY),
    );
    for (const [index, localX, localZ] of [
      [1, -platformSize * 0.42, -platformSize * 0.42],
      [2, platformSize * 0.42, -platformSize * 0.42],
      [3, -platformSize * 0.42, platformSize * 0.42],
      [4, platformSize * 0.42, platformSize * 0.42],
    ] as const) {
      const merlon = buildingLocalPoint(patrolTower, localX, localZ);
      scene.primitives.push(box(`${patrolTower.id}-water-city-merlon-${index}`, 2, merlon.x, roofY + FLOOR_SLAB_METERS, merlon.z, 0.48, feetToMeters(3.2), 0.48, "darkStone", [...landmarkTags, "patrol-tower", "parapet", "cover", `building-instance:${patrolTower.id}`], patrolTower.rotationY));
    }
    scene.tactical.push(tacticalFeature(`${patrolTower.id}-water-city-patrol-overwatch`, "highGround", patrolTower.positionCells.x, patrolTower.positionCells.z, roofY, 2.5, "The supported roof platform forms a recognizable canal patrol landmark."));
  }

  const marketAnchor = buildings.find((building) => building.district === "commercial")
    ?? buildings.find((building) => building.archetype === "tavern" || building.archetype === "warehouse");
  if (marketAnchor) {
    const baseY = (marketAnchor.baseYMeters ?? FLOOR_SLAB_METERS) + FLOOR_SLAB_METERS + 0.04;
    const frontageZ = marketAnchor.footprintCells.z * 0.52;
    for (let bay = 0; bay < 3; bay += 1) {
      const localX = (bay - 1) * Math.max(2.1, marketAnchor.footprintCells.x * 0.22);
      const canopy = buildingLocalPoint(marketAnchor, localX, frontageZ + 1.15);
      const canopyWidth = Math.max(1.8, marketAnchor.footprintCells.x * 0.2);
      scene.primitives.push(
        box(`${marketAnchor.id}-water-city-market-canopy-${bay + 1}`, 0, canopy.x, baseY + feetToMeters(8), canopy.z, canopyWidth, 0.16, 2.1, "wood", [...landmarkTags, "market-landmark", "market-canopy", "dockside-awning", "cover", `building-instance:${marketAnchor.id}`], marketAnchor.rotationY),
        box(`${marketAnchor.id}-water-city-market-counter-${bay + 1}`, 0, canopy.x, baseY, canopy.z, canopyWidth * 0.82, feetToMeters(3), 0.7, "wood", [...landmarkTags, "market-landmark", "market-counter", "cover", `building-instance:${marketAnchor.id}`], marketAnchor.rotationY),
      );
      for (const [postIndex, side] of [-1, 1].entries()) {
        const post = buildingLocalPoint(marketAnchor, localX + side * canopyWidth * 0.42, frontageZ + 1.15);
        scene.primitives.push(cylinder(`${marketAnchor.id}-water-city-market-post-${bay + 1}-${postIndex + 1}`, 0, post.x, baseY, post.z, 0.16, feetToMeters(8), "wood", [...landmarkTags, "market-landmark", "market-canopy-support", "structural-support", `building-instance:${marketAnchor.id}`]));
      }
    }
    scene.tactical.push(tacticalFeature(`${marketAnchor.id}-water-city-market-choke`, "chokepoint", marketAnchor.positionCells.x, marketAnchor.positionCells.z, baseY, 2, "Three supported market bays create a crowded, readable canal-front combat lane."));
  }

  if (!wantsRoofBridge) return;
  const candidates = buildings.filter((building) => building.detailLevel !== "mass");
  const pairs: Array<{ a: BuildingInstance; b: BuildingInstance; distance: number; heightDelta: number }> = [];
  for (let aIndex = 0; aIndex < candidates.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < candidates.length; bIndex += 1) {
      const a = candidates[aIndex];
      const b = candidates[bIndex];
      if (!a || !b) continue;
      const distance = Math.hypot(a.positionCells.x - b.positionCells.x, a.positionCells.z - b.positionCells.z);
      const heightDelta = Math.abs(roofHeight(a) - roofHeight(b));
      if (distance > 18 || heightDelta > feetToMeters(5)) continue;
      pairs.push({ a, b, distance, heightDelta });
    }
  }
  pairs.sort((left, right) => left.distance - right.distance || left.heightDelta - right.heightDelta);
  const used = new Set<string>();
  let bridgeCount = 0;
  for (const pair of pairs) {
    if (bridgeCount >= 2 || used.has(pair.a.id) || used.has(pair.b.id)) continue;
    const from = roofEdgeTowards(pair.a, pair.b);
    const to = roofEdgeTowards(pair.b, pair.a);
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span < 1.5 || span > 13) continue;
    const fromY = roofHeight(pair.a);
    const toY = roofHeight(pair.b);
    const deckY = Math.max(fromY, toY);
    const id = `water-city-roof-bridge-${bridgeCount + 1}`;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const sideX = -dz / length;
    const sideZ = dx / length;
    scene.primitives.push(
      box(`${id}-landing-a`, 2, from.x, fromY, from.z, 1.8, FLOOR_SLAB_METERS, 1.8, "wood", [...landmarkTags, "roof-route", "roof-bridge-landing", "standable", `building-instance:${pair.a.id}`]),
      box(`${id}-landing-b`, 2, to.x, toY, to.z, 1.8, FLOOR_SLAB_METERS, 1.8, "wood", [...landmarkTags, "roof-route", "roof-bridge-landing", "standable", `building-instance:${pair.b.id}`]),
      corridor(`${id}-deck`, 2, from.x, from.z, to.x, to.z, deckY, 1.25, "wood", [...landmarkTags, "roof-route", "roof-bridge", "bridge", "standable", "high-ground"]),
      corridor(`${id}-rail-left`, 2, from.x + sideX * 0.58, from.z + sideZ * 0.58, to.x + sideX * 0.58, to.z + sideZ * 0.58, deckY + feetToMeters(3), 0.1, "wood", [...landmarkTags, "roof-route", "roof-bridge-railing", "bridge-rail"]),
      corridor(`${id}-rail-right`, 2, from.x - sideX * 0.58, from.z - sideZ * 0.58, to.x - sideX * 0.58, to.z - sideZ * 0.58, deckY + feetToMeters(3), 0.1, "wood", [...landmarkTags, "roof-route", "roof-bridge-railing", "bridge-rail"]),
    );
    scene.routes.push(createRoute(`${id}-route`, "alternate", [
      { x: from.x, z: from.z, y: fromY },
      { x: to.x, z: to.z, y: toY },
    ], { purpose: "escape", traffic: 0.38, schedule: "all" }));
    scene.tactical.push(tacticalFeature(`${id}-choke`, "chokepoint", (from.x + to.x) / 2, (from.z + to.z) / 2, deckY, 1.2, "The roof bridge joins two real roof edges and creates an exposed elevated chokepoint."));
    used.add(pair.a.id);
    used.add(pair.b.id);
    bridgeCount += 1;
  }
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
            : program.requiredFeatures.includes("whalebone-landmark") ? "The Whalebone Lighthouse Village"
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
  const terrain = compileSettlementTerrain(program, context.request.prompt, context.rng.fork("settlement-terrain"), context.request.density);
  program.terrain.kind = terrain.summary.kind;
  program.terrain.buildableRatio = terrain.summary.buildableRatio;
  program.terrain.elevationBandsFeet = terrain.summary.elevationBandsFeet;
  scene.siteProgram = summarizeSiteProgram(program);
  scene.terrainProgram = terrain.summary;
  const landDepth = program.siteType === "harbor-district" ? program.bounds.z - 8 : program.bounds.z;
  const promptText = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const wantsWizardTower = ["法师塔", "魔法塔", "巫师塔", "炼金塔", "wizard tower", "mage tower", "alchemy tower"].some((term) => promptText.includes(term));
  let wizardTowerAssigned = false;
  const explicitlyFloating = ["浮空", "浮岛", "悬空", "floating", "levitating"].some((term) => promptText.includes(term));
  const isFloating = explicitlyFloating && ((context.sceneProgram?.morphology.includes("floating-islands") ?? false) || program.requiredFeatures.includes("salt-crystal-monastery"));
  const isHollowTree = program.requiredFeatures.includes("hollow-tree-city");
  const isMangrovePort = program.requiredFeatures.includes("mangrove-smuggler-port");
  const isMountainMonastery = program.requiredFeatures.includes("mountain-monastery") || program.requiredFeatures.includes("hillside-district");
  const isTidalCavern = program.requiredFeatures.includes("tidal-cavern");
  const isFlooded = program.requiredFeatures.includes("flooded-site") && !isTidalCavern;
  const legacySpecialElevation = isFloating || isMountainMonastery;
  const elevationAt = isFloating ? addFloatingIslandTerrain(scene, program.bounds.x, program.bounds.z, program.requiredFeatures.includes("salt-crystal-monastery")) : isMountainMonastery ? addMountainTerraces(scene, program.bounds.x, program.bounds.z) : terrain.elevationAt;
  if (!legacySpecialElevation) terrain.render(scene);
  else if (!isFloating) scene.primitives.push(box("site-terrain-base", 0, program.bounds.x / 2, 0, landDepth / 2, program.bounds.x, FLOOR_SLAB_METERS, landDepth, "earth", ["floor", "terrain", "site-program", `site:${program.siteType}`]));
  if (isHollowTree) addHollowTreeCity(scene, program.bounds.x, program.bounds.z);
  if (isMangrovePort) addMangroveSmugglerPort(scene, program.bounds.x, program.bounds.z, context.request.density, context.rng.fork("mangrove-parent"));
  // Districts are planning ownership, not giant coloured floor decals. Their
  // identity is made legible by parcel use, landmarks and road hierarchy.
  // A canal-bank settlement owns both a parent water surface and a normal
  // urban circulation layer.  Treating every river as a fully semantic
  // wilderness parent used to suppress its planned roads, blocks, yards and
  // civic open spaces, leaving only blue channels plus detached building
  // islands.  Standalone river sites still keep the terrain-only grammar.
  const waterCity = program.requiredFeatures.includes("water-city");
  const semanticTerrain = (["river", "impact-crater", "caldera", "ice-crevasse", "underdark", "megastructure", "bridge-megastructure", "coastal-cliff", "swamp-bone", "wreck-field"].includes(terrain.summary.kind) && !(terrain.summary.kind === "river" && waterCity)) || isFloating || isHollowTree || isMangrovePort;
  // Most semantic terrains own their complete circulation grammar so that a
  // generic road web cannot flatten a crater, caldera, crevasse, or cavern.
  // Coastal cliffs are different: the terrain generator owns the terraces and
  // cave, while the settlement planner owns the inhabited contour streets and
  // switchbacks that stitch those terraces together.
  const plannedTerrainRoads = terrain.summary.kind === "coastal-cliff"
    && program.morphology.roadPattern === "contour";
  if (!semanticTerrain) addBlockAndParcelSurfaces(scene, program, elevationAt);
  if (!semanticTerrain || plannedTerrainRoads) {
    for (const road of program.roads) scene.primitives.push(...roadPieces(road, legacySpecialElevation ? { ...terrain, elevationAt, surfaceAt: () => "ground" } : terrain));
    addRoadJunctions(scene, program, elevationAt);
  }
  if (!semanticTerrain) addOpenSpaces(scene, program, elevationAt);
  // A mangrove smuggler port owns its docks through tidal nodes and root
  // boardwalks. Do not append the generic straight shoreline docks here:
  // they create six diagonal city-scale axes that erase the parent wetland
  // grammar and make the port look like a normal modern harbor.
  if (program.siteType === "harbor-district" && terrain.summary.kind !== "coastal-cliff" && !isMangrovePort) addHarbor(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (program.siteType === "village" && !semanticTerrain) addVillageLandmarks(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (program.requiredFeatures.includes("mine-remnant")) addMineRemnantAtoms(scene, program.bounds.x, program.bounds.z, program.requiredFeatures);
  if (!isFloating && !semanticTerrain && (program.siteType === "city-district" || program.siteType === "town")) addUrbanDefences(scene, program.bounds.x, program.bounds.z);
  if (program.siteType === "mining-settlement" && !semanticTerrain) {
    addMiningValley(scene, program.bounds.x, program.bounds.z);
    scene.primitives.push(corridor("mining-cart-track", 0, 1, program.bounds.z * 0.28, program.bounds.x - 2, program.bounds.z * 0.72, FLOOR_SLAB_METERS + 0.08, 1.4, "metal", ["mine-cart-track", "industrial-route", "site-program"]));
    scene.primitives.push(box("mining-waste-slope", 0, program.bounds.x * 0.82, feetToMeters(5), program.bounds.z * 0.2, 9, feetToMeters(10), 8, "rock", ["waste-rock", "slope", "high-ground", "site-program"]));
  }
  const requestedTerrainCrossing = program.requiredFeatures.includes("conveyor-network")
    ? terrain.crossingCandidates[0]
    : undefined;
  if (program.requiredFeatures.includes("industrial-plant") || program.requiredFeatures.includes("rail-yard")) addIndustrialSite(scene, program.bounds.x, program.bounds.z, program.requiredFeatures, requestedTerrainCrossing);
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
  const mangroveMacro = context.rng.fork("mangrove-placement");
  const mangroveBuildingNodes = Array.from({ length: 8 }, (_, index) => [
    program.bounds.x * mangroveMacro.float(0.12, 0.88),
    program.bounds.z * mangroveMacro.float(0.24, 0.76),
  ] as const);
  const mangroveElevationFeet = Array.from({ length: 8 }, () => mangroveMacro.int(4, 18));
  const mangroveRootWaypoints = Array.from({ length: 12 }, () => [
    program.bounds.x * mangroveMacro.float(0.06, 0.94),
    program.bounds.z * mangroveMacro.float(0.08, 0.92),
  ] as const);
  for (const parcel of program.parcels) {
    if (terrain.summary.kind === "bridge-megastructure" && adaptedBuildings >= 9) continue;
    if (isMangrovePort && adaptedBuildings >= Math.max(12, Math.round(program.parcels.length * 0.68))) continue;
    const district = program.districts.find((candidate) => candidate.id === parcel.districtId);
    const clearance = Math.min(2, Math.max(parcel.buildingSize.x, parcel.buildingSize.z) * 0.18);
    const semanticPlacement = semanticTerrain ? terrain.placementFor(adaptedBuildings, program.parcels.length, parcel.center, clearance) : undefined;
    const mangroveNode = isMangrovePort ? mangroveBuildingNodes[adaptedBuildings % mangroveBuildingNodes.length] : undefined;
    const mangroveSide = isMangrovePort ? (adaptedBuildings % 2 === 0 ? -1 : 1) : 0;
    const mangroveCandidate = mangroveNode ? {
      x: mangroveNode[0] + mangroveSide * (2.7 + (adaptedBuildings % 3) * 0.8),
      z: mangroveNode[1] + Math.sin(adaptedBuildings * 1.7) * 1.2,
    } : undefined;
    // A parent wetland may reject a random parcel if it lands in the tidal
    // channel. Never let a child building float over water just because its
    // authored node was aesthetically convenient: use the terrain placement
    // solver as the final authority and inherit its actual elevation.
    const mangrovePlacement: { x: number; z: number; elevationFeet?: number } | undefined = mangroveCandidate
      && terrain.buildableAt(mangroveCandidate.x, mangroveCandidate.z, Math.min(1.2, clearance))
      ? {
        ...mangroveCandidate,
        elevationFeet: terrain.elevationFeetAt(mangroveCandidate.x, mangroveCandidate.z) + (mangroveElevationFeet[adaptedBuildings % mangroveElevationFeet.length] ?? 6) * 0.18,
      }
      : undefined;
    const placement = mangrovePlacement ?? semanticPlacement ?? nearestBuildable(parcel.center.x, parcel.center.z, clearance);
    if (!placement) continue;
    const siteElevation = isFlooded ? feetToMeters(5) : placement.elevationFeet === undefined ? elevationAt(placement.x, placement.z) : feetToMeters(placement.elevationFeet);
    const raisedStiltHome = program.requiredFeatures.includes("stilt-houses") && parcel.buildingKind === "home";
    const buildingBaseY = siteElevation + FLOOR_SLAB_METERS + (raisedStiltHome ? feetToMeters(5) : 0);
    const siteProfile = parcel.buildingKind === "tower" && wantsWizardTower && !wizardTowerAssigned ? "wizard-tower" as const : undefined;
    if (siteProfile === "wizard-tower") wizardTowerAssigned = true;
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
      baseY: buildingBaseY,
      state: parcel.state,
      functionalModules: parcel.functionalModules,
      siteProfile,
    }, context.rng.fork(parcel.buildingSeed));
    if (raisedStiltHome) {
      for (const [pierIndex, dx, dz] of [[0, -0.32, -0.32], [1, 0.32, -0.32], [2, -0.32, 0.32], [3, 0.32, 0.32]] as const) {
        scene.primitives.push(cylinder(
          `coastal-stilt-home-${parcel.id}-${pierIndex + 1}`,
          0,
          placement.x + parcel.buildingSize.x * dx,
          siteElevation,
          placement.z + parcel.buildingSize.z * dz,
          0.38,
          feetToMeters(5) + FLOOR_SLAB_METERS,
          "wood",
          ["coastal-cliff", "stilt-foundation", "support", "grounded-support", "home", `parcel:${parcel.id}`, "site-program"],
        ));
      }
      scene.primitives.push(stairs(
        `coastal-stilt-home-entry-${parcel.id}`,
        0,
        placement.x,
        siteElevation,
        placement.z + parcel.buildingSize.z * 0.48,
        1.4,
        feetToMeters(5),
        4,
        "wood",
        ["coastal-cliff", "stilt-foundation", "home", "supported", "standable", `parcel:${parcel.id}`, "site-program"],
        parcel.rotationY,
      ));
    }
    const requiresParentWater = parcel.functionalModules?.some((module) => module.requiresWater) ?? false;
    if (requiresParentWater) {
      const waterPoint = terrain.nearestSurfacePoint(placement.x, placement.z, ["water"], Math.max(10, Math.min(program.bounds.x, program.bounds.z) * 0.22));
      if (waterPoint !== undefined) {
        const dx = waterPoint.x - placement.x;
        const dz = waterPoint.z - placement.z;
        const distance = Math.max(0.001, Math.hypot(dx, dz));
        const shore = {
          x: waterPoint.x - (dx / distance) * 1.2,
          z: waterPoint.z - (dz / distance) * 1.2,
        };
        const deckY = siteElevation + FLOOR_SLAB_METERS + 0.1;
        scene.primitives.push(
          corridor(`terrain-water-access-${parcel.id}`, 0, placement.x, placement.z, shore.x, shore.z, deckY, 0.9, "wood", ["terrain-bound-water-access", "water-access", "standable", `parcel:${parcel.id}`, "site-program"]),
          cylinder(`terrain-water-access-pile-${parcel.id}-a`, 0, shore.x, feetToMeters(waterPoint.elevationFeet), shore.z, 0.32, Math.max(feetToMeters(3), deckY - feetToMeters(waterPoint.elevationFeet)), "wood", ["terrain-bound-water-access", "support", "grounded-support", `parcel:${parcel.id}`, "site-program"]),
          cylinder(`terrain-water-access-pile-${parcel.id}-b`, 0, waterPoint.x, feetToMeters(waterPoint.elevationFeet), waterPoint.z, 0.32, Math.max(feetToMeters(3), deckY - feetToMeters(waterPoint.elevationFeet)), "wood", ["terrain-bound-water-access", "support", "grounded-support", `parcel:${parcel.id}`, "site-program"]),
        );
        scene.routes.push(createRoute(`terrain-water-access-route-${parcel.id}`, "alternate", [
          { x: placement.x, z: placement.z, y: deckY },
          { x: shore.x, z: shore.z, y: deckY },
          { x: waterPoint.x, z: waterPoint.z, y: deckY },
        ], { purpose: "service", traffic: 0.28, schedule: "all" }));
        scene.tactical.push(tacticalFeature(`terrain-water-access-hazard-${parcel.id}`, "hazard", waterPoint.x, waterPoint.z, feetToMeters(waterPoint.elevationFeet), 1, "The functional module is physically tied to parent-scene water through a supported access deck."));
      }
    }
    if (isMangrovePort && siteElevation > 0.2) {
      for (const [pierIndex, dx, dz] of [[0, -0.31, -0.31], [1, 0.31, -0.31], [2, -0.31, 0.31], [3, 0.31, 0.31]] as const) {
        scene.primitives.push(cylinder(
          `mangrove-building-pier-${parcel.id}-${pierIndex + 1}`,
          0,
          placement.x + parcel.buildingSize.x * dx,
          0,
          placement.z + parcel.buildingSize.z * dz,
          0.48,
          siteElevation + FLOOR_SLAB_METERS,
          "wood",
          ["mangrove", "stilt-foundation", "support", `parcel:${parcel.id}`, "site-program"],
        ));
      }
    }
    adaptedBuildings += 1;
    const useParentRootAccess = isMangrovePort && (adaptedBuildings < 3 || (parcel.lod === "full-interior" && adaptedBuildings < 5));
    if (useParentRootAccess) {
      const rootAnchor = mangroveRootWaypoints.reduce((best, candidate) => {
        const bestDistance = Math.hypot(placement.x - best[0], placement.z - best[1]);
        const candidateDistance = Math.hypot(placement.x - candidate[0], placement.z - candidate[1]);
        return candidateDistance < bestDistance ? candidate : best;
      }, mangroveRootWaypoints[0]!);
      const accessY = siteElevation + FLOOR_SLAB_METERS + 0.06;
      const boardwalkY = FLOOR_SLAB_METERS + 0.7;
      const accessTags = ["parcel-access", "entrance-route", `parcel:${parcel.id}`, "site-program", "standable", "terrain-adapted", "root-boardwalk"];
      let routePoints: { x: number; z: number; y: number }[];
      if (accessY > boardwalkY + 0.3) {
        const rootDx = rootAnchor[0] - placement.x;
        const rootDz = rootAnchor[1] - placement.z;
        const stairRun = Math.max(3.2, Math.min(6.5, (accessY - boardwalkY) / feetToMeters(1.2)));
        const stairBottom = Math.abs(rootDx) >= Math.abs(rootDz)
          ? { x: placement.x + Math.sign(rootDx || 1) * stairRun, z: placement.z, y: boardwalkY }
          : { x: placement.x, z: placement.z + Math.sign(rootDz || 1) * stairRun, y: boardwalkY };
        const rootLeg = addOrthogonalAccess(
          scene,
          `parcel-access-${parcel.id}-root`,
          { x: rootAnchor[0], z: rootAnchor[1], y: boardwalkY },
          stairBottom,
          adaptedBuildings,
          0.72,
          "wood",
          accessTags,
        );
        const climb = stairConnection(
          `parcel-access-${parcel.id}-stair`,
          0,
          { xCells: stairBottom.x, zCells: stairBottom.z, yMeters: boardwalkY },
          { xCells: placement.x, zCells: placement.z, yMeters: accessY },
          0.82,
          "wood",
          [...accessTags, "stilt-stair"],
        );
        scene.primitives.push(climb.primitive);
        routePoints = [...rootLeg, { x: climb.top.xCells, z: climb.top.zCells, y: climb.top.yMeters }];
      } else {
        routePoints = addOrthogonalAccess(
          scene,
          `parcel-access-${parcel.id}-root`,
          { x: rootAnchor[0], z: rootAnchor[1], y: boardwalkY },
          { x: placement.x, z: placement.z, y: accessY },
          adaptedBuildings,
          0.72,
          "wood",
          accessTags,
        );
      }
      scene.routes.push(createRoute(`parcel-root-route-${parcel.id}`, "alternate", routePoints, { purpose: "service", traffic: 0.46, schedule: "all" }));
    } else {
      scene.primitives.push(corridor(
        `parcel-access-${parcel.id}`,
        0,
        placement.x - (isMangrovePort ? 0.5 : 1.4),
        placement.z,
        placement.x,
        placement.z,
        siteElevation + FLOOR_SLAB_METERS + 0.06,
        isMangrovePort ? 0.55 : parcel.lod === "full-interior" ? 1.4 : 1,
        isMangrovePort ? "wood" : program.siteType === "village" ? "earth" : "stone",
        ["parcel-access", "entrance-route", `parcel:${parcel.id}`, "site-program", "standable", "terrain-adapted", ...(isMangrovePort ? ["root-boardwalk"] : [])],
      ));
    }
    if (isFlooded) {
      for (const [pierIndex, dx, dz] of [[0, -0.36, -0.36], [1, 0.36, -0.36], [2, -0.36, 0.36], [3, 0.36, 0.36]] as const) scene.primitives.push(cylinder(`flood-pier-${parcel.id}-${pierIndex}`, 0, parcel.center.x + parcel.size.x * dx, 0, parcel.center.z + parcel.size.z * dz, 0.55, siteElevation, "wood", ["stilt-foundation", "flooded-site", "site-program"]));
      scene.primitives.push(stairs(`flood-access-stair-${parcel.id}`, 0, parcel.entrance.x, 0, parcel.entrance.z, 1.2, siteElevation, 3.8, "wood", ["flooded-site", "vertical-opening", "site-program"], parcel.rotationY));
    }
  }
  tagFunctionalInspectionClusters(scene);
  if (waterCity) addWaterCityLandmarks(scene, context.request.prompt);

  const central = program.openSpaces[0];
  const plaza = createRoom("settlement-plaza-room", program.siteType === "village" ? "Village green and public well" : program.siteType === "harbor-district" ? "Fish market plaza" : "Central plaza", "circulation", 0, central?.center.x ?? program.bounds.x / 2, central?.center.z ?? program.bounds.z / 2, central?.size.x ?? 8, central?.size.z ?? 8);
  scene.rooms.push(plaza);
  const industrialUnderground = scene.rooms.find((room) => room.id === "industrial-underground-room");
  if (industrialUnderground) connectRooms(scene.rooms, plaza.id, industrialUnderground.id);
  const buildingRoots = scene.rooms.filter((room) => room.id.startsWith("settlement-building-") && room.id.endsWith("-room"));
  for (const [index, room] of buildingRoots.entries()) connectRooms(scene.rooms, index === 0 ? plaza.id : (buildingRoots[index - 1]?.id ?? plaza.id), room.id);

  if (!semanticTerrain || plannedTerrainRoads) for (const road of program.roads) scene.routes.push(createRoute(`route-${road.id}`, road.hierarchy === "arterial" ? "primary" : "alternate", road.points.map((point) => ({ ...point, y: elevationAt(point.x, point.z) })), { purpose: road.purpose === "cargo" || road.purpose === "service" ? "service" : "crowd", traffic: road.hierarchy === "arterial" ? 0.94 : road.hierarchy === "street" ? 0.86 : road.hierarchy === "lane" || road.hierarchy === "trail" ? 0.44 : 0.7, schedule: road.purpose === "patrol" ? "night" : road.purpose === "service" ? "all" : "day" }));
  const core = scene.buildingInstances?.filter((building) => building.detailLevel === "full-interior") ?? [];
  const wantsRoofRoute = ["屋顶", "房顶", "追逐", "roof", "rooftop", "chase"].some((term) => context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US").includes(term));
  if (wantsRoofRoute && !waterCity && core.length > 0) {
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
  scene.diagnostics.metrics.siteWaterCityLandmarks = scene.primitives.filter((primitive) => primitive.tags?.includes("water-city-landmark")).length;
  scene.diagnostics.metrics.siteRoofBridges = scene.primitives.filter((primitive) => primitive.tags?.includes("roof-bridge")).length;
  const bridgeCount = scene.primitives.filter((primitive) => primitive.tags?.some((tag) => tag === "bridge" || tag.includes("bridge"))).length;
  const verticalConnectionCount = scene.primitives.filter((primitive) => primitive.tags?.some((tag) => tag === "vertical-route" || tag === "vertical-opening")).length;
  scene.settlementAdaptation = {
    version: 1,
    terrainKind: terrain.summary.kind,
    roadMode: plannedTerrainRoads ? "hybrid" : semanticTerrain ? "terrain-owned" : "planned",
    relocatedBuildings: adaptedBuildings,
    supportSurfaceCount: terrain.summary.supportSurfaces,
    bridgeCount,
    verticalConnectionCount,
    elevationRangeFeet: terrain.summary.maximumElevationFeet - terrain.summary.minimumElevationFeet,
  };
  return scene;
}
