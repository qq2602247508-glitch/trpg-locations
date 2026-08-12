import type { GeneratedScene, GeneratorContext } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  cellsToMeters,
  connectRooms,
  corridor,
  createRoom,
  createRoute,
  feetToMeters,
  primitive,
  rectangularShell,
  stairConnection,
  stairRoute,
  tacticalFeature,
  water,
} from "./shared";

function sewerProfile(context: GeneratorContext): { width: number; depth: number } {
  const { rng, request } = context;
  switch (request.size) {
    case "small":
      return { width: rng.int(20, 24), depth: rng.int(16, 20) };
    case "large":
      return { width: rng.int(32, 40), depth: rng.int(24, 30) };
    default:
      return { width: rng.int(26, 32), depth: rng.int(20, 25) };
  }
}

/** Four non-solid walls around a climb/water drop; the middle is intentionally void. */
function shaftFrame(
  id: string,
  level: number,
  x: number,
  z: number,
  bottomY: number,
  height: number,
  sizeCells: number,
): ReturnType<typeof box>[] {
  const half = sizeCells / 2;
  const thickness = 0.22;
  return [
    box(`${id}-west-wall`, level, x - half, bottomY, z, thickness, height, sizeCells, "darkStone", ["shaft", "shaft-wall", "vertical"]),
    box(`${id}-east-wall`, level, x + half, bottomY, z, thickness, height, sizeCells, "darkStone", ["shaft", "shaft-wall", "vertical"]),
    box(`${id}-north-wall`, level, x, bottomY, z - half, sizeCells, height, thickness, "darkStone", ["shaft", "shaft-wall", "vertical"]),
    box(`${id}-south-wall`, level, x, bottomY, z + half, sizeCells, height, thickness, "darkStone", ["shaft", "shaft-wall", "vertical"]),
  ];
}

/**
 * Two stacked sewer levels with an actual open shaft: water runs from the
 * elevated tributary, across a feeder, down a waterfall, and into the main.
 */
export function generateSewer(context: GeneratorContext): GeneratedScene {
  const { request, rng } = context;
  const { width, depth } = sewerProfile(context);
  const floorHeightFeet = [rng.int(10, 12), rng.int(10, 12)];
  const lowerY = 0;
  const upperY = feetToMeters(floorHeightFeet[0] ?? 11);
  const mainZ = Math.floor(depth * (rng.bool() ? 0.5 : 0.58));
  const mainWidth = rng.int(3, 4);
  const shaftX = Math.floor(width * (rng.bool() ? 0.57 : 0.65));
  const shaftZ = mainZ;
  const shaftSize = 6;
  const upperInletX = Math.max(3, Math.floor(width * 0.22));
  const upperStartZ = depth - 2;
  const upperChannelLength = Math.max(4, upperStartZ - shaftZ);
  const upperChannelCenterZ = shaftZ + upperChannelLength / 2;
  const feederLength = Math.max(3, shaftX - upperInletX);
  const feederCenterX = upperInletX + feederLength / 2;
  const lowerBranchX = Math.max(4, Math.floor(width * 0.3));
  const lowerBranchLength = Math.max(4, depth - 2 - mainZ);
  const lowerBranchCenterZ = mainZ + lowerBranchLength / 2;
  const walkZ = Math.max(2.6, mainZ - mainWidth / 2 - 2.1);
  const upperWalkZ = Math.max(2.6, shaftZ - shaftSize / 2 - 1.8);
  const scene = baseScene(
    "sewer",
    rng.pick(["The Iron Sluice", "Oldflow Works", "The Blackwater Conduits", "The Brick Veins"]),
    "Layered storm drains with a walkable open shaft and a continuously falling watercourse.",
    request.seed,
    { x: width, z: depth },
    2,
    floorHeightFeet,
  );

  const stairBottom = { xCells: shaftX + 1.65, zCells: shaftZ - 2, yMeters: lowerY + FLOOR_SLAB_METERS };
  const stairTop = { xCells: shaftX - 1.65, zCells: shaftZ - 2, yMeters: upperY + FLOOR_SLAB_METERS };
  const shaftStairs = stairConnection("sewer-primary-shaft-stairs", 0, stairBottom, stairTop, 1.45, "stone", ["shaft-access", "up", "down"]);
  const upperWaterY = upperY + FLOOR_SLAB_METERS;
  const lowerWaterY = lowerY + FLOOR_SLAB_METERS;
  const upperWaterRouteY = upperWaterY + 0.12;
  const lowerWaterRouteY = lowerWaterY + 0.16;

  scene.rooms.push(
    createRoom("sewer-main-channel", "Lower main channel", "service", 0, width / 2, mainZ, width - 2, mainWidth + 1, lowerY),
    createRoom("sewer-lower-maintenance", "Lower inspection way", "circulation", 0, width / 2, walkZ, width - 2, 2.5, lowerY),
    createRoom("sewer-lower-branch", "Lower branch junction", "service", 0, lowerBranchX, lowerBranchCenterZ, 3, lowerBranchLength, lowerY),
    createRoom("sewer-shaft-0", "Shaft base", "circulation", 0, shaftX, shaftZ, shaftSize, shaftSize, lowerY),
    createRoom("sewer-upper-gallery", "Upper inspection gallery", "circulation", 1, width / 2, upperWalkZ, width - 5, 3, upperY),
    createRoom("sewer-upper-tributary", "Elevated tributary", "service", 1, upperInletX, upperChannelCenterZ, 3, upperChannelLength, upperY),
    createRoom("sewer-shaft-1", "Shaft head", "circulation", 1, shaftX, shaftZ, shaftSize, shaftSize, upperY),
  );
  connectRooms(scene.rooms, "sewer-main-channel", "sewer-lower-maintenance");
  connectRooms(scene.rooms, "sewer-main-channel", "sewer-lower-branch");
  connectRooms(scene.rooms, "sewer-lower-maintenance", "sewer-shaft-0");
  connectRooms(scene.rooms, "sewer-shaft-0", "sewer-shaft-1");
  connectRooms(scene.rooms, "sewer-shaft-1", "sewer-upper-gallery");
  connectRooms(scene.rooms, "sewer-upper-gallery", "sewer-upper-tributary");

  scene.primitives.push(
    ...rectangularShell(
      "sewer-lower-vault",
      0,
      width / 2,
      depth / 2,
      lowerY,
      width,
      depth,
      upperY - lowerY - FLOOR_SLAB_METERS,
      "stone",
      "darkStone",
      ["sewer", "lower-vault"],
      { west: { offsetCells: walkZ - depth / 2, widthCells: 2.2 }, east: { offsetCells: walkZ - depth / 2, widthCells: 2.2 } },
    ),
    ...rectangularShell(
      "sewer-upper-vault",
      1,
      width / 2,
      depth / 2,
      upperY,
      width - 3,
      depth - 3,
      feetToMeters(floorHeightFeet[1] ?? 11) - FLOOR_SLAB_METERS,
      "stone",
      "darkStone",
      ["sewer", "upper-vault"],
      { west: { offsetCells: upperWalkZ - depth / 2, widthCells: 2.2 }, east: { offsetCells: upperWalkZ - depth / 2, widthCells: 2.2 } },
      [{ id: "sewer-primary-shaft-opening", centerXCells: shaftX, centerZCells: shaftZ, widthCells: shaftSize, depthCells: shaftSize, tags: ["shaft-opening", "vertical-opening"] }],
    ),
    corridor("sewer-lower-inspection-way", 0, 1.5, walkZ, width - 1.5, walkZ, lowerY + FLOOR_SLAB_METERS, 2.2, "stone", ["maintenance-way", "standable", "support-surface"]),
    corridor("sewer-upper-gallery-floor", 1, 2.5, upperWalkZ, width - 2.5, upperWalkZ, upperY + FLOOR_SLAB_METERS, 2.4, "stone", ["maintenance-way", "upper", "standable", "support-surface"]),
    water("sewer-main-water", 0, width / 2, lowerWaterY, mainZ, mainWidth, 0.32, width - 2, ["main-channel", "downstream", "continuous-water"], Math.PI / 2),
    water("sewer-lower-branch-water", 0, lowerBranchX, lowerWaterY, lowerBranchCenterZ, 2.1, 0.25, lowerBranchLength, ["branch-channel", "to-main", "continuous-water"]),
    water("sewer-upper-tributary-water", 1, upperInletX, upperWaterY, upperChannelCenterZ, 2.1, 0.24, upperChannelLength, ["branch-channel", "upstream", "continuous-water"]),
    water("sewer-upper-feeder-water", 1, feederCenterX, upperWaterY, shaftZ, 2.1, 0.24, feederLength, ["branch-channel", "to-shaft", "continuous-water"], Math.PI / 2),
    primitive("sewer-primary-waterfall", "water", 0, shaftX, lowerWaterY, shaftZ, cellsToMeters(2.1), upperY - lowerY + 0.3, cellsToMeters(2.1), "water", ["water", "waterfall", "shaft-water", "continuous-water"]),
    ...shaftFrame("sewer-primary-shaft", 0, shaftX, shaftZ, lowerY + FLOOR_SLAB_METERS, upperY - lowerY, shaftSize),
    shaftStairs.primitive,
    box("sewer-main-north-ledge", 0, width / 2, lowerY + FLOOR_SLAB_METERS, mainZ - mainWidth / 2 - 0.55, width - 2, 0.28, 0.7, "stone", ["ledge", "maintenance-edge"]),
    box("sewer-main-south-ledge", 0, width / 2, lowerY + FLOOR_SLAB_METERS, mainZ + mainWidth / 2 + 0.55, width - 2, 0.28, 0.7, "stone", ["ledge", "maintenance-edge"]),
  );

  scene.routes.push(
    createRoute("sewer-main-inspection-route", "primary", [
      { x: 0, z: walkZ, y: lowerY + FLOOR_SLAB_METERS },
      { x: shaftX - shaftSize / 2, z: walkZ, y: lowerY + FLOOR_SLAB_METERS },
      { x: width - 1, z: walkZ, y: lowerY + FLOOR_SLAB_METERS },
    ]),
    createRoute("sewer-upper-inspection-route", "alternate", [
      { x: 1.5, z: upperWalkZ, y: upperY + FLOOR_SLAB_METERS },
      { x: shaftX - shaftSize / 2, z: upperWalkZ, y: upperY + FLOOR_SLAB_METERS },
      { x: width - 1.5, z: upperWalkZ, y: upperY + FLOOR_SLAB_METERS },
    ]),
    stairRoute("sewer-primary-shaft-route", shaftStairs),
    createRoute("sewer-waterflow", "waterflow", [
      { x: upperInletX, z: upperStartZ, y: upperWaterRouteY },
      { x: upperInletX, z: shaftZ, y: upperWaterRouteY },
      { x: shaftX, z: shaftZ, y: upperWaterRouteY },
      { x: shaftX, z: shaftZ, y: lowerWaterRouteY },
      { x: width - 1, z: mainZ, y: lowerWaterRouteY },
    ]),
  );
  scene.tactical.push(
    tacticalFeature("sewer-inlet", "entrance", 0.7, walkZ, lowerY, 1, "A maintenance hatch opens onto the lower inspection way."),
    tacticalFeature("sewer-main-water-hazard", "hazard", width / 2, mainZ, lowerY, Math.ceil(mainWidth / 2), "Fast, waist-deep water pushes combatants toward the outlet."),
    tacticalFeature("sewer-shaft-chokepoint", "chokepoint", shaftX - shaftSize / 2, shaftZ, lowerY, 1, "The open shaft has only a narrow dry edge beside the falling water."),
    tacticalFeature("sewer-upper-gallery", "highGround", shaftX - shaftSize / 2, upperWalkZ, upperY, 2, "The upper inspection gallery overlooks the main channel through the open shaft."),
  );

  return scene;
}
