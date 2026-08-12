import { GRID_METERS, type BuildingProgramSummary, type GeneratedScene, type MaterialKey, type Room } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  cylinder,
  feetToMeters,
  primitive,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  type RectangularShellOpenings,
  wallWithOpenings,
} from "./shared";

export type BuildingZone = Room["role"];

export interface ProgramRoom {
  id: string;
  name: string;
  level: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  role: BuildingZone;
  tags: string[];
  floor?: MaterialKey;
  wall?: MaterialKey;
  openAir?: boolean;
  /** Optional signed offset from the authored floor stack. Negative values are
   * real below-grade rooms while retaining a stable UI level index. */
  elevationFeet?: number;
  /** Absolute signed elevation, used when a basement belongs to a separate
   * inspection layer but must still sit below grade. */
  absoluteElevationFeet?: number;
}

export interface ProgramConnection {
  id: string;
  from: string;
  to: string;
  kind: "door" | "corridor" | "service" | "secret" | "stair";
  width: number;
}

export type BuildingState = "ruined" | "abandoned" | "collapsed" | "fire" | "flooded" | "overgrown" | "infernal" | "war-damaged" | "sealed" | "temporary-conversion";
export type ExteriorStyle = "sacred-close" | "defensive-approach" | "institutional-street" | "coastal-cliff" | "service-yard" | "estate-drive" | "station-platform" | "academy-court";
export type FacadeStyle = "sacred" | "fortified" | "civic" | "industrial" | "domestic" | "academic";

export interface BuildingProgram {
  id: string;
  title: string;
  description: string;
  archetype: string;
  seed: string;
  bounds: { x: number; z: number };
  floorHeights: number[];
  floorLabels?: string[];
  rooms: ProgramRoom[];
  connections: ProgramConnection[];
  requiredFeatures: string[];
  detailCount?: number;
  floorMaterial: MaterialKey;
  wallMaterial: MaterialKey;
  states?: BuildingState[];
  exteriorStyle?: ExteriorStyle;
  facadeStyle?: FacadeStyle;
}

function roomBaseY(program: BuildingProgram, room: ProgramRoom): number {
  return baseY(program, room.level, room.elevationFeet, room.absoluteElevationFeet);
}

function addParapet(scene: GeneratedScene, id: string, room: ProgramRoom, y: number, material: MaterialKey): void {
  const h = feetToMeters(3.2);
  const t = 0.28;
  scene.primitives.push(
    box(`${id}-north`, room.level, room.x, y, room.z - room.depth / 2, room.width, h, t, material, ["parapet", "cover", "roof-route"]),
    box(`${id}-south`, room.level, room.x, y, room.z + room.depth / 2, room.width, h, t, material, ["parapet", "cover", "roof-route"]),
    box(`${id}-west`, room.level, room.x - room.width / 2, y, room.z, t, h, room.depth, material, ["parapet", "cover", "roof-route"]),
    box(`${id}-east`, room.level, room.x + room.width / 2, y, room.z, t, h, room.depth, material, ["parapet", "cover", "roof-route"]),
  );
}

function addFacadeAndMassing(scene: GeneratedScene, program: BuildingProgram): void {
  const aboveGrade = program.rooms.filter((room) => !room.openAir && room.absoluteElevationFeet === undefined && !room.tags.includes("underground"));
  const groundRooms = aboveGrade.filter((room) => room.level === 0);
  for (const room of groundRooms) {
    const y = roomBaseY(program, room) + feetToMeters(Math.min(7, (program.floorHeights[room.level] ?? 12) * 0.48));
    const nearNorth = room.z - room.depth / 2 < 6;
    const nearSouth = room.z + room.depth / 2 > program.bounds.z - 6;
    const sideZ = nearNorth ? room.z - room.depth / 2 - 0.05 : nearSouth ? room.z + room.depth / 2 + 0.05 : undefined;
    if (sideZ !== undefined) {
      const count = Math.max(1, Math.min(4, Math.floor(room.width / 4)));
      for (let index = 0; index < count; index += 1) {
        const x = room.x + (index - (count - 1) / 2) * Math.min(3, room.width / count);
        scene.primitives.push(box(`facade-window-${room.id}-${index}`, room.level, x, y, sideZ, 1.15, feetToMeters(4.6), 0.12, "warmLight", ["window", "facade", `room:${room.id}`]));
      }
    }
  }

  const roofRooms = program.rooms.filter((room) => room.tags.includes("roof-platform"));
  for (const room of roofRooms) addParapet(scene, `roof-parapet-${room.id}`, room, roomBaseY(program, room) + FLOOR_SLAB_METERS, program.wallMaterial);

  const tallestGround = groundRooms.toSorted((a, b) => b.width * b.depth - a.width * a.depth)[0];
  if (tallestGround) {
    const roofY = roomBaseY(program, tallestGround) + feetToMeters(program.floorHeights[0] ?? 12);
    if (program.facadeStyle === "domestic" || program.facadeStyle === "sacred" || program.facadeStyle === "academic") {
      const ranked = groundRooms.toSorted((a, b) => b.width * b.depth - a.width * a.depth);
      const roofCandidates = program.facadeStyle === "sacred"
        ? ranked.filter((room) => room.tags.some((tag) => tag === "nave" || tag === "prayer-room" || tag === "altar")).slice(0, 4)
        : ranked.slice(0, 3);
      for (const [index, roofRoom] of roofCandidates.entries()) {
        const roomRoofY = roomBaseY(program, roofRoom) + feetToMeters(program.floorHeights[roofRoom.level] ?? 12);
        const ridgeAlongX = roofRoom.width > roofRoom.depth;
        scene.primitives.push(primitive(
          `massing-gable-${roofRoom.id}-${index}`,
          "gable",
          roofRoom.level,
          roofRoom.x,
          roomRoofY,
          roofRoom.z,
          (ridgeAlongX ? roofRoom.depth + 1.1 : roofRoom.width + 1.1) * GRID_METERS,
          feetToMeters(program.facadeStyle === "sacred" ? 8 : 6),
          (ridgeAlongX ? roofRoom.width + 1.1 : roofRoom.depth + 1.1) * GRID_METERS,
          "roof",
          ["roof", "pitched-roof", "gable-roof", program.facadeStyle, `room:${roofRoom.id}`],
          ridgeAlongX ? Math.PI / 2 : 0,
        ));
      }
    }
    if (program.facadeStyle === "industrial") {
      for (let index = 0; index < 3; index += 1) scene.primitives.push(cylinder(`industrial-stack-${index}`, 0, tallestGround.x - tallestGround.width * 0.28 + index * tallestGround.width * 0.28, roofY, tallestGround.z + tallestGround.depth * 0.18, 1.1, feetToMeters(12 + index * 3), "metal", ["chimney", "industrial", "vertical-landmark"]));
    }
  }

  if (program.facadeStyle === "sacred") {
    const nave = program.rooms.find((room) => room.tags.includes("nave")) ?? groundRooms[0];
    if (nave) {
      const bell = program.rooms.find((room) => room.name.toLocaleLowerCase("en-US").includes("bell tower"));
      const towerX = bell?.x ?? nave.x - nave.width * 0.62;
      const towerZ = bell?.z ?? nave.z - nave.depth * 0.38;
      const towerH = feetToMeters((program.floorHeights[0] ?? 18) + 24);
      scene.primitives.push(
        box("sacred-bell-tower-mass", 0, towerX, 0, towerZ, 5.4, towerH, 5.4, program.wallMaterial, ["building-shell", "bell-tower", "vertical-landmark", "sacred"]),
        primitive("sacred-bell-spire", "cone", 0, towerX, towerH, towerZ, 6.2 * 1.524, feetToMeters(15), 6.2 * 1.524, "roof", ["roof", "spire", "bell-tower", "landmark"]),
      );
      for (const side of [-1, 1]) {
        scene.primitives.push(box(`sacred-buttress-${side}`, 0, nave.x + side * (nave.width / 2 + 0.35), 0, nave.z + nave.depth * 0.08, 0.8, feetToMeters(12), 3.2, "stone", ["flying-buttress", "sacred", "cover"]));
      }
    }
  }
  for (const tower of program.rooms.filter((room) => room.tags.includes("research-tower") || room.tags.includes("clock-tower"))) {
    const topY = roomBaseY(program, tower) + feetToMeters(program.floorHeights[tower.level] ?? 13);
    const diameter = Math.max(5.4, Math.min(tower.width, tower.depth) + 0.9);
    scene.primitives.push(
      cylinder(`facade-tower-${tower.id}`, tower.level, tower.x, 0, tower.z, diameter, topY, tower.tags.includes("clock-tower") ? "stone" : program.wallMaterial, ["building-shell", "tower-mass", "vertical-landmark", ...tower.tags]),
      primitive(`facade-tower-${tower.id}-cap`, "cone", tower.level, tower.x, topY, tower.z, (diameter + 1.1) * 1.524, feetToMeters(9), (diameter + 1.1) * 1.524, "roof", ["roof", "tower-cap", "vertical-landmark", ...tower.tags]),
    );
  }
}

function addExterior(scene: GeneratedScene, program: BuildingProgram): void {
  const cx = program.bounds.x / 2;
  const style = program.exteriorStyle;
  if (!style) return;
  const addApproach = (id: string, x: number, z: number, w: number, d: number, material: MaterialKey, tags: string[] = []) => scene.primitives.push(box(id, 0, x, 0, z, w, FLOOR_SLAB_METERS, d, material, ["floor", "exterior", "approach", ...tags]));
  if (style === "sacred-close") {
    addApproach("sacred-forecourt", cx, 2.2, 14, 5, "stone", ["forecourt"]);
    for (let index = 0; index < 8; index += 1) scene.primitives.push(box(`grave-marker-${index}`, 0, 3 + (index % 4) * 2.1, FLOOR_SLAB_METERS, 5 + Math.floor(index / 4) * 2.4, 0.55, feetToMeters(3.2), 1.1, "stone", ["graveyard", "cover"]));
  } else if (style === "defensive-approach") {
    addApproach("fortress-kill-approach", cx, 1.8, 18, 8, "earth", ["kill-zone"]);
    scene.primitives.push(box("fortress-ditch", 0, cx, -0.45, 5.5, 22, 0.35, 3.5, "hazard", ["ditch", "hazard", "exterior"]));
  } else if (style === "institutional-street") {
    addApproach("civic-front-street", cx, 2, 20, 5, "stone", ["street"]);
    addApproach("civic-rear-alley", program.bounds.x - 4, program.bounds.z - 4, 7, 15, "stone", ["rear-alley", "service-route"]);
  } else if (style === "coastal-cliff") {
    addApproach("cliff-maintenance-road", cx, program.bounds.z - 2, 22, 4, "rock", ["cliff-road", "high-ground"]);
    scene.primitives.push(box("cliff-drop", 0, cx, -feetToMeters(8), program.bounds.z + 1, 26, feetToMeters(8), 5, "rock", ["cliff", "vertical-face", "hazard"]));
  } else if (style === "service-yard") {
    addApproach("industrial-loading-yard", cx, 3, 22, 8, "stone", ["loading-yard"]);
    for (let index = 0; index < 4; index += 1) scene.primitives.push(cylinder(`yard-tank-${index}`, 0, 5 + index * 3.1, FLOOR_SLAB_METERS, program.bounds.z - 3.5, 2.1, feetToMeters(7), "metal", ["storage-tank", "cover", "exterior"]));
  } else if (style === "estate-drive") {
    addApproach("estate-carriage-drive", cx, 2.5, 8, 9, "stone", ["drive"]);
    for (const side of [-1, 1]) scene.primitives.push(box(`estate-gatehouse-${side}`, 0, cx + side * 7, 0, 2.5, 4, feetToMeters(9), 4, program.wallMaterial, ["gatehouse", "exterior", "cover"]));
  } else if (style === "station-platform") {
    addApproach("station-platform-a", cx - 7, program.bounds.z - 4, 5, 22, "stone", ["station-platform"]);
    addApproach("station-platform-b", cx + 7, program.bounds.z - 4, 5, 22, "stone", ["station-platform"]);
    scene.primitives.push(box("station-track-bed", 0, cx, -0.08, program.bounds.z - 4, 6, 0.12, 22, "darkStone", ["rail-track", "exterior"]));
  } else if (style === "academy-court") {
    addApproach("academy-processional-court", cx, 4, 18, 8, "stone", ["academy-court"]);
  }
}

function applyStates(scene: GeneratedScene, program: BuildingProgram): void {
  const states = new Set(program.states ?? []);
  if (states.has("abandoned") || states.has("ruined")) {
    for (let index = 0; index < 10; index += 1) {
      scene.primitives.push(box(`abandoned-debris-${index}`, 0, 4 + (index % 5) * Math.max(2, (program.bounds.x - 8) / 4), FLOOR_SLAB_METERS, 5 + Math.floor(index / 5) * Math.max(3, program.bounds.z * 0.42), 0.8 + (index % 3) * 0.35, 0.35 + (index % 2) * 0.25, 0.9 + ((index + 1) % 3) * 0.3, index % 2 === 0 ? "rock" : "wood", ["abandoned", "debris", "cover", "state"], index * 0.27));
    }
  }
  if (states.has("collapsed") || states.has("war-damaged")) {
    const candidateWalls = scene.primitives.filter((primitive) => primitive.tags?.includes("wall") && primitive.tags?.includes("program-room"));
    const removeIds = new Set(candidateWalls.filter((_, index) => index % 7 === 2 || index % 11 === 5).map((primitive) => primitive.id));
    scene.primitives = scene.primitives.filter((primitive) => !removeIds.has(primitive.id));
    const target = program.rooms.find((room) => room.tags.includes("collapsed-transept")) ?? program.rooms.find((room) => room.level === 0 && !room.openAir);
    if (target) {
      const y = roomBaseY(program, target) + FLOOR_SLAB_METERS;
      for (let index = 0; index < 7; index += 1) scene.primitives.push(box(`collapse-rubble-${index}`, target.level, target.x - target.width * 0.3 + (index % 4) * target.width * 0.2, y, target.z - target.depth * 0.2 + Math.floor(index / 4) * 1.8, 1.2 + (index % 3) * 0.35, 0.45 + (index % 2) * 0.35, 1.1, "rock", ["rubble", "cover", "collapsed", `room:${target.id}`], index * 0.31));
      scene.primitives.push(corridor("temporary-collapse-bridge", target.level, target.x - target.width * 0.42, target.z, target.x + target.width * 0.42, target.z, y + feetToMeters(2.5), 1.5, "wood", ["temporary-bridge", "alternate-route", "standable"]));
      scene.routes.push(createRoute("temporary-collapse-route", "alternate", [{ x: target.x - target.width * 0.42, z: target.z, y }, { x: target.x + target.width * 0.42, z: target.z, y: y + feetToMeters(2.5) }], { purpose: "escape" }));
    }
    if (program.archetype === "museum") {
      scene.primitives = scene.primitives.filter((primitive) => primitive.id !== "museum-glass-dome");
      const roof = program.rooms.find((room) => room.tags.includes("roof-platform"));
      if (roof) {
        const y = roomBaseY(program, roof) + FLOOR_SLAB_METERS;
        for (let index = 0; index < 6; index += 1) scene.primitives.push(box(`broken-dome-shard-${index}`, roof.level, roof.x - roof.width * 0.32 + index * roof.width * 0.13, y, roof.z + ((index % 2) - 0.5) * roof.depth * 0.28, 1.2, feetToMeters(2 + index % 3), 0.18, "warmLight", ["broken-glass", "collapsed", "roof-hazard"], index * 0.41));
      }
    }
  }
  if (states.has("flooded")) {
    for (const target of program.rooms.filter((room) => room.tags.includes("underground") || room.absoluteElevationFeet !== undefined)) {
      scene.primitives.push(primitive(`flood-${target.id}`, "water", target.level, target.x, roomBaseY(program, target) + FLOOR_SLAB_METERS + 0.06, target.z, target.width * 0.92 * 1.524, 0.22, target.depth * 0.92 * 1.524, "water", ["flooded", "hazard", `room:${target.id}`]));
    }
  }
  if (states.has("infernal")) {
    scene.primitives.push(
      primitive("infernal-lava-trench-a", "water", 0, program.bounds.x * 0.36, 0.04, program.bounds.z * 0.46, 2.2 * 1.524, 0.3, 18 * 1.524, "hazard", ["lava", "infernal", "hazard"]),
      primitive("infernal-lava-trench-b", "water", 0, program.bounds.x * 0.64, 0.04, program.bounds.z * 0.46, 2.2 * 1.524, 0.3, 18 * 1.524, "hazard", ["lava", "infernal", "hazard"]),
    );
    for (let index = 0; index < 5; index += 1) scene.primitives.push(cylinder(`infernal-chain-${index}`, 0, 5 + index * 7, feetToMeters(8), program.bounds.z * 0.54, 0.34, feetToMeters(18 + index * 2), "metal", ["chain", "infernal", "vertical-landmark"]));
  }
  if (states.has("fire")) {
    for (let index = 0; index < 5; index += 1) scene.primitives.push(primitive(`fire-zone-${index}`, "cone", 0, program.bounds.x * 0.28 + index * 2.1, FLOOR_SLAB_METERS, program.bounds.z * 0.7, 1.1, feetToMeters(6 + index), 1.1, "warmLight", ["fire", "hazard", "state"]));
  }
  if (states.has("overgrown")) {
    for (let index = 0; index < 9; index += 1) scene.primitives.push(cylinder(`overgrowth-${index}`, 0, 3 + (index % 5) * (program.bounds.x - 6) / 4, 0, 4 + Math.floor(index / 5) * (program.bounds.z - 8), 0.7, feetToMeters(5 + (index % 4) * 2), "moss", ["overgrowth", "cover", "state"]));
  }
}

function baseY(program: BuildingProgram, level: number, elevationFeet = 0, absoluteElevationFeet?: number): number {
  if (absoluteElevationFeet !== undefined) return feetToMeters(absoluteElevationFeet);
  return feetToMeters(program.floorHeights.slice(0, level).reduce((sum, value) => sum + value, 0) + elevationFeet);
}

function openingToward(room: ProgramRoom, other: ProgramRoom, width: number): RectangularShellOpenings {
  const dx = other.x - room.x;
  const dz = other.z - room.z;
  if (Math.abs(dx) > Math.abs(dz)) {
    return dx > 0 ? { east: { widthCells: width } } : { west: { widthCells: width } };
  }
  return dz > 0 ? { south: { widthCells: width } } : { north: { widthCells: width } };
}

function mergeOpenings(target: RectangularShellOpenings, additions: RectangularShellOpenings): void {
  for (const side of ["north", "south", "west", "east"] as const) {
    const addition = additions[side];
    if (!addition) continue;
    const current = target[side];
    target[side] = current ? [...(Array.isArray(current) ? current : [current]), ...(Array.isArray(addition) ? addition : [addition])] : addition;
  }
}

function boundaryPoint(from: ProgramRoom, to: ProgramRoom): { x: number; z: number } {
  if (from.openAir) return { x: from.x, z: from.z };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) > Math.abs(dz)) return { x: from.x + Math.sign(dx) * from.width / 2, z: from.z };
  return { x: from.x, z: from.z + Math.sign(dz) * from.depth / 2 };
}

/** Compile an auditable room graph into real floors, walls, door gaps, corridors and stairs. */
export function compileBuildingProgram(program: BuildingProgram): GeneratedScene {
  const scene = baseScene("building", program.title, program.description, program.seed, program.bounds, program.floorHeights.length, program.floorHeights);
  if (program.floorLabels) scene.floorLabels = [...program.floorLabels];
  scene.archetype = program.archetype;
  const topology: BuildingProgramSummary["topology"] = program.archetype === "manor" ? "courtyard" : program.archetype === "fortress" ? "defensive" : program.archetype === "hospital" || program.archetype === "police" || program.archetype === "museum" ? "institutional" : "composite";
  scene.buildingProgram = { archetype: program.archetype, requiredFeatures: [...program.requiredFeatures], roomCount: program.rooms.length, connectionCount: program.connections.length, levels: program.floorHeights.length, topology };
  const roomsById = new Map(program.rooms.map((room) => [room.id, room]));
  const openings = new Map<string, RectangularShellOpenings>();

  for (const connection of program.connections) {
    const from = roomsById.get(connection.from);
    const to = roomsById.get(connection.to);
    if (!from || !to) continue;
    const fromOpenings = openings.get(from.id) ?? {};
    const toOpenings = openings.get(to.id) ?? {};
    mergeOpenings(fromOpenings, openingToward(from, to, connection.width));
    mergeOpenings(toOpenings, openingToward(to, from, connection.width));
    openings.set(from.id, fromOpenings);
    openings.set(to.id, toOpenings);
  }

  for (const room of program.rooms) {
    const y = baseY(program, room.level, room.elevationFeet, room.absoluteElevationFeet);
    scene.rooms.push(createRoom(room.id, room.name, room.role, room.level, room.x, room.z, room.width, room.depth, y));
    if (room.openAir) {
      scene.primitives.push(box(`${room.id}-open-floor`, room.level, room.x, y, room.z, room.width, FLOOR_SLAB_METERS, room.depth, room.floor ?? "stone", ["floor", "courtyard", ...room.tags]));
      continue;
    }
    scene.primitives.push(...rectangularShell(
      room.id,
      room.level,
      room.x,
      room.z,
      y,
      room.width,
      room.depth,
      feetToMeters(program.floorHeights[room.level] ?? 12) - FLOOR_SLAB_METERS,
      room.floor ?? program.floorMaterial,
      room.wall ?? program.wallMaterial,
      ["building-shell", "program-room", `room:${room.id}`, ...room.tags],
      openings.get(room.id) ?? {},
    ));
  }

  for (const connection of program.connections) {
    const from = roomsById.get(connection.from);
    const to = roomsById.get(connection.to);
    if (!from || !to) continue;
    connectRooms(scene.rooms, from.id, to.id);
    if (connection.kind === "stair" || from.level !== to.level) {
      const fromHeight = baseY(program, from.level, from.elevationFeet, from.absoluteElevationFeet);
      const toHeight = baseY(program, to.level, to.elevationFeet, to.absoluteElevationFeet);
      const lower = fromHeight <= toHeight ? from : to;
      const upper = fromHeight <= toHeight ? to : from;
      const lowerY = baseY(program, lower.level, lower.elevationFeet, lower.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      const upperY = baseY(program, upper.level, upper.elevationFeet, upper.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      const riseCells = Math.abs(upperY - lowerY) / feetToMeters(5);
      const alongX = lower.width >= lower.depth;
      const available = Math.max(3.2, (alongX ? lower.width : lower.depth) - 1.8);
      const run = Math.min(available, Math.max(3.2, Math.min(6.5, riseCells * 1.55)));
      const direction = alongX ? (upper.x >= lower.x ? 1 : -1) : (upper.z >= lower.z ? 1 : -1);
      const bottom = { xCells: lower.x - (alongX ? direction * run * 0.5 : 0), zCells: lower.z - (alongX ? 0 : direction * run * 0.5), yMeters: lowerY };
      const top = { xCells: lower.x + (alongX ? direction * run * 0.5 : 0), zCells: lower.z + (alongX ? 0 : direction * run * 0.5), yMeters: upperY };
      const stair = stairConnection(connection.id, lower.level, bottom, top, connection.width, "stone", ["building-stair", "vertical-opening", `connects:${lower.id}:${upper.id}`]);
      scene.primitives.push(
        stair.primitive,
        box(`${connection.id}-lower-landing`, lower.level, bottom.xCells, lowerY, bottom.zCells, connection.width + 0.8, FLOOR_SLAB_METERS, 2.2, lower.floor ?? program.floorMaterial, ["floor", "stair-landing", "standable", `room:${lower.id}`]),
        box(`${connection.id}-upper-landing`, upper.level, top.xCells, upperY, top.zCells, connection.width + 0.8, FLOOR_SLAB_METERS, 2.2, upper.floor ?? program.floorMaterial, ["floor", "stair-landing", "standable", `room:${upper.id}`]),
      );
      scene.routes.push(stairRoute(`${connection.id}-route`, stair));
      continue;
    }
    const y = baseY(program, from.level, from.elevationFeet, from.absoluteElevationFeet) + FLOOR_SLAB_METERS;
    const fromPortal = boundaryPoint(from, to);
    const toPortal = boundaryPoint(to, from);
    scene.primitives.push(corridor(connection.id, from.level, fromPortal.x, fromPortal.z, toPortal.x, toPortal.z, y, connection.width, connection.kind === "service" ? "stone" : "wood", ["building-connection", `connection:${connection.kind}`]));
    scene.routes.push(createRoute(`${connection.id}-route`, connection.kind === "secret" || connection.kind === "service" ? "alternate" : "primary", [{ x: from.x, z: from.z, y }, { x: to.x, z: to.z, y }], { purpose: connection.kind === "service" ? "service" : connection.kind === "secret" ? "escape" : "movement" }));
  }

  const entrance = program.rooms.find((room) => room.tags.includes("entrance")) ?? program.rooms[0];
  if (entrance) scene.tactical.push(tacticalFeature(`${program.id}-entrance`, "entrance", entrance.x, entrance.z, baseY(program, entrance.level, entrance.elevationFeet, entrance.absoluteElevationFeet), 2, `Primary entrance to ${program.title}.`));
  const high = program.rooms.find((room) => room.tags.includes("roof-platform") || room.tags.includes("high-ground"));
  if (high) scene.tactical.push(tacticalFeature(`${program.id}-high-ground`, "highGround", high.x, high.z, baseY(program, high.level, high.elevationFeet, high.absoluteElevationFeet), 3, `${high.name} is a reachable elevated combat position.`));
  const fixtureRooms = program.rooms.filter((room) => !room.openAir && !room.tags.includes("roof-platform"));
  for (let index = 0; index < (program.detailCount ?? 0); index += 1) {
    const target = fixtureRooms[index % Math.max(1, fixtureRooms.length)];
    if (!target) continue;
    const column = index % 3;
    scene.primitives.push(box(`${program.id}-functional-fixture-${index}`, target.level, target.x + (column - 1) * Math.min(1.4, target.width * 0.16), baseY(program, target.level, target.elevationFeet, target.absoluteElevationFeet) + FLOOR_SLAB_METERS, target.z, 0.7, 1.25, 1.4, target.tags.includes("underground") ? "metal" : "wood", ["functional-fixture", `room:${target.id}`, "cover"]));
  }
  for (const target of program.rooms) {
    const y = baseY(program, target.level, target.elevationFeet, target.absoluteElevationFeet) + FLOOR_SLAB_METERS;
    if (target.tags.includes("antenna-platform")) {
      scene.primitives.push(cylinder(`${program.id}-antenna-mast`, target.level, target.x, y, target.z, 0.55, feetToMeters(18), "metal", ["antenna", "vertical-landmark", "roof-platform", `room:${target.id}`]));
    }
    if (target.tags.includes("radio-room")) {
      scene.primitives.push(box(`${program.id}-radio-console`, target.level, target.x, y, target.z, 3.2, feetToMeters(4), 1.1, "metal", ["radio-console", "evidence", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("bunker")) {
      scene.primitives.push(box(`${program.id}-bunker-stores`, target.level, target.x, y, target.z, 3.4, feetToMeters(3.5), 2, "wood", ["bunker", "emergency-stores", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("alchemy-lab")) {
      for (let index = 0; index < 3; index += 1) {
        scene.primitives.push(box(`${target.id}-alchemy-bench-${index}`, target.level, target.x - target.width * 0.28 + index * target.width * 0.28, y, target.z, 2.2, feetToMeters(3.2), 1.1, "wood", ["alchemy-bench", "cover", `room:${target.id}`]));
        scene.primitives.push(primitive(`${target.id}-alembic-${index}`, "sphere", target.level, target.x - target.width * 0.28 + index * target.width * 0.28, y + feetToMeters(3.2), target.z, 0.65, 0.65, 0.65, "warmLight", ["alembic", "alchemy", `room:${target.id}`]));
      }
    }
    if (target.tags.includes("library")) {
      for (let index = 0; index < 5; index += 1) scene.primitives.push(box(`${target.id}-stack-${index}`, target.level, target.x - target.width * 0.35 + index * target.width * 0.175, y, target.z + target.depth * 0.2, 0.65, feetToMeters(8), target.depth * 0.34, "wood", ["bookcase", "blocks-sight", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("ritual-circle") || target.tags.includes("summoning-circle") || target.tags.includes("ritual-core")) {
      scene.primitives.push(cylinder(`${target.id}-ritual-dais`, target.level, target.x, y, target.z, Math.max(3, Math.min(target.width, target.depth) * 0.48), feetToMeters(1.2), target.tags.includes("ritual-core") ? "hazard" : "darkStone", ["ritual-circle", "objective", "platform", `room:${target.id}`]));
    }
    if (target.tags.includes("turbine-hall")) {
      for (let index = 0; index < 3; index += 1) scene.primitives.push(cylinder(`${target.id}-turbine-${index}`, target.level, target.x - target.width * 0.3 + index * target.width * 0.3, y, target.z, 3.4, feetToMeters(9), "metal", ["turbine", "machinery", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("boiler")) {
      for (let index = 0; index < 3; index += 1) scene.primitives.push(cylinder(`${target.id}-boiler-${index}`, target.level, target.x - target.width * 0.28 + index * target.width * 0.28, y, target.z, 2.2, feetToMeters(8), "metal", ["boiler", "machinery", "hazard", `room:${target.id}`]));
    }
    if (target.tags.includes("control-room")) {
      scene.primitives.push(box(`${target.id}-control-bank`, target.level, target.x, y, target.z, target.width * 0.62, feetToMeters(4), 1.2, "metal", ["control-console", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("detention")) {
      for (let index = 0; index < 4; index += 1) scene.primitives.push(box(`${target.id}-cell-bars-${index}`, target.level, target.x - target.width * 0.36 + index * target.width * 0.24, y, target.z, 0.16, feetToMeters(8), target.depth * 0.72, "metal", ["cell-bars", "detention", `room:${target.id}`]));
    }
    if (target.tags.includes("taproom") || target.tags.includes("dining")) {
      const count = Math.max(3, Math.floor(target.width * target.depth / 28));
      for (let index = 0; index < count; index += 1) scene.primitives.push(cylinder(`${target.id}-table-${index}`, target.level, target.x - target.width * 0.3 + (index % 3) * target.width * 0.3, y, target.z - target.depth * 0.22 + Math.floor(index / 3) * 2.7, 1.8, feetToMeters(3), "wood", ["table", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("kitchen")) {
      scene.primitives.push(box(`${target.id}-hearth`, target.level, target.x, y, target.z + target.depth * 0.32, target.width * 0.58, feetToMeters(4), 1.2, "darkStone", ["kitchen-hearth", "hazard", `room:${target.id}`]));
    }
    if (target.tags.includes("war-machine-workshop")) {
      scene.primitives.push(cylinder(`${target.id}-war-engine`, target.level, target.x, y, target.z, Math.min(5, target.width * 0.56), feetToMeters(8), "metal", ["war-machine", "infernal", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("archive-carriage")) {
      scene.primitives.push(box(`${target.id}-rail-car-body`, target.level, target.x, y + feetToMeters(1), target.z, target.width * 0.82, feetToMeters(7), target.depth * 0.88, "wood", ["rail-car", "archive", "landmark", `room:${target.id}`]));
    }
    if (target.tags.includes("guest-room") || target.tags.includes("attic") || target.tags.includes("suite")) {
      scene.primitives.push(box(`${target.id}-bed`, target.level, target.x - target.width * 0.18, y, target.z, 2.1, feetToMeters(2.5), 3.3, "wood", ["bed", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("front-desk")) {
      scene.primitives.push(box(`${target.id}-public-counter`, target.level, target.x, y, target.z + target.depth * 0.22, target.width * 0.58, feetToMeters(3.8), 1.1, "wood", ["front-desk", "counter", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("interview") || target.tags.includes("interrogation")) {
      scene.primitives.push(box(`${target.id}-interview-table`, target.level, target.x, y, target.z, 2.8, feetToMeters(3), 1.4, "metal", ["interview-table", "investigation", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("garage")) {
      scene.primitives.push(box(`${target.id}-vehicle`, target.level, target.x, y + 0.22, target.z, target.width * 0.58, feetToMeters(4.5), target.depth * 0.48, "metal", ["vehicle", "garage", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("nave")) {
      for (let row = 0; row < 5; row += 1) for (const side of [-1, 1]) scene.primitives.push(box(`${target.id}-pew-${row}-${side}`, target.level, target.x + side * target.width * 0.22, y, target.z - target.depth * 0.3 + row * target.depth * 0.14, target.width * 0.34, feetToMeters(2.8), 0.8, "wood", ["pew", "cover", "sacred", `room:${target.id}`]));
    }
    if (target.tags.includes("altar")) {
      scene.primitives.push(box(`${target.id}-altar`, target.level, target.x, y + feetToMeters(1.2), target.z, Math.max(3, target.width * 0.5), feetToMeters(3.6), 1.6, "stone", ["altar", "objective", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("crypt")) {
      for (let index = 0; index < 6; index += 1) scene.primitives.push(box(`${target.id}-coffin-${index}`, target.level, target.x - target.width * 0.28 + (index % 3) * target.width * 0.28, y, target.z - target.depth * 0.22 + Math.floor(index / 3) * target.depth * 0.42, 2.1, feetToMeters(2.6), 3.5, "stone", ["coffin", "crypt", "cover", `room:${target.id}`]));
    }
    if (target.tags.includes("research-tower")) {
      scene.primitives.push(cylinder(`${target.id}-arcane-instrument`, target.level, target.x, y, target.z, 2.4, feetToMeters(7), "metal", ["arcane-instrument", "research", "landmark", `room:${target.id}`]));
    }
    if (target.tags.includes("auditorium")) {
      for (let row = 0; row < 6; row += 1) {
        const rowWidth = target.width * (0.48 + row * 0.045);
        for (const side of [-1, 1]) {
          scene.primitives.push(box(`${target.id}-seat-row-${row}-${side < 0 ? "west" : "east"}`, target.level, target.x + side * rowWidth * 0.26, y, target.z - target.depth * 0.3 + row * target.depth * 0.1, rowWidth * 0.42, feetToMeters(2.8), 0.72, "wood", ["opera-house", "auditorium-seat", "cover", `room:${target.id}`]));
        }
      }
    }
    if (target.tags.includes("orchestra-pit")) {
      scene.primitives.push(
        box(`${target.id}-pit-floor`, target.level, target.x, y - feetToMeters(3), target.z, target.width * 0.86, FLOOR_SLAB_METERS, target.depth * 0.8, "wood", ["opera-house", "orchestra-pit", "sunken-floor", "standable", `room:${target.id}`]),
        box(`${target.id}-music-stand-line`, target.level, target.x, y - feetToMeters(2.8), target.z, target.width * 0.62, feetToMeters(2.5), 0.6, "wood", ["opera-house", "music-stand", "cover", `room:${target.id}`]),
      );
    }
    if (target.tags.includes("stage")) {
      scene.primitives.push(
        box(`${target.id}-stage-deck`, target.level, target.x, y + feetToMeters(3), target.z, target.width * 0.9, feetToMeters(3), target.depth * 0.82, "wood", ["opera-house", "stage", "platform", "standable", "high-ground", `room:${target.id}`]),
        box(`${target.id}-proscenium-west`, target.level, target.x - target.width * 0.44, y, target.z - target.depth * 0.42, 0.8, feetToMeters(16), 1.2, "plaster", ["opera-house", "proscenium", "structural-support", `room:${target.id}`]),
        box(`${target.id}-proscenium-east`, target.level, target.x + target.width * 0.44, y, target.z - target.depth * 0.42, 0.8, feetToMeters(16), 1.2, "plaster", ["opera-house", "proscenium", "structural-support", `room:${target.id}`]),
      );
    }
    if (target.tags.includes("backstage")) {
      for (let index = 0; index < 3; index += 1) {
        scene.primitives.push(box(`${target.id}-scenery-flat-${index}`, target.level, target.x - target.width * 0.28 + index * target.width * 0.28, y, target.z, 0.5, feetToMeters(9), target.depth * 0.55, "wood", ["opera-house", "scenery-flat", "cover", `room:${target.id}`]));
      }
    }
    if (target.tags.includes("dressing-room")) {
      scene.primitives.push(
        box(`${target.id}-costume-rack`, target.level, target.x - target.width * 0.22, y, target.z, 0.7, feetToMeters(6.5), target.depth * 0.54, "wood", ["opera-house", "costume-rack", "cover", `room:${target.id}`]),
        box(`${target.id}-mirror-bank`, target.level, target.x + target.width * 0.2, y, target.z, 0.7, feetToMeters(5), target.depth * 0.48, "warmLight", ["opera-house", "dressing-mirror", `room:${target.id}`]),
      );
    }
    if (target.tags.includes("prop-store")) {
      for (let index = 0; index < 4; index += 1) {
        scene.primitives.push(box(`${target.id}-prop-crate-${index}`, target.level, target.x - target.width * 0.3 + index * target.width * 0.2, y, target.z, 1.6, feetToMeters(3.2 + index * 0.35), 1.4, "wood", ["opera-house", "prop-crate", "cover", "flooded", `room:${target.id}`]));
      }
    }
  }
  if (program.archetype === "hospital") {
    for (const target of program.rooms.filter((room) => /clinical|treatment|patient ward/i.test(room.name))) {
      for (let index = 0; index < Math.max(2, Math.floor(target.depth / 3)); index += 1) {
        scene.primitives.push(box(`hospital-bed-${target.id}-${index}`, target.level, target.x - target.width * 0.22 + (index % 2) * target.width * 0.44, baseY(program, target.level, target.elevationFeet, target.absoluteElevationFeet) + FLOOR_SLAB_METERS, target.z - target.depth * 0.28 + Math.floor(index / 2) * 2.2, 1.8, 0.72, 3.2, "wood", ["hospital", "bed", "cover", `room:${target.id}`]));
      }
    }
    const morgue = program.rooms.find((room) => /morgue/i.test(room.name));
    if (morgue) scene.primitives.push(box("hospital-autopsy-table", morgue.level, morgue.x, baseY(program, morgue.level, morgue.elevationFeet, morgue.absoluteElevationFeet) + FLOOR_SLAB_METERS, morgue.z, 2, 0.95, 4, "metal", ["hospital", "morgue", "autopsy", "evidence"]));
    const basementLab = program.rooms.find((room) => /boiler|laboratory/i.test(room.name));
    if (basementLab) {
      const y = baseY(program, basementLab.level, basementLab.elevationFeet, basementLab.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      scene.primitives.push(
        cylinder("hospital-basement-boiler-a", basementLab.level, basementLab.x - basementLab.width * 0.24, y, basementLab.z, 1.5, feetToMeters(7), "metal", ["hospital", "boiler", "machinery", "hazard", `room:${basementLab.id}`]),
        cylinder("hospital-basement-boiler-b", basementLab.level, basementLab.x + basementLab.width * 0.24, y, basementLab.z, 1.5, feetToMeters(7), "metal", ["hospital", "boiler", "machinery", "cover", `room:${basementLab.id}`]),
        box("hospital-secret-lab-table", basementLab.level, basementLab.x, y, basementLab.z - basementLab.depth * 0.25, 3.2, feetToMeters(3), 1.4, "metal", ["hospital", "secret-laboratory", "evidence", `room:${basementLab.id}`]),
      );
    }
  }
  if (program.archetype === "police") {
    scene.primitives.push(box("police-evidence-cages", 0, 29, baseY(program, 0) + FLOOR_SLAB_METERS, 25, 4, 2.4, 4, "metal", ["police", "evidence", "room-partition", "cover"]));
    const evidenceVault = program.rooms.find((room) => /evidence vault/i.test(room.name));
    if (evidenceVault) {
      const y = baseY(program, evidenceVault.level, evidenceVault.elevationFeet, evidenceVault.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      for (let index = 0; index < 4; index += 1) {
        scene.primitives.push(box(`police-vault-shelf-${index}`, evidenceVault.level, evidenceVault.x - evidenceVault.width * 0.28 + index * evidenceVault.width * 0.19, y, evidenceVault.z, 0.75, feetToMeters(6), evidenceVault.depth * 0.56, "metal", ["police", "evidence-shelf", "evidence", "cover", `room:${evidenceVault.id}`]));
      }
    }
  }
  if (program.archetype === "fortress") {
    const cx = program.bounds.x / 2;
    const cz = program.bounds.z / 2;
    const x0 = 2.5;
    const x1 = program.bounds.x - 2.5;
    const z0 = 2.5;
    const z1 = program.bounds.z - 2.5;
    const wallHeight = feetToMeters(18);
    const walkY = feetToMeters(14);
    scene.primitives.push(
      ...wallWithOpenings("fortress-outer-north", 0, cx, z0, FLOOR_SLAB_METERS, x1 - x0, wallHeight, "x", "darkStone", ["wall", "curtain-wall", "fortress"], { widthCells: 3.4 }),
      ...wallWithOpenings("fortress-outer-south", 0, cx, z1, FLOOR_SLAB_METERS, x1 - x0, wallHeight, "x", "darkStone", ["wall", "curtain-wall", "fortress"], []),
      ...wallWithOpenings("fortress-outer-west", 0, x0, cz, FLOOR_SLAB_METERS, z1 - z0, wallHeight, "z", "darkStone", ["wall", "curtain-wall", "fortress"], []),
      ...wallWithOpenings("fortress-outer-east", 0, x1, cz, FLOOR_SLAB_METERS, z1 - z0, wallHeight, "z", "darkStone", ["wall", "curtain-wall", "fortress"], []),
      box("fortress-north-wall-walk", 1, cx, walkY, z0 + 0.45, x1 - x0 - 5, FLOOR_SLAB_METERS, 2.2, "stone", ["floor", "platform", "wall-walk", "high-ground", "fortress"]),
      box("fortress-south-wall-walk", 1, cx, walkY, z1 - 0.45, x1 - x0 - 5, FLOOR_SLAB_METERS, 2.2, "stone", ["floor", "platform", "wall-walk", "high-ground", "fortress"]),
      box("fortress-west-wall-walk", 1, x0 + 0.45, walkY, cz, 2.2, FLOOR_SLAB_METERS, z1 - z0 - 5, "stone", ["floor", "platform", "wall-walk", "high-ground", "fortress"]),
      box("fortress-east-wall-walk", 1, x1 - 0.45, walkY, cz, 2.2, FLOOR_SLAB_METERS, z1 - z0 - 5, "stone", ["floor", "platform", "wall-walk", "high-ground", "fortress"]),
      box("fortress-portcullis", 0, cx, FLOOR_SLAB_METERS, z0 + 0.25, 3.2, feetToMeters(10), 0.25, "metal", ["portcullis", "gatehouse", "chokepoint", "fortress"]),
    );
    for (const [index, x, z] of [[0, x0, z0], [1, x1, z0], [2, x0, z1], [3, x1, z1]] as const) {
      scene.primitives.push(cylinder(`fortress-bastion-${index}`, 0, x, 0, z, 4.4, feetToMeters(25), "darkStone", ["corner-tower", "bastion", "high-ground", "fortress"]));
    }
    for (let index = 0; index < 12; index += 1) {
      const x = x0 + 2 + index * ((x1 - x0 - 4) / 11);
      scene.primitives.push(
        box(`fortress-crenel-north-${index}`, 1, x, walkY + feetToMeters(2.5), z0, 1.1, feetToMeters(3), 0.8, "darkStone", ["battlement", "cover", "wall-walk", "fortress"]),
        box(`fortress-crenel-south-${index}`, 1, x, walkY + feetToMeters(2.5), z1, 1.1, feetToMeters(3), 0.8, "darkStone", ["battlement", "cover", "wall-walk", "fortress"]),
      );
    }
    const armory = program.rooms.find((room) => room.tags.includes("armory"));
    if (armory) {
      const y = baseY(program, armory.level, armory.elevationFeet, armory.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      for (let index = 0; index < 3; index += 1) {
        scene.primitives.push(box(`fortress-armory-rack-${index}`, armory.level, armory.x - armory.width * 0.26 + index * armory.width * 0.26, y, armory.z + armory.depth * 0.22, 0.8, feetToMeters(6), armory.depth * 0.34, "wood", ["armory", "weapon-rack", "cover", `room:${armory.id}`]));
      }
      scene.primitives.push(box("fortress-armory-crates", armory.level, armory.x, y, armory.z - armory.depth * 0.24, 2.4, feetToMeters(3), 1.8, "wood", ["armory", "supply-crates", "cover", `room:${armory.id}`]));
    }
  }
  if (program.archetype === "museum") {
    for (const target of program.rooms.filter((room) => /exhibition|gallery/i.test(room.name))) {
      const y = baseY(program, target.level, target.elevationFeet, target.absoluteElevationFeet) + FLOOR_SLAB_METERS;
      for (let index = 0; index < 4; index += 1) scene.primitives.push(box(`museum-case-${target.id}-${index}`, target.level, target.x - target.width * 0.3 + index * target.width * 0.2, y, target.z, 1.4, feetToMeters(4), 1.4, "warmLight", ["museum", "display-case", "evidence", "cover", `room:${target.id}`]));
    }
    const roof = program.rooms.find((room) => room.tags.includes("roof-platform"));
    if (roof) {
      const y = baseY(program, roof.level, roof.elevationFeet, roof.absoluteElevationFeet);
      scene.primitives.push(
        primitive("museum-glass-dome", "sphere", roof.level, roof.x, y, roof.z, Math.min(roof.width, roof.depth) * 0.72 * 1.524, feetToMeters(7), Math.min(roof.width, roof.depth) * 0.72 * 1.524, "warmLight", ["museum", "glass-dome", "landmark", "roof"]),
        box("museum-roof-parapet-north", roof.level, roof.x, y, roof.z - roof.depth / 2, roof.width, feetToMeters(3), 0.35, "stone", ["museum", "parapet", "roof-route", "cover"]),
        box("museum-roof-parapet-south", roof.level, roof.x, y, roof.z + roof.depth / 2, roof.width, feetToMeters(3), 0.35, "stone", ["museum", "parapet", "roof-route", "cover"]),
      );
    }
  }
  addFacadeAndMassing(scene, program);
  addExterior(scene, program);
  applyStates(scene, program);
  for (const primitive of scene.primitives) {
    primitive.tags = [...new Set([...(primitive.tags ?? []), program.archetype])];
  }
  return scene;
}
