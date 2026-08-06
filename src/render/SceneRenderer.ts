import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { GRID_METERS } from "../schema";
import type {
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

interface PrimitiveBatch {
  host: THREE.Group;
  shape: ScenePrimitive["shape"];
  material: MaterialKey;
  primitives: ScenePrimitive[];
}

const FEET_TO_METERS = 0.3048;

/** Resolve a world-space Y coordinate to the authored logical floor. */
export function levelForY(scene: GeneratedScene, y: number): number {
  if (scene.floors <= 1) return 0;
  const floorBases = [0];
  for (let level = 1; level < scene.floors; level += 1) {
    const previousHeightFeet = scene.floorHeightFeet[level - 1] ?? scene.floorHeightFeet.at(-1) ?? 10;
    floorBases.push((floorBases[level - 1] ?? 0) + previousHeightFeet * FEET_TO_METERS);
  }

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

export function overlayTouchesFloor(levels: readonly number[], view: FloorView): boolean {
  return typeof view !== "number" || levels.includes(view);
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
    opacity: 0.72,
    transparent: true,
  },
  earth: { color: 0x8a6e50, roughness: 1 },
  rock: { color: 0x7e8981, roughness: 0.96 },
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

/**
 * A deliberately compact Three.js renderer: primitive types are batched into
 * InstancedMesh groups, while the small diagnostic overlays stay independent.
 */
export class SceneRenderer {
  readonly scene = new THREE.Scene();

  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);

  readonly renderer: THREE.WebGLRenderer;

  readonly controls: OrbitControls;

  onStats?: (stats: RenderStats) => void;

  private readonly modelRoot = new THREE.Group();

  private readonly gridRoot = new THREE.Group();

  private readonly routeRoot = new THREE.Group();

  private readonly tacticalRoot = new THREE.Group();

  private readonly materialCache = new Map<MaterialKey, THREE.MeshStandardMaterial>();

  private readonly geometryCache = new Map<ScenePrimitive["shape"], THREE.BufferGeometry>();

  private readonly resizeObserver: ResizeObserver;

  private readonly clock = new THREE.Clock();

  private animationFrame = 0;

  private lastStatsAt = 0;

  private fps = 60;

  private primitiveBatches = 0;

  private floorLayers = new Map<number, FloorLayer>();

  private activeFloorView: FloorView = "cut";

  private routesVisible = false;

  private tacticalVisible = false;

  private currentScene?: GeneratedScene;

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
    this.floorLayers.clear();
    this.modelRoot.clear();
    this.primitiveBatches = 0;

    this.worldBounds = this.measureBounds(scene);
    this.buildGrid(scene);
    this.buildPrimitiveBatches(scene);
    this.buildRoutes(scene);
    this.buildTacticalMarkers(scene);
    this.positionCamera();
    this.setFloorView(this.activeFloorView);
  }

  setFloorView(view: FloorView): void {
    this.activeFloorView = view;
    for (const [level, layer] of this.floorLayers) {
      if (view === "roof") {
        layer.structure.visible = true;
        layer.roof.visible = true;
      } else if (view === "cut") {
        layer.structure.visible = true;
        layer.roof.visible = false;
      } else {
        layer.structure.visible = level === view;
        layer.roof.visible = false;
      }
    }
    this.applyOverlayFloorFilter(this.routeRoot, view);
    this.applyOverlayFloorFilter(this.tacticalRoot, view);
  }

  setRouteVisibility(visible: boolean): void {
    this.routesVisible = visible;
    this.routeRoot.visible = visible;
  }

  setTacticalVisibility(visible: boolean): void {
    this.tacticalVisible = visible;
    this.tacticalRoot.visible = visible;
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
    this.renderer.render(this.scene, this.camera);

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

    const hemisphere = new THREE.HemisphereLight(0xafd3d8, 0x243d30, 2.05);
    hemisphere.name = "Cool sky fill";
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe3ba, 3.35);
    key.name = "Warm key light";
    key.position.set(14, 25, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x5ca8c1, 1.5);
    rim.name = "Cyan rim light";
    rim.position.set(-16, 12, -20);
    this.scene.add(rim);

    const warmFill = new THREE.PointLight(0xffa35c, 27, 58, 1.8);
    warmFill.name = "Interior glow";
    warmFill.position.set(0, 7, 0);
    this.scene.add(warmFill);
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
      minX = Math.min(minX, primitive.position.x - primitive.size.x / 2);
      maxX = Math.max(maxX, primitive.position.x + primitive.size.x / 2);
      minZ = Math.min(minZ, primitive.position.z - primitive.size.z / 2);
      maxZ = Math.max(maxZ, primitive.position.z + primitive.size.z / 2);
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

    const linePositions: number[] = [];
    const y = FLOOR_OVERLAY_Y;
    const pushLine = (x1: number, z1: number, x2: number, z2: number) => {
      linePositions.push(x1, y, z1, x2, y, z2);
    };

    for (let x = minX; x <= maxX + 0.001; x += GRID_METERS) {
      pushLine(x, minZ, x, maxZ);
    }
    for (let z = minZ; z <= maxZ + 0.001; z += GRID_METERS) {
      pushLine(minX, z, maxX, z);
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x94e2ba,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    grid.name = "5 ft / 1.524 m grid";
    grid.renderOrder = 2;
    this.gridRoot.add(grid);
  }

  private buildPrimitiveBatches(scene: GeneratedScene): void {
    const batchMap = new Map<string, PrimitiveBatch>();
    const maxLevel = Math.max(
      scene.floors - 1,
      ...scene.primitives.map((primitive) => primitive.level),
      0,
    );
    for (let level = 0; level <= maxLevel; level += 1) this.createFloorLayer(level);

    for (const primitive of scene.primitives) {
      const isRoof = primitive.material === "roof" || primitive.tags?.includes("roof") === true;
      const layer = this.floorLayers.get(primitive.level) ?? this.createFloorLayer(primitive.level);
      const host = isRoof ? layer.roof : layer.structure;
      const key = `${primitive.level}|${isRoof ? "roof" : "structure"}|${primitive.shape}|${primitive.material}`;
      const existing = batchMap.get(key);
      if (existing) {
        existing.primitives.push(primitive);
      } else {
        batchMap.set(key, {
          host,
          shape: primitive.shape,
          material: primitive.material,
          primitives: [primitive],
        });
      }
    }

    for (const batch of batchMap.values()) {
      const mesh = new THREE.InstancedMesh(
        this.getGeometry(batch.shape),
        this.getMaterial(batch.material),
        batch.primitives.length,
      );
      mesh.name = `${batch.material} ${batch.shape} × ${batch.primitives.length}`;
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
        mesh.setColorAt(index, this.tintedMaterialColor(batch.material, primitive.id));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      batch.host.add(mesh);
      this.primitiveBatches += 1;
    }
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
        0.07,
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
      mesh.renderOrder = 3;
      this.routeRoot.add(mesh);
    }
    this.routeRoot.visible = this.routesVisible;
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
    for (const object of root.children) {
      const levels = Array.isArray(object.userData.levels)
        ? object.userData.levels.filter((level): level is number => typeof level === "number")
        : [];
      object.visible = levels.length === 0 || overlayTouchesFloor(levels, view);
    }
  }

  private positionCamera(): void {
    const { minX, maxX, minZ, maxZ, maxY } = this.worldBounds;
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
      case "stairs":
        geometry = this.createStairsGeometry();
        break;
    }
    this.geometryCache.set(shape, geometry);
    return geometry;
  }

  private createStairsGeometry(): THREE.BufferGeometry {
    const steps = 5;
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    for (let index = steps - 1; index >= 0; index -= 1) {
      const x = -0.5 + (index / steps) * 1;
      const y = -0.5 + ((index + 1) / steps) * 1;
      shape.lineTo(x, y);
      shape.lineTo(x, y - 1 / steps);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      steps: 1,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -0.5);
    // The scene contract stores stair width on X and stair run on Z. The
    // profile above is authored in XY and extruded through Z, so rotate it
    // once: extrusion becomes local X (width) and the rising profile becomes
    // local Z (run). Authored rotationY can then steer the run like corridors.
    geometry.rotateY(-Math.PI / 2);
    return geometry;
  }

  private getMaterial(key: MaterialKey): THREE.MeshStandardMaterial {
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const style = MATERIAL_STYLE[key];
    const material = new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: style.roughness,
      metalness: style.metalness ?? 0,
      emissive: style.emissive ?? style.color,
      emissiveIntensity: style.emissiveIntensity ?? 0.26,
      transparent: style.transparent ?? false,
      opacity: style.opacity ?? 1,
      depthWrite: key !== "water",
      vertexColors: false,
    });
    this.materialCache.set(key, material);
    return material;
  }

  private tintedMaterialColor(material: MaterialKey, id: string): THREE.Color {
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
