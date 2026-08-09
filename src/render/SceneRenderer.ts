import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { GRID_METERS } from "../schema";
import type {
  BuildingInstance,
  GeneratedScene,
  MaterialKey,
  ScenePrimitive,
  TacticalFeature,
} from "../schema";

export type FloorView = "cut" | "roof" | number;

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
  primitiveBatches: number;
}

interface FloorLayer {
  structure: THREE.Group;
  roof: THREE.Group;
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

const SPATIAL_BATCH_THRESHOLD_METERS = GRID_METERS * 60;
const SPATIAL_BATCH_SIZE_METERS = GRID_METERS * 28;

export function spatialBatchKey(position: Pick<THREE.Vector3, "x" | "z">, bounds: Pick<WorldBounds, "minX" | "maxX" | "minZ" | "maxZ">): string {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  if (span < SPATIAL_BATCH_THRESHOLD_METERS) return "whole-scene";
  const chunkX = Math.floor((position.x - bounds.minX) / SPATIAL_BATCH_SIZE_METERS);
  const chunkZ = Math.floor((position.z - bounds.minZ) / SPATIAL_BATCH_SIZE_METERS);
  return `chunk:${chunkX}:${chunkZ}`;
}

interface PrimitiveBatch {
  host: THREE.Group;
  shape: ScenePrimitive["shape"];
  material: MaterialKey;
  ghost: boolean;
  focusCluster?: string;
  primitives: ScenePrimitive[];
}

const FEET_TO_METERS = 0.3048;

/** Resolve a world-space Y coordinate to the authored logical floor. */
export function levelForY(scene: GeneratedScene, y: number): number {
  if (scene.floors <= 1) return 0;
  const floorBases = Array.from({ length: scene.floors }, (_, level) => floorBaseY(scene, level));

  let closestLevel = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [level, baseY] of floorBases.entries()) {
    const distance = Math.abs(y - baseY);
    if (distance < closestDistance) {
      closestLevel = level;
      closestDistance = distance;
    }
  }
  return closestLevel;
}

/** World-space base height for a logical floor, shared by geometry and overlays. */
export function floorBaseY(scene: GeneratedScene, level: number): number {
  let baseY = 0;
  for (let index = 0; index < level; index += 1) {
    baseY += (scene.floorHeightFeet[index] ?? scene.floorHeightFeet.at(-1) ?? 10) * FEET_TO_METERS;
  }
  return baseY;
}

export function overlayTouchesFloor(levels: readonly number[], view: FloorView): boolean {
  return typeof view !== "number" || levels.includes(view);
}

export function routeMatchesTime(schedule: GeneratedScene["routes"][number]["schedule"], time: "day" | "night"): boolean {
  return schedule === undefined || schedule === "all" || schedule === time;
}

function focusClusterTag(primitive: ScenePrimitive): string | undefined {
  return primitive.tags?.find((tag) => tag.startsWith("focus-cluster:"));
}

const MATERIAL_STYLE: Record<
  MaterialKey,
  {
    color: number;
    roughness: number;
    metalness?: number;
    emissive?: number;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
  }
> = {
  stone: { color: 0x8a998e, roughness: 0.9, metalness: 0.02 },
  darkStone: { color: 0x48594f, roughness: 0.94, metalness: 0.01 },
  wood: { color: 0xa9774a, roughness: 0.8, metalness: 0.01 },
  plaster: { color: 0xd7c5a5, roughness: 0.86 },
  roof: { color: 0x73504a, roughness: 0.82, metalness: 0.02 },
  metal: { color: 0x82949b, roughness: 0.38, metalness: 0.68 },
  water: {
    color: 0x2d8ca3,
    roughness: 0.16,
    metalness: 0.26,
    emissive: 0x0b3540,
    emissiveIntensity: 0.38,
    opacity: 0.72,
    transparent: true,
  },
  earth: { color: 0x8a6e50, roughness: 1 },
  rock: { color: 0x7e8981, roughness: 0.96 },
  ice: {
    color: 0x9fc9d6,
    roughness: 0.28,
    metalness: 0.08,
    emissive: 0x173a45,
    emissiveIntensity: 0.18,
    opacity: 0.88,
    transparent: true,
  },
  moss: { color: 0x5e865d, roughness: 1 },
  hazard: {
    color: 0xba5138,
    roughness: 0.5,
    emissive: 0x4b120b,
    emissiveIntensity: 0.35,
  },
  warmLight: {
    color: 0xf0a65b,
    roughness: 0.43,
    emissive: 0xd86d24,
    emissiveIntensity: 1.6,
  },
};

const ROUTE_COLORS: Record<GeneratedScene["routes"][number]["kind"], number> = {
  primary: 0xf0c77a,
  alternate: 0x87b6d2,
  vertical: 0xd291bc,
  waterflow: 0x4bbbd7,
};

const TACTICAL_COLORS: Record<TacticalFeature["kind"], number> = {
  cover: 0x77b7c8,
  highGround: 0xe8c76a,
  hazard: 0xf0644c,
  chokepoint: 0xc685e3,
  entrance: 0x6fd091,
  secret: 0x8d94c9,
};

// Generator floor slabs are 0.18 m tall. Keep editor overlays just above them
// so the tactical grid and diagnostics remain readable instead of z-fighting.
const FLOOR_OVERLAY_Y = 0.225;

/** Keeps atmospheric depth without letting large districts disappear into fog. */
export function fogDensityForSpan(spanMeters: number): number {
  return THREE.MathUtils.clamp(0.42 / Math.max(1, spanMeters), 0.0014, 0.009);
}

/**
 * A deliberately compact Three.js renderer: primitive types are batched into
 * InstancedMesh groups, while the small diagnostic overlays stay independent.
 */
export class SceneRenderer {
  readonly scene = new THREE.Scene();

  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);

  readonly topCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 3000);

  readonly renderer: THREE.WebGLRenderer;

  readonly controls: OrbitControls;

  onStats?: (stats: RenderStats) => void;

  private readonly modelRoot = new THREE.Group();

  private readonly gridRoot = new THREE.Group();

  private readonly routeRoot = new THREE.Group();

  private readonly tacticalRoot = new THREE.Group();

  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();

  private readonly geometryCache = new Map<ScenePrimitive["shape"], THREE.BufferGeometry>();

  private readonly resizeObserver: ResizeObserver;

  private readonly clock = new THREE.Clock();

  private animationFrame = 0;

  private lastStatsAt = 0;

  private fps = 60;

  private primitiveBatches = 0;

  private floorLayers = new Map<number, FloorLayer>();

  private activeFloorView: FloorView = "cut";

  private cameraMode: "perspective" | "top" = "perspective";

  private planningView: "all" | "roads" | "parcels" | "buildings" = "all";

  private routesVisible = false;

  private tacticalVisible = false;

  private timeOfDay: "day" | "night" = "day";

  // Start in a solid exterior mode that agrees with the UI toggle. Interior
  // inspection is explicit: enabling it rebuilds wall batches as ghosted
  // shells, while numeric floor views expose the requested tactical layer.
  private buildingTransparency = false;

  private ambientLight?: THREE.AmbientLight;

  private hemisphereLight?: THREE.HemisphereLight;

  private keyLight?: THREE.DirectionalLight;

  private rimLight?: THREE.DirectionalLight;

  private warmFill?: THREE.PointLight;

  private currentScene?: GeneratedScene;

  private focusedBuildingId?: string;

  private worldBounds: WorldBounds = {
    minX: -8,
    maxX: 8,
    minZ: -8,
    maxZ: 8,
    maxY: 5,
  };

  constructor(private readonly host: HTMLElement) {
    this.scene.background = new THREE.Color(0x10201f);
    this.scene.fog = new THREE.FogExp2(0x10201f, 0.009);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "three-canvas";
    this.host.replaceChildren(this.renderer.domElement);

    this.camera.position.set(13, 15, 15);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 180;
    this.controls.target.set(0, 0, 0);

    this.modelRoot.name = "Generated primitives";
    this.gridRoot.name = "5 foot tactical grid";
    this.routeRoot.name = "Route diagnostics";
    this.tacticalRoot.name = "Tactical diagnostics";
    this.scene.add(this.gridRoot, this.modelRoot, this.routeRoot, this.tacticalRoot);

    this.addAtmosphere();
    this.addLights();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animate();
  }

  setScene(scene: GeneratedScene): void {
    this.currentScene = scene;
    this.focusedBuildingId = undefined;
    this.floorLayers.clear();
    this.modelRoot.clear();
    this.primitiveBatches = 0;

    this.worldBounds = this.measureBounds(scene);
    this.adaptEnvironmentToBounds();
    this.buildGrid(scene);
    this.buildPrimitiveBatches(scene);
    this.buildRoutes(scene);
    this.buildTacticalMarkers(scene);
    this.positionCamera();
    this.setFloorView(this.activeFloorView);
  }

  setBuildingFocus(buildingId?: string): void {
    if (!this.currentScene) return;
    const selected = buildingId ? this.currentScene.buildingInstances?.find((building) => building.id === buildingId) : undefined;
    this.focusedBuildingId = selected?.id;
    this.modelRoot.clear();
    this.floorLayers.clear();
    this.primitiveBatches = 0;
    this.buildGrid(this.currentScene);
    this.buildPrimitiveBatches(this.currentScene);
    if (!selected) {
      this.setFloorView("roof");
      this.positionCamera();
      return;
    }
    this.cameraMode = "perspective";
    this.controls.enabled = true;
    // Enter on the ground floor so the selected building reads as a plan,
    // rather than stacking every storey's walls into one opaque tower. The
    // ordinary floor selector remains available for upper floors and B1.
    this.setFloorView(0);
  }

  private positionCameraForFocusedBuilding(selected: BuildingInstance, view: FloorView): void {
    const numericLevel = typeof view === "number" ? view : 0;
    const isBasement = typeof view === "number" && this.currentScene?.floorLabels?.[view]?.startsWith("B") === true;
    const priorHeight = selected.floorHeightFeet.slice(0, Math.min(numericLevel, selected.floorHeightFeet.length)).reduce((sum, value) => sum + value, 0) * 0.3048;
    const currentHeight = (selected.floorHeightFeet[Math.min(numericLevel, selected.floorHeightFeet.length - 1)] ?? 10) * 0.3048;
    const fallbackFocusY = typeof view === "number"
      ? isBasement
        ? (selected.baseYMeters ?? 0) - 10 * 0.3048 + Math.max(0.8, currentHeight * 0.35)
        : (selected.baseYMeters ?? 0) + priorHeight + Math.max(0.8, currentHeight * 0.35)
      : (selected.baseYMeters ?? 0) + Math.max(1.4, (selected.exteriorHeightMeters ?? currentHeight) * 0.38);
    // BuildingInstance positions and footprints are tactical cells, whereas
    // rendered primitive positions are metres (see shared.cellPoint). Keep the
    // focus camera and its context filter in rendered world coordinates.
    const selectedIdTag = `building-instance:${selected.id}`;
    const viewLevel = typeof view === "number" ? view : 0;
    const visibleBuildingPrimitives = this.currentScene?.primitives.filter((primitive) => (
      primitive.tags?.includes(selectedIdTag) === true
      && primitive.level === viewLevel
      && primitive.tags?.includes("focus-cutaway") !== true
      && primitive.tags?.includes("roof") !== true
    )) ?? [];
    const minX = visibleBuildingPrimitives.length > 0 ? Math.min(...visibleBuildingPrimitives.map((primitive) => primitive.position.x - primitive.size.x / 2)) : selected.positionCells.x * GRID_METERS - selected.footprintCells.x * GRID_METERS / 2;
    const maxX = visibleBuildingPrimitives.length > 0 ? Math.max(...visibleBuildingPrimitives.map((primitive) => primitive.position.x + primitive.size.x / 2)) : selected.positionCells.x * GRID_METERS + selected.footprintCells.x * GRID_METERS / 2;
    const minZ = visibleBuildingPrimitives.length > 0 ? Math.min(...visibleBuildingPrimitives.map((primitive) => primitive.position.z - primitive.size.z / 2)) : selected.positionCells.z * GRID_METERS - selected.footprintCells.z * GRID_METERS / 2;
    const maxZ = visibleBuildingPrimitives.length > 0 ? Math.max(...visibleBuildingPrimitives.map((primitive) => primitive.position.z + primitive.size.z / 2)) : selected.positionCells.z * GRID_METERS + selected.footprintCells.z * GRID_METERS / 2;
    const minY = visibleBuildingPrimitives.length > 0 ? Math.min(...visibleBuildingPrimitives.map((primitive) => primitive.position.y)) : fallbackFocusY - currentHeight * 0.35;
    const maxY = visibleBuildingPrimitives.length > 0 ? Math.max(...visibleBuildingPrimitives.map((primitive) => primitive.position.y + primitive.size.y)) : fallbackFocusY + currentHeight * 0.65;
    const targetY = visibleBuildingPrimitives.length > 0 ? (minY + maxY) / 2 : fallbackFocusY;
    const target = new THREE.Vector3((minX + maxX) / 2, targetY, (minZ + maxZ) / 2);
    const verticalSpan = Math.max(1, maxY - minY);
    const span = Math.max(maxX - minX, maxZ - minZ, verticalSpan * 1.45, 7 * GRID_METERS) * (isBasement ? 0.78 : 1.02);
    // The focus blueprint cuts its local east and south walls. Approach from
    // that same local diagonal after applying the building's authored yaw;
    // a fixed world-space camera could otherwise look straight at the two
    // retained back walls of a rotated building.
    const cosine = Math.cos(selected.rotationY);
    const sine = Math.sin(selected.rotationY);
    const viewX = (cosine + sine) / Math.SQRT2;
    const viewZ = (-sine + cosine) / Math.SQRT2;
    this.cameraMode = "perspective";
    this.controls.enabled = true;
    this.controls.target.copy(target);
    // Focused interiors are tactical inspection views, not district
    // overviews.  The previous 1.58× orbit distance left small settlement
    // rooms occupying only a fraction of the canvas, which made real shelves,
    // tables and door gaps look like decoration.  Keep enough diagonal
    // context for walls and stairs while bringing the selected floor into a
    // readable combat scale.
    this.camera.position.set(
      target.x + viewX * span * 1.18,
      target.y + Math.max(verticalSpan * 0.72, span * 0.42),
      target.z + viewZ * span * 1.18,
    );
    this.camera.near = 0.1;
    this.camera.far = Math.max(300, span * 20);
    this.controls.minDistance = Math.max(1.5, span * 0.28);
    this.controls.maxDistance = Math.max(24, span * 6);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setFloorView(view: FloorView): void {
    this.activeFloorView = view;
    const authoredRoofView = typeof view === "number" && this.currentScene?.floorLabels?.[view]?.includes("屋顶") === true;
    for (const [level, layer] of this.floorLayers) {
      if (view === "roof") {
        layer.structure.visible = true;
        layer.roof.visible = true;
      } else if (view === "cut") {
        layer.structure.visible = true;
        layer.roof.visible = false;
      } else {
        layer.structure.visible = level === view;
        layer.roof.visible = authoredRoofView && level === view;
      }
    }
    this.applyRouteFilters();
    this.applyOverlayFloorFilter(this.gridRoot, view);
    this.applyOverlayFloorFilter(this.tacticalRoot, view);
    this.applyPlanningView();
    const tacticalGround = this.gridRoot.getObjectByName("Tactical ground");
    if (tacticalGround) {
      const selected = typeof view === "number"
        ? this.currentScene?.primitives.filter((primitive) => primitive.level === view) ?? []
        : [];
      const undergroundOnly = (typeof view === "number" && this.currentScene?.floorLabels?.[view]?.startsWith("B") === true)
        || (selected.length > 0
          && selected.every((primitive) => primitive.position.y + primitive.size.y <= 0.05 || primitive.tags?.includes("underground")));
      tacticalGround.visible = !undergroundOnly;
    }
    this.recenterCameraForFloor(view);
  }

  setRouteVisibility(visible: boolean): void {
    this.routesVisible = visible;
    this.routeRoot.visible = visible;
  }

  setTacticalVisibility(visible: boolean): void {
    this.tacticalVisible = visible;
    this.tacticalRoot.visible = visible;
  }

  setBuildingTransparency(enabled: boolean): void {
    if (this.buildingTransparency === enabled) return;
    this.buildingTransparency = enabled;
    if (!this.currentScene) return;
    this.modelRoot.clear();
    this.floorLayers.clear();
    this.primitiveBatches = 0;
    this.buildPrimitiveBatches(this.currentScene);
    this.setFloorView(this.activeFloorView);
  }

  setPlanningView(view: "all" | "roads" | "parcels" | "buildings"): void {
    this.planningView = view;
    this.applyPlanningView();
  }

  setCameraPreset(preset: "overview" | "low" | "top"): void {
    if (preset === "top") {
      this.cameraMode = "top";
      this.controls.enabled = false;
      this.configureTopCamera();
      return;
    }
    this.cameraMode = "perspective";
    this.controls.enabled = true;
    if (preset === "overview") {
      this.recenterCameraForFloor(this.activeFloorView);
      return;
    }
    if (this.focusedBuildingId && this.currentScene) {
      const focused = this.currentScene.buildingInstances?.find((building) => building.id === this.focusedBuildingId);
      if (focused) {
        this.positionCameraForFocusedBuilding(focused, this.activeFloorView);
        const target = this.controls.target.clone();
        const span = Math.max(focused.footprintCells.x, focused.footprintCells.z, 7) * GRID_METERS;
        const cosine = Math.cos(focused.rotationY);
        const sine = Math.sin(focused.rotationY);
        const viewX = (cosine + sine) / Math.SQRT2;
        const viewZ = (-sine + cosine) / Math.SQRT2;
        this.camera.position.set(target.x + viewX * span * 2.15, target.y + Math.max(3.8, span * 0.36), target.z + viewZ * span * 2.15);
        this.camera.lookAt(target);
        this.controls.update();
        return;
      }
    }
    if (typeof this.activeFloorView === "number" && this.currentScene) {
      const visible = this.floorInspectionPrimitives(this.activeFloorView);
      if (visible.length > 0) {
        const bounds = this.boundsForPrimitives(visible, GRID_METERS * 0.75);
        const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 5);
        const minY = Math.min(...visible.map((primitive) => primitive.position.y));
        const maxY = Math.max(...visible.map((primitive) => primitive.position.y + primitive.size.y));
        const target = new THREE.Vector3(
          (bounds.minX + bounds.maxX) / 2,
          (minY + maxY) / 2,
          (bounds.minZ + bounds.maxZ) / 2,
        );
        this.controls.target.copy(target);
        this.camera.position.set(
          target.x + span * 0.94,
          target.y + Math.max(3.2, span * 0.31),
          target.z + span * 0.76,
        );
        this.camera.lookAt(target);
        this.controls.update();
        return;
      }
    }
    let span = Math.max(this.worldBounds.maxX - this.worldBounds.minX, this.worldBounds.maxZ - this.worldBounds.minZ, 5);
    const target = this.controls.target.clone();
    const authoredView = this.currentScene?.viewProgram;
    if (authoredView?.mode === "scene") {
      const focusX = authoredView.focusCells.x * GRID_METERS;
      const focusZ = authoredView.focusCells.z * GRID_METERS;
      span = Math.max(8 * GRID_METERS, authoredView.radiusCells * GRID_METERS * 2);
      const included = this.currentScene?.primitives.filter((primitive) => authoredView.includeTags.some((tag) => primitive.tags?.includes(tag))
        && Math.hypot(primitive.position.x - focusX, primitive.position.z - focusZ) <= span * 0.72) ?? [];
      const focusY = included.length > 0
        ? Math.max(0.12, Math.max(...included.map((primitive) => primitive.position.y + primitive.size.y)) * 0.38)
        : 0.12;
      target.set(focusX, focusY, focusZ);
      this.controls.target.copy(target);
    }
    this.camera.position.set(
      target.x + span * 0.96,
      target.y + Math.max(4.2, span * 0.24),
      target.z + span * 0.78,
    );
    this.camera.lookAt(target);
    this.controls.update();
  }

  setTimeOfDay(time: "day" | "night"): void {
    this.timeOfDay = time;
    this.scene.background = new THREE.Color(time === "night" ? 0x071315 : 0x10201f);
    if (this.scene.fog) this.scene.fog.color.set(time === "night" ? 0x071315 : 0x10201f);
    if (this.ambientLight) this.ambientLight.intensity = time === "night" ? 0.46 : 0.85;
    if (this.hemisphereLight) this.hemisphereLight.intensity = time === "night" ? 0.82 : 2.05;
    if (this.keyLight) this.keyLight.intensity = time === "night" ? 1.25 : 3.35;
    if (this.rimLight) this.rimLight.intensity = time === "night" ? 2.1 : 1.5;
    if (this.warmFill) this.warmFill.intensity = time === "night" ? 52 : 27;
    this.applyRouteFilters();
  }

  getStats(): RenderStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      fps: this.fps,
      primitiveBatches: this.primitiveBatches,
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeContents(this.gridRoot);
    this.disposeContents(this.routeRoot);
    this.disposeContents(this.tacticalRoot);
    for (const geometry of this.geometryCache.values()) geometry.dispose();
    for (const material of this.materialCache.values()) material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.25);
    if (delta > 0) this.fps = THREE.MathUtils.lerp(this.fps, 1 / delta, 0.12);
    this.controls.update();
    this.renderer.render(this.scene, this.cameraMode === "top" ? this.topCamera : this.camera);

    const now = performance.now();
    if (this.onStats && now - this.lastStatsAt > 500) {
      this.lastStatsAt = now;
      this.onStats(this.getStats());
    }
  };

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.cameraMode === "top") this.configureTopCamera();
    this.renderer.setSize(width, height, false);
  }

  private addAtmosphere(): void {
    const count = 180;
    const positions = new Float32Array(count * 3);
    let state = 0x1234abcd;
    for (let index = 0; index < count; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      positions[index * 3] = ((state / 0xffffffff) * 2 - 1) * 120;
      state = (state * 1664525 + 1013904223) >>> 0;
      positions[index * 3 + 1] = (state / 0xffffffff) * 58 + 8;
      state = (state * 1664525 + 1013904223) >>> 0;
      positions[index * 3 + 2] = ((state / 0xffffffff) * 2 - 1) * 120;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9ed1c7,
      size: 0.22,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = "Ambient motes";
    this.scene.add(points);
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0xd2e7d6, 0.85);
    ambient.name = "Readable ambient fill";
    this.scene.add(ambient);
    this.ambientLight = ambient;

    const hemisphere = new THREE.HemisphereLight(0xafd3d8, 0x243d30, 2.05);
    hemisphere.name = "Cool sky fill";
    this.scene.add(hemisphere);
    this.hemisphereLight = hemisphere;

    const key = new THREE.DirectionalLight(0xffe3ba, 3.35);
    key.name = "Warm key light";
    key.position.set(14, 25, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    key.target.name = "Warm key target";
    this.keyLight = key;
    this.scene.add(key.target);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x5ca8c1, 1.5);
    rim.name = "Cyan rim light";
    rim.position.set(-16, 12, -20);
    rim.target.name = "Cyan rim target";
    this.rimLight = rim;
    this.scene.add(rim.target);
    this.scene.add(rim);

    const warmFill = new THREE.PointLight(0xffa35c, 27, 58, 1.8);
    warmFill.name = "Interior glow";
    warmFill.position.set(0, 7, 0);
    this.warmFill = warmFill;
    this.scene.add(warmFill);
  }

  private adaptEnvironmentToBounds(): void {
    const { minX, maxX, minZ, maxZ } = this.worldBounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const span = Math.max(width, depth, 5);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = fogDensityForSpan(span);
    }
    if (this.keyLight) {
      this.keyLight.position.set(centerX + span * 0.42, span * 0.7, centerZ + span * 0.28);
      this.keyLight.target.position.set(centerX, 0, centerZ);
      const shadowExtent = Math.max(24, span * 0.68);
      this.keyLight.shadow.camera.left = -shadowExtent;
      this.keyLight.shadow.camera.right = shadowExtent;
      this.keyLight.shadow.camera.top = shadowExtent;
      this.keyLight.shadow.camera.bottom = -shadowExtent;
      this.keyLight.shadow.camera.far = Math.max(120, span * 3);
      this.keyLight.shadow.camera.updateProjectionMatrix();
    }
    if (this.rimLight) {
      this.rimLight.position.set(centerX - span * 0.38, span * 0.48, centerZ - span * 0.42);
      this.rimLight.target.position.set(centerX, 0, centerZ);
    }
    if (this.warmFill) {
      this.warmFill.position.set(centerX, Math.max(7, span * 0.08), centerZ);
      this.warmFill.distance = Math.max(58, span * 0.72);
    }
  }

  private measureBounds(scene: GeneratedScene): WorldBounds {
    const fallbackWidth = Math.max(1, scene.boundsCells.x) * GRID_METERS;
    const fallbackDepth = Math.max(1, scene.boundsCells.z) * GRID_METERS;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let maxY = 2;

    for (const primitive of scene.primitives) {
      const rotation = primitive.rotationY ?? 0;
      const cosine = Math.abs(Math.cos(rotation));
      const sine = Math.abs(Math.sin(rotation));
      const halfX = (primitive.size.x * cosine + primitive.size.z * sine) / 2;
      const halfZ = (primitive.size.x * sine + primitive.size.z * cosine) / 2;
      minX = Math.min(minX, primitive.position.x - halfX);
      maxX = Math.max(maxX, primitive.position.x + halfX);
      minZ = Math.min(minZ, primitive.position.z - halfZ);
      maxZ = Math.max(maxZ, primitive.position.z + halfZ);
      maxY = Math.max(maxY, primitive.position.y + primitive.size.y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
      minX = -fallbackWidth / 2;
      maxX = fallbackWidth / 2;
      minZ = -fallbackDepth / 2;
      maxZ = fallbackDepth / 2;
    }

    // Snap to whole tactical cells so visible grid lines always represent 5 ft.
    const pad = GRID_METERS;
    return {
      minX: Math.floor((minX - pad) / GRID_METERS) * GRID_METERS,
      maxX: Math.ceil((maxX + pad) / GRID_METERS) * GRID_METERS,
      minZ: Math.floor((minZ - pad) / GRID_METERS) * GRID_METERS,
      maxZ: Math.ceil((maxZ + pad) / GRID_METERS) * GRID_METERS,
      maxY: maxY + 2,
    };
  }

  private buildGrid(scene: GeneratedScene): void {
    this.disposeContents(this.gridRoot);
    const { minX, maxX, minZ, maxZ } = this.worldBounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!this.focusedBuildingId) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({
          color: 0x1b3b31,
          roughness: 1,
          metalness: 0,
        }),
      );
      ground.name = "Tactical ground";
      ground.rotation.x = -Math.PI / 2;
      ground.position.set((minX + maxX) / 2, -0.035, (minZ + maxZ) / 2);
      ground.receiveShadow = true;
      this.gridRoot.add(ground);
    }

    const surfaceTags = new Set(["floor", "platform", "ledge", "terrain", "bridge", "boardwalk", "ice-island", "road", "plaza", "quay", "clearing"]);
    const surfaceLinesByKey = new Map<string, { level: number; focusCluster?: string; positions: number[] }>();
    const belongsToFocus = (primitive: ScenePrimitive): boolean => !this.focusedBuildingId
      || primitive.tags?.includes(`building-instance:${this.focusedBuildingId}`) === true;
    const addSurfaceGrid = (surface: ScenePrimitive): void => {
      if (!belongsToFocus(surface)) return;
      if (surface.shape !== "box" || !surface.tags?.some((tag) => surfaceTags.has(tag))) return;
      if (surface.id === "site-terrain-base") return;
      if (scene.siteProgram && surface.tags?.includes("terrain") && !surface.tags.some((tag) => ["road", "bridge", "platform", "ledge"].includes(tag))) return;
      const cosine = Math.cos(surface.rotationY ?? 0);
      const sine = Math.sin(surface.rotationY ?? 0);
      const toWorld = (localX: number, localZ: number): [number, number, number] => [
        surface.position.x + localX * cosine + localZ * sine,
        surface.position.y + surface.size.y + 0.035,
        surface.position.z - localX * sine + localZ * cosine,
      ];
      const cluster = focusClusterTag(surface);
      const key = `${surface.level}|${cluster ?? "none"}`;
      const entry = surfaceLinesByKey.get(key) ?? { level: surface.level, focusCluster: cluster, positions: [] };
      surfaceLinesByKey.set(key, entry);
      const linePositions = entry.positions;
      const push = (a: [number, number, number], b: [number, number, number]) => linePositions.push(...a, ...b);
      const minLocalX = -surface.size.x / 2;
      const maxLocalX = surface.size.x / 2;
      const minLocalZ = -surface.size.z / 2;
      const maxLocalZ = surface.size.z / 2;
      for (let x = minLocalX; x <= maxLocalX + 0.001; x += GRID_METERS) push(toWorld(x, minLocalZ), toWorld(x, maxLocalZ));
      for (let z = minLocalZ; z <= maxLocalZ + 0.001; z += GRID_METERS) push(toWorld(minLocalX, z), toWorld(maxLocalX, z));
    };
    for (const surface of scene.primitives) addSurfaceGrid(surface);
    for (const entry of surfaceLinesByKey.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
      const material = new THREE.LineBasicMaterial({ color: 0x9bb8bd, transparent: true, opacity: 0.78, depthTest: true, depthWrite: false, toneMapped: false });
      const grid = new THREE.LineSegments(geometry, material);
      grid.name = `surface grid batch · level ${entry.level + 1}`;
      grid.userData.levels = [entry.level];
      grid.userData.focusCluster = entry.focusCluster;
      grid.renderOrder = 2;
      this.gridRoot.add(grid);
    }

    // Stair treads are walkable faces too. Draw a small grid on every tread,
    // transformed with the authored stair rotation, instead of leaving stairs
    // as ungridded solid ramps.
    const stairLinesByKey = new Map<string, { level: number; focusCluster?: string; positions: number[] }>();
    for (const stair of scene.primitives.filter((primitive) => primitive.shape === "stairs" && belongsToFocus(primitive))) {
      const steps = Math.max(2, Math.round(stair.size.y / 0.18));
      const treadDepth = stair.size.z / steps;
      const cosine = Math.cos(stair.rotationY ?? 0);
      const sine = Math.sin(stair.rotationY ?? 0);
      const toWorld = (localX: number, localZ: number, y: number): [number, number, number] => [
        stair.position.x + localX * cosine + localZ * sine,
        y,
        stair.position.z - localX * sine + localZ * cosine,
      ];
      const cluster = focusClusterTag(stair);
      const key = `${stair.level}|${cluster ?? "none"}`;
      const entry = stairLinesByKey.get(key) ?? { level: stair.level, focusCluster: cluster, positions: [] };
      stairLinesByKey.set(key, entry);
      const linePositions = entry.positions;
      const push = (a: [number, number, number], b: [number, number, number]) => linePositions.push(...a, ...b);
      for (let step = 0; step < steps; step += 1) {
        const z0 = -stair.size.z / 2 + step * treadDepth;
        const z1 = z0 + treadDepth;
        const y = stair.position.y + stair.size.y * ((step + 1) / steps) + 0.035;
        for (let x = -stair.size.x / 2; x <= stair.size.x / 2 + 0.001; x += GRID_METERS) push(toWorld(x, z0, y), toWorld(x, z1, y));
        push(toWorld(-stair.size.x / 2, z0, y), toWorld(stair.size.x / 2, z0, y));
      }
    }
    for (const entry of stairLinesByKey.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
      const material = new THREE.LineBasicMaterial({ color: 0xb9d7c8, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false, toneMapped: false });
      const grid = new THREE.LineSegments(geometry, material);
      grid.name = `stair grid batch · level ${entry.level + 1}`;
      grid.userData.levels = [entry.level];
      grid.userData.focusCluster = entry.focusCluster;
      grid.renderOrder = 2;
      this.gridRoot.add(grid);
    }

  }

  private buildPrimitiveBatches(scene: GeneratedScene): void {
    const batchMap = new Map<string, PrimitiveBatch>();
    const architecturalScene = scene.sceneProgram?.domain === "building"
      || scene.sceneProgram?.domain === "interior"
      || scene.kind === "building"
      || scene.kind === "tower"
      || scene.kind === "tavern"
      || scene.kind === "dungeon";
    const maxLevel = Math.max(
      scene.floors - 1,
      ...scene.primitives.map((primitive) => primitive.level),
      0,
    );
    const focusedBuilding = this.focusedBuildingId ? scene.buildingInstances?.find((building) => building.id === this.focusedBuildingId) : undefined;
    const focusCenter = focusedBuilding ? new THREE.Vector2(focusedBuilding.positionCells.x * GRID_METERS, focusedBuilding.positionCells.z * GRID_METERS) : undefined;
    const focusRadius = focusedBuilding ? Math.max(focusedBuilding.footprintCells.x, focusedBuilding.footprintCells.z, 7) * GRID_METERS * 2.4 : Number.POSITIVE_INFINITY;
    const focusedParcelTag = focusedBuilding?.parcelId ? `parcel:${focusedBuilding.parcelId}` : undefined;
    for (let level = 0; level <= maxLevel; level += 1) this.createFloorLayer(level);

    for (const primitive of scene.primitives) {
      const instanceTag = primitive.tags?.find((tag) => tag.startsWith("building-instance:"));
      const primitiveBuildingId = instanceTag?.slice("building-instance:".length);
      const focusInterior = primitive.tags?.includes("focus-interior") === true;
      if (!this.focusedBuildingId && focusInterior) continue;
      if (this.focusedBuildingId) {
        if (primitiveBuildingId && primitiveBuildingId !== this.focusedBuildingId) continue;
        if (primitiveBuildingId === this.focusedBuildingId && primitive.tags?.includes("focus-cutaway")) continue;
        if (primitiveBuildingId === this.focusedBuildingId
          && !focusInterior
          && primitive.tags?.includes("full-interior") !== true
          && primitive.tags?.some((tag) => tag === "envelope-part" || tag === "roof") === true) continue;
        if (!primitiveBuildingId && primitive.tags?.includes("roof-route") === true) continue;
        // The parent site's giant terrain slab used to remain visible during
        // building focus and read as a ceiling slicing through the room.
        if (!primitiveBuildingId && primitive.id === "site-terrain-base") continue;
        if (!primitiveBuildingId) {
          const ownedParcelContext = focusedParcelTag !== undefined
            && primitive.tags?.includes(focusedParcelTag) === true
            && primitive.tags?.some((tag) => [
              "parcel-access",
              "entrance-route",
              "stilt-foundation",
              "stilt-stair",
              "terrain-bound-water-access",
              "grounded-support",
              "root-boardwalk",
            ].includes(tag)) === true;
          if (!ownedParcelContext) continue;
          if (focusCenter && Math.hypot(primitive.position.x - focusCenter.x, primitive.position.z - focusCenter.y) > focusRadius) continue;
        }
      }
      // A reachable roof deck is authored as ordinary stone/wood so it can
      // carry a tactical grid.  It is still part of the roof inspection
      // layer: keeping it in the numeric top floor used to hide the actual
      // top-storey room beneath one large opaque plate.
      const isRoof = primitive.material === "roof"
        || primitive.tags?.includes("roof") === true
        || (primitive.tags?.includes("roof-platform") === true && primitive.tags?.includes("wall-walk") !== true);
      const isBuilding = primitive.tags?.some((tag) => tag === "wall" || tag === "settlement-building" || tag === "building-shell" || tag === "curtain-wall" || tag === "keep") === true;
      // In architectural scenes the slab itself is part of the inspection
      // problem: opaque upper floors hide rooms and create the same stacked
      // plate look that made the earlier screenshots unreadable. Ghost the
      // floor surface together with walls, but leave tactical furniture solid.
      const isArchitecturalFloor = (scene.kind === "building" || scene.kind === "dungeon" || scene.kind === "tower")
        && primitive.tags?.includes("floor-slab") === true;
      const ghost = architecturalScene && this.buildingTransparency && (isBuilding || isArchitecturalFloor);
      const layer = this.floorLayers.get(primitive.level) ?? this.createFloorLayer(primitive.level);
      const host = isRoof ? layer.roof : layer.structure;
      const chunk = spatialBatchKey(primitive.position, this.worldBounds);
      const focusCluster = focusClusterTag(primitive);
      const planningClass = primitive.tags?.includes("settlement-building") ? "buildings"
        : primitive.material === "water" || primitive.tags?.some((tag) => ["road", "rail-track", "dock", "bridge", "quay", "watercourse"].includes(tag)) ? "roads"
          : primitive.tags?.some((tag) => ["block-surface", "parcel-yard", "open-space"].includes(tag)) ? "parcels"
            : "context";
      const key = `${primitive.level}|${isRoof ? "roof" : "structure"}|${primitive.shape}|${primitive.material}|${ghost ? "ghost" : "solid"}|${chunk}|${planningClass}|${focusCluster ?? "none"}`;
      const existing = batchMap.get(key);
      if (existing) {
        existing.primitives.push(primitive);
      } else {
        batchMap.set(key, {
          host,
          shape: primitive.shape,
          material: primitive.material,
          ghost,
          focusCluster,
          primitives: [primitive],
        });
      }
    }

    for (const batch of batchMap.values()) {
      const mesh = new THREE.InstancedMesh(
        this.getGeometry(batch.shape),
        this.getMaterial(batch.material, batch.ghost),
        batch.primitives.length,
      );
      mesh.name = `${batch.material} ${batch.shape} × ${batch.primitives.length}`;
      const sampleTags = batch.primitives[0]?.tags ?? [];
      mesh.userData.planningClass = sampleTags.includes("settlement-building") ? "buildings"
        : batch.material === "water" || sampleTags.some((tag) => ["road", "rail-track", "dock", "bridge", "quay", "watercourse"].includes(tag)) ? "roads"
          : sampleTags.some((tag) => ["block-surface", "parcel-yard", "open-space"].includes(tag)) ? "parcels"
          : "context";
      mesh.userData.focusCluster = batch.focusCluster;
      mesh.castShadow = batch.material !== "water" && batch.material !== "warmLight";
      mesh.receiveShadow = batch.material !== "warmLight";
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      for (const [index, primitive] of batch.primitives.entries()) {
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), primitive.rotationY ?? 0);
        position.set(
          primitive.position.x,
          primitive.position.y + Math.max(primitive.size.y, 0.025) / 2,
          primitive.position.z,
        );
        scale.set(
          Math.max(primitive.size.x, 0.025),
          Math.max(primitive.size.y, 0.025),
          Math.max(primitive.size.z, 0.025),
        );
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, this.tintedMaterialColor(batch.material, primitive.id, primitive.tags));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      batch.host.add(mesh);
      this.primitiveBatches += 1;
    }
    this.applyPlanningView();
  }

  private applyPlanningView(): void {
    const activeCluster = typeof this.activeFloorView === "number"
      ? this.activeFloorFocusClusterTag(this.activeFloorView)
      : undefined;
    this.modelRoot.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      const category = object.userData.planningClass;
      const clusterVisible = activeCluster === undefined || object.userData.focusCluster === activeCluster;
      object.visible = clusterVisible && (this.planningView === "all"
        || category === this.planningView
        || (this.planningView === "parcels" && (category === "roads" || category === "parcels")));
    });
    // Planning isolation is meant to expose the authored road/block/building
    // relationship. Keeping every tactical surface grid visible turns a clean
    // road graph into a white wireframe cloud, especially around stairs and
    // multi-level cliff settlements. Restore the tactical grids immediately
    // when returning to the complete scene.
    this.gridRoot.visible = this.planningView === "all";
  }

  private createFloorLayer(level: number): FloorLayer {
    const existing = this.floorLayers.get(level);
    if (existing) return existing;
    const structure = new THREE.Group();
    structure.name = `Level ${level + 1} structure`;
    const roof = new THREE.Group();
    roof.name = `Level ${level + 1} roof`;
    this.modelRoot.add(structure, roof);
    const layer = { structure, roof };
    this.floorLayers.set(level, layer);
    return layer;
  }

  private buildRoutes(scene: GeneratedScene): void {
    this.disposeContents(this.routeRoot);
    for (const route of scene.routes) {
      if (route.points.length < 2) continue;
      const points = route.points.map(
        (point) => new THREE.Vector3(point.x, point.y + FLOOR_OVERLAY_Y + 0.06, point.z),
      );
      // Keep diagnostics on the exact validated polyline. A smoothing spline
      // can bow through walls even when every authored portal is correct.
      const curve = new THREE.CurvePath<THREE.Vector3>();
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (from && to) curve.add(new THREE.LineCurve3(from, to));
      }
      const geometry = new THREE.TubeGeometry(
        curve,
        Math.min(96, Math.max(12, points.length * 12)),
        0.055 + (route.traffic ?? 0.35) * 0.055,
        6,
        false,
      );
      const material = new THREE.MeshBasicMaterial({
        color: ROUTE_COLORS[route.kind],
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Route: ${route.kind}`;
      mesh.userData.levels = [...new Set(route.points.map((point) => levelForY(scene, point.y)))];
      mesh.userData.schedule = route.schedule ?? "all";
      mesh.renderOrder = 3;
      this.routeRoot.add(mesh);
    }
    this.applyRouteFilters();
  }

  private buildTacticalMarkers(scene: GeneratedScene): void {
    this.disposeContents(this.tacticalRoot);
    for (const feature of scene.tactical) {
      const featureGroup = new THREE.Group();
      featureGroup.name = `Tactical feature: ${feature.kind}`;
      featureGroup.userData.levels = [levelForY(scene, feature.position.y)];
      const radius = Math.max(GRID_METERS * 0.23, feature.radiusCells * GRID_METERS * 0.72);
      const color = TACTICAL_COLORS[feature.kind];
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.69, radius, 28),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
        }),
      );
      ring.name = `Tactical: ${feature.kind}`;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(feature.position.x, feature.position.y + FLOOR_OVERLAY_Y + 0.08, feature.position.z);
      ring.renderOrder = 4;
      featureGroup.add(ring);

      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, 0.36, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
      );
      core.position.set(feature.position.x, feature.position.y + FLOOR_OVERLAY_Y + 0.18, feature.position.z);
      core.renderOrder = 4;
      featureGroup.add(core);
      this.tacticalRoot.add(featureGroup);
    }
    this.tacticalRoot.visible = this.tacticalVisible;
  }

  private applyOverlayFloorFilter(root: THREE.Group, view: FloorView): void {
    const activeCluster = root === this.gridRoot && typeof view === "number"
      ? this.activeFloorFocusClusterTag(view)
      : undefined;
    for (const object of root.children) {
      const levels = Array.isArray(object.userData.levels)
        ? object.userData.levels.filter((level): level is number => typeof level === "number")
        : [];
      // A full cutaway may expose several storeys, but drawing every storey's
      // grid at once turns the building into a stack of moire planes. Keep the
      // 1F tactical grid as the spatial reference in cut mode; numeric views
      // still show the exact grid for every standable upper or basement face.
      const clusterVisible = activeCluster === undefined || object.userData.focusCluster === activeCluster;
      object.visible = clusterVisible && (root === this.gridRoot && view === "cut"
        ? levels.length === 0 || levels.includes(0)
        : levels.length === 0 || overlayTouchesFloor(levels, view));
    }
  }

  private applyRouteFilters(): void {
    for (const object of this.routeRoot.children) {
      const levels = Array.isArray(object.userData.levels)
        ? object.userData.levels.filter((level): level is number => typeof level === "number")
        : [];
      const schedule = object.userData.schedule;
      object.visible = (levels.length === 0 || overlayTouchesFloor(levels, this.activeFloorView))
        && routeMatchesTime(schedule, this.timeOfDay);
    }
    this.routeRoot.visible = this.routesVisible;
  }

  /**
   * Numeric basement views may contain several unrelated cellars spread across
   * a settlement. Feature generators can mark one coherent inspection group
   * with `focus-cluster:*`; camera fitting then frames that group instead of
   * shrinking every basement into a few pixels. The geometry remains present
   * and the convention is reusable by caves, crypts, vaults, and machinery
   * levels without teaching the renderer their domain names.
   */
  private floorFocusCluster(primitives: ScenePrimitive[]): ScenePrimitive[] {
    const groups = new Map<string, ScenePrimitive[]>();
    for (const primitive of primitives) {
      for (const tag of primitive.tags ?? []) {
        if (!tag.startsWith("focus-cluster:")) continue;
        const group = groups.get(tag) ?? [];
        group.push(primitive);
        groups.set(tag, group);
      }
    }
    if (groups.size === 0) return primitives;
    return [...groups.values()].sort((left, right) => right.length - left.length)[0] ?? primitives;
  }

  private activeFloorFocusClusterTag(level: number): string | undefined {
    if (!this.currentScene) return undefined;
    const counts = new Map<string, number>();
    for (const primitive of this.currentScene.primitives) {
      if (primitive.level !== level) continue;
      const tag = focusClusterTag(primitive);
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  }

  private floorInspectionPrimitives(level: number): ScenePrimitive[] {
    if (!this.currentScene) return [];
    const authoredRoofView = this.currentScene.floorLabels?.[level]?.includes("屋顶") === true;
    return this.floorFocusCluster(this.currentScene.primitives.filter((primitive) => primitive.level === level
      && (authoredRoofView || (primitive.material !== "roof"
        && !primitive.tags?.includes("roof")
        && !(primitive.tags?.includes("roof-platform") && !primitive.tags?.includes("wall-walk"))))));
  }

  private recenterCameraForFloor(view: FloorView): void {
    if (!this.currentScene) return;
    if (this.focusedBuildingId) {
      const focused = this.currentScene.buildingInstances?.find((building) => building.id === this.focusedBuildingId);
      if (focused) {
        this.positionCameraForFocusedBuilding(focused, view);
        return;
      }
    }
    if (this.cameraMode === "top") {
      this.configureTopCamera();
      return;
    }
    if (view === "cut" || view === "roof") {
      this.positionCamera();
      return;
    }
    let visible: ScenePrimitive[] = [];
    if (typeof view === "number") {
      visible = this.floorInspectionPrimitives(view);
    }
    if (visible.length === 0) return;
    const minX = Math.min(...visible.map((primitive) => primitive.position.x - primitive.size.x / 2));
    const maxX = Math.max(...visible.map((primitive) => primitive.position.x + primitive.size.x / 2));
    const minZ = Math.min(...visible.map((primitive) => primitive.position.z - primitive.size.z / 2));
    const maxZ = Math.max(...visible.map((primitive) => primitive.position.z + primitive.size.z / 2));
    const minY = Math.min(...visible.map((primitive) => primitive.position.y));
    const maxY = Math.max(...visible.map((primitive) => primitive.position.y + primitive.size.y));
    const target = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const span = Math.max(maxX - minX, maxZ - minZ, 5);
    this.camera.position.set(
      target.x + span * 0.76,
      target.y + Math.max(span * 0.92, (maxY - minY) * 1.6),
      target.z + span * 0.82,
    );
    this.controls.target.copy(target);
    this.controls.update();
  }

  private positionCamera(): void {
    let { minX, maxX, minZ, maxZ, maxY } = this.worldBounds;
    const authoredView = this.currentScene?.viewProgram;
    if (authoredView?.mode === "site" || authoredView?.mode === "building") {
      const focusX = authoredView.focusCells.x * GRID_METERS;
      const focusZ = authoredView.focusCells.z * GRID_METERS;
      const radius = Math.max(8, authoredView.radiusCells) * GRID_METERS;
      minX = focusX - radius;
      maxX = focusX + radius;
      minZ = focusZ - radius;
      maxZ = focusZ + radius;
      const included = this.currentScene?.primitives.filter((primitive) => authoredView.includeTags.some((tag) => primitive.tags?.includes(tag))
        && Math.hypot(primitive.position.x - focusX, primitive.position.z - focusZ) <= radius * 1.25) ?? [];
      if (included.length > 0) maxY = Math.max(...included.map((primitive) => primitive.position.y + primitive.size.y));
    }
    const singleBuilding = this.currentScene?.buildingInstances?.length === 1
      ? this.currentScene.buildingInstances[0]
      : undefined;
    const sitePrimitives = !authoredView && singleBuilding && this.currentScene?.primitives.some((primitive) => primitive.tags?.includes("site-program"))
      ? this.currentScene.primitives.filter((primitive) => primitive.tags?.includes("site-program")
        || primitive.tags?.includes(`building-instance:${singleBuilding.id}`)
        || primitive.tags?.includes("building-pad"))
      : [];
    if (sitePrimitives.length > 0 && singleBuilding) {
      minX = Math.min(...sitePrimitives.map((primitive) => primitive.position.x - primitive.size.x / 2));
      maxX = Math.max(...sitePrimitives.map((primitive) => primitive.position.x + primitive.size.x / 2));
      minZ = Math.min(...sitePrimitives.map((primitive) => primitive.position.z - primitive.size.z / 2));
      maxZ = Math.max(...sitePrimitives.map((primitive) => primitive.position.z + primitive.size.z / 2));
      maxY = Math.max(...sitePrimitives.map((primitive) => primitive.position.y + primitive.size.y));
      const buildingX = singleBuilding.positionCells.x * GRID_METERS;
      const buildingZ = singleBuilding.positionCells.z * GRID_METERS;
      const contextRadius = Math.max(singleBuilding.footprintCells.x, singleBuilding.footprintCells.z, 12) * GRID_METERS * 1.9;
      minX = Math.max(minX, buildingX - contextRadius);
      maxX = Math.min(maxX, buildingX + contextRadius);
      minZ = Math.max(minZ, buildingZ - contextRadius);
      maxZ = Math.min(maxZ, buildingZ + contextRadius);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const span = Math.max(width, depth, 5);
    // Tactical play is evaluated from the walkable surface first; aiming near
    // the floor keeps rooms centred while retaining headroom for tall pieces.
    const target = new THREE.Vector3((minX + maxX) / 2, 0.12, (minZ + maxZ) / 2);
    this.camera.near = 0.1;
    this.camera.far = Math.max(300, span * 12);
    this.camera.position.set(
      target.x + span * 0.76,
      target.y + Math.max(span * 0.92, maxY * 1.6),
      target.z + span * 0.82,
    );
    this.controls.minDistance = Math.max(2.5, span * 0.18);
    this.controls.maxDistance = Math.max(38, span * 5.2);
    this.controls.target.copy(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private configureTopCamera(): void {
    const { minX, maxX, minZ, maxZ, maxY } = this.topCameraBounds();
    const width = Math.max(5, maxX - minX);
    const depth = Math.max(5, maxZ - minZ);
    const bounds = this.host.getBoundingClientRect();
    const aspect = Math.max(0.25, bounds.width / Math.max(1, bounds.height));
    const paddedWidth = width * 1.08;
    const paddedDepth = depth * 1.08;
    const halfHeight = Math.max(paddedDepth / 2, paddedWidth / (2 * aspect));
    const halfWidth = halfHeight * aspect;
    this.topCamera.left = -halfWidth;
    this.topCamera.right = halfWidth;
    this.topCamera.top = halfHeight;
    this.topCamera.bottom = -halfHeight;
    this.topCamera.near = 0.1;
    this.topCamera.far = Math.max(300, maxY + 220);
    this.topCamera.position.set((minX + maxX) / 2, Math.max(120, maxY + 80), (minZ + maxZ) / 2);
    this.topCamera.up.set(0, 0, -1);
    this.topCamera.lookAt((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.topCamera.updateProjectionMatrix();
  }

  /**
   * A district overview should include the complete site, but an authored
   * upper, basement or roof layer often occupies only one landmark building.
   * Fitting those views to the whole settlement made valid rooms look like a
   * handful of pixels in the corner and defeated visual inspection.
   */
  private topCameraBounds(): WorldBounds {
    if (!this.currentScene) return this.worldBounds;
    const focusedIdTag = this.focusedBuildingId ? `building-instance:${this.focusedBuildingId}` : undefined;
    const focusedVisible = focusedIdTag
      ? this.currentScene.primitives.filter((primitive) => primitive.tags?.includes(focusedIdTag) === true
        && (typeof this.activeFloorView !== "number" || primitive.level === this.activeFloorView)
        && primitive.tags?.includes("focus-cutaway") !== true
        && (this.activeFloorView === "roof" || (primitive.material !== "roof" && !primitive.tags?.includes("roof"))))
      : [];
    if (focusedVisible.length > 0) return this.boundsForPrimitives(focusedVisible, GRID_METERS * 1.25);

    if (typeof this.activeFloorView !== "number") {
      const authoredView = this.currentScene.viewProgram;
      if (authoredView?.mode === "site" || authoredView?.mode === "building") {
        const focusX = authoredView.focusCells.x * GRID_METERS;
        const focusZ = authoredView.focusCells.z * GRID_METERS;
        const radius = Math.max(8, authoredView.radiusCells) * GRID_METERS;
        const included = this.currentScene.primitives.filter((primitive) => authoredView.includeTags.some((tag) => primitive.tags?.includes(tag))
          && Math.hypot(primitive.position.x - focusX, primitive.position.z - focusZ) <= radius * 1.25);
        const maxY = included.length > 0
          ? Math.max(...included.map((primitive) => primitive.position.y + primitive.size.y))
          : this.worldBounds.maxY;
        return {
          minX: focusX - radius,
          maxX: focusX + radius,
          minZ: focusZ - radius,
          maxZ: focusZ + radius,
          maxY,
        };
      }
      return this.worldBounds;
    }
    const visible = this.floorInspectionPrimitives(this.activeFloorView);
    if (visible.length === 0) return this.worldBounds;

    return this.boundsForPrimitives(visible, GRID_METERS * 1.5);
  }

  private boundsForPrimitives(primitives: ScenePrimitive[], pad: number): WorldBounds {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let maxY = 2;
    for (const primitive of primitives) {
      const rotation = primitive.rotationY ?? 0;
      const cosine = Math.abs(Math.cos(rotation));
      const sine = Math.abs(Math.sin(rotation));
      const halfX = (primitive.size.x * cosine + primitive.size.z * sine) / 2;
      const halfZ = (primitive.size.x * sine + primitive.size.z * cosine) / 2;
      minX = Math.min(minX, primitive.position.x - halfX);
      maxX = Math.max(maxX, primitive.position.x + halfX);
      minZ = Math.min(minZ, primitive.position.z - halfZ);
      maxZ = Math.max(maxZ, primitive.position.z + halfZ);
      maxY = Math.max(maxY, primitive.position.y + primitive.size.y);
    }
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      maxY: maxY + 2,
    };
  }

  private getGeometry(shape: ScenePrimitive["shape"]): THREE.BufferGeometry {
    const cached = this.geometryCache.get(shape);
    if (cached) return cached;
    let geometry: THREE.BufferGeometry;
    switch (shape) {
      case "box":
      case "water":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, 4);
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, 14, 10);
        break;
      case "gable":
        geometry = this.createGableGeometry();
        break;
      case "ramp":
        geometry = this.createRampGeometry();
        break;
      case "stairs":
        geometry = this.createStairsGeometry();
        break;
    }
    this.geometryCache.set(shape, geometry);
    return geometry;
  }

  private createGableGeometry(): THREE.BufferGeometry {
    // Unit triangular prism: the ridge runs along local Z. Scaling supplies
    // authored width, rise and length; rotationY turns the ridge for wide bays.
    const vertices = new Float32Array([
      -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0, 0.5, -0.5,
      -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0, 0.5,  0.5,
    ]);
    const indices = [
      0, 2, 1, 3, 4, 5,
      0, 1, 4, 0, 4, 3,
      0, 3, 5, 0, 5, 2,
      1, 2, 5, 1, 5, 4,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createRampGeometry(): THREE.BufferGeometry {
    // Unit triangular wedge: local +Z is the high edge, local -Z is the
    // low edge. Authored rotationY points the wedge into the higher terrain.
    const vertices = new Float32Array([
      -0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,
      -0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,
      -0.5,  0.5,  0.5,
       0.5,  0.5,  0.5,
    ]);
    const indices = [
      0, 1, 3, 0, 3, 2,
      0, 4, 5, 0, 5, 1,
      0, 2, 4,
      1, 5, 3,
      2, 3, 5, 2, 5, 4,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createStairsGeometry(): THREE.BufferGeometry {
    // Author open treads instead of one solid saw-tooth extrusion. The old
    // solid profile exposed a rise-high side face; in cutaways and basement
    // views that face read as a giant wall and hid the room the stair served.
    // These twelve closed tread boxes keep the same unit contract (X width,
    // Y rise, Z run) while preserving sight lines beneath and beside a stair.
    const steps = 12;
    const treadThickness = 0.045;
    const vertices: number[] = [];
    const indices: number[] = [];
    const addFace = (a: number[], b: number[], c: number[], d: number[]) => {
      const offset = vertices.length / 3;
      vertices.push(...a, ...b, ...c, ...d);
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    };
    const addTread = (centerY: number, centerZ: number) => {
      const x0 = -0.5; const x1 = 0.5;
      const y0 = centerY - treadThickness / 2; const y1 = centerY + treadThickness / 2;
      const z0 = centerZ - 0.5 / steps; const z1 = centerZ + 0.5 / steps;
      addFace([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      addFace([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      addFace([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      addFace([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
      addFace([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
      addFace([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    };
    for (let index = 0; index < steps; index += 1) {
      addTread(-0.5 + (index + 1) / steps, -0.5 + (index + 0.5) / steps);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private getMaterial(key: MaterialKey, ghost = false): THREE.MeshStandardMaterial {
    const cacheKey = `${key}:${ghost ? "ghost" : "solid"}`;
    const cached = this.materialCache.get(cacheKey);
    if (cached) return cached;
    const style = MATERIAL_STYLE[key];
    const material = new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: style.roughness,
      metalness: style.metalness ?? 0,
      emissive: style.emissive ?? style.color,
      emissiveIntensity: style.emissiveIntensity ?? 0.26,
      transparent: ghost || style.transparent === true,
      opacity: ghost ? 0.48 : style.opacity ?? 1,
      depthWrite: ghost ? false : key !== "water",
      vertexColors: false,
    });
    this.materialCache.set(cacheKey, material);
    return material;
  }

  private tintedMaterialColor(material: MaterialKey, id: string, tags: readonly string[] = []): THREE.Color {
    // Tactical terrain must read as continuous regions. Per-instance hash tint
    // is useful for props, but makes a cell-based heightfield look like noisy
    // mosaic tiles. Keep authored floors, shelves, banks and semantic grids
    // on one stable material tone; retain subtle variation for loose props.
    // Semantic terrain layers need stable, region-level contrast. These are
    // deliberate material roles rather than per-cell noise, so an ice field
    // can expose snow, blue ice, thaw water and a dark crevasse at a glance.
    if (tags.includes("snow-ridge-leeward")) return new THREE.Color("#8fa8ad");
    if (tags.includes("snow-ridge") || tags.includes("snow-ridge-segment")) return new THREE.Color("#d9e4df");
    if (tags.includes("broken-floe-edge")) return new THREE.Color("#75aeb7");
    if (tags.includes("ice-base-plate")) return new THREE.Color("#9bc4c6");
    if (tags.includes("secondary-crevasse")) return new THREE.Color("#315c69");
    if (tags.includes("thin-ice") || tags.includes("thaw-pool")) return new THREE.Color("#427f89");
    if (tags.includes("snow-patch")) return new THREE.Color("#d9e5df");
    if (tags.includes("cold-forest-floor")) return new THREE.Color(material === "earth" ? "#5f6255" : "#315348");
    if (tags.includes("deadwood") || tags.includes("snag")) return new THREE.Color("#4d443b");
    if (tags.includes("conifer-crown")) return new THREE.Color("#284f38");
    if (tags.includes("broadleaf-crown")) return new THREE.Color("#47734a");
    if (tags.includes("ancient-crown-lobe")) return new THREE.Color("#356440");
    if (tags.includes("understory-tree") || tags.includes("young-tree")) return new THREE.Color("#5b7d49");
    if (tags.includes("tree") && material === "wood") return new THREE.Color("#5a4534");
    if (tags.includes("home-fixture") && material === "wood") return new THREE.Color("#704a2d");
    if (tags.includes("island-underbelly-mass")) return new THREE.Color(material === "darkStone" ? "#344740" : "#52665c");
    if (tags.includes("island-underside")) return new THREE.Color(material === "darkStone" ? "#4a5f56" : "#697b71");
    if (tags.includes("suspension-cable")) return new THREE.Color("#c0d7d1");
    if (tags.includes("bridge-guardrail")) return new THREE.Color("#92aaa4");
    if (tags.includes("floating-island") && tags.includes("floor")) return new THREE.Color(material === "darkStone" ? "#879b91" : "#aab5aa");
    if (tags.includes("block-surface")) return new THREE.Color(MATERIAL_STYLE[material].color).offsetHSL(0, -0.08, 0.045);
    if (tags.includes("parcel-yard")) return new THREE.Color(MATERIAL_STYLE[material].color).offsetHSL(0.02, -0.12, 0.08);
    if (tags.includes("terrain") || tags.includes("floor") || tags.includes("semantic-grid") || tags.includes("macro-region")) {
      return new THREE.Color(MATERIAL_STYLE[material].color);
    }
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const variance = (((hash >>> 0) % 17) - 8) / 100;
    return new THREE.Color(MATERIAL_STYLE[material].color).offsetHSL(variance * 0.18, variance * 0.18, variance);
  }

  private disposeContents(root: THREE.Group): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material?.dispose();
    });
    root.clear();
  }
}
