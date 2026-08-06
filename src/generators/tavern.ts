import type { GeneratedScene, GeneratorContext } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  choose,
  connectRooms,
  createRoom,
  createRoute,
  feetToMeters,
  primitive,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  wallWithOpenings,
} from "./shared";

interface GuestLayout {
  id: string;
  index: number;
  level: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  onLeft?: boolean;
}

function tavernFootprint(context: GeneratorContext): { width: number; depth: number; minFloors: number; maxFloors: number } {
  const { rng, request } = context;
  switch (request.size) {
    case "small":
      return { width: rng.int(12, 14), depth: rng.int(12, 14), minFloors: 1, maxFloors: 2 };
    case "large":
      return { width: rng.int(17, 20), depth: rng.int(17, 20), minFloors: 2, maxFloors: 3 };
    default:
      return { width: rng.int(14, 17), depth: rng.int(14, 17), minFloors: 1, maxFloors: 3 };
  }
}

function upperGuestLayouts(
  level: number,
  width: number,
  depth: number,
  hallwayWidth: number,
  guestCount: number,
): GuestLayout[] {
  const innerDepth = depth - 2;
  const leftWidth = Math.max(3, Math.floor((width - hallwayWidth - 2) / 2));
  const rightWidth = Math.max(3, width - 2 - hallwayWidth - leftWidth);
  // Never let a low random room count turn a bedroom into a banquet hall.
  // Add paired rooms until every bay is at most seven cells deep; larger inns
  // therefore gain rooms instead of stretching the same two-room template.
  const rows = Math.max(Math.ceil(guestCount / 2), Math.ceil(innerDepth / 7));
  const actualGuestCount = rows * 2;
  const layouts: GuestLayout[] = [];
  for (let index = 0; index < actualGuestCount; index += 1) {
    const onLeft = index % 2 === 0;
    const row = Math.floor(index / 2);
    const roomStart = 1 + Math.floor((innerDepth * row) / rows);
    const roomEnd = 1 + Math.floor((innerDepth * (row + 1)) / rows);
    const roomDepth = Math.max(3, roomEnd - roomStart);
    const roomWidth = onLeft ? leftWidth : rightWidth;
    layouts.push({
      id: `tavern-guest-${level}-${index + 1}`,
      index: index + 1,
      level,
      x: onLeft ? 1 + roomWidth / 2 : width - 1 - roomWidth / 2,
      z: roomStart + roomDepth / 2,
      width: roomWidth,
      depth: roomDepth,
      onLeft,
    });
  }
  return layouts;
}

/**
 * A compact, usable inn. Bedrooms deliberately stay within ordinary 3–5-cell
 * dimensions (with rare 6–7-cell suites on larger upper floors), while the
 * public taproom remains the largest tactical space.
 */
export function generateTavern(context: GeneratorContext): GeneratedScene {
  const { request, rng } = context;
  const profile = tavernFootprint(context);
  const floors = rng.int(profile.minFloors, profile.maxFloors);
  const floorHeightFeet = Array.from({ length: floors }, () => rng.int(11, 13));
  const floorBaseY: number[] = [];
  let roofY = 0;
  for (const floorHeight of floorHeightFeet) {
    floorBaseY.push(roofY);
    roofY += feetToMeters(floorHeight);
  }

  const mood = choose(rng, ["smoky", "busy", "wind-battered", "quietly prosperous"]);
  const scene = baseScene(
    "tavern",
    choose(rng, ["The Hearth and Lantern", "The Copper Kettle", "The Crossroads Rest", "The Wayfarer's Cask"]),
    `${mood} inn with a compact public taproom, working back rooms, and reachable guest accommodation.`,
    request.seed,
    { x: profile.width, z: profile.depth },
    floors,
    floorHeightFeet,
  );

  const { width, depth } = profile;
  const innerDepth = depth - 2;
  const desiredServiceWidth = request.size === "small" ? 4 : request.size === "large" ? rng.int(5, 6) : rng.int(4, 5);
  const serviceWidth = Math.min(desiredServiceWidth, width - 8);
  const hallWidth = width - serviceWidth - 2;
  const serviceStart = hallWidth + 1;
  const hallCenterX = 1 + hallWidth / 2;
  const hallCenterZ = depth / 2;
  const stairX = Math.max(3.2, hallWidth - 1.4);
  const stairRun = Math.min(4.8, Math.max(3.8, depth - 8));
  const stairBottomZ = depth - 2.1;
  const stairTopZ = stairBottomZ - stairRun;
  const stairwellCenterZ = (stairBottomZ + stairTopZ) / 2;
  const groundY = floorBaseY[0] ?? 0;
  const kitchenDepth = floors === 1
    ? Math.max(3, Math.floor(innerDepth * 0.32))
    : Math.max(4, Math.floor(innerDepth * 0.58));
  const pantryDepth = floors === 1
    ? Math.max(3, Math.floor(innerDepth * 0.18))
    : Math.max(3, innerDepth - kitchenDepth);
  const kitchenCenterZ = 1 + kitchenDepth / 2;
  const pantryCenterZ = 1 + kitchenDepth + pantryDepth / 2;

  const groundGuestLayouts: GuestLayout[] = [];
  if (floors === 1) {
    const guestStart = 1 + kitchenDepth + pantryDepth;
    const guestDepth = Math.max(3, innerDepth - kitchenDepth - pantryDepth);
    const guestCount = Math.max(1, Math.min(3, Math.floor(guestDepth / 3)));
    for (let index = 0; index < guestCount; index += 1) {
      const roomStart = guestStart + Math.floor((guestDepth * index) / guestCount);
      const roomEnd = guestStart + Math.floor((guestDepth * (index + 1)) / guestCount);
      const roomDepth = Math.max(3, roomEnd - roomStart);
      groundGuestLayouts.push({
        id: `tavern-guest-0-${index + 1}`,
        index: index + 1,
        level: 0,
        x: serviceStart + serviceWidth / 2,
        z: roomStart + roomDepth / 2,
        width: serviceWidth,
        depth: roomDepth,
      });
    }
  }

  scene.rooms.push(
    createRoom("tavern-common-room", "Common room", "public", 0, hallCenterX, hallCenterZ, hallWidth, innerDepth, groundY),
    createRoom("tavern-stairwell-0", "Stairwell", "circulation", 0, stairX, stairwellCenterZ, 3, Math.ceil(stairRun) + 1, groundY),
    createRoom("tavern-kitchen", "Kitchen and scullery", "service", 0, serviceStart + serviceWidth / 2, kitchenCenterZ, serviceWidth, kitchenDepth, groundY),
    createRoom("tavern-pantry", "Pantry and stores", "service", 0, serviceStart + serviceWidth / 2, pantryCenterZ, serviceWidth, pantryDepth, groundY),
  );
  connectRooms(scene.rooms, "tavern-common-room", "tavern-stairwell-0");
  connectRooms(scene.rooms, "tavern-common-room", "tavern-kitchen");
  connectRooms(scene.rooms, "tavern-kitchen", "tavern-pantry");
  for (const guest of groundGuestLayouts) {
    scene.rooms.push(createRoom(guest.id, `Guest room ${guest.index}`, "private", 0, guest.x, guest.z, guest.width, guest.depth, groundY));
    connectRooms(scene.rooms, "tavern-common-room", guest.id);
  }

  const serviceDoorOpenings = [
    { offsetCells: kitchenCenterZ - depth / 2, widthCells: 1.6 },
    ...groundGuestLayouts.map((guest) => ({ offsetCells: guest.z - depth / 2, widthCells: 1.2 })),
  ];
  scene.primitives.push(
    ...rectangularShell(
      "tavern-ground-shell",
      0,
      width / 2,
      depth / 2,
      groundY,
      width,
      depth,
      feetToMeters(floorHeightFeet[0] ?? 12) - FLOOR_SLAB_METERS,
      "wood",
      "plaster",
      ["tavern", "ground-floor"],
      { west: { widthCells: 2.2 } },
    ),
    ...wallWithOpenings(
      "tavern-service-partition",
      0,
      serviceStart,
      depth / 2,
      groundY + FLOOR_SLAB_METERS,
      innerDepth,
      feetToMeters(floorHeightFeet[0] ?? 12) - FLOOR_SLAB_METERS,
      "z",
      "plaster",
      ["service-partition"],
      serviceDoorOpenings,
    ),
    ...wallWithOpenings(
      "tavern-kitchen-pantry-partition",
      0,
      serviceStart + serviceWidth / 2,
      1 + kitchenDepth,
      groundY + FLOOR_SLAB_METERS,
      serviceWidth,
      feetToMeters(floorHeightFeet[0] ?? 12) - FLOOR_SLAB_METERS,
      "x",
      "plaster",
      ["service-partition"],
      { offsetCells: serviceWidth * 0.12, widthCells: 1.25 },
    ),
    box("tavern-bar", 0, hallWidth - 0.9, groundY + FLOOR_SLAB_METERS, depth * 0.42, 0.9, 1.05, Math.max(3, depth * 0.22), "wood", ["bar", "cover"]),
    primitive("tavern-hearth", "cylinder", 0, hallWidth * 0.3, groundY + FLOOR_SLAB_METERS, depth * 0.68, 1.5, 0.55, 1.5, "stone", ["hearth", "cover"]),
  );
  for (const guest of groundGuestLayouts) {
    const dividerZ = guest.z - guest.depth / 2;
    scene.primitives.push(
      ...wallWithOpenings(
        `tavern-guest-divider-${guest.index}`,
        0,
        serviceStart + serviceWidth / 2,
        dividerZ,
        groundY + FLOOR_SLAB_METERS,
        serviceWidth,
        feetToMeters(floorHeightFeet[0] ?? 12) - FLOOR_SLAB_METERS,
        "x",
        "plaster",
        ["guest-room", "single-floor"],
        { offsetCells: 0, widthCells: 1.15 },
      ),
    );
  }

  const tableCount = 2 + rng.int(0, request.density >= 0.65 ? 3 : 2);
  for (let index = 0; index < tableCount; index += 1) {
    const x = 1.8 + rng.int(0, Math.max(1, hallWidth - 4));
    const z = 2 + rng.int(0, Math.max(1, depth - 5));
    scene.primitives.push(box(`tavern-table-${index + 1}`, 0, x, groundY + FLOOR_SLAB_METERS, z, 1.15, 0.82, 1.15, "wood", ["table", "cover"]));
    scene.tactical.push(tacticalFeature(`tavern-table-cover-${index + 1}`, "cover", x, z, groundY, 1, "A sturdy table can break line of sight."));
  }

  if (floors === 1) {
    const loftBottom = { xCells: stairX, zCells: stairBottomZ, yMeters: groundY + FLOOR_SLAB_METERS };
    const loftTop = { xCells: stairX, zCells: stairTopZ, yMeters: groundY + feetToMeters(7) };
    const loftStairs = stairConnection("tavern-loft-stairs", 0, loftBottom, loftTop, 1.6, "wood", ["loft", "service-access"]);
    scene.primitives.push(
      loftStairs.primitive,
      box("tavern-loft", 0, loftTop.xCells, loftTop.yMeters, loftTop.zCells, 3.2, FLOOR_SLAB_METERS, 2.8, "wood", ["platform", "loft"]),
    );
    scene.routes.push(stairRoute("tavern-loft-access", loftStairs));
    scene.tactical.push(tacticalFeature("tavern-loft-advantage", "highGround", loftTop.xCells, loftTop.zCells, loftTop.yMeters, 1, "The real loft landing overlooks the busy floor."));
  }

  for (let level = 1; level < floors; level += 1) {
    const baseY = floorBaseY[level] ?? groundY;
    const levelHeight = feetToMeters(floorHeightFeet[level] ?? 12);
    const hallwayWidth = request.size === "large" ? 4 : 2;
    const maximumGuests = Math.max(2, Math.min(request.size === "large" ? 8 : 6, Math.floor((innerDepth / 3) * 2)));
    const guestCount = rng.int(2, maximumGuests);
    const guests = upperGuestLayouts(level, width, depth, hallwayWidth, guestCount);
    const bottom = { xCells: stairX, zCells: stairBottomZ, yMeters: (floorBaseY[level - 1] ?? groundY) + FLOOR_SLAB_METERS };
    const top = { xCells: stairX, zCells: stairTopZ, yMeters: baseY + FLOOR_SLAB_METERS };
    const mainStairs = stairConnection(`tavern-main-stairs-${level}`, level - 1, bottom, top, 2.1, "wood", ["main-stair"]);
    const stairwellId = `tavern-stairwell-${level}`;
    scene.rooms.push(
      createRoom(stairwellId, "Stair landing", "circulation", level, stairX, stairwellCenterZ, 3, Math.ceil(stairRun) + 1, baseY),
      createRoom(`tavern-hallway-${level}`, "Guest corridor", "circulation", level, width / 2, depth / 2, hallwayWidth, innerDepth, baseY),
    );
    connectRooms(scene.rooms, stairwellId, `tavern-hallway-${level}`);
    connectRooms(scene.rooms, `tavern-stairwell-${level - 1}`, stairwellId);
    for (const guest of guests) {
      scene.rooms.push(createRoom(guest.id, `Guest room ${level}-${guest.index}`, "private", level, guest.x, guest.z, guest.width, guest.depth, baseY));
      connectRooms(scene.rooms, `tavern-hallway-${level}`, guest.id);
    }
    const leftDoorOpenings = guests.filter((guest) => guest.onLeft).map((guest) => ({ offsetCells: guest.z - depth / 2, widthCells: 1.15 }));
    const rightDoorOpenings = guests.filter((guest) => !guest.onLeft).map((guest) => ({ offsetCells: guest.z - depth / 2, widthCells: 1.15 }));
    scene.primitives.push(
      ...rectangularShell(
        `tavern-upper-shell-${level}`,
        level,
        width / 2,
        depth / 2,
        baseY,
        width,
        depth,
        levelHeight - FLOOR_SLAB_METERS,
        "wood",
        "plaster",
        ["tavern", "guest-floor"],
        {},
        [{ id: `tavern-stair-opening-${level}`, centerXCells: top.xCells, centerZCells: top.zCells, widthCells: 3, depthCells: 3.2, tags: ["stair-opening", "vertical-opening"] }],
      ),
      ...wallWithOpenings(`tavern-hallway-wall-left-${level}`, level, width / 2 - hallwayWidth / 2, depth / 2, baseY + FLOOR_SLAB_METERS, innerDepth, levelHeight - FLOOR_SLAB_METERS, "z", "plaster", ["guest-corridor"], leftDoorOpenings),
      ...wallWithOpenings(`tavern-hallway-wall-right-${level}`, level, width / 2 + hallwayWidth / 2, depth / 2, baseY + FLOOR_SLAB_METERS, innerDepth, levelHeight - FLOOR_SLAB_METERS, "z", "plaster", ["guest-corridor"], rightDoorOpenings),
      mainStairs.primitive,
    );
    scene.routes.push(stairRoute(`tavern-stair-route-${level}`, mainStairs));
  }

  scene.primitives.push(
    box("tavern-roof", floors - 1, width / 2, roofY, depth / 2, width + 0.6, 0.32, depth + 0.6, "roof", ["roof"]),
    primitive("tavern-door-lantern", "cone", 0, 1.1, groundY + 2.2, depth / 2, 0.6, 1.25, 0.6, "warmLight", ["light", "entrance"]),
  );
  scene.routes.push(
    createRoute("tavern-main-route", "primary", [
      { x: -1, z: depth / 2, y: groundY + FLOOR_SLAB_METERS },
      { x: 2, z: depth / 2, y: groundY + FLOOR_SLAB_METERS },
      { x: hallCenterX, z: hallCenterZ, y: groundY + FLOOR_SLAB_METERS },
      { x: stairX, z: stairBottomZ, y: groundY + FLOOR_SLAB_METERS },
    ]),
    createRoute("tavern-service-route", "alternate", [
      { x: hallWidth - 0.8, z: kitchenCenterZ, y: groundY + FLOOR_SLAB_METERS },
      { x: serviceStart + serviceWidth / 2, z: kitchenCenterZ, y: groundY + FLOOR_SLAB_METERS },
      { x: serviceStart + serviceWidth / 2, z: pantryCenterZ, y: groundY + FLOOR_SLAB_METERS },
    ]),
  );
  scene.tactical.push(
    tacticalFeature("tavern-front-door", "entrance", 1, depth / 2, groundY, 1, "The main door opens into the common room."),
    tacticalFeature("tavern-bar-choke", "chokepoint", hallWidth - 0.9, depth * 0.42, groundY, 1, "The bar narrows movement between taproom and service wing."),
  );
  if (floors > 1) {
    const topLevelY = (floorBaseY[floors - 1] ?? groundY) + FLOOR_SLAB_METERS;
    scene.tactical.push(tacticalFeature("tavern-upper-landing-advantage", "highGround", stairX, stairTopZ, topLevelY, 1, "The upper stair landing is an actual reachable overlook."));
  }

  return scene;
}
