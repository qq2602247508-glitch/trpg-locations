import type { GeneratedScene, MaterialKey, Room } from "../schema";
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
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  type RectangularShellOpenings,
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
}

export interface ProgramConnection {
  id: string;
  from: string;
  to: string;
  kind: "door" | "corridor" | "service" | "secret" | "stair";
  width: number;
}

export interface BuildingProgram {
  id: string;
  title: string;
  description: string;
  archetype: string;
  seed: string;
  bounds: { x: number; z: number };
  floorHeights: number[];
  rooms: ProgramRoom[];
  connections: ProgramConnection[];
  requiredFeatures: string[];
  detailCount?: number;
  floorMaterial: MaterialKey;
  wallMaterial: MaterialKey;
}

function baseY(program: BuildingProgram, level: number): number {
  return feetToMeters(program.floorHeights.slice(0, level).reduce((sum, value) => sum + value, 0));
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
  scene.archetype = program.archetype;
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
    const y = baseY(program, room.level);
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
      const lower = from.level < to.level ? from : to;
      const upper = from.level < to.level ? to : from;
      const lowerY = baseY(program, lower.level) + FLOOR_SLAB_METERS;
      const upperY = baseY(program, upper.level) + FLOOR_SLAB_METERS;
      const stair = stairConnection(connection.id, lower.level, { xCells: lower.x, zCells: lower.z, yMeters: lowerY }, { xCells: upper.x, zCells: upper.z, yMeters: upperY }, connection.width, "stone", ["building-stair", "vertical-opening", `connects:${lower.id}:${upper.id}`]);
      scene.primitives.push(stair.primitive);
      scene.routes.push(stairRoute(`${connection.id}-route`, stair));
      continue;
    }
    const y = baseY(program, from.level) + FLOOR_SLAB_METERS;
    const fromPortal = boundaryPoint(from, to);
    const toPortal = boundaryPoint(to, from);
    scene.primitives.push(corridor(connection.id, from.level, fromPortal.x, fromPortal.z, toPortal.x, toPortal.z, y, connection.width, connection.kind === "service" ? "stone" : "wood", ["building-connection", `connection:${connection.kind}`]));
    scene.routes.push(createRoute(`${connection.id}-route`, connection.kind === "secret" || connection.kind === "service" ? "alternate" : "primary", [{ x: from.x, z: from.z, y }, { x: to.x, z: to.z, y }], { purpose: connection.kind === "service" ? "service" : connection.kind === "secret" ? "escape" : "movement" }));
  }

  const entrance = program.rooms.find((room) => room.tags.includes("entrance")) ?? program.rooms[0];
  if (entrance) scene.tactical.push(tacticalFeature(`${program.id}-entrance`, "entrance", entrance.x, entrance.z, baseY(program, entrance.level), 2, `Primary entrance to ${program.title}.`));
  const high = program.rooms.find((room) => room.tags.includes("roof-platform") || room.tags.includes("high-ground"));
  if (high) scene.tactical.push(tacticalFeature(`${program.id}-high-ground`, "highGround", high.x, high.z, baseY(program, high.level), 3, `${high.name} is a reachable elevated combat position.`));
  const fixtureRooms = program.rooms.filter((room) => !room.openAir && !room.tags.includes("roof-platform"));
  for (let index = 0; index < (program.detailCount ?? 0); index += 1) {
    const target = fixtureRooms[index % Math.max(1, fixtureRooms.length)];
    if (!target) continue;
    const column = index % 3;
    scene.primitives.push(box(`${program.id}-functional-fixture-${index}`, target.level, target.x + (column - 1) * Math.min(1.4, target.width * 0.16), baseY(program, target.level) + FLOOR_SLAB_METERS, target.z, 0.7, 1.25, 1.4, target.tags.includes("underground") ? "metal" : "wood", ["functional-fixture", `room:${target.id}`, "cover"]));
  }
  if (program.archetype === "hospital") {
    for (const target of program.rooms.filter((room) => /clinical|treatment|patient ward/i.test(room.name))) {
      for (let index = 0; index < Math.max(2, Math.floor(target.depth / 3)); index += 1) {
        scene.primitives.push(box(`hospital-bed-${target.id}-${index}`, target.level, target.x - target.width * 0.22 + (index % 2) * target.width * 0.44, baseY(program, target.level) + FLOOR_SLAB_METERS, target.z - target.depth * 0.28 + Math.floor(index / 2) * 2.2, 1.8, 0.72, 3.2, "wood", ["hospital", "bed", "cover", `room:${target.id}`]));
      }
    }
    const morgue = program.rooms.find((room) => /morgue/i.test(room.name));
    if (morgue) scene.primitives.push(box("hospital-autopsy-table", morgue.level, morgue.x, baseY(program, morgue.level) + FLOOR_SLAB_METERS, morgue.z, 2, 0.95, 4, "metal", ["hospital", "morgue", "autopsy", "evidence"]));
  }
  if (program.archetype === "police") {
    scene.primitives.push(box("police-evidence-cages", 0, 29, baseY(program, 0) + FLOOR_SLAB_METERS, 25, 4, 2.4, 4, "metal", ["police", "evidence", "room-partition", "cover"]));
  }
  for (const primitive of scene.primitives) {
    primitive.tags = [...new Set([...(primitive.tags ?? []), program.archetype])];
  }
  return scene;
}
