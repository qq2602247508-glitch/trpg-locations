import {
  GRID_FEET,
  GRID_METERS,
  type BuildingInstance,
  type BuildingProgramSummary,
  type GeneratedScene,
  type MaterialKey,
  type PrimitiveShape,
  type Room,
  type Route,
  type SceneDiagnostics,
  type SceneKind,
  type ScenePrimitive,
  type TacticalFeature,
  type SettlementBuildingKind,
  type SettlementBuildingProgram,
  type Vec2,
  type Vec3,
} from "../schema";
import { normalizeGenerationTiming } from "../timing";

export interface ValidationOptions {
  /** Apply safe metadata/topology repairs to the returned copy. Defaults to true. */
  repair?: boolean;
}

export interface SceneValidationResult {
  /** A cloned scene with diagnostics attached, and repairs applied when enabled. */
  scene: GeneratedScene;
  diagnostics: SceneDiagnostics;
  valid: boolean;
  score: number;
  warnings: string[];
  repairs: string[];
  /** Remaining issues that cannot be safely repaired into a usable scene. */
  errors: string[];
}

type UnknownRecord = Record<string, unknown>;

interface GeometryMetrics {
  routePointCount: number;
  routePointsNearWalkable: number;
  verticalRouteCount: number;
  waterflowRouteCount: number;
  roomConnectionCount: number;
  openingEvidenceCount: number;
  connectorCount: number;
  connectorClearanceErrorCount: number;
  vegetationTrunksChecked: number;
  vegetationCanopyGroupsChecked: number;
  vegetationGroundContactErrorCount: number;
  vegetationDetachedCanopyErrorCount: number;
  geometryErrorCount: number;
}

const SCENE_KINDS = ["tavern", "tower", "sewer", "cave", "dungeon", "building", "settlement", "wilderness", "adaptive"] as const satisfies readonly SceneKind[];
const PRIMITIVE_SHAPES = ["box", "cylinder", "cone", "sphere", "gable", "ramp", "stairs", "water"] as const satisfies readonly PrimitiveShape[];
const MATERIAL_KEYS = ["stone", "darkStone", "wood", "plaster", "roof", "metal", "water", "earth", "rock", "ice", "moss", "hazard", "warmLight"] as const satisfies readonly MaterialKey[];
const ROOM_ROLES = ["public", "private", "service", "circulation", "combat", "natural"] as const satisfies readonly Room["role"][];
const ROUTE_KINDS = ["primary", "alternate", "vertical", "waterflow"] as const satisfies readonly Route["kind"][];
const ROUTE_PURPOSES = ["movement", "crowd", "service", "escape", "water"] as const satisfies readonly NonNullable<Route["purpose"]>[];
const ROUTE_SCHEDULES = ["day", "night", "all"] as const satisfies readonly NonNullable<Route["schedule"]>[];
const TACTICAL_KINDS = ["cover", "highGround", "hazard", "chokepoint", "entrance", "secret"] as const satisfies readonly TacticalFeature["kind"][];
const SETTLEMENT_BUILDING_KINDS = ["home", "tavern", "shrine", "warehouse", "tower", "manor", "guild", "clinic", "blacksmith", "mill", "barn", "factory"] as const satisfies readonly SettlementBuildingKind[];
const BUILDING_DETAIL_LEVELS = ["mass", "facade", "full-interior"] as const satisfies readonly BuildingInstance["detailLevel"][];
const BUILDING_STATES = ["active", "abandoned", "flooded", "temporary"] as const satisfies readonly NonNullable<BuildingInstance["state"]>[];

const GEOMETRY_EPSILON = 0.000_1;
const ROUTE_BOUNDS_MARGIN_METERS = GRID_METERS * 2.5;
const ROUTE_SURFACE_MARGIN_METERS = GRID_METERS * 1.2;
const CONNECTOR_LANDING_MARGIN_METERS = GRID_METERS * 0.35;
const VERTICAL_ROUTE_MIN_RISE_METERS = GRID_METERS * 0.35;
const CAVE_ELEVATION_MIN_RISE_METERS = GRID_METERS * 0.9;
const VEGETATION_CONTACT_MARGIN_METERS = GRID_METERS * 0.16;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneScene(scene: GeneratedScene): GeneratedScene {
  // The schema only contains structured-cloneable data. A cloned result keeps
  // validation side-effect free even when repairs are enabled.
  return globalThis.structuredClone(scene);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function components(rooms: readonly Room[]): string[][] {
  const known = new Map(rooms.map((room) => [room.id, room]));
  const unseen = new Set(known.keys());
  const groups: string[][] = [];

  while (unseen.size > 0) {
    const start = unseen.values().next().value as string;
    const queue = [start];
    const group: string[] = [];
    unseen.delete(start);

    while (queue.length > 0) {
      const id = queue.shift() as string;
      group.push(id);
      const room = known.get(id);
      if (room === undefined) continue;
      for (const connection of room.connections) {
        if (unseen.has(connection)) {
          unseen.delete(connection);
          queue.push(connection);
        }
      }
    }
    groups.push(group);
  }

  return groups;
}

function hasTag(primitive: ScenePrimitive, tag: string): boolean {
  return primitive.tags?.includes(tag) ?? false;
}

function hasAnyTag(primitive: ScenePrimitive, tags: readonly string[]): boolean {
  return tags.some((tag) => hasTag(primitive, tag));
}

function primitiveVerticalSpan(primitive: ScenePrimitive): { min: number; max: number } {
  // Generators conventionally place floors/stairs at their lower surface, while
  // some third-party scenes use their geometric centre. Accept both conventions
  // as evidence instead of imposing a renderer-specific transform here.
  return {
    min: Math.min(primitive.position.y - primitive.size.y / 2, primitive.position.y) - GEOMETRY_EPSILON,
    max: Math.max(primitive.position.y + primitive.size.y / 2, primitive.position.y + primitive.size.y) + GEOMETRY_EPSILON,
  };
}

function pointNearPrimitiveFootprint(point: Vec3, primitive: ScenePrimitive, margin = 0): boolean {
  const dx = point.x - primitive.position.x;
  const dz = point.z - primitive.position.z;
  const rotation = primitive.rotationY ?? 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  // Rotate into the primitive's local X/Z frame. This is a conservative 2D
  // footprint check, not a general collision system.
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;

  if (primitive.shape === "cylinder" || primitive.shape === "sphere" || primitive.shape === "cone") {
    return Math.hypot(localX, localZ) <= Math.max(primitive.size.x, primitive.size.z) / 2 + margin;
  }
  return Math.abs(localX) <= primitive.size.x / 2 + margin
    && Math.abs(localZ) <= primitive.size.z / 2 + margin;
}

function pointNearPrimitiveSurface(point: Vec3, primitive: ScenePrimitive, horizontalMargin = 0, verticalMargin = 0): boolean {
  const span = primitiveVerticalSpan(primitive);
  return pointNearPrimitiveFootprint(point, primitive, horizontalMargin)
    && point.y >= span.min - verticalMargin
    && point.y <= span.max + verticalMargin;
}

function stairEndpoints(stair: ScenePrimitive): { lower: Vec3; upper: Vec3 } {
  const rotation = stair.rotationY ?? 0;
  const sine = Math.sin(rotation);
  const cosine = Math.cos(rotation);
  const halfRun = stair.size.z / 2;
  const offset = (localZ: number): { x: number; z: number } => ({
    x: stair.position.x + localZ * sine,
    // `stairConnection` uses atan2(dx, dz), while Three.js rotates a local
    // +Z vector toward (+sin θ, +cos θ). Preserve that authored direction so
    // the lower/upper endpoints remain the exact bottom/top portals.
    z: stair.position.z + localZ * cosine,
  });
  const lower = offset(-halfRun);
  const upper = offset(halfRun);
  return {
    lower: { ...lower, y: stair.position.y },
    upper: { ...upper, y: stair.position.y + stair.size.y },
  };
}

function horizontalEndpoints(primitive: ScenePrimitive): { first: Vec3; second: Vec3 } {
  const rotation = primitive.rotationY ?? 0;
  const longAxisIsX = primitive.size.x >= primitive.size.z;
  const halfLength = Math.max(primitive.size.x, primitive.size.z) / 2;
  const localX = longAxisIsX ? halfLength : 0;
  const localZ = longAxisIsX ? 0 : halfLength;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const offset = {
    x: localX * cosine + localZ * sine,
    z: -localX * sine + localZ * cosine,
  };
  return {
    first: {
      x: primitive.position.x - offset.x,
      y: primitive.position.y,
      z: primitive.position.z - offset.z,
    },
    second: {
      x: primitive.position.x + offset.x,
      y: primitive.position.y,
      z: primitive.position.z + offset.z,
    },
  };
}

type VerticalConnector = {
  primitive: ScenePrimitive;
  kind: "stair" | "ladder";
  endpointCandidates: Array<{ lower: Vec3; upper: Vec3 }>;
};

function verticalConnector(primitive: ScenePrimitive): VerticalConnector | undefined {
  if (hasAnyTag(primitive, ["magical-floating", "levitating", "floating-island"])) return undefined;
  // A few terrain grammars render natural slopes with the stairs primitive.
  // Their support is validated by the cave/elevation contract below, not by
  // artificial stair landing and doorway rules.
  if (hasAnyTag(primitive, ["natural-ramp", "elevation-change", "ledge-ramp"])) return undefined;
  if (primitive.shape === "stairs" && primitive.size.y >= VERTICAL_ROUTE_MIN_RISE_METERS) {
    return {
      primitive,
      kind: "stair",
      endpointCandidates: [stairEndpoints(primitive)],
    };
  }
  const isExplicitLadder = hasAnyTag(primitive, ["ladder", "shaft-access", "vertical-route"])
    || primitive.id.toLowerCase().includes("ladder");
  if (!isExplicitLadder || primitive.size.y < VERTICAL_ROUTE_MIN_RISE_METERS) {
    return undefined;
  }

  // Older ladder builders use both centre-Y and lower-surface-Y conventions.
  // Keep both candidates while validation migrates generators to explicit
  // endpoint-authored connectors.
  const halfHeight = primitive.size.y / 2;
  return {
    primitive,
    kind: "ladder",
    endpointCandidates: [
      {
        lower: { x: primitive.position.x, y: primitive.position.y - halfHeight, z: primitive.position.z },
        upper: { x: primitive.position.x, y: primitive.position.y + halfHeight, z: primitive.position.z },
      },
      {
        lower: { x: primitive.position.x, y: primitive.position.y, z: primitive.position.z },
        upper: { x: primitive.position.x, y: primitive.position.y + primitive.size.y, z: primitive.position.z },
      },
    ],
  };
}

function routeSamples(route: Route): Vec3[] {
  const samples: Vec3[] = [];
  for (let index = 0; index < route.points.length; index += 1) {
    const point = route.points[index] as Vec3;
    if (index === 0) {
      samples.push(point);
      continue;
    }
    const previous = route.points[index - 1] as Vec3;
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
    // At most half a tactical cell between samples catches a route which
    // visually cuts through a narrow wall or loses its water geometry midway.
    const sections = Math.max(1, Math.ceil(distance / (GRID_METERS * 0.5)));
    for (let section = 1; section <= sections; section += 1) {
      const fraction = section / sections;
      samples.push({
        x: previous.x + (point.x - previous.x) * fraction,
        y: previous.y + (point.y - previous.y) * fraction,
        z: previous.z + (point.z - previous.z) * fraction,
      });
    }
  }
  return samples;
}

function routeVerticalRange(route: Route): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of route.points) {
    min = Math.min(min, point.y);
    max = Math.max(max, point.y);
  }
  return { min, max };
}

function rangesOverlap(left: { min: number; max: number }, right: { min: number; max: number }, margin = 0): boolean {
  return left.max + margin >= right.min && right.max + margin >= left.min;
}

function routeNearPrimitive(route: Route, primitive: ScenePrimitive, horizontalMargin: number, verticalMargin: number): boolean {
  return routeSamples(route).some((sample) => pointNearPrimitiveSurface(sample, primitive, horizontalMargin, verticalMargin));
}

function isWalkablePrimitive(primitive: ScenePrimitive): boolean {
  return primitive.shape === "stairs" || hasAnyTag(primitive, [
    "floor",
    "corridor",
    "stairs",
    "shaft-access",
    "natural-ramp",
    "elevation-change",
    "maintenance-way",
    "platform",
    "ledge",
    "entrance",
    "standable",
    "support-surface",
    "stair-landing",
  ]);
}

function isArtificialBridge(primitive: ScenePrimitive): boolean {
  return hasTag(primitive, "support-validation-required")
    && hasTag(primitive, "bridge")
    && !hasAnyTag(primitive, [
      "magical-floating",
      "levitating",
      "floating-island",
      "decorative-bridge",
    ]);
}

function isExplicitElevatedPlatform(primitive: ScenePrimitive): boolean {
  return hasTag(primitive, "support-validation-required")
    && (hasTag(primitive, "platform") || hasTag(primitive, "floor") || hasTag(primitive, "standable"))
    && !isStructuralSupportPrimitive(primitive)
    && hasAnyTag(primitive, [
    "canopy-platform",
    "tree-platform",
    "escape-platform",
    "observation-platform",
    "suspended-platform",
    "hanging-platform",
    "market-platform",
  ])
    && !hasAnyTag(primitive, ["magical-floating", "levitating", "floating-island"]);
}

function isStructuralSupportPrimitive(primitive: ScenePrimitive): boolean {
  return hasAnyTag(primitive, [
    "structural-support",
    "platform-support",
    "grounded-support",
    "bridge-anchor",
    "bridge-abutment",
    "buttress",
    "tree-trunk",
    "tree-support",
    "giant-tree",
    "suspension-rod",
  ]);
}

function isWaterPrimitive(primitive: ScenePrimitive): boolean {
  return primitive.shape === "water" || primitive.material === "water" || hasTag(primitive, "water");
}

function isVerticalSupport(primitive: ScenePrimitive): boolean {
  return primitive.shape === "stairs" || hasAnyTag(primitive, ["stairs", "shaft-access"]);
}

function isVerticalOpeningEvidence(primitive: ScenePrimitive): boolean {
  return hasAnyTag(primitive, ["stair-opening", "vertical-opening", "shaft", "shaft-access", "opening", "floor-opening", "opening-frame"])
    || (primitive.tags?.some((tag) => tag.startsWith("opening:")) ?? false);
}

function isNaturalElevationSupport(primitive: ScenePrimitive): boolean {
  return hasAnyTag(primitive, ["natural-ramp", "elevation-change"]);
}

function isSolidFloorSlab(primitive: ScenePrimitive): boolean {
  return primitive.shape !== "water"
    && primitive.material !== "water"
    && primitive.size.y > GEOMETRY_EPSILON
    && hasTag(primitive, "floor");
}

function isVegetationSurface(primitive: ScenePrimitive): boolean {
  return !isWaterPrimitive(primitive) && hasAnyTag(primitive, [
    "terrain",
    "floor",
    "support-surface",
    "standable",
  ]);
}

function isOpeningEvidence(primitive: ScenePrimitive): boolean {
  const id = primitive.id.toLowerCase();
  return hasAnyTag(primitive, ["door-frame", "opening", "floor-opening", "opening-frame", "doorway", "portal", "arch"])
    || (primitive.tags?.some((tag) => tag.startsWith("opening:")) ?? false)
    || id.includes("door-frame")
    || id.includes("opening")
    || id.includes("doorway");
}

function isConnectorClearanceBlocker(primitive: ScenePrimitive): boolean {
  if (primitive.shape === "water" || isOpeningEvidence(primitive)) return false;
  if (hasAnyTag(primitive, [
    "decorative",
    "nonblocking",
    "railing",
    "bridge-rail",
    "roof-edge",
    "edge-protection",
    "structural-support",
    "platform-support",
    "grounded-support",
    "bridge-anchor",
    "bridge-abutment",
    "buttress",
    "tree-trunk",
    "tree-support",
    "giant-tree",
    "suspension-rod",
  ])) return false;
  return hasAnyTag(primitive, [
    "wall",
    "blocks-movement",
    "solid-obstacle",
    "obstacle",
    "beam",
    "main-beam",
    "crossbeam",
    "floor-slab",
    "solid",
  ]);
}

function pointAtSegmentHeight(start: Vec3, end: Vec3, height: number): Vec3 | undefined {
  const delta = end.y - start.y;
  if (Math.abs(delta) <= GEOMETRY_EPSILON) return undefined;
  const fraction = (height - start.y) / delta;
  if (fraction <= GEOMETRY_EPSILON || fraction >= 1 - GEOMETRY_EPSILON) return undefined;
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: height,
    z: start.z + (end.z - start.z) * fraction,
  };
}

function connectionPairs(rooms: readonly Room[]): Array<readonly [Room, Room]> {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const seen = new Set<string>();
  const pairs: Array<readonly [Room, Room]> = [];
  for (const room of rooms) {
    for (const connectionId of room.connections) {
      const other = byId.get(connectionId);
      if (other === undefined) continue;
      const key = [room.id, other.id].sort().join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([room, other]);
    }
  }
  return pairs;
}

function connectionSamples(first: Room, second: Room, divisions = 10): Vec3[] {
  const samples: Vec3[] = [];
  for (let index = 0; index <= divisions; index += 1) {
    const fraction = index / divisions;
    samples.push({
      x: first.center.x + (second.center.x - first.center.x) * fraction,
      y: first.center.y + (second.center.y - first.center.y) * fraction,
      z: first.center.z + (second.center.z - first.center.z) * fraction,
    });
  }
  return samples;
}

function validateGeometryInvariants(
  kind: SceneKind,
  boundsCells: Vec2,
  rooms: readonly Room[],
  primitives: readonly ScenePrimitive[],
  routes: readonly Route[],
  report: (message: string) => void,
): GeometryMetrics {
  let geometryErrors = 0;
  const geometryError = (message: string): void => {
    geometryErrors += 1;
    report(message);
  };
  const walkable = primitives.filter(isWalkablePrimitive);
  const water = primitives.filter(isWaterPrimitive);
  const verticalSupports = primitives.filter(isVerticalSupport);
  const naturalSupports = primitives.filter(isNaturalElevationSupport);
  const floorSlabs = primitives.filter(isSolidFloorSlab);
  const openings = primitives.filter(isOpeningEvidence);
  // Dormant focus interiors are compiled for on-demand building inspection.
  // Settlement-wide roads do not participate in that isolated local graph, so
  // they must not be reported as crossing walls that are invisible in overview.
  const solidWalls = primitives.filter((primitive) => hasTag(primitive, "wall") && !hasTag(primitive, "focus-interior") && !isOpeningEvidence(primitive));
  const maximumX = boundsCells.x * GRID_METERS;
  const maximumZ = boundsCells.z * GRID_METERS;
  let routePointCount = 0;
  let routePointsNearWalkable = 0;
  let verticalRouteCount = 0;
  let waterflowRouteCount = 0;
  let connectorClearanceErrorCount = 0;
  let vegetationGroundContactErrorCount = 0;
  let vegetationCanopyGroupsChecked = 0;
  let vegetationDetachedCanopyErrorCount = 0;

  for (const route of routes) {
    const routeRange = routeVerticalRange(route);
    const isVertical = route.kind === "vertical";
    const isWaterflow = route.kind === "waterflow";
    if (isVertical) verticalRouteCount += 1;
    if (isWaterflow) waterflowRouteCount += 1;

    for (let pointIndex = 0; pointIndex < route.points.length; pointIndex += 1) {
      const point = route.points[pointIndex] as Vec3;
      routePointCount += 1;
      if (point.x < -ROUTE_BOUNDS_MARGIN_METERS || point.x > maximumX + ROUTE_BOUNDS_MARGIN_METERS
        || point.z < -ROUTE_BOUNDS_MARGIN_METERS || point.z > maximumZ + ROUTE_BOUNDS_MARGIN_METERS) {
        geometryError(`Route ${route.id} point ${pointIndex} lies outside the reasonable metre-space bounds.`);
      }

      if (!isWaterflow) {
        // Primary routes can legitimately begin just outside an exterior door
        // or cave mouth. Interior points remain under the tighter tolerance.
        const surfaceMargin = pointIndex === 0 || pointIndex === route.points.length - 1
          ? ROUTE_BOUNDS_MARGIN_METERS
          : ROUTE_SURFACE_MARGIN_METERS;
        const hasWalkableSurface = walkable.some((primitive) => pointNearPrimitiveSurface(
          point,
          primitive,
          surfaceMargin,
          ROUTE_SURFACE_MARGIN_METERS,
        ));
        if (hasWalkableSurface) routePointsNearWalkable += 1;
        else geometryError(`Route ${route.id} point ${pointIndex} has no nearby walkable primitive evidence.`);
      }

      if (isWaterflow && pointIndex > 0) {
        const previous = route.points[pointIndex - 1] as Vec3;
        if (point.y > previous.y + GEOMETRY_EPSILON) {
          geometryError(`Waterflow route ${route.id} rises from point ${pointIndex - 1} to ${pointIndex}.`);
        }
      }
    }

    if (!isWaterflow) {
      const wallViolations = new Set<string>();
      for (const sample of routeSamples(route)) {
        for (const wall of solidWalls) {
          const wallBuildingId = wall.tags?.find((tag) => tag.startsWith("building-instance:"))?.slice("building-instance:".length);
          // Settlement and wilderness parent routes are authored before the
          // on-demand full-interior basement graph. A contour road may pass
          // below a high-bank parcel in plan view without belonging to that
          // cellar. Keep validating the building's own entry/basement routes,
          // but do not treat unrelated parent-site routes as if they were
          // trying to walk through a dormant underground room.
          if (hasTag(wall, "underground")
            && hasTag(wall, "full-interior")
            && wallBuildingId
            && !route.id.includes(wallBuildingId)) continue;
          // A surface route may pass over a basement wall. Underground
          // partitions only block routes while the sample is actually inside
          // their vertical span; otherwise every cabin trail crossing the
          // building footprint becomes a false wall violation.
          if (hasTag(wall, "underground") && sample.y > wall.position.y + wall.size.y + ROUTE_SURFACE_MARGIN_METERS) continue;
          if (!pointNearPrimitiveSurface(sample, wall, 0, 0)) continue;
          const hasNearbyOpening = openings.some((opening) => (
            opening.level === wall.level
            && pointNearPrimitiveSurface(sample, opening, GRID_METERS * 0.65, ROUTE_SURFACE_MARGIN_METERS)
          ));
          if (!hasNearbyOpening) wallViolations.add(wall.id);
        }
      }
      for (const wallId of wallViolations) {
        geometryError(`Route ${route.id} passes through solid wall ${wallId} without nearby opening evidence.`);
      }
    }

    if (isWaterflow) {
      const unsupportedSamples = routeSamples(route).filter((sample) => !water.some((primitive) => pointNearPrimitiveSurface(
        sample,
        primitive,
        ROUTE_SURFACE_MARGIN_METERS,
        ROUTE_SURFACE_MARGIN_METERS,
      )));
      if (unsupportedSamples.length > 0) {
        geometryError(`Waterflow route ${route.id} has ${unsupportedSamples.length} sample(s) without nearby water primitive evidence.`);
      }
    }

    if (!isVertical) continue;

    if (routeRange.max - routeRange.min < VERTICAL_ROUTE_MIN_RISE_METERS) {
      geometryError(`Vertical route ${route.id} does not rise by a meaningful amount.`);
      continue;
    }
    const supported = verticalSupports.some((primitive) => (
      rangesOverlap(routeRange, primitiveVerticalSpan(primitive), ROUTE_SURFACE_MARGIN_METERS)
      && routeNearPrimitive(route, primitive, ROUTE_SURFACE_MARGIN_METERS, ROUTE_SURFACE_MARGIN_METERS)
    ));
    if (!supported) {
      geometryError(`Vertical route ${route.id} has no nearby stairs or shaft-access primitive.`);
    }

    for (let pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
      const start = route.points[pointIndex - 1] as Vec3;
      const end = route.points[pointIndex] as Vec3;
      if (Math.abs(end.y - start.y) < VERTICAL_ROUTE_MIN_RISE_METERS) continue;
      for (const floor of floorSlabs) {
        const crossing = pointAtSegmentHeight(start, end, floor.position.y);
        if (crossing === undefined || !pointNearPrimitiveFootprint(crossing, floor, GEOMETRY_EPSILON)) continue;
        const hasCrossingSupport = verticalSupports.some((primitive) => (
          pointNearPrimitiveSurface(crossing, primitive, ROUTE_SURFACE_MARGIN_METERS, ROUTE_SURFACE_MARGIN_METERS)
          && rangesOverlap(primitiveVerticalSpan(primitive), { min: crossing.y, max: crossing.y }, ROUTE_SURFACE_MARGIN_METERS)
        ));
        const hasCrossingOpening = primitives.some((primitive) => (
          isVerticalOpeningEvidence(primitive)
          && pointNearPrimitiveSurface(crossing, primitive, ROUTE_SURFACE_MARGIN_METERS, ROUTE_SURFACE_MARGIN_METERS)
          && rangesOverlap(primitiveVerticalSpan(primitive), { min: crossing.y, max: crossing.y }, ROUTE_SURFACE_MARGIN_METERS)
        ));
        // Adaptive composition intentionally changes `scene.kind`, so domain
        // identity cannot be inferred from that discriminator here. Explicit
        // terrain + edge tags are stronger evidence and remain valid after a
        // wilderness scene becomes an adaptive composition.
        const isOutdoorEdge = hasTag(floor, "terrain") && hasAnyTag(floor, ["ledge", "platform", "bridge"]);
        if (!hasCrossingSupport) {
          geometryError(`Vertical route ${route.id} crosses solid floor slab ${floor.id} without local stair or shaft opening evidence.`);
        } else if (!hasCrossingOpening && !isOutdoorEdge) {
          geometryError(`Vertical route ${route.id} crosses solid floor slab ${floor.id} without local vertical-opening or shaft evidence.`);
        }
      }
    }
  }

  if (kind === "cave") {
    for (const route of routes) {
      for (let pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
        const start = route.points[pointIndex - 1] as Vec3;
        const end = route.points[pointIndex] as Vec3;
        if (Math.abs(end.y - start.y) < CAVE_ELEVATION_MIN_RISE_METERS) continue;
        const segment: Route = { id: route.id, kind: route.kind, points: [start, end] };
        const routeRange = routeVerticalRange(segment);
        const supported = naturalSupports.some((primitive) => (
          rangesOverlap(routeRange, primitiveVerticalSpan(primitive), ROUTE_SURFACE_MARGIN_METERS)
          && routeNearPrimitive(segment, primitive, ROUTE_SURFACE_MARGIN_METERS, ROUTE_SURFACE_MARGIN_METERS)
        ));
        if (!supported) {
          geometryError(`Cave route ${route.id} crosses an elevation change without natural-ramp or elevation-change evidence.`);
        }
      }
    }
  }

  const isClosedBuilding = kind !== "cave" && rooms.some((room) => room.role !== "natural");
  const pairs = connectionPairs(rooms);
  const connectionCount = pairs.length;
  const wallCount = primitives.filter((primitive) => hasTag(primitive, "wall")).length;
  if (isClosedBuilding && connectionCount > 0 && wallCount > 0 && openings.length === 0) {
    geometryError("Closed building room connections have wall geometry but no door-frame/opening evidence.");
  }
  if (isClosedBuilding) {
    for (const [first, second] of pairs) {
      // A circulation node can intentionally model an open landing/corridor;
      // require a doorway only where two enclosed functional rooms claim to
      // cross a directly represented solid wall.
      if (first.level !== second.level || first.role === "circulation" || second.role === "circulation") continue;
      const samples = connectionSamples(first, second);
      const barrier = solidWalls.find((wall) => (
        wall.level === first.level
        && rangesOverlap(primitiveVerticalSpan(wall), { min: first.center.y, max: second.center.y }, ROUTE_SURFACE_MARGIN_METERS)
        && samples.some((sample) => pointNearPrimitiveFootprint(sample, wall, GEOMETRY_EPSILON))
      ));
      if (barrier === undefined) continue;
      const openingNearby = openings.some((opening) => (
        opening.level === first.level
        && samples.some((sample) => pointNearPrimitiveFootprint(sample, opening, GRID_METERS * 1.8))
      ));
      if (!openingNearby) {
        geometryError(`Room connection ${first.id} <-> ${second.id} crosses solid wall ${barrier.id} without nearby door-frame/opening evidence.`);
      }
    }
  }

  const authoredPlatforms = primitives.filter((primitive) => hasTag(primitive, "vertical-slum") && hasTag(primitive, "market-platform"));
  const authoredSupports = primitives.filter((primitive) => hasTag(primitive, "vertical-slum") && hasTag(primitive, "platform-support"));
  for (const platform of authoredPlatforms) {
    const platformBottom = primitiveVerticalSpan(platform).min;
    const supportingColumns = authoredSupports.filter((support) => pointNearPrimitiveFootprint(support.position, platform, GRID_METERS * 0.2)
      && primitiveVerticalSpan(support).max >= platformBottom - ROUTE_SURFACE_MARGIN_METERS);
    if (supportingColumns.length < 2) geometryError(`Elevated platform ${platform.id} lacks two grounded structural supports.`);
  }

  // Composition can move terrain, parcels and authored structures after their
  // source generator has built a stair or ladder. Validate every meaningful
  // vertical connector after composition, not only a short allow-list of site
  // stairs, and never let the connector count as its own landing evidence.
  const verticalConnectors = primitives
    .map(verticalConnector)
    .filter((connector): connector is VerticalConnector => connector !== undefined);
  const stairLandingSurfaces = primitives.filter((primitive) => (
    primitive.shape !== "stairs"
    && isWalkablePrimitive(primitive)
    && !hasAnyTag(primitive, ["water", "lava", "void"])
  ));
  const pointAtWalkableHeight = (point: Vec3, surface: ScenePrimitive): boolean => {
    // Most generators author a slab from its lower surface. Imported or older
    // primitives may use centre-Y, and a few route-facing slabs expose their
    // authored Y as the traversal datum. Accept those discrete surface datums,
    // never any arbitrary point inside a tall walkable-tagged volume.
    const candidateHeights = [
      surface.position.y,
      surface.position.y + surface.size.y / 2,
      surface.position.y + surface.size.y,
    ];
    return candidateHeights.some((height) => Math.abs(point.y - height) <= CONNECTOR_LANDING_MARGIN_METERS);
  };
  const pointOnWalkableTop = (point: Vec3, surface: ScenePrimitive): boolean => (
    pointNearPrimitiveFootprint(point, surface, GRID_METERS * 0.75)
    && pointAtWalkableHeight(point, surface)
  );
  const pointAtOpenedLanding = (point: Vec3): boolean => openings.some((opening) => (
    isVerticalOpeningEvidence(opening)
    // Floor openings are represented by four narrow rim primitives around an
    // intentionally empty centre. The centre of a normal 3 x 3.2-cell stair
    // well can therefore be about 1.6 cells from every individual rim.
    && pointNearPrimitiveFootprint(point, opening, GRID_METERS * 2)
    && pointAtWalkableHeight(point, opening)
  ));
  const endpointSupported = (point: Vec3, connectorPrimitive: ScenePrimitive): boolean => (
    point.y <= CONNECTOR_LANDING_MARGIN_METERS
    || stairLandingSurfaces.some((surface) => surface !== connectorPrimitive && pointOnWalkableTop(point, surface))
    || pointAtOpenedLanding(point)
  );
  const structureSupportsPoint = (point: Vec3, subject: ScenePrimitive): boolean => primitives.some((support) => (
    support !== subject
    && isStructuralSupportPrimitive(support)
    && pointNearPrimitiveFootprint(point, support, GRID_METERS * 0.75)
    && rangesOverlap(
      primitiveVerticalSpan(support),
      { min: point.y - ROUTE_SURFACE_MARGIN_METERS, max: point.y + ROUTE_SURFACE_MARGIN_METERS },
    )
  ));
  const routeSupportsConnector = (connector: VerticalConnector, endpoints: { lower: Vec3; upper: Vec3 }): boolean => (
    !hasAnyTag(connector.primitive, ["route-destination-required", "shaft-access", "ladder"])
    || routes.some((route) => {
      const samples = routeSamples(route);
      const nearConnector = samples.some((sample) => (
        pointNearPrimitiveFootprint(sample, connector.primitive, GRID_METERS * 1.5)
        && sample.y >= Math.min(endpoints.lower.y, endpoints.upper.y) - ROUTE_SURFACE_MARGIN_METERS
        && sample.y <= Math.max(endpoints.lower.y, endpoints.upper.y) + ROUTE_SURFACE_MARGIN_METERS
      ));
      return nearConnector && rangesOverlap(routeVerticalRange(route), {
        min: Math.min(endpoints.lower.y, endpoints.upper.y),
        max: Math.max(endpoints.lower.y, endpoints.upper.y),
      }, ROUTE_SURFACE_MARGIN_METERS);
    })
  );

  for (const bridge of primitives.filter(isArtificialBridge)) {
    const endpoints = horizontalEndpoints(bridge);
    const endpointHasLanding = (point: Vec3): boolean => (
      stairLandingSurfaces.some((surface) => surface !== bridge && pointOnWalkableTop(point, surface))
      || structureSupportsPoint(point, bridge)
    );
    if (!endpointHasLanding(endpoints.first)) {
      geometryError(`Bridge ${bridge.id} has a floating first endpoint with no walkable landing or structural anchor.`);
    }
    if (!endpointHasLanding(endpoints.second)) {
      geometryError(`Bridge ${bridge.id} has a floating second endpoint with no walkable landing or structural anchor.`);
    }
  }

  for (const platform of primitives.filter(isExplicitElevatedPlatform)) {
    const platformBottom = primitiveVerticalSpan(platform).min;
    const supports = primitives.filter((support) => (
      support !== platform
      && isStructuralSupportPrimitive(support)
      && pointNearPrimitiveFootprint(support.position, platform, GRID_METERS * 0.35)
      && primitiveVerticalSpan(support).max >= platformBottom - ROUTE_SURFACE_MARGIN_METERS
    ));
    const requiredSupportCount = hasAnyTag(platform, ["canopy-platform", "tree-platform"]) ? 1 : 2;
    if (supports.length < requiredSupportCount) {
      geometryError(`Elevated platform ${platform.id} has no sufficient structural support continuity.`);
    }
  }

  for (const connector of verticalConnectors) {
    const candidate = connector.endpointCandidates.find((endpoints) => (
      endpointSupported(endpoints.lower, connector.primitive) && endpointSupported(endpoints.upper, connector.primitive)
    ));
    const lowerSupported = connector.endpointCandidates.some((endpoints) => endpointSupported(endpoints.lower, connector.primitive));
    const upperSupported = connector.endpointCandidates.some((endpoints) => endpointSupported(endpoints.upper, connector.primitive));
    const label = connector.kind === "stair" ? "Stair" : "Ladder";
    if (!lowerSupported) geometryError(`${label} ${connector.primitive.id} has a floating lower endpoint with no walkable landing.`);
    if (!upperSupported) geometryError(`${label} ${connector.primitive.id} has a floating upper endpoint with no walkable landing.`);
    if (candidate === undefined) continue;
    if (!routeSupportsConnector(connector, candidate)) {
      geometryError(`${label} ${connector.primitive.id} has no nearby route destination evidence.`);
    }

    const connectorRoute: Route = {
      id: `${connector.primitive.id}-clearance`,
      kind: "vertical",
      points: [candidate.lower, candidate.upper],
    };
    const connectorBuildingId = connector.primitive.tags
      ?.find((tag) => tag.startsWith("building-instance:"))
      ?.slice("building-instance:".length);
    const blockingWall = solidWalls.find((wall) => (
      (() => {
        const wallBuildingId = wall.tags
          ?.find((tag) => tag.startsWith("building-instance:"))
          ?.slice("building-instance:".length);
        // Focus/full interiors are dormant, per-building inspection scenes.
        // Their underground walls may overlap in the settlement overview but
        // cannot block another building's local stair graph.
        return !(connectorBuildingId
          && wallBuildingId
          && connectorBuildingId !== wallBuildingId
          && hasTag(wall, "underground"));
      })()
      &&
      routeSamples(connectorRoute).slice(1, -1).some((sample) => pointNearPrimitiveSurface(
        sample,
        wall,
        Math.max(GEOMETRY_EPSILON, connector.primitive.size.x * 0.3),
        0,
      ))
      && !openings.some((opening) => (
        opening.level === wall.level
        && routeNearPrimitive(connectorRoute, opening, GRID_METERS * 0.65, ROUTE_SURFACE_MARGIN_METERS)
      ))
    ));
    if (blockingWall !== undefined) {
      geometryError(`${label} ${connector.primitive.id} crosses solid wall ${blockingWall.id} without nearby opening evidence.`);
    }

    const connectorClearanceBlockers = primitives.filter((primitive) => (
      primitive !== connector.primitive
      && isConnectorClearanceBlocker(primitive)
      && !(hasTag(primitive, "underground")
        && connectorBuildingId !== undefined
        && (primitive.tags?.find((tag) => tag.startsWith("building-instance:"))?.slice("building-instance:".length) ?? undefined) !== undefined
        && (primitive.tags?.find((tag) => tag.startsWith("building-instance:"))?.slice("building-instance:".length) ?? undefined) !== connectorBuildingId)
    ));
    const connectorSamples = routeSamples(connectorRoute);
    const lowerY = Math.min(candidate.lower.y, candidate.upper.y);
    const upperY = Math.max(candidate.lower.y, candidate.upper.y);
    const endpointInset = Math.max(GRID_METERS * 0.45, connector.primitive.size.z * 0.16);
    const clearanceSamples = connectorSamples.filter((sample) => (
      sample.y > lowerY + endpointInset
      && sample.y < upperY - endpointInset
    ));
    const clearanceHalfWidth = Math.max(
      GRID_METERS * 0.28,
      connector.primitive.size.x * 0.5 + GRID_METERS * 0.08,
    );
    const clearanceVerticalMargin = Math.max(
      GRID_METERS * 0.12,
      Math.min(GRID_METERS * 0.42, connector.primitive.size.y * 0.08),
    );
    const blockingVolume = connectorClearanceBlockers.find((blocker) => {
      const blockerSpan = primitiveVerticalSpan(blocker);
      const overlapsConnectorHeight = rangesOverlap(
        blockerSpan,
        { min: lowerY + endpointInset, max: upperY - endpointInset },
        clearanceVerticalMargin,
      );
      if (!overlapsConnectorHeight) return false;
      const openingNearby = openings.some((opening) => (
        opening.level === blocker.level
        && routeNearPrimitive(connectorRoute, opening, GRID_METERS * 0.8, ROUTE_SURFACE_MARGIN_METERS)
        && pointNearPrimitiveFootprint(blocker.position, opening, GRID_METERS * 0.8)
      ));
      if (openingNearby) return false;
      return clearanceSamples.some((sample) => pointNearPrimitiveFootprint(sample, blocker, clearanceHalfWidth));
    });
    if (blockingVolume !== undefined) {
      connectorClearanceErrorCount += 1;
      geometryError(`${label} ${connector.primitive.id} clearance volume intersects blocking ${blockingVolume.id}.`);
    }
  }

  // Vegetation is checked after composition, against the final terrain/floor
  // primitives. The authored Y datum is the trunk base in the generator
  // convention; accepting the three usual surface datums keeps this compatible
  // with imported centre-Y slabs without treating arbitrary volume overlap as
  // contact. Decorative canopy-only blobs and explicitly floating vegetation
  // are intentionally outside this contract.
  const vegetationSurfaces = primitives.filter(isVegetationSurface);
  const treeTrunks = primitives.filter((primitive) => (
    hasTag(primitive, "tree-trunk")
    && hasAnyTag(primitive, ["forest", "woodland-cover", "mangrove", "ancient-tree"])
    && !hasAnyTag(primitive, ["magical-floating", "levitating", "floating-island", "decorative"])
  ));
  for (const trunk of treeTrunks) {
    const baseY = trunk.position.y;
    const grounded = vegetationSurfaces.some((surface) => (
      pointNearPrimitiveFootprint(trunk.position, surface, Math.max(GEOMETRY_EPSILON, trunk.size.x * 0.15))
      && [surface.position.y, surface.position.y + surface.size.y / 2, surface.position.y + surface.size.y]
        .some((surfaceY) => Math.abs(baseY - surfaceY) <= VEGETATION_CONTACT_MARGIN_METERS)
    ));
    if (!grounded) {
      vegetationGroundContactErrorCount += 1;
      geometryError(`Vegetation trunk ${trunk.id} has no post-composition terrain contact.`);
    }
  }
  for (const canopy of primitives.filter((primitive) => (
    hasTag(primitive, "tree-canopy")
    && hasTag(primitive, "canopy-layer")
    && !hasAnyTag(primitive, ["magical-floating", "levitating", "floating-island"])
  ))) {
    vegetationCanopyGroupsChecked += 1;
    const attachmentRadius = Math.max(GRID_METERS, Math.min(canopy.size.x, canopy.size.z) * 0.45);
    const anchor = canopy.tags?.find((tag) => tag.startsWith("tree-anchor:"));
    const attached = treeTrunks.some((trunk) => (
      (anchor === undefined || trunk.tags?.includes(anchor))
      &&
      Math.hypot(canopy.position.x - trunk.position.x, canopy.position.z - trunk.position.z) <= attachmentRadius
      && primitiveVerticalSpan(trunk).max >= primitiveVerticalSpan(canopy).min - GRID_METERS
    ));
    if (!attached) {
      vegetationDetachedCanopyErrorCount += 1;
      geometryError(`Tree canopy ${canopy.id} has no attached trunk support.`);
    }
  }

  return {
    routePointCount,
    routePointsNearWalkable,
    verticalRouteCount,
    waterflowRouteCount,
    roomConnectionCount: connectionCount,
    openingEvidenceCount: openings.length,
    connectorCount: verticalConnectors.length,
    connectorClearanceErrorCount,
    vegetationTrunksChecked: treeTrunks.length,
    vegetationCanopyGroupsChecked: primitives.filter((primitive) => (
      hasTag(primitive, "tree-canopy")
      && hasTag(primitive, "canopy-layer")
      && !hasAnyTag(primitive, ["magical-floating", "levitating", "floating-island"])
    )).length,
    vegetationGroundContactErrorCount,
    vegetationDetachedCanopyErrorCount,
    geometryErrorCount: geometryErrors,
  };
}

/**
 * Checks structural and tactical invariants, then returns a cloned scene. The
 * default repair mode only normalizes malformed metadata, IDs, numeric values,
 * connections, and the minimal route/entrance metadata required for play. It
 * deliberately never snaps metre-space geometry to cell-space map bounds.
 */
export function validateScene(scene: GeneratedScene, options: ValidationOptions = {}): SceneValidationResult {
  const repair = options.repair ?? true;
  const output = cloneScene(scene);
  const warnings: string[] = [];
  const repairs: string[] = [];
  const errors: string[] = [];

  const repairable = (message: string): void => {
    warnings.push(message);
    if (repair) repairs.push(message);
    else errors.push(message);
  };
  const fatal = (message: string): void => {
    warnings.push(message);
    errors.push(message);
  };

  const stringValue = (value: unknown, fallback: string, label: string): string => {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    repairable(`${label} was blank or invalid; using ${JSON.stringify(fallback)}.`);
    return fallback;
  };
  const finiteValue = (value: unknown, fallback: number, label: string): number => {
    if (isFiniteNumber(value)) return value;
    repairable(`${label} was not finite; using ${fallback}.`);
    return fallback;
  };
  const positiveValue = (value: unknown, fallback: number, label: string): number => {
    if (isFiniteNumber(value) && value > 0) return value;
    repairable(`${label} must be positive; using ${fallback}.`);
    return fallback;
  };
  const positiveInteger = (value: unknown, fallback: number, label: string): number => {
    if (isFiniteNumber(value) && Number.isSafeInteger(value) && value > 0) return value;
    repairable(`${label} must be a positive safe integer; using ${fallback}.`);
    return fallback;
  };
  const nonNegativeInteger = (value: unknown, fallback: number, label: string): number => {
    if (isFiniteNumber(value) && Number.isSafeInteger(value) && value >= 0) return value;
    repairable(`${label} must be a non-negative safe integer; using ${fallback}.`);
    return fallback;
  };
  const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T => {
    if (isOneOf(value, allowed)) return value;
    repairable(`${label} was invalid; using ${fallback}.`);
    return fallback;
  };
  const vec3 = (value: unknown, fallback: Vec3, label: string): Vec3 => {
    if (!isRecord(value)) {
      repairable(`${label} was missing or invalid; using a finite fallback position.`);
      return { ...fallback };
    }
    return {
      x: finiteValue(value.x, fallback.x, `${label}.x`),
      y: finiteValue(value.y, fallback.y, `${label}.y`),
      z: finiteValue(value.z, fallback.z, `${label}.z`),
    };
  };
  const sizeVec3 = (value: unknown, fallback: Vec3, label: string): Vec3 => {
    if (!isRecord(value)) {
      repairable(`${label} was missing or invalid; using a positive fallback size.`);
      return { ...fallback };
    }
    return {
      x: positiveValue(value.x, fallback.x, `${label}.x`),
      y: positiveValue(value.y, fallback.y, `${label}.y`),
      z: positiveValue(value.z, fallback.z, `${label}.z`),
    };
  };
  const sizeVec2 = (value: unknown, fallback: Vec2, label: string, wholeCells = false): Vec2 => {
    if (!isRecord(value)) {
      repairable(`${label} was missing or invalid; using a positive fallback size.`);
      return { ...fallback };
    }
    return {
      x: wholeCells ? positiveInteger(value.x, fallback.x, `${label}.x`) : positiveValue(value.x, fallback.x, `${label}.x`),
      z: wholeCells ? positiveInteger(value.z, fallback.z, `${label}.z`) : positiveValue(value.z, fallback.z, `${label}.z`),
    };
  };

  const rawPrimitives = Array.isArray((output as unknown as UnknownRecord).primitives)
    ? ((output as unknown as UnknownRecord).primitives as unknown[])
    : [];
  const rawRooms = Array.isArray((output as unknown as UnknownRecord).rooms)
    ? ((output as unknown as UnknownRecord).rooms as unknown[])
    : [];
  const rawRoutes = Array.isArray((output as unknown as UnknownRecord).routes)
    ? ((output as unknown as UnknownRecord).routes as unknown[])
    : [];
  const rawTactical = Array.isArray((output as unknown as UnknownRecord).tactical)
    ? ((output as unknown as UnknownRecord).tactical as unknown[])
    : [];
  const rawBuildingInstances = Array.isArray((output as unknown as UnknownRecord).buildingInstances)
    ? ((output as unknown as UnknownRecord).buildingInstances as unknown[])
    : [];

  if (!Array.isArray((output as unknown as UnknownRecord).primitives)) repairable("primitives was not an array; using an empty list.");
  if (!Array.isArray((output as unknown as UnknownRecord).rooms)) repairable("rooms was not an array; using an empty list.");
  if (!Array.isArray((output as unknown as UnknownRecord).routes)) repairable("routes was not an array; using an empty list.");
  if (!Array.isArray((output as unknown as UnknownRecord).tactical)) repairable("tactical was not an array; using an empty list.");

  const rawMaxLevel = [...rawPrimitives, ...rawRooms]
    .map((item) => (isRecord(item) && isFiniteNumber(item.level) && Number.isSafeInteger(item.level) ? item.level : 0))
    .reduce((maximum, level) => Math.max(maximum, level), 0);

  const kind = enumValue(output.kind, SCENE_KINDS, "adaptive", "kind");
  const title = stringValue(output.title, `${kind[0]?.toUpperCase() ?? "A"}${kind.slice(1)} scene`, "title");
  const description = stringValue(output.description, "Deterministically generated tactical scene.", "description");
  const seed = stringValue(output.seed, "repaired-seed", "seed");
  const version = output.version === 1 ? 1 : (repairable("version must be 1; using 1."), 1);
  const gridFeet = output.gridFeet === GRID_FEET ? GRID_FEET : (repairable(`gridFeet must be ${GRID_FEET}; using ${GRID_FEET}.`), GRID_FEET);

  const boundsCells = sizeVec2(output.boundsCells, { x: 12, z: 12 }, "boundsCells", true);
  let floors = positiveInteger(output.floors, Math.max(1, rawMaxLevel + 1), "floors");
  if (floors < rawMaxLevel + 1) {
    repairable(`floors (${floors}) did not include every authored level; using ${rawMaxLevel + 1}.`);
    floors = rawMaxLevel + 1;
  }

  const rawHeights = Array.isArray((output as unknown as UnknownRecord).floorHeightFeet)
    ? ((output as unknown as UnknownRecord).floorHeightFeet as unknown[])
    : [];
  if (!Array.isArray((output as unknown as UnknownRecord).floorHeightFeet)) repairable("floorHeightFeet was not an array; using default floor heights.");
  if (rawHeights.length !== floors) repairable(`floorHeightFeet length (${rawHeights.length}) did not match floors (${floors}); normalizing it.`);
  const floorHeightFeet: number[] = [];
  for (let index = 0; index < floors; index += 1) {
    const prior = floorHeightFeet[index - 1] ?? 10;
    floorHeightFeet.push(positiveValue(rawHeights[index], prior, `floorHeightFeet[${index}]`));
  }
  const generationMs = Math.max(0, finiteValue(output.generationMs, 0, "generationMs"));
  if (isFiniteNumber(output.generationMs) && output.generationMs < 0) repairable("generationMs must not be negative; using 0.");
  const rawTiming = (output as unknown as UnknownRecord).timing;
  const timing = rawTiming === undefined ? undefined : normalizeGenerationTiming(rawTiming, generationMs);
  if (rawTiming !== undefined) {
    if (!isRecord(rawTiming)) repairable("timing was not an object; using zeroed timing.");
    const raw = isRecord(rawTiming) ? rawTiming : {};
    for (const field of ["planningMs", "geometryMs", "totalMs", "transportMs"] as const) {
      if (raw[field] !== undefined && (!isFiniteNumber(raw[field]) || raw[field] < 0)) {
        repairable(`timing.${field} must be finite and non-negative; using 0.`);
      }
    }
    if (timing && timing.totalMs < timing.planningMs + timing.geometryMs) {
      repairable("timing.totalMs must include planningMs and geometryMs; clamping it.");
    }
  }

  const uniqueId = (raw: unknown, prefix: string, index: number, used: Set<string>): string => {
    const base = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : `${prefix}-${index + 1}`;
    if (base !== raw) repairable(`${prefix}[${index}].id was blank or invalid; using ${JSON.stringify(base)}.`);
    let candidate = base;
    let duplicate = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${duplicate}`;
      duplicate += 1;
    }
    if (candidate !== base) repairable(`${prefix}[${index}].id duplicated ${JSON.stringify(base)}; using ${JSON.stringify(candidate)}.`);
    used.add(candidate);
    return candidate;
  };
  const levelFor = (raw: unknown, label: string): number => {
    const level = nonNegativeInteger(raw, 0, label);
    if (level >= floors) {
      const corrected = floors - 1;
      repairable(`${label} (${level}) exceeded floors; using ${corrected}.`);
      return corrected;
    }
    return level;
  };

  const primitiveIds = new Set<string>();
  const primitives: ScenePrimitive[] = [];
  for (let index = 0; index < rawPrimitives.length; index += 1) {
    const raw = rawPrimitives[index];
    if (!isRecord(raw)) {
      repairable(`primitives[${index}] was not an object and was removed.`);
      continue;
    }
    const shape = enumValue(raw.shape, PRIMITIVE_SHAPES, "box", `primitives[${index}].shape`);
    const material = enumValue(raw.material, MATERIAL_KEYS, shape === "water" ? "water" : "stone", `primitives[${index}].material`);
    const rawTags = raw.tags;
    let tags: string[] | undefined;
    if (rawTags !== undefined) {
      if (!Array.isArray(rawTags)) {
        repairable(`primitives[${index}].tags was not an array and was removed.`);
        tags = [];
      } else {
        const cleaned = rawTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim());
        if (cleaned.length !== rawTags.length || unique(cleaned).length !== cleaned.length) {
          repairable(`primitives[${index}].tags contained invalid or duplicate values and was normalized.`);
        }
        tags = unique(cleaned);
      }
    }
    const rotationY = raw.rotationY === undefined
      ? undefined
      : finiteValue(raw.rotationY, 0, `primitives[${index}].rotationY`);
    primitives.push({
      id: uniqueId(raw.id, "primitive", index, primitiveIds),
      shape,
      position: vec3(raw.position, { x: 0, y: 0, z: 0 }, `primitives[${index}].position`),
      size: sizeVec3(raw.size, { x: GRID_METERS, y: 0.1, z: GRID_METERS }, `primitives[${index}].size`),
      ...(rotationY === undefined ? {} : { rotationY }),
      material,
      level: levelFor(raw.level, `primitives[${index}].level`),
      ...(tags === undefined ? {} : { tags }),
    });
  }

  const roomIds = new Set<string>();
  const rooms: Room[] = [];
  for (let index = 0; index < rawRooms.length; index += 1) {
    const raw = rawRooms[index];
    if (!isRecord(raw)) {
      repairable(`rooms[${index}] was not an object and was removed.`);
      continue;
    }
    const rawConnections = raw.connections;
    let connections: string[] = [];
    if (!Array.isArray(rawConnections)) {
      repairable(`rooms[${index}].connections was not an array; using an empty list.`);
    } else {
      const stringConnections = rawConnections.filter((connection): connection is string => typeof connection === "string" && connection.trim().length > 0).map((connection) => connection.trim());
      if (stringConnections.length !== rawConnections.length || unique(stringConnections).length !== stringConnections.length) {
        repairable(`rooms[${index}].connections contained invalid or duplicate IDs and was normalized.`);
      }
      connections = unique(stringConnections);
    }
    rooms.push({
      id: uniqueId(raw.id, "room", index, roomIds),
      name: stringValue(raw.name, `Room ${index + 1}`, `rooms[${index}].name`),
      level: levelFor(raw.level, `rooms[${index}].level`),
      center: vec3(raw.center, { x: 0, y: 0, z: 0 }, `rooms[${index}].center`),
      sizeCells: sizeVec2(raw.sizeCells, { x: 4, z: 4 }, `rooms[${index}].sizeCells`),
      role: enumValue(raw.role, ROOM_ROLES, "natural", `rooms[${index}].role`),
      connections,
    });
  }

  // Connections reference room IDs, so repair them only after every room ID is stable.
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  for (const room of rooms) {
    const validConnections: string[] = [];
    for (const connection of room.connections) {
      if (connection === room.id) {
        repairable(`rooms[${room.id}].connections contained a self-connection and it was removed.`);
      } else if (!roomById.has(connection)) {
        repairable(`rooms[${room.id}].connections referenced missing room ${JSON.stringify(connection)} and it was removed.`);
      } else {
        validConnections.push(connection);
      }
    }
    room.connections = unique(validConnections);
  }
  for (const room of rooms) {
    for (const connection of room.connections) {
      const other = roomById.get(connection);
      if (other !== undefined && !other.connections.includes(room.id)) {
        repairable(`Connection ${room.id} -> ${other.id} was one-way; making it reciprocal.`);
        if (repair) other.connections.push(room.id);
      }
    }
  }
  if (rooms.length > 1) {
    const roomComponents = components(rooms);
    if (roomComponents.length > 1) {
      repairable(`Room graph had ${roomComponents.length} disconnected components; linking them in deterministic ID order.`);
      if (repair) {
        for (let index = 1; index < roomComponents.length; index += 1) {
          const previous = roomById.get((roomComponents[index - 1] as string[])[0] as string);
          const current = roomById.get((roomComponents[index] as string[])[0] as string);
          if (previous !== undefined && current !== undefined) {
            if (!previous.connections.includes(current.id)) previous.connections.push(current.id);
            if (!current.connections.includes(previous.id)) current.connections.push(previous.id);
          }
        }
      }
    }
  }

  const routeIds = new Set<string>();
  const routes: Route[] = [];
  for (let index = 0; index < rawRoutes.length; index += 1) {
    const raw = rawRoutes[index];
    if (!isRecord(raw)) {
      repairable(`routes[${index}] was not an object and was removed.`);
      continue;
    }
    const rawPoints = raw.points;
    const points: Vec3[] = [];
    if (!Array.isArray(rawPoints)) {
      repairable(`routes[${index}].points was not an array; creating a minimal route.`);
    } else {
      for (let pointIndex = 0; pointIndex < rawPoints.length; pointIndex += 1) {
        const point = rawPoints[pointIndex];
        if (!isRecord(point)) {
          repairable(`routes[${index}].points[${pointIndex}] was invalid and was removed.`);
          continue;
        }
        points.push(vec3(point, { x: 0, y: 0, z: 0 }, `routes[${index}].points[${pointIndex}]`));
      }
    }
    if (points.length === 0) points.push({ x: 0, y: 0, z: 0 });
    if (points.length < 2) {
      repairable(`routes[${index}] had fewer than two points; extending it by one tactical cell.`);
      const start = points[0] as Vec3;
      points.push({ x: start.x + GRID_METERS, y: start.y, z: start.z });
    }
    const purpose = raw.purpose === undefined ? undefined : enumValue(raw.purpose, ROUTE_PURPOSES, "movement", `routes[${index}].purpose`);
    const traffic = raw.traffic === undefined ? undefined : Math.min(1, Math.max(0, finiteValue(raw.traffic, 0.5, `routes[${index}].traffic`)));
    const schedule = raw.schedule === undefined ? undefined : enumValue(raw.schedule, ROUTE_SCHEDULES, "all", `routes[${index}].schedule`);
    routes.push({
      id: uniqueId(raw.id, "route", index, routeIds),
      kind: enumValue(raw.kind, ROUTE_KINDS, "primary", `routes[${index}].kind`),
      points,
      ...(purpose === undefined ? {} : { purpose }),
      ...(traffic === undefined ? {} : { traffic }),
      ...(schedule === undefined ? {} : { schedule }),
    });
  }

  if (rooms.length > 0 && routes.length === 0) {
    repairable("Scene had no routes; adding a minimal primary route at the first room.");
    if (repair) {
      const point = rooms[0]?.center ?? { x: 0, y: 0, z: 0 };
      routes.push({
        id: uniqueId("route-primary-auto", "route", routes.length, routeIds),
        kind: "primary",
        points: [{ ...point }, { x: point.x + GRID_METERS, y: point.y, z: point.z }],
      });
    }
  }
  if (routes.length > 0 && !routes.some((route) => route.kind === "primary")) {
    repairable("Scene had no primary route; adding a primary route that follows the first route.");
    if (repair) {
      const source = routes[0] as Route;
      routes.push({
        id: uniqueId("route-primary-auto", "route", routes.length, routeIds),
        kind: "primary",
        points: source.points.map((point) => ({ ...point })),
      });
    }
  }

  const tacticalIds = new Set<string>();
  const tactical: TacticalFeature[] = [];
  for (let index = 0; index < rawTactical.length; index += 1) {
    const raw = rawTactical[index];
    if (!isRecord(raw)) {
      repairable(`tactical[${index}] was not an object and was removed.`);
      continue;
    }
    tactical.push({
      id: uniqueId(raw.id, "tactical", index, tacticalIds),
      kind: enumValue(raw.kind, TACTICAL_KINDS, "cover", `tactical[${index}].kind`),
      position: vec3(raw.position, rooms[0]?.center ?? { x: 0, y: 0, z: 0 }, `tactical[${index}].position`),
      radiusCells: positiveValue(raw.radiusCells, 1, `tactical[${index}].radiusCells`),
      note: stringValue(raw.note, "Tactical feature", `tactical[${index}].note`),
    });
  }

  const buildingInstanceIds = new Set<string>();
  const buildingInstances: BuildingInstance[] = [];
  if ((output as unknown as UnknownRecord).buildingInstances !== undefined && !Array.isArray((output as unknown as UnknownRecord).buildingInstances)) {
    repairable("buildingInstances was not an array; removing invalid building manifests.");
  }
  for (let index = 0; index < rawBuildingInstances.length; index += 1) {
    const raw = rawBuildingInstances[index];
    if (!isRecord(raw)) {
      repairable(`buildingInstances[${index}] was not an object and was removed.`);
      continue;
    }
    const id = uniqueId(raw.id, "building-instance", index, buildingInstanceIds);
    const archetype = enumValue(raw.archetype, SETTLEMENT_BUILDING_KINDS, "home", `buildingInstances[${index}].archetype`);
    const manifestFloors = positiveInteger(raw.floors, 1, `buildingInstances[${index}].floors`);
    const rawManifestHeights = Array.isArray(raw.floorHeightFeet) ? raw.floorHeightFeet : [];
    if (rawManifestHeights.length !== manifestFloors) repairable(`buildingInstances[${index}].floorHeightFeet did not match its floor count; normalizing it.`);
    const manifestHeights: number[] = [];
    for (let floorIndex = 0; floorIndex < manifestFloors; floorIndex += 1) {
      manifestHeights.push(positiveValue(rawManifestHeights[floorIndex], manifestHeights[floorIndex - 1] ?? 10, `buildingInstances[${index}].floorHeightFeet[${floorIndex}]`));
    }
    const positionRecord = isRecord(raw.positionCells) ? raw.positionCells : {};
    if (!isRecord(raw.positionCells)) repairable(`buildingInstances[${index}].positionCells was invalid; using the origin.`);
    const detailLevel = enumValue(raw.detailLevel, BUILDING_DETAIL_LEVELS, "facade", `buildingInstances[${index}].detailLevel`);
    const functionalModules = Array.isArray(raw.functionalModules)
      ? raw.functionalModules.filter((module): module is NonNullable<BuildingInstance["functionalModules"]>[number] => (
        isRecord(module)
        && typeof module.id === "string"
        && typeof module.kind === "string"
        && typeof module.label === "string"
        && typeof module.levelRole === "string"
        && typeof module.minimumFootprintCells === "number"
        && Number.isFinite(module.minimumFootprintCells)
        && Array.isArray(module.tags)
        && module.tags.every((tag) => typeof tag === "string")
      )) as NonNullable<BuildingInstance["functionalModules"]>
      : undefined;
    if (Array.isArray(raw.functionalModules) && functionalModules?.length !== raw.functionalModules.length) {
      repairable(`buildingInstances[${index}].functionalModules contained invalid entries and was normalized.`);
    }
    const instance: BuildingInstance = {
      id,
      archetype,
      seed: stringValue(raw.seed, `${seed}/building/${index + 1}`, `buildingInstances[${index}].seed`),
      district: stringValue(raw.district, "mixed", `buildingInstances[${index}].district`),
      positionCells: {
        x: finiteValue(positionRecord.x, 0, `buildingInstances[${index}].positionCells.x`),
        z: finiteValue(positionRecord.z, 0, `buildingInstances[${index}].positionCells.z`),
      },
      footprintCells: sizeVec2(raw.footprintCells, { x: 4, z: 4 }, `buildingInstances[${index}].footprintCells`),
      rotationY: finiteValue(raw.rotationY, 0, `buildingInstances[${index}].rotationY`),
      floors: manifestFloors,
      floorHeightFeet: manifestHeights,
      detailLevel,
      ...(typeof raw.baseYMeters === "number" && Number.isFinite(raw.baseYMeters) ? { baseYMeters: raw.baseYMeters } : {}),
      ...(typeof raw.exteriorHeightMeters === "number" && raw.exteriorHeightMeters > 0 && Number.isFinite(raw.exteriorHeightMeters) ? { exteriorHeightMeters: raw.exteriorHeightMeters } : {}),
      ...(typeof raw.parcelId === "string" ? { parcelId: raw.parcelId } : {}),
      ...(typeof raw.frontageRoadId === "string" ? { frontageRoadId: raw.frontageRoadId } : {}),
      ...(isRecord(raw.entranceCells) ? { entranceCells: sizeVec2(raw.entranceCells, { x: 0, z: 0 }, `buildingInstances[${index}].entranceCells`) } : {}),
      ...(isRecord(raw.buildingProgram) && Array.isArray(raw.buildingProgram.requiredFeatures) ? { buildingProgram: raw.buildingProgram as unknown as BuildingProgramSummary } : {}),
      ...(isRecord(raw.envelopeProgram) && typeof raw.envelopeProgram.silhouetteSignature === "string" ? { envelopeProgram: raw.envelopeProgram as unknown as NonNullable<BuildingInstance["envelopeProgram"]> } : {}),
      ...(isRecord(raw.interiorProgram) && Array.isArray(raw.interiorProgram.rooms) && Array.isArray(raw.interiorProgram.connections) && Array.isArray(raw.interiorProgram.verticalCores) ? { interiorProgram: raw.interiorProgram as unknown as SettlementBuildingProgram } : {}),
      ...(typeof raw.siteProfile === "string" ? { siteProfile: raw.siteProfile } : {}),
      ...(functionalModules && functionalModules.length > 0 ? { functionalModules: functionalModules.map((module) => ({
        ...module,
        tags: [...module.tags],
      })) } : {}),
      ...(raw.state === undefined ? {} : { state: enumValue(raw.state, BUILDING_STATES, "active", `buildingInstances[${index}].state`) }),
    };
    if (!primitives.some((primitive) => primitive.id.startsWith(`${id}-`) && hasTag(primitive, "independent-building-module"))) {
      fatal(`Building instance ${id} has no independently generated exterior primitive evidence.`);
    }
    buildingInstances.push(instance);
  }
  if (rooms.length > 0 && !tactical.some((feature) => feature.kind === "entrance")) {
    repairable("Scene had no entrance feature; adding one at the primary route start.");
    if (repair) {
      const primary = routes.find((route) => route.kind === "primary");
      const point = primary?.points[0] ?? rooms[0]?.center ?? { x: 0, y: 0, z: 0 };
      tactical.push({
        id: uniqueId("entrance-auto", "tactical", tactical.length, tacticalIds),
        kind: "entrance",
        position: { ...point },
        radiusCells: 1,
        note: "Auto-repaired tactical entrance",
      });
    }
  }

  const geometry = validateGeometryInvariants(kind, boundsCells, rooms, primitives, routes, fatal);

  if (primitives.length === 0) fatal("Scene contains no valid primitives.");
  if (rooms.length === 0) fatal("Scene contains no valid rooms.");
  if (routes.length === 0) fatal("Scene contains no valid routes.");
  if (!routes.some((route) => route.kind === "primary")) fatal("Scene contains no primary route.");
  if (!tactical.some((feature) => feature.kind === "entrance")) fatal("Scene contains no tactical entrance.");

  const finalComponents = components(rooms);
  const entranceCount = tactical.filter((feature) => feature.kind === "entrance").length;
  const tacticalVariety = new Set(tactical.map((feature) => feature.kind).filter((kind) => kind !== "entrance")).size;
  const primaryRouteCount = routes.filter((route) => route.kind === "primary").length;
  const boundsAreaCells = boundsCells.x * boundsCells.z;
  const structuralScore = (primitives.length > 0 ? 15 : 0)
    + (rooms.length > 0 ? 15 : 0)
    + (routes.length > 0 ? 12 : 0)
    + (primaryRouteCount > 0 ? 8 : 0);
  const topologyScore = rooms.length <= 1 || finalComponents.length === 1 ? 15 : 0;
  const tacticalScore = (entranceCount > 0 ? 5 : 0) + Math.min(10, tacticalVariety * 3);
  const dimensionScore = (boundsAreaCells >= 4 ? 5 : 0) + (floorHeightFeet.length === floors ? 5 : 0);
  const metadataScore = title.length > 0 && description.length > 0 && seed.length > 0 && gridFeet === GRID_FEET ? 10 : 0;
  const verticalScore = floors > 1 && routes.some((route) => route.kind === "vertical") ? 5 : 0;
  // P1 geometry violations are deliberately expensive: an attractive but
  // impossible route must never present as a 100-point playable scene.
  const errorPenalty = Math.min(85, errors.length * 12);
  const score = Math.max(0, Math.min(100, structuralScore + topologyScore + tacticalScore + dimensionScore + metadataScore + verticalScore - errorPenalty));
  const valid = errors.length === 0;
  const authoredDiagnostics: UnknownRecord = isRecord((output as unknown as UnknownRecord).diagnostics) ? (output as unknown as UnknownRecord).diagnostics as UnknownRecord : {};
  const authoredMetrics = isRecord(authoredDiagnostics.metrics) ? authoredDiagnostics.metrics : {};
  const preservedMetrics = Object.fromEntries(Object.entries(authoredMetrics).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
  const metrics: Record<string, number> = {
    ...preservedMetrics,
    primitiveCount: primitives.length,
    roomCount: rooms.length,
    routeCount: routes.length,
    primaryRouteCount,
    tacticalCount: tactical.length,
    buildingInstanceCount: buildingInstances.length,
    entranceCount,
    tacticalVariety,
    floors,
    roomComponents: finalComponents.length,
    routePointCount: geometry.routePointCount,
    routePointsNearWalkable: geometry.routePointsNearWalkable,
    verticalRouteCount: geometry.verticalRouteCount,
    waterflowRouteCount: geometry.waterflowRouteCount,
    roomConnectionCount: geometry.roomConnectionCount,
    openingEvidenceCount: geometry.openingEvidenceCount,
    connectorCount: geometry.connectorCount,
    connectorClearanceErrorCount: geometry.connectorClearanceErrorCount,
    vegetationTrunksChecked: geometry.vegetationTrunksChecked,
    vegetationCanopyGroupsChecked: geometry.vegetationCanopyGroupsChecked,
    vegetationGroundContactErrorCount: geometry.vegetationGroundContactErrorCount,
    vegetationDetachedCanopyErrorCount: geometry.vegetationDetachedCanopyErrorCount,
    geometryErrorCount: geometry.geometryErrorCount,
    boundsAreaCells,
    repairCount: repairs.length,
    warningCount: warnings.length,
    errorCount: errors.length,
  };
  const diagnostics: SceneDiagnostics = {
    valid,
    score,
    warnings: unique(warnings),
    repairs: unique(repairs),
    metrics,
  };

  if (repair) {
    output.version = version;
    output.kind = kind;
    output.title = title;
    output.description = description;
    output.seed = seed;
    output.gridFeet = gridFeet;
    output.boundsCells = boundsCells;
    output.floors = floors;
    output.floorHeightFeet = floorHeightFeet;
    output.primitives = primitives;
    output.rooms = rooms;
    output.routes = routes;
    output.tactical = tactical;
    if ((output as unknown as UnknownRecord).buildingInstances !== undefined) output.buildingInstances = buildingInstances;
    output.generationMs = generationMs;
    if (timing) output.timing = timing;
  }
  output.diagnostics = diagnostics;

  return {
    scene: output,
    diagnostics,
    valid,
    score,
    warnings: diagnostics.warnings,
    repairs: diagnostics.repairs,
    errors: unique(errors),
  };
}

/** Convenience helper for generator pipelines that only need the final scene. */
export function validateAndRepairScene(scene: GeneratedScene): GeneratedScene {
  return validateScene(scene).scene;
}
