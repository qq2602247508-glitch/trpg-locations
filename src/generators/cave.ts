import type { GeneratedScene, GeneratorContext } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  cellsToMeters,
  clamp,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  cylinder,
  feetToMeters,
  primitive,
  stairConnection,
  stairs,
  tacticalFeature,
  water,
} from "./shared";

interface Chamber {
  id: string;
  x: number;
  z: number;
  y: number;
  diameter: number;
}

function addCavePassage(
  scene: GeneratedScene,
  from: Chamber,
  to: Chamber,
  routeId: string,
  kind: "primary" | "alternate",
  widthCells: number,
): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const centreDistance = Math.max(1, Math.hypot(dx, dz));
  const unitX = dx / centreDistance;
  const unitZ = dz / centreDistance;
  const fromOffset = Math.min(from.diameter * 0.36, centreDistance * 0.28);
  const toOffset = Math.min(to.diameter * 0.36, centreDistance * 0.28);
  const fromPortal = { xCells: from.x + unitX * fromOffset, zCells: from.z + unitZ * fromOffset, yMeters: from.y + FLOOR_SLAB_METERS };
  const toPortal = { xCells: to.x - unitX * toOffset, zCells: to.z - unitZ * toOffset, yMeters: to.y + FLOOR_SLAB_METERS };
  const elevationDelta = toPortal.yMeters - fromPortal.yMeters;

  if (Math.abs(elevationDelta) < 0.01) {
    scene.primitives.push(corridor(`${routeId}-level-passage`, 0, fromPortal.xCells, fromPortal.zCells, toPortal.xCells, toPortal.zCells, fromPortal.yMeters, widthCells, "rock", ["cave-passage", "level-passage", `passage:${routeId}`]));
  } else {
    const bottom = elevationDelta > 0 ? fromPortal : toPortal;
    const top = elevationDelta > 0 ? toPortal : fromPortal;
    const ramp = stairConnection(`${routeId}-continuous-ramp`, 0, bottom, top, widthCells, "rock", ["cave-passage", "continuous-ramp", "elevation-change", `passage:${routeId}`]);
    scene.primitives.push(ramp.primitive);
  }
  const normalX = -unitZ;
  const normalZ = unitX;
  const shellOffset = widthCells / 2 + 0.85;
  for (let index = 1; index <= 4; index += 1) {
    const t = index / 5;
    const x = fromPortal.xCells + (toPortal.xCells - fromPortal.xCells) * t;
    const z = fromPortal.zCells + (toPortal.zCells - fromPortal.zCells) * t;
    const y = fromPortal.yMeters + elevationDelta * t;
    for (const side of [-1, 1]) {
      scene.primitives.push(primitive(
        `${routeId}-passage-wall-${index}-${side < 0 ? "left" : "right"}`,
        "sphere",
        0,
        x + normalX * shellOffset * side,
        y,
        z + normalZ * shellOffset * side,
        cellsToMeters(1.25),
        cellsToMeters(1.8 + (index % 2) * 0.45),
        cellsToMeters(1.15),
        "rock",
        ["cave-wall", "passage-wall", "vertical-face", "blocks-sight", `passage:${routeId}`],
      ));
    }
    if (index % 2 === 0) {
      scene.primitives.push(primitive(
        `${routeId}-passage-roof-${index}`,
        "sphere",
        0,
        x,
        y + feetToMeters(9),
        z,
        cellsToMeters(widthCells + 1.9),
        cellsToMeters(1.5),
        cellsToMeters(1.7),
        "rock",
        ["cave-ceiling", "passage-roof", `passage:${routeId}`],
      ));
    }
  }
  scene.routes.push(createRoute(routeId, kind, [
    { x: from.x, z: from.z, y: from.y + FLOOR_SLAB_METERS },
    { x: fromPortal.xCells, z: fromPortal.zCells, y: fromPortal.yMeters },
    { x: toPortal.xCells, z: toPortal.zCells, y: toPortal.yMeters },
    { x: to.x, z: to.z, y: to.y + FLOOR_SLAB_METERS },
  ]));
}

function addChamberShells(scene: GeneratedScene, chambers: readonly Chamber[], rng: GeneratorContext["rng"]): void {
  const roomsById = new Map(scene.rooms.map((room) => [room.id, room]));
  const chambersById = new Map(chambers.map((chamber) => [chamber.id, chamber]));
  for (const chamber of chambers) {
    const room = roomsById.get(chamber.id);
    const openingAngles = (room?.connections ?? [])
      .map((id) => chambersById.get(id))
      .filter((other): other is Chamber => other !== undefined)
      .map((other) => Math.atan2(other.z - chamber.z, other.x - chamber.x));
    const segmentCount = Math.max(14, Math.round(chamber.diameter * 2.1));
    const radius = chamber.diameter * 0.5;
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (Math.PI * 2 * index) / segmentCount;
      const angleDistance = (target: number) => Math.abs(Math.atan2(Math.sin(angle - target), Math.cos(angle - target)));
      if (openingAngles.some((opening) => angleDistance(opening) < 0.34)) continue;
      const radialJitter = rng.float(-0.28, 0.32);
      const x = chamber.x + Math.cos(angle) * (radius + radialJitter);
      const z = chamber.z + Math.sin(angle) * (radius + radialJitter);
      const heightFeet = rng.int(9, 17);
      scene.primitives.push(box(
        `${chamber.id}-shell-wall-${index}`,
        0,
        x,
        chamber.y + FLOOR_SLAB_METERS,
        z,
        rng.float(1.05, 1.65),
        feetToMeters(heightFeet),
        rng.float(0.8, 1.35),
        "rock",
        ["cave-wall", "chamber-shell", "vertical-face", "blocks-sight", `room:${chamber.id}`],
        -angle,
      ));
      if (index % 4 === 1) {
        scene.primitives.push(primitive(
          `${chamber.id}-shell-overhang-${index}`,
          "sphere",
          0,
          x - Math.cos(angle) * 0.45,
          chamber.y + feetToMeters(heightFeet - 1),
          z - Math.sin(angle) * 0.45,
          cellsToMeters(1.4),
          cellsToMeters(1.1),
          cellsToMeters(1.5),
          "rock",
          ["cave-ceiling", "chamber-overhang", `room:${chamber.id}`],
        ));
      }
    }
  }
}

const ANCHORS = [
  { x: 0.15, z: 0.32 },
  { x: 0.34, z: 0.16 },
  { x: 0.61, z: 0.2 },
  { x: 0.83, z: 0.45 },
  { x: 0.67, z: 0.78 },
  { x: 0.37, z: 0.81 },
  { x: 0.14, z: 0.62 },
  { x: 0.48, z: 0.5 },
] as const;

const TOPOLOGIES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [6, 0, 1, 7, 3, 4, 5, 2],
  [1, 0, 6, 5, 7, 2, 3, 4],
  [2, 1, 7, 6, 5, 4, 3, 0],
] as const;

function caveBounds(context: GeneratorContext): { width: number; depth: number; chamberCount: number } {
  const { rng, request } = context;
  switch (request.size) {
    case "small":
      return { width: rng.int(24, 30), depth: rng.int(20, 26), chamberCount: rng.int(4, 5) };
    case "large":
      return { width: rng.int(42, 52), depth: rng.int(36, 46), chamberCount: rng.int(7, 8) };
    default:
      return { width: rng.int(32, 40), depth: rng.int(28, 36), chamberCount: rng.int(5, 7) };
  }
}

/**
 * A cave is represented as a connected chamber graph, not a building grid.
 * Chamber elevations evolve along the graph, so routes visibly climb and fall.
 */
export function generateCave(context: GeneratorContext): GeneratedScene {
  const { request, rng } = context;
  const { width, depth, chamberCount } = caveBounds(context);
  const topology = rng.pick(TOPOLOGIES);
  const title = rng.pick(["The Echoing Steps", "Mossfall Caverns", "The Windworn Hollows", "The Broken Underways"]);
  const scene = baseScene(
    "cave",
    title,
    `A ${chamberCount}-node natural cavern network with uneven shelves, connecting passages, and unstable ground.`,
    request.seed,
    { x: width, z: depth },
    1,
    [12],
  );
  scene.archetype = "cave";

  const chambers: Chamber[] = [];
  let elevationCells = rng.int(0, 1);
  for (let index = 0; index < chamberCount; index += 1) {
    const anchorIndex = topology[index] ?? 0;
    const anchor = ANCHORS[anchorIndex] ?? ANCHORS[0];
    const diameter = rng.int(request.density >= 0.65 ? 6 : 5, request.size === "large" ? 11 : 8);
    const x = clamp(anchor.x * width + rng.int(-1, 1), diameter / 2 + 1, width - diameter / 2 - 1);
    const z = clamp(anchor.z * depth + rng.int(-1, 1), diameter / 2 + 1, depth - diameter / 2 - 1);
    if (index > 0) elevationCells = clamp(elevationCells + rng.int(-1, 2), 0, 4);
    const y = cellsToMeters(elevationCells);
    const id = `cave-chamber-${index + 1}`;
    chambers.push({ id, x, z, y, diameter });
    const name = index === 0
      ? "Cave mouth"
      : rng.pick(["Dripstone hall", "Collapsed gallery", "Moss grotto", "Wind chamber", "Crystal shelf", "Black pool room"]);
    scene.rooms.push(createRoom(id, name, "natural", 0, x, z, diameter, diameter, y));
    scene.primitives.push(
      cylinder(`${id}-floor`, 0, x, y, z, diameter, FLOOR_SLAB_METERS, "rock", ["floor", "cavern", "natural"]),
      primitive(
        `${id}-ceiling-rock`,
        "sphere",
        0,
        x + diameter * 0.2,
        y + feetToMeters(rng.int(8, 13)),
        z - diameter * 0.16,
        cellsToMeters(Math.max(1.4, diameter * 0.38)),
        cellsToMeters(Math.max(1.2, diameter * 0.3)),
        cellsToMeters(Math.max(1.4, diameter * 0.38)),
        "rock",
        ["ceiling", "cavern-rock"],
      ),
    );

    const coverCount = rng.int(1, request.density >= 0.7 ? 3 : 2);
    for (let cover = 0; cover < coverCount; cover += 1) {
      const angle = (Math.PI * 2 * cover) / coverCount + rng.float(-0.45, 0.45);
      const distance = Math.max(1.2, diameter * (0.2 + cover * 0.1));
      const rockX = clamp(x + Math.cos(angle) * distance, 1, width - 1);
      const rockZ = clamp(z + Math.sin(angle) * distance, 1, depth - 1);
      scene.primitives.push(
        primitive(
          `${id}-cover-rock-${cover + 1}`,
          "sphere",
          0,
          rockX,
          y + FLOOR_SLAB_METERS,
          rockZ,
          cellsToMeters(1.1),
          cellsToMeters(1.1),
          cellsToMeters(1.1),
          "rock",
          ["rock", "cover"],
        ),
      );
      scene.tactical.push(tacticalFeature(`${id}-cover-${cover + 1}`, "cover", rockX, rockZ, y, 1, "A boulder provides hard cover in the uneven cave."));
    }
  }

  for (let index = 1; index < chambers.length; index += 1) {
    const previous = chambers[index - 1];
    const current = chambers[index];
    if (!previous || !current) continue;
    connectRooms(scene.rooms, previous.id, current.id);
    addCavePassage(scene, previous, current, `cave-route-${index}`, "primary", 2.1);
  }

  // Every medium and large network gets a non-linear connection, making this a
  // graph with a loop instead of a corridor chain.
  if (chambers.length >= 4) {
    const from = chambers[1];
    const to = chambers[chambers.length - 1];
    if (from && to) {
      connectRooms(scene.rooms, from.id, to.id);
      addCavePassage(scene, from, to, "cave-alternate-route", "alternate", 1.6);
      scene.tactical.push(tacticalFeature("cave-narrow-alternate", "chokepoint", (from.x + to.x) / 2, (from.z + to.z) / 2, Math.min(from.y, to.y), 1, "A narrow squeeze creates an alternate but dangerous flanking route."));
    }
  }
  addChamberShells(scene, chambers, rng.fork("chamber-shells"));

  const ledgeCandidates = chambers.slice(1);
  const ledgeCount = Math.min(ledgeCandidates.length, rng.int(1, request.size === "large" ? 3 : 2));
  for (let index = 0; index < ledgeCount; index += 1) {
    const chamber = ledgeCandidates[index];
    if (!chamber) continue;
    const ledgeHeight = feetToMeters(rng.int(5, 10));
    const ledgeX = clamp(chamber.x + chamber.diameter * 0.2, 1, width - 1);
    const ledgeZ = clamp(chamber.z - chamber.diameter * 0.18, 1, depth - 1);
    scene.primitives.push(
      box(`${chamber.id}-rock-ledge`, 0, ledgeX, chamber.y + ledgeHeight, ledgeZ, Math.max(2, chamber.diameter * 0.42), FLOOR_SLAB_METERS * 2, Math.max(2, chamber.diameter * 0.28), "rock", ["ledge", "platform", "high-ground"]),
      stairs(`${chamber.id}-ledge-ramp`, 0, (chamber.x + ledgeX) / 2, chamber.y + FLOOR_SLAB_METERS, (chamber.z + ledgeZ) / 2, 1.4, ledgeHeight, 3.2, "rock", ["natural-ramp", "ledge-access"]),
    );
    scene.tactical.push(tacticalFeature(`${chamber.id}-ledge-ground`, "highGround", ledgeX, ledgeZ, chamber.y + ledgeHeight, 2, "A natural stone shelf gives a clear height advantage."));
  }

  const dangerChamber = chambers[Math.min(chambers.length - 1, Math.max(1, rng.int(1, chambers.length - 1)))];
  if (dangerChamber) {
    const hazardIsWater = rng.bool();
    if (hazardIsWater) {
      scene.primitives.push(water(`${dangerChamber.id}-black-pool`, 0, dangerChamber.x - dangerChamber.diameter * 0.18, dangerChamber.y + FLOOR_SLAB_METERS, dangerChamber.z + dangerChamber.diameter * 0.16, Math.max(2, dangerChamber.diameter * 0.35), 0.22, Math.max(2, dangerChamber.diameter * 0.35), ["hazard", "black-pool"]));
    } else {
      scene.primitives.push(box(`${dangerChamber.id}-sinkhole`, 0, dangerChamber.x - dangerChamber.diameter * 0.18, dangerChamber.y + FLOOR_SLAB_METERS, dangerChamber.z + dangerChamber.diameter * 0.16, Math.max(2, dangerChamber.diameter * 0.36), 0.12, Math.max(2, dangerChamber.diameter * 0.36), "hazard", ["hazard", "sinkhole"]));
    }
    scene.tactical.push(tacticalFeature(`${dangerChamber.id}-hazard`, "hazard", dangerChamber.x - dangerChamber.diameter * 0.18, dangerChamber.z + dangerChamber.diameter * 0.16, dangerChamber.y, 2, hazardIsWater ? "A cold black pool conceals a sudden drop." : "Cracked stone collapses at the edge of a sinkhole."));
  }

  const entrance = chambers[0];
  const secret = chambers[chambers.length - 1];
  if (entrance) {
    scene.routes.push(createRoute("cave-entrance-route", "primary", [
      { x: Math.max(0, entrance.x - entrance.diameter / 2 - 2), z: entrance.z, y: entrance.y },
      { x: entrance.x, z: entrance.z, y: entrance.y },
    ]));
    scene.tactical.push(tacticalFeature("cave-entrance", "entrance", Math.max(0, entrance.x - entrance.diameter / 2), entrance.z, entrance.y, 2, "A sloping natural mouth opens into the first chamber."));
  }
  if (secret) {
    scene.tactical.push(tacticalFeature("cave-hidden-squeeze", "secret", secret.x + secret.diameter * 0.32, secret.z - secret.diameter * 0.26, secret.y, 1, "A concealed squeeze behind hanging stone offers a covert exit."));
  }

  const highestWalkableY = Math.max(
    0,
    ...scene.primitives
      .filter((primitive) => primitive.tags?.includes("floor") || primitive.tags?.includes("ledge") || primitive.tags?.includes("platform"))
      .map((primitive) => primitive.position.y + primitive.size.y),
  );
  // Cave "floor height" is a vertical envelope rather than a storey: it must
  // contain the highest shelf plus enough headroom to play on it.
  scene.floorHeightFeet = [Math.ceil((highestWalkableY + feetToMeters(11)) / 0.3048)];

  return scene;
}
