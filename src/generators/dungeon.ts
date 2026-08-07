import type { GeneratedScene, GeneratorContext } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  choose,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  feetToMeters,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
} from "./shared";

type DungeonStyle = "crypt" | "temple" | "mine" | "prison" | "lair" | "sewer" | "arcane";

function styleFor(prompt: string): DungeonStyle {
  const text = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  if (["矿井", "矿坑", "mine", "矿车"].some((term) => text.includes(term))) return "mine";
  if (["神殿", "祭坛", "temple", "邪教"].some((term) => text.includes(term))) return "temple";
  if (["墓穴", "墓室", "crypt", "陵墓", "骸骨"].some((term) => text.includes(term))) return "crypt";
  if (["监狱", "牢房", "prison", "囚禁"].some((term) => text.includes(term))) return "prison";
  if (["龙巢", "巢穴", "lair", "巨龙"].some((term) => text.includes(term))) return "lair";
  if (["下水道", "sewer", "排水"].some((term) => text.includes(term))) return "sewer";
  if (["法师", "巫师", "奥术", "arcane", "实验室"].some((term) => text.includes(term))) return "arcane";
  return "crypt";
}

const styleTitles: Record<DungeonStyle, readonly string[]> = {
  crypt: ["The Hollow Crypt", "Catacombs Below the Bell"],
  temple: ["The Sunken Temple", "The Veiled Altar Depths"],
  mine: ["Deepdelve Dungeon", "The Red Seam Levels"],
  prison: ["The Iron Cells", "Blackgate Prison Below"],
  lair: ["The Dragon's Underhold", "The Hoard Below"],
  sewer: ["The Flooded Underways", "The Old Drain Maze"],
  arcane: ["The Broken Arcanum", "The Spellwright Vaults"],
};

interface DungeonRoomLayout {
  x: number;
  z: number;
  w: number;
  d: number;
}

function roomLayout(style: DungeonStyle, index: number, count: number, width: number, depth: number, rng: GeneratorContext["rng"]): DungeonRoomLayout {
  const cx = width / 2 + 2;
  const cz = depth / 2 + 2;
  const bound = (value: number, span: number, limit: number) => Math.max(3 + span / 2, Math.min(limit + 1 - span / 2, value));
  if (style === "temple") {
    const rows = Math.ceil(count / 2);
    const row = Math.floor(index / 2);
    const isSanctum = index === count - 1;
    const w = isSanctum ? Math.min(12, width * 0.34) : rng.int(5, 8);
    const d = isSanctum ? Math.min(10, depth * 0.3) : rng.int(5, 7);
    const x = isSanctum ? cx : cx + (index % 2 === 0 ? -1 : 1) * width * 0.2;
    const z = 4 + row * Math.max(5, (depth - 8) / Math.max(1, rows - 1));
    return { x: bound(x, w, width), z: bound(z, d, depth), w, d };
  }
  if (style === "mine") {
    const branch = index % 3;
    const rank = Math.floor(index / 3) + 1;
    const angle = -Math.PI * 0.82 + branch * Math.PI * 0.82 + rng.float(-0.12, 0.12);
    const radius = Math.min(width, depth) * Math.min(0.34, 0.1 + rank * 0.09);
    const w = rng.int(5, 9);
    const d = rng.int(5, 8);
    return { x: bound(cx + Math.cos(angle) * radius, w, width), z: bound(cz + Math.sin(angle) * radius, d, depth), w, d };
  }
  if (style === "prison") {
    const rows = Math.ceil(count / 2);
    const w = index === 0 ? 8 : 4;
    const d = index === 0 ? 7 : 5;
    const x = index === 0 ? cx : cx + (index % 2 === 0 ? -1 : 1) * width * 0.2;
    const z = index === 0 ? 4.5 : 6 + Math.floor((index - 1) / 2) * Math.max(4.5, (depth - 12) / Math.max(1, rows - 1));
    return { x: bound(x, w, width), z: bound(z, d, depth), w, d };
  }
  if (style === "lair") {
    if (index === 0) return { x: cx, z: cz, w: Math.min(15, width * 0.42), d: Math.min(13, depth * 0.4) };
    const angle = (Math.PI * 2 * (index - 1)) / Math.max(1, count - 1) + rng.float(-0.16, 0.16);
    const radius = Math.min(width, depth) * 0.31;
    const w = rng.int(6, 10);
    const d = rng.int(5, 9);
    return { x: bound(cx + Math.cos(angle) * radius, w, width), z: bound(cz + Math.sin(angle) * radius, d, depth), w, d };
  }
  if (style === "sewer") {
    const w = index % 3 === 0 ? 8 : 5;
    const d = index % 3 === 0 ? 6 : 5;
    const x = cx + (index % 3 === 0 ? 0 : index % 2 === 0 ? -width * 0.22 : width * 0.22);
    const z = 4 + index * Math.max(4, (depth - 8) / Math.max(1, count - 1));
    return { x: bound(x, w, width), z: bound(z, d, depth), w, d };
  }
  if (style === "arcane") {
    if (index === 0) return { x: cx, z: cz, w: 9, d: 9 };
    const angle = (Math.PI * 2 * (index - 1)) / Math.max(1, count - 1);
    const radius = Math.min(width, depth) * 0.28;
    const w = rng.int(5, 7);
    const d = rng.int(5, 7);
    return { x: bound(cx + Math.cos(angle) * radius, w, width), z: bound(cz + Math.sin(angle) * radius, d, depth), w, d };
  }
  const columns = Math.max(2, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const w = rng.int(5, Math.max(6, Math.floor((width - 8) / columns) - 1));
  const d = rng.int(5, Math.max(6, Math.floor((depth - 8) / rows) - 1));
  return {
    x: 4 + (column + 0.5) * ((width - 8) / columns) + rng.float(-1.5, 1.5),
    z: 4 + (row + 0.5) * ((depth - 8) / rows) + rng.float(-1.5, 1.5),
    w,
    d,
  };
}

/** Graph-first D&D dungeon grammar: rooms are authored as a connected graph
 * before walls, secret doors, stairs, and combat geometry are emitted. */
export function generateDungeon(context: GeneratorContext): GeneratedScene {
  const style = styleFor(context.request.prompt);
  const scale = context.request.size === "small" ? 0.72 : context.request.size === "large" ? 1.45 : 1;
  const levels = context.request.size === "small" ? 2 : context.request.size === "large" ? context.rng.int(3, 5) : context.rng.int(2, 4);
  const width = Math.round(42 * scale);
  const depth = Math.round(34 * scale);
  const roomCount = Math.round((8 + context.request.density * 9) * scale);
  const floorHeights = Array.from({ length: levels }, () => context.rng.int(10, 15));
  const scene = baseScene("dungeon", choose(context.rng, styleTitles[style]), `${style} multi-level dungeon with a connected room graph, loops, hidden rooms, vertical shafts, and tactical choke points.`, context.request.seed, { x: width + 4, z: depth + 4 }, levels, floorHeights);
  scene.archetype = `dungeon:${style}`;
  const baseYs = floorHeights.map((_, level) => feetToMeters(floorHeights.slice(0, level).reduce((sum, value) => sum + value, 0)));
  const roomsPerLevel = Math.max(4, Math.ceil(roomCount / levels));
  const allRooms: Array<{ id: string; level: number; x: number; z: number; w: number; d: number; hidden: boolean }> = [];

  for (let level = 0; level < levels; level += 1) {
    const baseY = baseYs[level] ?? 0;
    const floorRoomCount = level === 0
      ? Math.max(4, Math.min(roomsPerLevel + 2, 5 + Math.ceil(roomCount / levels)))
      : level === levels - 1
        ? Math.max(3, Math.min(roomsPerLevel - 1, 3 + Math.ceil(roomCount / levels * 0.72)))
        : Math.max(4, roomsPerLevel);
    for (let index = 0; index < floorRoomCount; index += 1) {
      const { x, z, w, d } = roomLayout(style, index, floorRoomCount, width, depth, context.rng.fork(`layout-${level}-${index}`));
      const hidden = index > 1 && (index + level) % 7 === 0;
      const id = `dungeon-room-${level}-${index}`;
      allRooms.push({ id, level, x, z, w, d, hidden });
      const floorRole = level === 0 ? (index < 2 ? "entry" : "service") : level === levels - 1 ? (index === floorRoomCount - 1 ? "boss" : "treasure") : (index % 3 === 0 ? "hazard" : "combat");
      const role = hidden ? "private" : index === floorRoomCount - 1 ? "combat" : index === 0 ? "public" : "natural";
      const roomLabel = hidden ? "Hidden chamber" : level === 0 ? `${level + 1}F entrance ${style} chamber ${index + 1}` : level === levels - 1 ? `${level + 1}F core ${style} chamber ${index + 1}` : `${level + 1}F side ${style} chamber ${index + 1}`;
      scene.rooms.push(createRoom(id, roomLabel, role, level, x, z, w, d, baseY));
      const shellMaterial = level === levels - 1 ? "darkStone" : level === 0 ? "stone" : style === "arcane" ? "darkStone" : "rock";
      const height = feetToMeters((floorHeights[level] ?? 12) + (level === levels - 1 ? 5 : level === 0 ? -1 : 1)) - FLOOR_SLAB_METERS;
      scene.primitives.push(...rectangularShell(`${id}-shell`, level, x, z, baseY, w, d, height, "stone", shellMaterial, ["dungeon", `dungeon-style:${style}`, `floor-role:${floorRole}`, hidden ? "secret-room" : "room", "door-frame"], {}));
      const featureTags = style === "prison" ? ["bars", "cell"] : style === "temple" ? ["altar", "ritual"] : style === "lair" ? ["hoard", "bone-cover"] : style === "sewer" ? ["channel", "sluice"] : style === "arcane" ? ["arcane-node", "teleport-focus"] : style === "mine" ? ["ore-cart", "timber"] : ["sarcophagus", "grave-goods"];
      const featureHeight = level === levels - 1 ? 3.8 : level === 0 ? 1.8 : 2.5;
      scene.primitives.push(box(`${id}-feature`, level, x + context.rng.float(-w * 0.2, w * 0.2), baseY + FLOOR_SLAB_METERS, z + context.rng.float(-d * 0.2, d * 0.2), Math.max(1.2, w * (level === levels - 1 ? 0.3 : 0.22)), feetToMeters(hidden ? 5 : featureHeight), Math.max(1.2, d * (level === levels - 1 ? 0.28 : 0.2)), hidden ? "warmLight" : style === "mine" ? "wood" : style === "prison" ? "metal" : "darkStone", ["dungeon", hidden ? "secret" : "cover", `style:${style}`, `floor-role:${floorRole}`, ...featureTags]));
      if (hidden) scene.tactical.push(tacticalFeature(`${id}-secret`, "secret", x, z, baseY, 2, "A concealed chamber is reached through a hidden door or false wall."));
      else if (index === floorRoomCount - 1) scene.tactical.push(tacticalFeature(`${id}-encounter`, "chokepoint", x, z, baseY, 3, "A larger chamber anchors an encounter and controls the level route."));
    }
  }

  const byLevel = (level: number) => allRooms.filter((room) => room.level === level);
  for (let level = 0; level < levels; level += 1) {
    const floorRooms = byLevel(level);
    for (let index = 1; index < floorRooms.length; index += 1) {
      const parentIndex = style === "lair" || style === "arcane" ? 0 : style === "mine" ? Math.floor((index - 1) / 2) : index - 1;
      const previous = floorRooms[parentIndex];
      const current = floorRooms[index];
      if (!previous || !current) continue;
      connectRooms(scene.rooms, previous.id, current.id);
      scene.primitives.push(corridor(`${previous.id}-to-${current.id}`, level, previous.x, previous.z, current.x, current.z, (baseYs[level] ?? 0) + FLOOR_SLAB_METERS, 1.2, style === "sewer" ? "stone" : "wood", ["dungeon", "combat-route"]));
    }
    if (floorRooms.length > 3) {
      const first = floorRooms[0];
      const loop = floorRooms[floorRooms.length - 1];
      if (first && loop) {
        connectRooms(scene.rooms, first.id, loop.id);
        const y = (baseYs[level] ?? 0) + FLOOR_SLAB_METERS;
        scene.routes.push(createRoute(`dungeon-loop-${level}`, "alternate", [{ x: first.x, z: first.z, y }, { x: loop.x, z: loop.z, y }]));
      }
    }
  }
  for (let level = 0; level < levels - 1; level += 1) {
    const lower = byLevel(level)[Math.floor(byLevel(level).length / 2)];
    const upper = byLevel(level + 1)[Math.floor(byLevel(level + 1).length / 2)];
    if (!lower || !upper) continue;
    const stair = stairConnection(`dungeon-stair-${level}`, level, { xCells: lower.x, zCells: lower.z, yMeters: (baseYs[level] ?? 0) + FLOOR_SLAB_METERS }, { xCells: upper.x, zCells: upper.z, yMeters: (baseYs[level + 1] ?? 0) + FLOOR_SLAB_METERS }, 1.7, style === "mine" ? "wood" : "stone", ["dungeon", "vertical-route", "vertical-opening", "shaft-access"]);
    scene.primitives.push(stair.primitive);
    scene.routes.push(stairRoute(`dungeon-vertical-route-${level}`, stair));
    connectRooms(scene.rooms, lower.id, upper.id);
  }
  const entrance = allRooms[0];
  if (entrance) {
    scene.routes.push(createRoute("dungeon-primary-route", "primary", [{ x: Math.max(1, entrance.x - entrance.w / 2), z: entrance.z, y: baseYs[0] ?? 0 }, { x: entrance.x, z: entrance.z, y: baseYs[0] ?? 0 }]));
    scene.tactical.push(tacticalFeature("dungeon-entrance", "entrance", entrance.x, entrance.z, baseYs[0] ?? 0, 2, "The entrance descends into the first level and leaves multiple routes open."));
  }
  return scene;
}
