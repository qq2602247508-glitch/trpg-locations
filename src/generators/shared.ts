import {
  GRID_METERS,
  type GeneratedScene,
  type MaterialKey,
  type PrimitiveShape,
  type Room,
  type Route,
  type SceneKind,
  type ScenePrimitive,
  type TacticalFeature,
  type Vec2,
  type Vec3,
} from "../schema";

/** All authored layouts are measured in tactical cells, then emitted in metres. */
export const CELL = GRID_METERS;
export const FLOOR_SLAB_METERS = 0.18;
export const WALL_THICKNESS_METERS = 0.28;

export interface WallOpening {
  /** Offset from the wall midpoint, measured along that wall in cells. */
  offsetCells?: number;
  /** Clear opening width, measured along that wall in cells. */
  widthCells?: number;
}

export type WallOpeningSpec = WallOpening | readonly WallOpening[];

export interface RectangularShellOpenings {
  north?: WallOpeningSpec;
  south?: WallOpeningSpec;
  west?: WallOpeningSpec;
  east?: WallOpeningSpec;
}

/** A rectangular void carved out of a generated floor slab, in tactical cells. */
export interface FloorOpening {
  id: string;
  centerXCells: number;
  centerZCells: number;
  widthCells: number;
  depthCells: number;
  tags?: string[];
}

/** A world-height portal on either end of a climb; X/Z remain tactical cells. */
export interface StairPortal {
  xCells: number;
  zCells: number;
  yMeters: number;
}

export interface StairConnection {
  primitive: ScenePrimitive;
  bottom: StairPortal;
  top: StairPortal;
}

export const cellsToMeters = (cells: number): number => cells * CELL;
export const feetToMeters = (feet: number): number => feet * 0.3048;

export function cellPoint(x: number, z: number, y = 0): Vec3 {
  return { x: cellsToMeters(x), y, z: cellsToMeters(z) };
}

export function baseScene(
  kind: SceneKind,
  title: string,
  description: string,
  seed: string,
  boundsCells: Vec2,
  floors: number,
  floorHeightFeet: number[],
): GeneratedScene {
  return {
    version: 1,
    kind,
    title,
    description,
    seed,
    gridFeet: 5,
    boundsCells,
    floors,
    floorHeightFeet,
    primitives: [],
    rooms: [],
    routes: [],
    tactical: [],
    diagnostics: {
      valid: false,
      score: 0,
      warnings: [],
      repairs: [],
      metrics: {},
    },
    // Runtime is deliberately not measured here: a generated layout should be fully
    // reproducible for a request/seed pair, including when compared in tests.
    generationMs: 0,
  };
}

export function createRoom(
  id: string,
  name: string,
  role: Room["role"],
  level: number,
  xCells: number,
  zCells: number,
  widthCells: number,
  depthCells: number,
  yMeters = 0,
): Room {
  return {
    id,
    name,
    level,
    center: cellPoint(xCells, zCells, yMeters),
    sizeCells: { x: widthCells, z: depthCells },
    role,
    connections: [],
  };
}

export function connectRooms(rooms: Room[], firstId: string, secondId: string): void {
  const first = rooms.find((room) => room.id === firstId);
  const second = rooms.find((room) => room.id === secondId);
  if (!first || !second) {
    throw new Error(`Cannot connect missing rooms: ${firstId}, ${secondId}`);
  }
  if (!first.connections.includes(secondId)) first.connections.push(secondId);
  if (!second.connections.includes(firstId)) second.connections.push(firstId);
}

export function primitive(
  id: string,
  shape: PrimitiveShape,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  widthMeters: number,
  heightMeters: number,
  depthMeters: number,
  material: MaterialKey,
  tags: string[] = [],
  rotationY?: number,
): ScenePrimitive {
  return {
    id,
    shape,
    position: cellPoint(xCells, zCells, yMeters),
    size: { x: widthMeters, y: heightMeters, z: depthMeters },
    ...(rotationY === undefined ? {} : { rotationY }),
    material,
    level,
    tags,
  };
}

export function box(
  id: string,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  widthCells: number,
  heightMeters: number,
  depthCells: number,
  material: MaterialKey,
  tags: string[] = [],
  rotationY?: number,
): ScenePrimitive {
  return primitive(
    id,
    "box",
    level,
    xCells,
    yMeters,
    zCells,
    cellsToMeters(widthCells),
    heightMeters,
    cellsToMeters(depthCells),
    material,
    tags,
    rotationY,
  );
}

/** A non-walkable triangular terrain facing. Local +Z is the high edge. */
export function ramp(
  id: string,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  widthCells: number,
  heightMeters: number,
  runCells: number,
  material: MaterialKey,
  tags: string[] = [],
  rotationY = 0,
): ScenePrimitive {
  return primitive(id, "ramp", level, xCells, yMeters, zCells, cellsToMeters(widthCells), heightMeters, cellsToMeters(runCells), material, tags, rotationY);
}

/**
 * Builds a floor as non-overlapping slabs around one or more actual voids.
 * The opening frame is deliberately separate from `floor-slab` geometry, so
 * callers and tests can verify that no solid slab bridges a climb or shaft.
 */
export function floorSlabWithOpenings(
  id: string,
  level: number,
  centerXCells: number,
  baseY: number,
  centerZCells: number,
  widthCells: number,
  depthCells: number,
  material: MaterialKey,
  tags: string[] = [],
  openings: readonly FloorOpening[] = [],
): ScenePrimitive[] {
  const floorTags = ["floor", "floor-slab", ...tags];
  if (openings.length === 0) {
    return [box(`${id}-floor`, level, centerXCells, baseY, centerZCells, widthCells, FLOOR_SLAB_METERS, depthCells, material, floorTags)];
  }

  const minX = centerXCells - widthCells / 2;
  const maxX = centerXCells + widthCells / 2;
  const minZ = centerZCells - depthCells / 2;
  const maxZ = centerZCells + depthCells / 2;
  const clipped = openings
    .map((opening) => {
      const openingWidth = clamp(opening.widthCells, 0.8, widthCells - 0.2);
      const openingDepth = clamp(opening.depthCells, 0.8, depthCells - 0.2);
      const x = clamp(opening.centerXCells, minX + openingWidth / 2 + 0.05, maxX - openingWidth / 2 - 0.05);
      const z = clamp(opening.centerZCells, minZ + openingDepth / 2 + 0.05, maxZ - openingDepth / 2 - 0.05);
      return {
        ...opening,
        centerXCells: x,
        centerZCells: z,
        widthCells: openingWidth,
        depthCells: openingDepth,
        minX: x - openingWidth / 2,
        maxX: x + openingWidth / 2,
        minZ: z - openingDepth / 2,
        maxZ: z + openingDepth / 2,
      };
    });
  const xBounds = [...new Set([minX, maxX, ...clipped.flatMap((opening) => [opening.minX, opening.maxX])])].sort((left, right) => left - right);
  const zBounds = [...new Set([minZ, maxZ, ...clipped.flatMap((opening) => [opening.minZ, opening.maxZ])])].sort((left, right) => left - right);
  const primitives: ScenePrimitive[] = [];
  let piece = 0;

  for (let xIndex = 1; xIndex < xBounds.length; xIndex += 1) {
    const startX = xBounds[xIndex - 1];
    const endX = xBounds[xIndex];
    if (startX === undefined || endX === undefined || endX - startX <= 0.02) continue;
    for (let zIndex = 1; zIndex < zBounds.length; zIndex += 1) {
      const startZ = zBounds[zIndex - 1];
      const endZ = zBounds[zIndex];
      if (startZ === undefined || endZ === undefined || endZ - startZ <= 0.02) continue;
      const midpointX = (startX + endX) / 2;
      const midpointZ = (startZ + endZ) / 2;
      const isVoid = clipped.some((opening) => midpointX > opening.minX && midpointX < opening.maxX && midpointZ > opening.minZ && midpointZ < opening.maxZ);
      if (isVoid) continue;
      piece += 1;
      primitives.push(box(`${id}-floor-slab-${piece}`, level, midpointX, baseY, midpointZ, endX - startX, FLOOR_SLAB_METERS, endZ - startZ, material, floorTags));
    }
  }

  for (const opening of clipped) {
    const rim = Math.min(0.22, Math.max(0.12, Math.min(opening.widthCells, opening.depthCells) * 0.08));
    const frameTags = ["floor-opening", "opening-frame", `opening:${opening.id}`, ...(opening.tags ?? [])];
    const frameY = baseY + FLOOR_SLAB_METERS;
    const frameHeight = FLOOR_SLAB_METERS * 0.72;
    primitives.push(
      box(`${id}-${opening.id}-frame-north`, level, opening.centerXCells, frameY, opening.minZ - rim / 2, opening.widthCells + rim * 2, frameHeight, rim, material, frameTags),
      box(`${id}-${opening.id}-frame-south`, level, opening.centerXCells, frameY, opening.maxZ + rim / 2, opening.widthCells + rim * 2, frameHeight, rim, material, frameTags),
      box(`${id}-${opening.id}-frame-west`, level, opening.minX - rim / 2, frameY, opening.centerZCells, rim, frameHeight, opening.depthCells, material, frameTags),
      box(`${id}-${opening.id}-frame-east`, level, opening.maxX + rim / 2, frameY, opening.centerZCells, rim, frameHeight, opening.depthCells, material, frameTags),
    );
  }
  return primitives;
}

export function cylinder(
  id: string,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  diameterCells: number,
  heightMeters: number,
  material: MaterialKey,
  tags: string[] = [],
): ScenePrimitive {
  return primitive(
    id,
    "cylinder",
    level,
    xCells,
    yMeters,
    zCells,
    cellsToMeters(diameterCells),
    heightMeters,
    cellsToMeters(diameterCells),
    material,
    tags,
  );
}

export function water(
  id: string,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  widthCells: number,
  depthMeters: number,
  lengthCells: number,
  tags: string[] = [],
  rotationY?: number,
): ScenePrimitive {
  return primitive(
    id,
    "water",
    level,
    xCells,
    yMeters,
    zCells,
    cellsToMeters(widthCells),
    depthMeters,
    cellsToMeters(lengthCells),
    "water",
    ["water", ...tags],
    rotationY,
  );
}

export function stairs(
  id: string,
  level: number,
  xCells: number,
  yMeters: number,
  zCells: number,
  widthCells: number,
  riseMeters: number,
  runCells: number,
  material: MaterialKey,
  tags: string[] = [],
  rotationY?: number,
): ScenePrimitive {
  return primitive(
    id,
    "stairs",
    level,
    xCells,
    yMeters,
    zCells,
    cellsToMeters(widthCells),
    riseMeters,
    cellsToMeters(runCells),
    material,
    ["stairs", ...tags],
    rotationY,
  );
}

/**
 * Creates one climb from explicit bottom/top portals. The primitive's centre,
 * run, rotation, and all route endpoints can therefore be derived from the
 * same two facts rather than drifting apart as layouts evolve.
 */
export function stairConnection(
  id: string,
  level: number,
  bottom: StairPortal,
  top: StairPortal,
  widthCells: number,
  material: MaterialKey,
  tags: string[] = [],
): StairConnection {
  if (top.yMeters <= bottom.yMeters) {
    throw new Error(`${id} requires a top portal above its bottom portal`);
  }
  const dx = top.xCells - bottom.xCells;
  const dz = top.zCells - bottom.zCells;
  const runCells = Math.max(1, Math.hypot(dx, dz));
  return {
    primitive: stairs(
      id,
      level,
      (bottom.xCells + top.xCells) / 2,
      bottom.yMeters,
      (bottom.zCells + top.zCells) / 2,
      widthCells,
      top.yMeters - bottom.yMeters,
      runCells,
      material,
      ["stair-connection", "vertical", ...tags],
      Math.atan2(dx, dz),
    ),
    bottom,
    top,
  };
}

export function stairRoute(id: string, connection: StairConnection): Route {
  return createRoute(id, "vertical", [
    { x: connection.bottom.xCells, z: connection.bottom.zCells, y: connection.bottom.yMeters },
    { x: connection.top.xCells, z: connection.top.zCells, y: connection.top.yMeters },
  ]);
}

function splitWall(
  id: string,
  level: number,
  centerXCells: number,
  centerZCells: number,
  yMeters: number,
  lengthCells: number,
  heightMeters: number,
  horizontal: boolean,
  material: MaterialKey,
  tags: string[],
  opening?: WallOpeningSpec,
): ScenePrimitive[] {
  const whole = (): ScenePrimitive => horizontal
    ? primitive(id, "box", level, centerXCells, yMeters, centerZCells, cellsToMeters(lengthCells), heightMeters, WALL_THICKNESS_METERS, material, ["wall", ...tags])
    : primitive(id, "box", level, centerZCells, yMeters, centerXCells, WALL_THICKNESS_METERS, heightMeters, cellsToMeters(lengthCells), material, ["wall", ...tags]);
  if (!opening || (Array.isArray(opening) && opening.length === 0)) return [whole()];

  const requested = Array.isArray(opening) ? opening : [opening];
  // For north/south walls `centerXCells` is the varying coordinate. For west/east
  // callers pass their varying z coordinate through the same argument position.
  const start = centerXCells - lengthCells / 2;
  const end = start + lengthCells;
  const intervals = requested
    .map((entry) => {
      const clearWidth = clamp(entry.widthCells ?? 1.6, 0.8, Math.max(0.8, lengthCells - 0.8));
      const openingCenter = clamp(centerXCells + (entry.offsetCells ?? 0), start + clearWidth / 2 + 0.1, end - clearWidth / 2 - 0.1);
      return { start: openingCenter - clearWidth / 2, end: openingCenter + clearWidth / 2 };
    })
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end + 0.04) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  const result: ScenePrimitive[] = [];

  const makeSegment = (suffix: string, alongCenter: number, segmentLength: number): void => {
    if (segmentLength <= 0.05) return;
    if (horizontal) {
      result.push(primitive(`${id}-${suffix}`, "box", level, alongCenter, yMeters, centerZCells, cellsToMeters(segmentLength), heightMeters, WALL_THICKNESS_METERS, material, ["wall", "door-frame", ...tags]));
    } else {
      result.push(primitive(`${id}-${suffix}`, "box", level, centerZCells, yMeters, alongCenter, WALL_THICKNESS_METERS, heightMeters, cellsToMeters(segmentLength), material, ["wall", "door-frame", ...tags]));
    }
  };
  let cursor = start;
  for (let index = 0; index < merged.length; index += 1) {
    const interval = merged[index];
    if (!interval) continue;
    makeSegment(`segment-${index + 1}`, cursor + (interval.start - cursor) / 2, interval.start - cursor);
    cursor = interval.end;
  }
  makeSegment(`segment-${merged.length + 1}`, cursor + (end - cursor) / 2, end - cursor);
  return result;
}

/** Builds a horizontal (X) or vertical (Z) partition with one or more door gaps. */
export function wallWithOpenings(
  id: string,
  level: number,
  centerXCells: number,
  centerZCells: number,
  yMeters: number,
  lengthCells: number,
  heightMeters: number,
  axis: "x" | "z",
  material: MaterialKey,
  tags: string[] = [],
  openings: WallOpeningSpec = [],
): ScenePrimitive[] {
  if (axis === "x") {
    return splitWall(id, level, centerXCells, centerZCells, yMeters, lengthCells, heightMeters, true, material, tags, openings);
  }
  return splitWall(id, level, centerZCells, centerXCells, yMeters, lengthCells, heightMeters, false, material, tags, openings);
}

/** A floor and four retaining walls, optionally split around visible door openings. */
export function rectangularShell(
  id: string,
  level: number,
  centerXCells: number,
  centerZCells: number,
  baseY: number,
  widthCells: number,
  depthCells: number,
  wallHeightMeters: number,
  floorMaterial: MaterialKey,
  wallMaterial: MaterialKey,
  tags: string[] = [],
  openings: RectangularShellOpenings = {},
  floorOpenings: readonly FloorOpening[] = [],
): ScenePrimitive[] {
  const halfWidth = widthCells / 2;
  const halfDepth = depthCells / 2;
  const wallCenterY = baseY + FLOOR_SLAB_METERS;
  return [
    ...floorSlabWithOpenings(id, level, centerXCells, baseY, centerZCells, widthCells, depthCells, floorMaterial, tags, floorOpenings),
    ...splitWall(`${id}-north-wall`, level, centerXCells, centerZCells - halfDepth, wallCenterY, widthCells, wallHeightMeters, true, wallMaterial, tags, openings.north),
    ...splitWall(`${id}-south-wall`, level, centerXCells, centerZCells + halfDepth, wallCenterY, widthCells, wallHeightMeters, true, wallMaterial, tags, openings.south),
    // `splitWall` uses its first coordinate as the variable axis. Swapping
    // centerX/centerZ here lets a vertical wall split along Z while preserving
    // the authored world-space position.
    ...splitWall(`${id}-west-wall`, level, centerZCells, centerXCells - halfWidth, wallCenterY, depthCells, wallHeightMeters, false, wallMaterial, tags, openings.west),
    ...splitWall(`${id}-east-wall`, level, centerZCells, centerXCells + halfWidth, wallCenterY, depthCells, wallHeightMeters, false, wallMaterial, tags, openings.east),
  ];
}

/** A walkable connection whose long axis follows the supplied points. */
export function corridor(
  id: string,
  level: number,
  fromXCells: number,
  fromZCells: number,
  toXCells: number,
  toZCells: number,
  yMeters: number,
  widthCells: number,
  material: MaterialKey,
  tags: string[] = [],
): ScenePrimitive {
  const dx = toXCells - fromXCells;
  const dz = toZCells - fromZCells;
  const lengthCells = Math.max(1, Math.hypot(dx, dz));
  return primitive(
    id,
    "box",
    level,
    (fromXCells + toXCells) / 2,
    yMeters,
    (fromZCells + toZCells) / 2,
    cellsToMeters(widthCells),
    FLOOR_SLAB_METERS,
    cellsToMeters(lengthCells),
    material,
    ["floor", "corridor", ...tags],
    Math.atan2(dx, dz),
  );
}

export function createRoute(
  id: string,
  kind: Route["kind"],
  points: Array<{ x: number; z: number; y?: number }>,
  metadata: Pick<Route, "purpose" | "traffic" | "schedule"> = {},
): Route {
  return {
    id,
    kind,
    points: points.map((point) => cellPoint(point.x, point.z, point.y ?? 0)),
    ...metadata,
  };
}

export function tacticalFeature(
  id: string,
  kind: TacticalFeature["kind"],
  xCells: number,
  zCells: number,
  yMeters: number,
  radiusCells: number,
  note: string,
): TacticalFeature {
  return {
    id,
    kind,
    position: cellPoint(xCells, zCells, yMeters),
    radiusCells,
    note,
  };
}

export function choose<T>(
  rng: { int(min: number, max: number): number },
  values: readonly T[],
): T {
  if (values.length === 0) throw new Error("Cannot choose from an empty list");
  const selected = values[rng.int(0, values.length - 1)];
  if (selected === undefined) throw new Error("Seeded selection was out of range");
  return selected;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
