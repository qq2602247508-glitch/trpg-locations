import type { BuildingProgramSummary, GeneratedScene, MaterialKey, Room } from "../schema";
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
      const stair = stairConnection(connection.id, lower.level, { xCells: lower.x, zCells: lower.z, yMeters: lowerY }, { xCells: upper.x, zCells: upper.z, yMeters: upperY }, connection.width, "stone", ["building-stair", "vertical-opening", `connects:${lower.id}:${upper.id}`]);
      scene.primitives.push(stair.primitive);
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
  for (const primitive of scene.primitives) {
    primitive.tags = [...new Set([...(primitive.tags ?? []), program.archetype])];
  }
  return scene;
}
