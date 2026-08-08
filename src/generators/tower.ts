import type { GeneratedScene, GeneratorContext } from "../schema";
import {
  FLOOR_SLAB_METERS,
  baseScene,
  box,
  choose,
  connectRooms,
  createRoom,
  createRoute,
  cylinder,
  feetToMeters,
  floorSlabWithOpenings,
  primitive,
  rectangularShell,
  stairConnection,
  stairRoute,
  stairs,
  tacticalFeature,
} from "./shared";

function towerProfile(context: GeneratorContext): { footprint: number; floors: number } {
  const { rng, request } = context;
  switch (request.size) {
    case "small":
      return { footprint: rng.int(8, 10), floors: rng.int(3, 4) };
    case "large":
      return { footprint: rng.bool(0.16) ? rng.int(17, 19) : rng.int(13, 16), floors: rng.int(4, 6) };
    default:
      return { footprint: rng.int(10, 13), floors: rng.int(3, 5) };
  }
}

function roundTowerWalls(
  id: string,
  level: number,
  centerX: number,
  centerZ: number,
  baseY: number,
  diameter: number,
  wallHeight: number,
): ReturnType<typeof box>[] {
  const segments = 10;
  const radius = diameter / 2 - 0.32;
  const chord = (Math.PI * diameter) / segments;
  const result: ReturnType<typeof box>[] = [];
  for (let index = 0; index < segments; index += 1) {
    // The west-facing segment is deliberately omitted at ground level,
    // creating a visible arched entrance instead of a closed ring with an
    // entrance only in metadata.
    if (level === 0 && index === segments / 2) continue;
    const angle = (Math.PI * 2 * index) / segments;
    result.push(
      box(
        `${id}-wall-${index + 1}`,
        level,
        centerX + Math.cos(angle) * radius,
        baseY + FLOOR_SLAB_METERS,
        centerZ + Math.sin(angle) * radius,
        chord + 0.2,
        wallHeight,
        0.34,
        "darkStone",
        ["wall", "round", "tower"],
        Math.PI / 2 - angle,
      ),
    );
  }
  return result;
}

function spiralFlight(id: string, level: number, center: number, bottomY: number, topY: number, radius: number): { steps: ReturnType<typeof box>[]; route: ReturnType<typeof createRoute> } {
  const count = 18;
  const steps: ReturnType<typeof box>[] = [];
  const points: Array<{ x: number; z: number; y: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const fraction = index / (count - 1);
    const angle = -Math.PI * 0.5 + fraction * Math.PI * 2;
    const x = center + Math.cos(angle) * radius;
    const z = center + Math.sin(angle) * radius;
    const y = bottomY + (topY - bottomY) * fraction;
    steps.push(box(`${id}-step-${index}`, level, x, y, z, 1.25, Math.max(0.16, (topY - bottomY) / count), 0.72, "stone", ["stairs", "spiral-stair", "standable", "vertical-opening"], -angle));
    points.push({ x, z, y });
  }
  return { steps, route: createRoute(`${id}-route`, "vertical", points) };
}

/** A vertically navigable tower whose silhouette and floor use are independently varied. */
export function generateTower(context: GeneratorContext): GeneratedScene {
  const { request, rng } = context;
  const promptText = request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const wizardTower = ["法师塔", "魔法塔", "巫师塔", "wizard tower", "mage tower"].some((term) => promptText.includes(term));
  const profileBase = towerProfile(context);
  const profile = {
    ...profileBase,
    floors: wizardTower && ["三层", "three floors", "three-level", "3-floor"].some((term) => promptText.includes(term)) ? 3 : profileBase.floors,
  };
  const isRound = wizardTower || rng.bool();
  const floorHeightFeet = Array.from({ length: profile.floors }, () => rng.int(13, 15));
  const floorBaseY: number[] = [];
  let topY = 0;
  for (const height of floorHeightFeet) {
    floorBaseY.push(topY);
    topY += feetToMeters(height);
  }

  const bounds = profile.footprint + 2;
  const center = bounds / 2;
  const purpose = choose(rng, ["watch", "arcane survey", "river patrol", "border signal"]);
  const scene = baseScene(
    "tower",
    wizardTower ? "The Starward Wizard Tower" : choose(rng, ["The Warden's Needle", "The Starward Tower", "Greywatch Spire", "The Lantern Keep"]),
    wizardTower ? "Three-level arcane tower with a true spiral stair, alchemy laboratory, restricted library, observatory, and roof duel platform." : `${isRound ? "Round" : "Square"} ${purpose} tower with stacked chambers, landings, and exposed platforms.`,
    request.seed,
    { x: bounds, z: bounds },
    profile.floors,
    floorHeightFeet,
  );

  const stairRun = Math.min(5.5, Math.max(3.8, profile.footprint - 3));
  const platformOffset = Math.max(1.7, profile.footprint * 0.2);
  const entranceX = center - profile.footprint / 2 + 0.7;
  const roomRoles: Array<"private" | "service" | "combat"> = ["combat", "service", "private"];
  const roomNames = wizardTower
    ? ["Arcane entry", "Alchemy laboratory", "Restricted library", "Spell observatory", "Summoning chamber", "Roof duel platform"]
    : ["Guard chamber", "Store and winch room", "Map room", "Signal chamber", "Observatory", "Ward room", "Bell floor"];
  const stairBottomPortal = (level: number, yMeters: number) => ({
    xCells: center + (level % 2 === 0 ? -stairRun / 2 : stairRun / 2),
    zCells: center,
    yMeters,
  });
  const stairTopPortal = (level: number, yMeters: number) => ({
    xCells: center + (level % 2 === 0 ? stairRun / 2 : -stairRun / 2),
    zCells: center,
    yMeters,
  });

  for (let level = 0; level < profile.floors; level += 1) {
    const baseY = floorBaseY[level] ?? 0;
    const floorHeight = feetToMeters(floorHeightFeet[level] ?? 14);
    const roomId = `tower-chamber-${level}`;
    const roomName = wizardTower
      ? level === 0 ? "Alchemy laboratory" : level === 1 ? "Restricted library" : level === profile.floors - 1 ? "Spell observatory" : "Arcane study"
      : level === 0 ? "Entry chamber" : roomNames[(level - 1) % roomNames.length] ?? "Tower chamber";
    const roomRole = level === 0 ? "public" : roomRoles[(level - 1) % roomRoles.length] ?? "private";
    const stairsId = `tower-landing-${level}`;
    const landingPortal = stairBottomPortal(level, baseY + FLOOR_SLAB_METERS);
    const floorOpenings = level === 0
      ? []
      : [{ id: `tower-stair-opening-${level}`, centerXCells: wizardTower ? center : landingPortal.xCells, centerZCells: wizardTower ? center : landingPortal.zCells, widthCells: wizardTower ? 4.2 : 2.7, depthCells: wizardTower ? 4.2 : 2.7, tags: ["stair-opening", "vertical-opening"] }];
    scene.rooms.push(
      createRoom(roomId, roomName, roomRole, level, center, center, profile.footprint - 1.2, profile.footprint - 1.2, baseY),
      createRoom(stairsId, level === 0 ? "Lower landing" : "Stair landing", "circulation", level, landingPortal.xCells, landingPortal.zCells, 3, 3, baseY),
    );
    if (wizardTower) {
      const featureTag = level === 0 ? "alchemy" : level === 1 ? "library" : level === profile.floors - 1 ? "observatory" : "arcane-core";
      scene.primitives.push(
        box(`wizard-${featureTag}-${level}`, level, center, baseY + FLOOR_SLAB_METERS, center, Math.max(2.2, profile.footprint * 0.34), level === profile.floors - 1 ? 2.4 : 1.6, Math.max(2.2, profile.footprint * 0.28), featureTag === "alchemy" ? "hazard" : featureTag === "library" ? "wood" : "darkStone", ["wizard-tower", featureTag, "cover"]),
      );
      scene.tactical.push(tacticalFeature(`wizard-${featureTag}-tactical-${level}`, featureTag === "observatory" ? "highGround" : featureTag === "alchemy" ? "hazard" : "cover", center, center, baseY, 2, `The ${featureTag} floor gives the wizard tower a distinct tactical purpose.`));
    }
    connectRooms(scene.rooms, roomId, stairsId);
    if (level > 0) connectRooms(scene.rooms, `tower-landing-${level - 1}`, stairsId);

    if (isRound) {
      scene.primitives.push(
        ...floorSlabWithOpenings(`tower-round-${level}`, level, center, baseY, center, profile.footprint - 0.6, profile.footprint - 0.6, "stone", ["round", "tower"], floorOpenings),
        ...roundTowerWalls(`tower-round-${level}`, level, center, center, baseY, profile.footprint, floorHeight - FLOOR_SLAB_METERS),
      );
    } else {
      scene.primitives.push(
        ...rectangularShell(
          `tower-square-${level}`,
          level,
          center,
          center,
          baseY,
          profile.footprint,
          profile.footprint,
          floorHeight - FLOOR_SLAB_METERS,
          "stone",
          "darkStone",
          ["tower", "square"],
          level === 0 ? { west: { widthCells: 1.8 } } : {},
          floorOpenings,
        ),
      );
    }

    const platformY = baseY + floorHeight * 0.54;
    const platformX = center + (level % 2 === 0 ? platformOffset : -platformOffset) * 0.52;
    const platformZ = center + (level % 2 === 0 ? -platformOffset : platformOffset) * 0.36;
    scene.primitives.push(
      (isRound
        ? cylinder(`tower-platform-${level}`, level, platformX, platformY, platformZ, 3.6, FLOOR_SLAB_METERS, "stone", ["platform", "high-ground"])
        : box(`tower-platform-${level}`, level, platformX, platformY, platformZ, 3.6, FLOOR_SLAB_METERS, 3.6, "stone", ["platform", "high-ground"])),
      stairs(
        `tower-platform-stairs-${level}`,
        level,
        (center + platformX) / 2,
        baseY + FLOOR_SLAB_METERS,
        (center + platformZ) / 2,
        1.5,
        Math.max(1.5, platformY - baseY),
        Math.max(2.8, profile.footprint * 0.24),
        "stone",
        ["platform-access"],
        level % 2 === 0 ? Math.PI / 4 : -Math.PI / 4,
      ),
    );
    scene.tactical.push(tacticalFeature(`tower-platform-ground-${level}`, "highGround", platformX, platformZ, platformY, 2, "A half-storey platform dominates the chamber below."));

    if (level < profile.floors - 1) {
      const nextY = floorBaseY[level + 1] ?? baseY + floorHeight;
      const mainStairs = stairConnection(
        `tower-main-stairs-${level}-${level + 1}`,
        level,
        landingPortal,
        stairTopPortal(level, nextY + FLOOR_SLAB_METERS),
        1.8,
        "stone",
        ["main-stair", "alternating-flight"],
      );
      if (wizardTower) {
        const spiral = spiralFlight(`tower-spiral-${level}-${level + 1}`, level, center, baseY + FLOOR_SLAB_METERS, nextY + FLOOR_SLAB_METERS, Math.max(1.65, profile.footprint * 0.2));
        scene.primitives.push(...spiral.steps);
        scene.routes.push(spiral.route);
      } else {
        scene.primitives.push(mainStairs.primitive);
        scene.routes.push(stairRoute(`tower-vertical-route-${level}`, mainStairs));
      }
    }
  }

  const roofHeight = Math.max(2.4, feetToMeters(floorHeightFeet[profile.floors - 1] ?? 14) * 0.38);
  scene.primitives.push(
    primitive(
      "tower-roof",
      "cone",
      profile.floors - 1,
      center,
      topY,
      center,
      (profile.footprint + 1) * 1.524,
      roofHeight,
      (profile.footprint + 1) * 1.524,
      "roof",
      ["roof", isRound ? "round" : "square"],
    ),
    box("tower-entry-jamb-north", 0, entranceX, FLOOR_SLAB_METERS, center - 1.15, 0.45, feetToMeters(8), 0.45, "darkStone", ["entrance", "door-frame"]),
    box("tower-entry-jamb-south", 0, entranceX, FLOOR_SLAB_METERS, center + 1.15, 0.45, feetToMeters(8), 0.45, "darkStone", ["entrance", "door-frame"]),
    box("tower-entry-step", 0, entranceX, FLOOR_SLAB_METERS, center, 1.4, 0.45, 2.2, "stone", ["entrance", "stairs"]),
  );
  if (wizardTower) {
    scene.rooms.push(createRoom("wizard-roof-duel-room", "Roof duel platform", "combat", profile.floors - 1, center, center, Math.max(5, profile.footprint * 0.7), Math.max(5, profile.footprint * 0.7), topY));
    connectRooms(scene.rooms, `tower-chamber-${profile.floors - 1}`, "wizard-roof-duel-room");
    scene.primitives.push(
      cylinder("wizard-roof-duel-platform", profile.floors - 1, center, topY + roofHeight * 0.78, center, profile.footprint * 0.82, FLOOR_SLAB_METERS, "stone", ["roof-platform", "roof-duel", "standable", "high-ground"]),
      cylinder("wizard-roof-parapet", profile.floors - 1, center, topY + roofHeight * 0.78 + FLOOR_SLAB_METERS, center, profile.footprint * 0.9, feetToMeters(3), "darkStone", ["roof", "parapet", "cover"]),
    );
  }
  scene.routes.push(
    createRoute("tower-primary-route", "primary", [
      { x: entranceX - 1.5, z: center, y: 0 },
      { x: center, z: center, y: 0 },
      { x: stairBottomPortal(0, FLOOR_SLAB_METERS).xCells, z: stairBottomPortal(0, FLOOR_SLAB_METERS).zCells, y: FLOOR_SLAB_METERS },
    ]),
    createRoute("tower-platform-circuit", "alternate", [
      { x: center - profile.footprint * 0.28, z: center, y: floorBaseY[0] ?? 0 },
      { x: center, z: center + profile.footprint * 0.28, y: floorBaseY[0] ?? 0 },
      { x: center + profile.footprint * 0.28, z: center, y: floorBaseY[0] ?? 0 },
    ]),
  );
  scene.tactical.push(
    tacticalFeature("tower-entrance", "entrance", entranceX, center, 0, 1, "The narrow front door channels anyone entering the keep."),
    tacticalFeature("tower-stair-chokepoint", "chokepoint", stairBottomPortal(0, FLOOR_SLAB_METERS).xCells, stairBottomPortal(0, FLOOR_SLAB_METERS).zCells, floorBaseY[0] ?? 0, 1, "The stair throat is narrow enough for a determined defense."),
    tacticalFeature("tower-roof-vantage", "highGround", center, center, topY, 3, "The roof commands approaches in every direction."),
  );

  return scene;
}
