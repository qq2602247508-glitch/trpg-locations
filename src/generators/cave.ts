import type { GeneratedScene, GeneratorContext } from "../schema";
import { instantiateBuildingModule, type BuildingLot } from "./buildingModule";
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

/**
 * Embed an architectural compound into the natural cave graph.  The cave
 * remains the parent: its chambers, voids, elevation and routes are generated
 * first, then independent building modules are anchored to actual chamber
 * floors.  This is intentionally a grammar (monastery = chapel + quarters +
 * tower + archive + tidal court), not a scene-specific coordinate dump.
 */
function addCavernMonasteryCompound(
  scene: GeneratedScene,
  context: GeneratorContext,
  chambers: readonly Chamber[],
): void {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const monastery = ["修道院", "寺院", "monastery", "abbey", "cloister"].some((term) => text.includes(term));
  const tidal = ["潮汐", "涨潮", "退潮", "潮池", "海蚀", "tidal", "tide pool", "sea-eroded"].some((term) => text.includes(term));
  if (!monastery || !tidal || chambers.length < 3) return;

  const ordered = [...chambers].sort((left, right) => right.diameter - left.diameter);
  const chapelChamber = ordered[0];
  const quartersChamber = ordered.find((candidate) => candidate.id !== chapelChamber?.id && candidate.diameter >= 7) ?? ordered[1];
  const towerChamber = ordered.find((candidate) => candidate.id !== chapelChamber?.id && candidate.id !== quartersChamber?.id && candidate.diameter >= 6) ?? ordered[2];
  if (!chapelChamber || !quartersChamber || !towerChamber) return;

  const embeddedTags = ["cavern-monastery", "embedded-building", "cave-parent", "tidal-cavern"];
  const addBuilding = (lot: BuildingLot, chamber: Chamber): void => {
    const instance = instantiateBuildingModule(scene, lot, context.rng.fork(`cavern-monastery:${lot.id}`));
    const roleTags = lot.id.includes("chapel")
      ? ["sea-eroded-chapel", "chapel", "shrine"]
      : lot.id.includes("quarters")
        ? ["monastic-quarters", "residential"]
        : ["bell-tower", "tower", "high-ground"];
    for (const primitiveEntry of scene.primitives) {
      if (primitiveEntry.tags?.includes(`building-instance:${instance.id}`)) {
        primitiveEntry.tags = [...new Set([...(primitiveEntry.tags ?? []), ...embeddedTags, ...roleTags])];
      }
    }
    const instanceRecord = scene.buildingInstances?.find((candidate) => candidate.id === instance.id);
    if (instanceRecord) instanceRecord.detailLevel = "full-interior";
    connectRooms(scene.rooms, chamber.id, `${lot.id}-room`);
  };

  const baseLot = (id: string, chamber: Chamber, kind: BuildingLot["kind"], width: number, depth: number): BuildingLot => ({
    id,
    kind,
    x: chamber.x,
    z: chamber.z,
    width,
    depth,
    rotation: context.rng.fork(`rotation:${id}`).float(-0.18, 0.18),
    district: "cavern-monastery",
    seed: `${context.request.seed}/${id}`,
    lod: "full-interior",
    floorCount: kind === "tower" ? 2 : 2,
    baseY: chamber.y + FLOOR_SLAB_METERS,
    state: "active",
    climateProfile: "coastal",
  });

  addBuilding({
    ...baseLot("tidal-monastery-chapel", chapelChamber, "shrine", 7.2, 6.6),
    functionalModules: [
      { id: "chapel-archive", kind: "archive", label: "藏经洞", levelRole: "basement", minimumFootprintCells: 12, tags: ["archive", "scriptorium", "hidden-knowledge"] },
    ],
  }, chapelChamber);
  addBuilding({
    ...baseLot("tidal-monastery-quarters", quartersChamber, "home", 6.4, 5.8),
    functionalModules: [
      { id: "monk-service", kind: "workshop", label: "僧侣生活与修缮室", levelRole: "ground", minimumFootprintCells: 10, tags: ["monastic-quarters", "service"] },
    ],
  }, quartersChamber);
  addBuilding(baseLot("tidal-monastery-bell-tower", towerChamber, "tower", 4.8, 4.8), towerChamber);

  const court = ordered.find((candidate) => ![chapelChamber.id, quartersChamber.id, towerChamber.id].includes(candidate.id)) ?? chambers[chambers.length - 1];
  if (court) {
    const poolX = court.x + court.diameter * 0.16;
    const poolZ = court.z - court.diameter * 0.08;
    const poolY = court.y + FLOOR_SLAB_METERS + feetToMeters(0.2);
    scene.primitives.push(
      water("tidal-monastery-courtyard-pool", 0, poolX, poolY, poolZ, Math.max(2.4, court.diameter * 0.34), 0.18, Math.max(2.2, court.diameter * 0.26), ["cavern-monastery", "tidal-cavern", "tidal-pool", "cavern-tide-pool", "hazard", "watercourse"]),
    );
    const stoneCount = 4;
    const lowTidePoints = [{ x: court.x, z: court.z, y: poolY + 0.06 }];
    for (let index = 0; index < stoneCount; index += 1) {
      const t = (index + 1) / (stoneCount + 1);
      const x = court.x + (poolX - court.x) * t;
      const z = court.z + (poolZ - court.z) * t;
      scene.primitives.push(box(`tidal-monastery-stepping-stone-${index + 1}`, 0, x, poolY + 0.09, z, 1.2, FLOOR_SLAB_METERS * 0.46, 1.1, "stone", ["cavern-monastery", "tidal-cavern", "low-tide-stone", "standable", "route"]));
      lowTidePoints.push({ x, z, y: poolY + 0.1 });
    }
    lowTidePoints.push({ x: poolX, z: poolZ, y: poolY + 0.1 });
    scene.routes.push(createRoute("tidal-monastery-low-tide-route", "alternate", lowTidePoints, { purpose: "movement", traffic: 0.52, schedule: "all" }));
    scene.tactical.push(
      tacticalFeature("tidal-monastery-pool-hazard", "hazard", poolX, poolZ, poolY, 2, "The tidal court is traversable at low tide but floods into a hazardous pool at high tide."),
      tacticalFeature("tidal-monastery-court-chokepoint", "chokepoint", court.x, court.z, court.y, 2, "A narrow stone approach controls the monastery's tidal courtyard."),
    );
  }

  const escapeX = towerChamber.x + towerChamber.diameter * 0.42;
  const escapeZ = towerChamber.z;
  const escapeTop = towerChamber.y + feetToMeters(10);
  const escapeConnection = stairConnection(
    "tidal-monastery-cliff-escape-ladder",
    0,
    { xCells: towerChamber.x, zCells: escapeZ, yMeters: towerChamber.y + FLOOR_SLAB_METERS },
    { xCells: escapeX, zCells: escapeZ, yMeters: escapeTop },
    0.9,
    "wood",
    [...embeddedTags, "cliff-escape-ladder", "vertical-route", "standable"],
  );
  scene.primitives.push(
    escapeConnection.primitive,
    box("tidal-monastery-cliff-escape-lower-landing", 0, escapeConnection.bottom.xCells, escapeConnection.bottom.yMeters, escapeConnection.bottom.zCells, 1.5, FLOOR_SLAB_METERS, 1.5, "stone", [...embeddedTags, "cliff-escape-ladder", "stair-landing", "standable"]),
    box("tidal-monastery-cliff-escape-upper-landing", 1, escapeConnection.top.xCells, escapeConnection.top.yMeters, escapeConnection.top.zCells, 1.8, FLOOR_SLAB_METERS, 1.8, "stone", [...embeddedTags, "cliff-escape-ladder", "stair-landing", "standable", "high-ground"]),
  );
  scene.routes.push(createRoute("tidal-monastery-cliff-escape-route", "vertical", [
    { x: towerChamber.x, z: towerChamber.z, y: towerChamber.y + FLOOR_SLAB_METERS },
    { x: escapeX, z: escapeZ, y: escapeTop },
  ], { purpose: "escape", traffic: 0.34, schedule: "all" }));
  scene.tactical.push(tacticalFeature("tidal-monastery-cliff-escape", "secret", escapeX, escapeZ, escapeTop, 1, "A cliffside escape ladder reaches a higher ledge above the tide line."));
}

function addCaveEmbeddedBuilding(scene: GeneratedScene, context: GeneratorContext, chambers: readonly Chamber[]): void {
  if (scene.buildingInstances && scene.buildingInstances.length > 0) return;
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const hasBuiltStructure = [
    "医院", "警察局", "警局", "博物馆", "酒店", "旅店", "酒馆", "教堂", "神殿", "礼拜堂", "庄园", "宅邸", "堡垒", "要塞",
    "发电站", "修道院", "寺院", "学院", "火车站", "灯塔", "木屋", "小屋", "猎人屋", "观测站", "气象站", "研究站", "实验室",
    "工坊", "工厂", "仓库", "哨所", "钟塔", "hospital", "police station", "museum", "hotel", "inn", "tavern", "church", "chapel",
    "temple", "manor", "fortress", "power station", "monastery", "abbey", "academy", "railway station", "lighthouse", "cabin", "lodge",
    "observatory", "weather station", "research station", "laboratory", "workshop", "factory", "warehouse", "outpost", "bell tower",
  ].some((term) => text.includes(term));
  if (!hasBuiltStructure || chambers.length === 0) return;

  const kind: BuildingLot["kind"] = ["教堂", "神殿", "礼拜堂", "修道院", "寺院", "church", "chapel", "temple", "monastery", "abbey"].some((term) => text.includes(term))
    ? "shrine"
    : ["灯塔", "钟塔", "观测站", "气象站", "observatory", "lighthouse", "bell tower"].some((term) => text.includes(term))
      ? "tower"
      : ["工厂", "发电站", "工坊", "仓库", "实验室", "factory", "power station", "workshop", "warehouse", "laboratory"].some((term) => text.includes(term))
        ? "factory"
        : ["酒馆", "旅店", "酒店", "tavern", "inn", "hotel"].some((term) => text.includes(term))
          ? "tavern"
          : ["庄园", "宅邸", "manor", "mansion"].some((term) => text.includes(term))
            ? "manor"
            : "home";
  const siteProfile = ["气象站", "观测站", "weather station", "observatory"].some((term) => text.includes(term))
    ? "weather-station" as const
    : ["研究站", "实验室", "research station", "laboratory"].some((term) => text.includes(term))
      ? "field-station" as const
      : undefined;
  const chamber = [...chambers].sort((left, right) => right.diameter - left.diameter)[0];
  if (!chamber) return;
  const lot: BuildingLot = {
    id: "cave-embedded-building",
    kind,
    x: chamber.x,
    z: chamber.z,
    width: Math.min(7.2, Math.max(5, chamber.diameter - 1.4)),
    depth: Math.min(6.6, Math.max(4.8, chamber.diameter - 1.8)),
    rotation: context.rng.fork("cave-embedded-building-rotation").float(-0.24, 0.24),
    district: "cave-embedded-site",
    seed: `${context.request.seed}/cave-embedded-building`,
    lod: "full-interior",
    floorCount: kind === "tower" ? 2 : 1,
    baseY: chamber.y + FLOOR_SLAB_METERS,
    state: "active",
    siteProfile,
    climateProfile: "coastal",
  };
  const instance = instantiateBuildingModule(scene, lot, context.rng.fork("cave-embedded-building"));
  for (const primitiveEntry of scene.primitives) {
    if (!primitiveEntry.tags?.includes(`building-instance:${instance.id}`)) continue;
    primitiveEntry.tags = [...new Set([...(primitiveEntry.tags ?? []), "embedded-building", "building", "interior", "foundation", "cave-parent", "cavern-architecture", "cave-access"])];
  }
  connectRooms(scene.rooms, chamber.id, `${lot.id}-room`);
  scene.routes.push(createRoute("cave-embedded-building-route", "alternate", [
    { x: chamber.x, z: chamber.z + chamber.diameter * 0.58, y: chamber.y + FLOOR_SLAB_METERS },
    { x: chamber.x, z: chamber.z, y: chamber.y + FLOOR_SLAB_METERS },
  ], { purpose: "movement", traffic: 0.44, schedule: "all" }));
  scene.tactical.push(tacticalFeature("cave-embedded-building-entrance", "entrance", chamber.x, chamber.z + chamber.diameter * 0.58, chamber.y, 1, "A cave passage arrives at the independently generated building entrance."));
}

function addCaveEnvironmentalPromptAtoms(scene: GeneratedScene, context: GeneratorContext, chambers: readonly Chamber[]): void {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const seaCave = ["海蚀洞", "潮汐洞穴", "潮汐洞", "sea cave", "tidal cavern"].some((term) => text.includes(term));
  const wantsPool = ["潮池", "潮汐池", "tide pool", "tidal pool"].some((term) => text.includes(term));
  const wantsLowTideRoute = ["退潮", "低潮", "石路", "low tide", "ebb tide", "stone path"].some((term) => text.includes(term));
  if (seaCave || wantsPool) {
    for (const primitiveEntry of scene.primitives) {
      if (!primitiveEntry.tags?.some((tag) => tag === "cave-wall" || tag === "cavern" || tag === "chamber-shell")) continue;
      primitiveEntry.tags = [...new Set([...(primitiveEntry.tags ?? []), ...(seaCave ? ["sea-cave"] : []), "tidal-cavern"])];
    }
  }
  if (!wantsPool || chambers.length === 0 || scene.primitives.some((primitiveEntry) => primitiveEntry.tags?.includes("cavern-tide-pool") || primitiveEntry.tags?.includes("tidal-pool"))) return;
  const chamber = [...chambers].sort((left, right) => right.diameter - left.diameter)[chambers.length > 1 ? 1 : 0];
  if (!chamber) return;
  const poolY = chamber.y + FLOOR_SLAB_METERS + 0.04;
  const poolX = chamber.x + chamber.diameter * 0.16;
  const poolZ = chamber.z - chamber.diameter * 0.12;
  scene.primitives.push(water("cave-prompt-tide-pool", 0, poolX, poolY, poolZ, Math.max(2.2, chamber.diameter * 0.3), 0.18, Math.max(2, chamber.diameter * 0.24), ["sea-cave", "tidal-cavern", "tidal-pool", "cavern-tide-pool", "watercourse", "hazard"]));
  scene.tactical.push(tacticalFeature("cave-prompt-tide-pool-hazard", "hazard", poolX, poolZ, poolY, 2, "A tidal pool fills this cave chamber as the tide rises."));
  if (wantsLowTideRoute) {
    const points = [{ x: chamber.x, z: chamber.z, y: poolY + 0.08 }];
    for (let index = 0; index < 3; index += 1) {
      const t = (index + 1) / 4;
      const x = chamber.x + (poolX - chamber.x) * t;
      const z = chamber.z + (poolZ - chamber.z) * t;
      scene.primitives.push(box(`cave-prompt-low-tide-stone-${index + 1}`, 0, x, poolY + 0.1, z, 1.15, FLOOR_SLAB_METERS * 0.42, 1.05, "stone", ["sea-cave", "tidal-cavern", "low-tide-stone", "standable", "route"]));
      points.push({ x, z, y: poolY + 0.1 });
    }
    points.push({ x: poolX, z: poolZ, y: poolY + 0.1 });
    scene.routes.push(createRoute("cave-prompt-low-tide-route", "alternate", points, { purpose: "movement", traffic: 0.4, schedule: "all" }));
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
      cylinder(`${id}-floor`, 0, x, y, z, diameter, FLOOR_SLAB_METERS, "rock", ["floor", "cavern", "natural", "standable", "support-surface"]),
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
  addCavernMonasteryCompound(scene, context, chambers);
  addCaveEmbeddedBuilding(scene, context, chambers);
  addCaveEnvironmentalPromptAtoms(scene, context, chambers);

  const ledgeCandidates = chambers.slice(1);
  const ledgeCount = Math.min(ledgeCandidates.length, rng.int(1, request.size === "large" ? 3 : 2));
  for (let index = 0; index < ledgeCount; index += 1) {
    const chamber = ledgeCandidates[index];
    if (!chamber) continue;
    const ledgeHeight = feetToMeters(rng.int(5, 10));
    const ledgeX = clamp(chamber.x + chamber.diameter * 0.2, 1, width - 1);
    const ledgeZ = clamp(chamber.z - chamber.diameter * 0.18, 1, depth - 1);
    scene.primitives.push(
      box(`${chamber.id}-rock-ledge`, 0, ledgeX, chamber.y + ledgeHeight, ledgeZ, Math.max(2, chamber.diameter * 0.42), FLOOR_SLAB_METERS * 2, Math.max(2, chamber.diameter * 0.28), "rock", ["ledge", "platform", "high-ground", "standable", "support-surface"]),
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
  const compoundText = request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const cavernMonastery = ["修道院", "寺院", "monastery", "abbey", "cloister"].some((term) => compoundText.includes(term))
    && ["潮汐", "涨潮", "退潮", "潮池", "海蚀", "tidal", "tide pool", "sea-eroded"].some((term) => compoundText.includes(term));
  if (scene.buildingInstances && scene.buildingInstances.length > 0) {
    scene.floors = 4;
    scene.floorHeightFeet = [12, 10, 10, 12];
    scene.floorLabels = cavernMonastery
      ? ["洞穴与礼拜堂/1F", "钟塔与居室上层", "屋顶与高架", "藏经洞/B1"]
      : ["洞穴与嵌入建筑/1F", "建筑上层", "屋顶与洞穴高架", "地下储藏/B1"];
  }

  return scene;
}
