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
    const floorRoomCount = Math.min(roomsPerLevel, 4 + Math.ceil(roomCount / levels));
    const columns = Math.max(2, Math.ceil(Math.sqrt(floorRoomCount)));
    const rows = Math.ceil(floorRoomCount / columns);
    for (let index = 0; index < floorRoomCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const w = context.rng.int(5, Math.max(6, Math.floor((width - 8) / columns) - 1));
      const d = context.rng.int(5, Math.max(6, Math.floor((depth - 8) / rows) - 1));
      const x = 4 + (column + 0.5) * ((width - 8) / columns) + context.rng.float(-1.5, 1.5);
      const z = 4 + (row + 0.5) * ((depth - 8) / rows) + context.rng.float(-1.5, 1.5);
      const hidden = index > 1 && (index + level) % 7 === 0;
      const id = `dungeon-room-${level}-${index}`;
      allRooms.push({ id, level, x, z, w, d, hidden });
      const role = hidden ? "private" : index === floorRoomCount - 1 ? "combat" : index === 0 ? "public" : "natural";
      scene.rooms.push(createRoom(id, hidden ? "Hidden chamber" : `${level + 1}F ${style} chamber ${index + 1}`, role, level, x, z, w, d, baseY));
      scene.primitives.push(...rectangularShell(`${id}-shell`, level, x, z, baseY, w, d, feetToMeters(floorHeights[level] ?? 12) - FLOOR_SLAB_METERS, "stone", style === "arcane" ? "darkStone" : "rock", ["dungeon", `dungeon-style:${style}`, hidden ? "secret-room" : "room", "door-frame"], {}));
      scene.primitives.push(box(`${id}-feature`, level, x + context.rng.float(-w * 0.2, w * 0.2), baseY + FLOOR_SLAB_METERS, z + context.rng.float(-d * 0.2, d * 0.2), Math.max(1.2, w * 0.22), feetToMeters(hidden ? 5 : 2.5), Math.max(1.2, d * 0.2), hidden ? "warmLight" : style === "mine" ? "wood" : "darkStone", ["dungeon", hidden ? "secret" : "cover", `style:${style}`]));
      if (hidden) scene.tactical.push(tacticalFeature(`${id}-secret`, "secret", x, z, baseY, 2, "A concealed chamber is reached through a hidden door or false wall."));
      else if (index === floorRoomCount - 1) scene.tactical.push(tacticalFeature(`${id}-encounter`, "chokepoint", x, z, baseY, 3, "A larger chamber anchors an encounter and controls the level route."));
    }
  }

  const byLevel = (level: number) => allRooms.filter((room) => room.level === level);
  for (let level = 0; level < levels; level += 1) {
    const floorRooms = byLevel(level);
    for (let index = 1; index < floorRooms.length; index += 1) {
      const previous = floorRooms[index - 1];
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
