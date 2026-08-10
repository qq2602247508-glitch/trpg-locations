import type { SeededRandom } from "../core/random";
import type { GeneratedScene, MaterialKey } from "../schema";
import type { SiteProgram, TerrainProgramSummary } from "../site-program";
import { FLOOR_SLAB_METERS, box, corridor, createRoute, cylinder, feetToMeters, primitive, stairs, tacticalFeature, water } from "./shared";

export type TerrainSurface = "ground" | "rock" | "water" | "lava" | "void" | "platform";

export interface TerrainCrossingCandidate {
  id: string;
  hazard: Extract<TerrainSurface, "water" | "lava" | "void">;
  from: { x: number; z: number; elevationFeet: number };
  to: { x: number; z: number; elevationFeet: number };
  midpoint: { x: number; z: number; elevationFeet: number };
  deckElevationFeet: number;
  spanCells: number;
}

interface TerrainCell {
  elevationFeet: number;
  surface: TerrainSurface;
  buildable: boolean;
  standable: boolean;
  hazard: boolean;
}

export interface SettlementTerrain {
  summary: TerrainProgramSummary;
  elevationAt(x: number, z: number): number;
  elevationFeetAt(x: number, z: number): number;
  buildableAt(x: number, z: number, clearance?: number): boolean;
  surfaceAt(x: number, z: number): TerrainSurface;
  crossingCandidates: readonly TerrainCrossingCandidate[];
  nearestSurfacePoint(x: number, z: number, surfaces: readonly TerrainSurface[], radius?: number): { x: number; z: number; elevationFeet: number; surface: TerrainSurface } | undefined;
  placementFor(index: number, total: number, requested: { x: number; z: number }, clearance?: number): { x: number; z: number; elevationFeet?: number } | undefined;
  render(scene: GeneratedScene): void;
}

const includesAny = (text: string, terms: readonly string[]): boolean => terms.some((term) => text.includes(term));

function terrainKind(program: SiteProgram, prompt: string): TerrainProgramSummary["kind"] {
  const text = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  // A named parent landform owns the site before secondary transport words.
  // Otherwise a crater prompt containing “吊桥” was incorrectly promoted to
  // the bridge-pier slum grammar and the crater disappeared entirely.
  if (program.requiredFeatures.includes("impact-crater-settlement")) return "impact-crater";
  if (program.requiredFeatures.includes("volcanic-settlement") || includesAny(text, ["火山口村", "火山聚落", "volcanic settlement", "caldera village"])) return "caldera";
  if (program.requiredFeatures.includes("ice-crevasse-settlement") || includesAny(text, ["冰川裂隙", "冰川裂缝", "巨大裂隙", "冰隙聚落", "glacier crevasse", "crevasse settlement"])) return "ice-crevasse";
  if (program.requiredFeatures.includes("underdark-settlement") || includesAny(text, ["幽暗地域", "underdark", "地下聚落"])) return "underdark";
  if (program.requiredFeatures.includes("hollow-tree-city") || includesAny(text, ["空心古树", "古树内部", "树内城市", "hollow tree"])) return "megastructure";
  if (program.requiredFeatures.includes("mangrove-smuggler-port") || includesAny(text, ["红树林", "走私港", "港村", "mangrove", "smuggler port"])) return "swamp-bone";
  if (program.requiredFeatures.includes("salt-crystal-monastery") || includesAny(text, ["盐晶", "浮空修道院", "修道院群", "salt crystal", "floating monastery"])) {
    const explicitlyFloating = includesAny(text, ["浮空", "浮岛", "悬空", "floating", "levitating"]);
    const cavernParent = includesAny(text, ["潮汐洞穴", "洞穴群", "洞窟群", "洞穴网络", "海蚀洞", "tidal cavern", "cave network", "cavern network", "sea cave"]);
    return explicitlyFloating || !cavernParent ? "megastructure" : "underdark";
  }
  if (program.requiredFeatures.includes("tower-city") || includesAny(text, ["巨型塔楼结构", "巨塔城市", "tower city", "megastructure city"])) return "megastructure";
  if (program.requiredFeatures.includes("vertical-slum") || includesAny(text, ["桥墩之间", "垂直贫民", "bridge-pier settlement"])) return "bridge-megastructure";
  // Explicit canal hydrology owns the parent terrain even when the old harbor
  // also sits on a sea cliff. The cliff remains a bank/elevation constraint;
  // it must not erase the requested main channel, branches, and crossings.
  if (program.requiredFeatures.includes("water-city")) return "river";
  if (program.requiredFeatures.includes("coastal-cliff") || includesAny(text, ["海崖港镇", "分层海崖", "海岸悬崖", "黑沙海岸", "鲸骨灯塔村", "灯塔村", "sea-cliff port", "cliff port", "coastal cliff", "black sand coast", "lighthouse village"])) return "coastal-cliff";
  if (program.requiredFeatures.includes("bone-swamp-settlement") || includesAny(text, ["石化龙骨", "肋骨栈道", "dragonbone swamp", "fossil ribs"])) return "swamp-bone";
  if (program.requiredFeatures.includes("airship-wreck-settlement") || includesAny(text, ["坠毁飞艇", "飞艇残骸", "crashed airship", "airship wreck"])) return "wreck-field";
  return program.terrain.kind;
}

function materialFor(cell: TerrainCell, kind: TerrainProgramSummary["kind"]): MaterialKey {
  if (cell.surface === "lava") return "hazard";
  if (kind === "ice-crevasse") return cell.elevationFeet <= -10 ? "darkStone" : "ice";
  if (kind === "coastal-cliff") return cell.elevationFeet <= 0 ? "darkStone" : cell.elevationFeet >= 20 ? "rock" : "stone";
  if (cell.surface === "rock" || kind === "underdark" || kind === "caldera" || kind === "impact-crater" || kind === "megastructure") return cell.elevationFeet >= 20 ? "darkStone" : "rock";
  return kind === "river" ? "earth" : "earth";
}

function warpedRiverX(z: number, width: number, depth: number, phase: number): number {
  return width * (0.48 + Math.sin(z / Math.max(8, depth * 0.17) + phase) * 0.1 + Math.sin(z / Math.max(5, depth * 0.08) + phase * 0.7) * 0.035);
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax; const dz = bz - az; const length2 = dx * dx + dz * dz;
  const t = length2 <= 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function reserveLinearTerrain(
  scene: GeneratedScene,
  id: string,
  kind: "void" | "water" | "lava" | "unstable",
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  widthCells: number,
  clearanceCells: number,
  reason: string,
): void {
  (scene.terrainReservations ??= []).push({
    id,
    kind,
    centerCells: { x: (fromX + toX) / 2, z: (fromZ + toZ) / 2 },
    sizeCells: { x: widthCells, z: Math.max(1, Math.hypot(toX - fromX, toZ - fromZ)) },
    rotationY: Math.atan2(toX - fromX, toZ - fromZ),
    clearanceCells,
    reason,
  });
}

export function compileSettlementTerrain(program: SiteProgram, prompt: string, rng: SeededRandom, density = 0.5): SettlementTerrain {
  const width = Math.max(12, Math.round(program.bounds.x));
  const depth = Math.max(12, Math.round(program.bounds.z));
  const kind = terrainKind(program, prompt);
  const phase = rng.float(-Math.PI, Math.PI);
  const craterCx = width * rng.float(0.46, 0.54);
  const craterCz = depth * rng.float(0.43, 0.55);
  const craterRadius = Math.min(width, depth) * rng.float(0.27, 0.34);
  const breachAngle = rng.float(-Math.PI, Math.PI);
  const breachAngles = [breachAngle, breachAngle + Math.PI * 0.72, breachAngle - Math.PI * 0.69];
  const normalizedPrompt = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const saltMarsh = includesAny(normalizedPrompt, ["盐沼", "盐泽", "潮汐湿地", "salt marsh", "tidal marsh"]);
  const coastalCanal = kind === "river" && program.requiredFeatures.includes("coastal-cliff");
  const cliffBankSide = phase >= 0 ? -1 : 1;
  const wantsCraterBridge = includesAny(normalizedPrompt, ["跨坑", "吊桥", "悬索桥", "suspension bridge", "rope bridge"]);
  const wantsCraterShrine = includesAny(normalizedPrompt, ["神龛", "神殿", "祭坛", "shrine", "altar", "temple"]);
  const wantsCraterMine = includesAny(normalizedPrompt, ["矿工入口", "矿井", "矿洞", "mine entrance", "mine"]);
  const wantsRadialFractures = includesAny(normalizedPrompt, ["放射状裂缝", "放射裂缝", "辐射裂缝", "radial fracture", "radial fractures", "fracture field"]);
  const wantsOrePiles = includesAny(normalizedPrompt, ["矿石堆", "矿物堆", "矿石", "ore pile", "ore piles", "mineral pile"]);
  const wantsCraterCollapse = includesAny(normalizedPrompt, ["坍塌", "塌陷", "崩塌", "collapse", "collapsed"]);
  const fractureCount = wantsRadialFractures ? 5 + Math.round(density * 3) : 0;
  const fractureAngles = Array.from({ length: fractureCount }, (_, fracture) => breachAngle + (Math.PI * 2 * fracture) / Math.max(1, fractureCount) + rng.fork(`fracture-${fracture}`).float(-0.16, 0.16));
  const radialFractureAt = (angle: number, radial: number): boolean => wantsRadialFractures
    && radial > 0.24
    && radial < 1.38
    && fractureAngles.some((candidate) => Math.abs(Math.atan2(Math.sin(angle - candidate), Math.cos(angle - candidate))) < 0.018 + density * 0.018);
  const collapseAngle = breachAngle + Math.PI * 1.31;
  const crevasseCenterX = width * 0.5;
  const crevasseHalfGap = 3.8 + (program.seed.length % 5) * 0.45;
  const crevasseAt = (z: number) => crevasseCenterX + Math.sin(z * 0.17 + phase) * (2.1 + (program.seed.length % 4) * 0.4);
  const ravineX = width * rng.float(0.46, 0.57);
  const megaCx = width / 2;
  const megaCz = depth / 2;
  const megaRadius = Math.min(width, depth) * 0.42;
  const isHollowTree = program.requiredFeatures.includes("hollow-tree-city");
  const isMangrovePort = program.requiredFeatures.includes("mangrove-smuggler-port");
  const isSaltCrystal = program.requiredFeatures.includes("salt-crystal-monastery");
  const cells: TerrainCell[] = [];
  const indexOf = (x: number, z: number): number => Math.max(0, Math.min(depth - 1, Math.floor(z))) * width + Math.max(0, Math.min(width - 1, Math.floor(x)));

  for (let z = 0; z < depth; z += 1) for (let x = 0; x < width; x += 1) {
    let elevationFeet = 0;
    let surface: TerrainSurface = "ground";
    let buildable = true;
    let standable = true;
    let hazard = false;

    if (kind === "river") {
      const center = warpedRiverX(z, width, depth, phase);
      const halfWidth = 2.2 + Math.sin(z * 0.23 + phase) * 0.45;
      const branchSpecs = [
        { z: depth * 0.28, edgeX: 0 },
        { z: depth * 0.53, edgeX: width },
        { z: depth * 0.78, edgeX: 0 },
      ];
      const branchDistance = Math.min(...branchSpecs.map((branch) => distanceToSegment(x + 0.5, z + 0.5, warpedRiverX(branch.z, width, depth, phase), branch.z, branch.edgeX, branch.z + Math.sin(branch.z + phase) * 2)));
      const mainDistance = Math.abs(x + 0.5 - center);
      const distance = Math.min(mainDistance, branchDistance);
      const activeHalfWidth = branchDistance < mainDistance ? 1.45 : halfWidth;
      const downhill = Math.max(0, 15 - Math.floor((z / Math.max(1, depth - 1)) * 3) * 5);
      const bankSide = Math.sign((x + 0.5) - center) || 1;
      const isCliffBank = coastalCanal
        && bankSide === cliffBankSide
        && distance > activeHalfWidth + 0.9
        && distance < activeHalfWidth + 6.8;
      elevationFeet = downhill + (distance > activeHalfWidth + 3.2 ? 5 : 0) + (isCliffBank ? 15 : 0);
      if (distance <= activeHalfWidth) {
        elevationFeet = downhill - 10;
        surface = "water";
        buildable = false;
        standable = false;
        hazard = true;
      } else if (distance <= activeHalfWidth + 1.4) {
        elevationFeet = downhill - 5;
        surface = "rock";
        buildable = false;
      } else if (distance <= activeHalfWidth + 3.2) {
        elevationFeet = downhill;
        surface = "rock";
      } else if (isCliffBank && distance < activeHalfWidth + 2.1) {
        surface = "rock";
      }
    } else if (kind === "impact-crater" || kind === "caldera") {
      const dx = x + 0.5 - craterCx;
      const dz = z + 0.5 - craterCz;
      const angle = Math.atan2(dz, dx);
      const warp = 1 + Math.sin(angle * 3 + phase) * 0.1 + Math.sin(angle * 7 - phase) * 0.045;
      const radial = Math.hypot(dx, dz) / (craterRadius * warp);
      const breach = breachAngles.some((candidate) => Math.abs(Math.atan2(Math.sin(angle - candidate), Math.cos(angle - candidate))) < 0.13);
      if (radial < 0.28) elevationFeet = kind === "caldera" ? -5 : 0;
      else if (radial < 0.52) elevationFeet = 5;
      else if (radial < 0.72) elevationFeet = 10;
      else if (radial < 0.94) elevationFeet = breach ? 10 : 20;
      else if (radial < 1.14) elevationFeet = breach ? 10 : 25;
      else elevationFeet = 10 + (Math.sin(x * 0.31 + z * 0.17 + phase) > 0.64 ? 5 : 0);
      surface = "rock";
      if (kind === "caldera" && radial < 0.3) {
        surface = "lava";
        buildable = false;
        standable = false;
        hazard = true;
      }
      const outletAngle = breachAngles[0] ?? breachAngle;
      const outletDelta = Math.abs(Math.atan2(Math.sin(angle - outletAngle), Math.cos(angle - outletAngle)));
      if (kind === "caldera" && outletDelta < 0.12 && radial < 1.45) {
        elevationFeet = radial < 0.3 ? -5 : radial < 0.75 ? 0 : 5;
        surface = "lava";
        buildable = false;
        standable = false;
        hazard = true;
      }
      const collapseDelta = Math.abs(Math.atan2(Math.sin(angle - collapseAngle), Math.cos(angle - collapseAngle)));
      if (kind === "impact-crater" && wantsCraterCollapse && radial > 0.72 && radial < 1.2 && collapseDelta < 0.12) {
        surface = "void";
        buildable = false;
        standable = false;
        hazard = true;
      }
      if (kind === "impact-crater" && radialFractureAt(angle, radial) && surface !== "void") {
        elevationFeet -= radial < 0.58 ? 10 : radial < 0.92 ? 15 : 10;
        buildable = false;
        hazard = true;
      }
      if (radial > 0.7 && radial < 1.12 && !breach) buildable = Math.abs(radial - 0.83) < 0.07 || Math.abs(radial - 1.04) < 0.055;
    } else if (kind === "ice-crevasse") {
      const gapCenter = crevasseAt(z + 0.5);
      const distance = Math.abs(x + 0.5 - gapCenter);
      const edge = Math.min(x, z, width - 1 - x, depth - 1 - z);
      if (edge === 0) {
        surface = "void"; buildable = false; standable = false;
      } else if (distance <= 1.4) {
        elevationFeet = -15;
        surface = "rock";
        buildable = false;
        hazard = true;
      } else if (distance <= crevasseHalfGap) {
        surface = "void";
        buildable = false;
        standable = false;
        hazard = true;
      } else {
        elevationFeet = x + 0.5 < gapCenter ? 20 : 30;
        surface = "rock";
        buildable = distance > crevasseHalfGap + 4;
      }
    } else if (kind === "underdark") {
      const nx = (x + 0.5 - width / 2) / (width * 0.48);
      const nz = (z + 0.5 - depth / 2) / (depth * 0.47);
      const caveEdge = nx * nx + nz * nz + Math.sin(x * 0.22 + phase) * 0.06 + Math.sin(z * 0.31) * 0.04;
      const ravineDistance = Math.abs(x + 0.5 - (ravineX + Math.sin(z * 0.21 + phase) * 2.2));
      const lakeShape = ((x + 0.5 - width * 0.22) / Math.max(3, width * 0.14)) ** 2 + ((z + 0.5 - depth * 0.72) / Math.max(3, depth * 0.12)) ** 2;
      if (caveEdge > 1) {
        surface = "void"; buildable = false; standable = false;
      } else if (lakeShape < 1) {
        elevationFeet = -5; surface = "water"; buildable = false; standable = false; hazard = true;
      } else if (ravineDistance < 1.6) {
        elevationFeet = -15; surface = "void"; buildable = false; standable = false; hazard = true;
      } else {
        const shelf = Math.sin(x * 0.18 + phase) + Math.cos(z * 0.22 - phase * 0.5);
        elevationFeet = shelf > 0.8 ? 15 : shelf > -0.15 ? 10 : shelf > -0.9 ? 5 : 0;
        surface = "rock";
        buildable = ravineDistance > 3.2;
      }
    } else if (kind === "swamp-bone") {
      const channel = Math.abs(x + 0.5 - (width * 0.38 + Math.sin(z * 0.19 + phase) * width * 0.12));
      const poolNoise = Math.sin(x * 0.31 + phase) + Math.cos(z * 0.27 - phase);
      if (channel < 2.2 || poolNoise > 1.45) {
        elevationFeet = -5; surface = "water"; buildable = false; standable = false; hazard = true;
      } else {
        elevationFeet = poolNoise < -1.1 ? 0 : 5; surface = "ground"; buildable = channel > 3.5;
      }
    } else if (kind === "wreck-field") {
      const rolling = Math.sin(x * 0.17 + phase) + Math.cos(z * 0.21 - phase * 0.4);
      elevationFeet = rolling > 0.85 ? 10 : rolling > -0.35 ? 5 : 0;
      surface = "rock";
      buildable = true;
    } else if (kind === "coastal-cliff") {
      const band = z / Math.max(1, depth - 1);
      if (band > 0.84) {
        elevationFeet = -10; surface = "water"; buildable = false; standable = false; hazard = true;
      } else {
        elevationFeet = band < 0.28 ? 30 : band < 0.5 ? 20 : band < 0.7 ? 10 : 0;
        surface = "rock";
        buildable = band < 0.78;
      }
    } else if (kind === "bridge-megastructure") {
      const ravineDistance = Math.abs(x + 0.5 - width * 0.5);
      if (ravineDistance < width * 0.22) {
        elevationFeet = -20;
        surface = "void";
        buildable = false;
        standable = false;
        hazard = true;
      } else {
        elevationFeet = ravineDistance > width * 0.4 ? 15 : 10;
        surface = "rock";
        buildable = false;
        standable = true;
      }
    } else if (kind === "megastructure") {
      const radial = Math.hypot(x + 0.5 - megaCx, z + 0.5 - megaCz);
      if (isSaltCrystal) {
        const islands = [
          { x: width * 0.22, z: depth * 0.68, rx: width * 0.16, rz: depth * 0.18, y: 0 },
          { x: width * 0.52, z: depth * 0.3, rx: width * 0.15, rz: depth * 0.16, y: 25 },
          { x: width * 0.82, z: depth * 0.64, rx: width * 0.14, rz: depth * 0.15, y: 50 },
        ];
        const island = islands.find((candidate) => ((x + 0.5 - candidate.x) / candidate.rx) ** 2 + ((z + 0.5 - candidate.z) / candidate.rz) ** 2 < 1);
        if (!island) {
          surface = "void"; buildable = false; standable = false; hazard = true;
        } else {
          const edgeNoise = Math.sin((x + z) * 0.55 + phase) * 0.08;
          elevationFeet = island.y + (edgeNoise > 0.02 ? 5 : 0);
          surface = "platform";
          buildable = true;
        }
      } else if (radial > megaRadius) {
        surface = "void"; buildable = false; standable = false;
      } else {
        elevationFeet = isHollowTree
          ? radial < megaRadius * 0.26 ? 55 : radial < megaRadius * 0.52 ? 35 : radial < megaRadius * 0.78 ? 15 : 0
          : radial < megaRadius * 0.3 ? 60 : radial < megaRadius * 0.56 ? 40 : radial < megaRadius * 0.78 ? 20 : 0;
        surface = "platform";
        buildable = isHollowTree ? radial > megaRadius * 0.12 : radial > megaRadius * 0.18;
      }
    } else {
      const rolling = Math.sin(x * 0.12 + phase) + Math.cos(z * 0.15 - phase * 0.4);
      elevationFeet = kind === "rolling" || kind === "valley" ? (rolling > 0.8 ? 10 : rolling > -0.3 ? 5 : 0) : 0;
      surface = kind === "coast" ? "rock" : "ground";
    }
    cells.push({ elevationFeet, surface, buildable, standable, hazard });
  }

  const cellAt = (x: number, z: number): TerrainCell => cells[indexOf(x, z)] ?? { elevationFeet: 0, surface: "ground", buildable: true, standable: true, hazard: false };
  const clearanceBuildable = (x: number, z: number, clearance = 0): boolean => {
    const radius = Math.max(0, Math.ceil(clearance));
    for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const px = x + dx; const pz = z + dz;
      if (px < 0 || pz < 0 || px >= width || pz >= depth || !cellAt(px, pz).buildable) return false;
      if (Math.abs(cellAt(px, pz).elevationFeet - cellAt(x, z).elevationFeet) > 5) return false;
    }
    return true;
  };
  const elevations = cells.map((cell) => cell.elevationFeet);
  const elevationBandsFeet = [...new Set(elevations)].sort((a, b) => a - b);
  const summary: TerrainProgramSummary = {
    version: 1,
    kind,
    widthCells: width,
    depthCells: depth,
    elevationBandsFeet,
    minimumElevationFeet: Math.min(...elevations),
    maximumElevationFeet: Math.max(...elevations),
    buildableRatio: cells.filter((cell) => cell.buildable).length / cells.length,
    waterRatio: cells.filter((cell) => cell.surface === "water").length / cells.length,
    hazardRatio: cells.filter((cell) => cell.hazard).length / cells.length,
    bridgeCandidates: kind === "river" ? 3 : kind === "underdark" ? 2 : 0,
    supportSurfaces: kind === "megastructure" ? 3 : 1,
  };
  const crossingCandidates: TerrainCrossingCandidate[] = [];
  const addCrossing = (
    id: string,
    hazard: TerrainCrossingCandidate["hazard"],
    from: { x: number; z: number },
    to: { x: number; z: number },
    deckClearanceFeet = 5,
  ): void => {
    const midpoint = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
    const fromElevation = cellAt(from.x, from.z).elevationFeet;
    const toElevation = cellAt(to.x, to.z).elevationFeet;
    const midpointElevation = cellAt(midpoint.x, midpoint.z).elevationFeet;
    crossingCandidates.push({
      id,
      hazard,
      from: { ...from, elevationFeet: fromElevation },
      to: { ...to, elevationFeet: toElevation },
      midpoint: { ...midpoint, elevationFeet: midpointElevation },
      deckElevationFeet: Math.max(fromElevation, toElevation) + deckClearanceFeet,
      spanCells: Math.hypot(to.x - from.x, to.z - from.z),
    });
  };
  if (kind === "caldera") {
    const outlet = breachAngles[0] ?? breachAngle;
    const crossingRadius = craterRadius * 0.49;
    addCrossing(
      "caldera-lava-outlet",
      "lava",
      { x: craterCx + Math.cos(outlet + 0.3) * crossingRadius, z: craterCz + Math.sin(outlet + 0.3) * crossingRadius },
      { x: craterCx + Math.cos(outlet - 0.3) * crossingRadius, z: craterCz + Math.sin(outlet - 0.3) * crossingRadius },
      7,
    );
  } else if (kind === "river") {
    for (const [index, row] of [depth * 0.28, depth * 0.56, depth * 0.81].entries()) {
      const center = warpedRiverX(row, width, depth, phase);
      addCrossing(`river-channel-${index + 1}`, "water", { x: center - 5.2, z: row }, { x: center + 5.2, z: row }, 3);
    }
  } else if (kind === "ice-crevasse") {
    for (const [index, row] of [depth * 0.28, depth * 0.57, depth * 0.82].entries()) {
      const center = crevasseAt(row);
      addCrossing(`ice-crevasse-${index + 1}`, "void", { x: center - crevasseHalfGap - 2, z: row }, { x: center + crevasseHalfGap + 2, z: row }, 4);
    }
  } else if (kind === "underdark") {
    for (const [index, row] of [depth * 0.3, depth * 0.72].entries()) {
      addCrossing(`underdark-ravine-${index + 1}`, "void", { x: ravineX - 4, z: row }, { x: ravineX + 4, z: row }, 4);
    }
  }

  return {
    summary,
    elevationAt: (x, z) => feetToMeters(cellAt(x, z).elevationFeet),
    elevationFeetAt: (x, z) => cellAt(x, z).elevationFeet,
    buildableAt: clearanceBuildable,
    surfaceAt: (x, z) => cellAt(x, z).surface,
    crossingCandidates,
    nearestSurfacePoint(x, z, surfaces, radius = 16) {
      const allowed = new Set(surfaces);
      let nearest: { x: number; z: number; elevationFeet: number; surface: TerrainSurface; distance: number } | undefined;
      const searchRadius = Math.max(1, Math.ceil(radius));
      for (let dz = -searchRadius; dz <= searchRadius; dz += 1) for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
        const px = x + dx;
        const pz = z + dz;
        if (px < 0 || pz < 0 || px >= width || pz >= depth) continue;
        const cell = cellAt(px, pz);
        if (!allowed.has(cell.surface)) continue;
        const distance = Math.hypot(dx, dz);
        if (nearest !== undefined && nearest.distance <= distance) continue;
        nearest = { x: Math.floor(px) + 0.5, z: Math.floor(pz) + 0.5, elevationFeet: cell.elevationFeet, surface: cell.surface, distance };
      }
      if (nearest === undefined) return undefined;
      const { distance: _distance, ...point } = nearest;
      return point;
    },
    placementFor(index, total, requested, clearance = 0) {
      if (kind === "megastructure") {
        if (isSaltCrystal) {
          const islands = [
            { x: width * 0.22, z: depth * 0.68, y: 0 },
            { x: width * 0.52, z: depth * 0.3, y: 25 },
            { x: width * 0.82, z: depth * 0.64, y: 50 },
          ];
          const island = islands[index % islands.length]!;
          const angle = phase + Math.floor(index / islands.length) * 1.91;
          const radius = 2.4 + (index % 3) * 1.1;
          return { x: island.x + Math.cos(angle) * radius, z: island.z + Math.sin(angle) * radius, elevationFeet: island.y };
        }
        const ring = index % 3;
        const radii = [megaRadius * 0.69, megaRadius * 0.47, megaRadius * 0.25];
        const countOnRing = Math.max(1, Math.ceil((total - ring) / 3));
        const sequence = Math.floor(index / 3);
        const angle = phase + ring * 0.41 + (Math.PI * 2 * sequence / countOnRing);
        return { x: megaCx + Math.cos(angle) * (radii[ring] ?? megaRadius * 0.5), z: megaCz + Math.sin(angle) * (radii[ring] ?? megaRadius * 0.5) };
      }
      if (kind === "bridge-megastructure") {
        const platform = index % 3;
        const slot = Math.floor(index / 3);
        const slotOffsets = [-0.13, -0.04, 0.05, 0.14];
        const x = width * (0.5 + (slotOffsets[slot % slotOffsets.length] ?? 0));
        const z = depth * (0.3 + platform * 0.19) + (Math.floor(slot / slotOffsets.length) % 2 === 0 ? -1.4 : 1.4);
        return { x, z, elevationFeet: [12, 24, 36][platform] ?? 12 };
      }
      if (kind === "coastal-cliff") {
        const shelf = index % 3;
        const zBands = [depth * 0.2, depth * 0.43, depth * 0.66];
        const x = width * (0.12 + ((index * 0.237 + Math.abs(phase) * 0.03) % 0.76));
        const z = (zBands[shelf] ?? depth * 0.45) + (Math.floor(index / 3) % 2 === 0 ? -1.2 : 1.2);
        return { x, z, elevationFeet: cellAt(x, z).elevationFeet };
      }
      if (kind === "swamp-bone") {
        const z = depth * (0.12 + ((index * 0.173 + Math.abs(phase) * 0.04) % 0.76));
        const spineX = width * 0.62 + Math.sin(z * 0.11 + phase) * 2;
        const x = spineX + (index % 2 === 0 ? -5.2 : 5.2);
        return { x, z, elevationFeet: cellAt(x, z).elevationFeet };
      }
      if (kind === "wreck-field") {
        const x = width * (0.14 + ((index * 0.229 + Math.abs(phase) * 0.05) % 0.72));
        const z = depth * (0.24 + ((index * 0.137) % 0.54));
        return { x, z, elevationFeet: cellAt(x, z).elevationFeet };
      }
      if (kind === "ice-crevasse") {
        const z = 3 + ((index * 9.17 + Math.abs(phase) * 3) % Math.max(4, depth - 6));
        const side = index % 2 === 0 ? -1 : 1;
        const gapCenter = crevasseAt(z);
        const candidate = { x: gapCenter + side * (crevasseHalfGap + 5.5), z };
        if (clearanceBuildable(candidate.x, candidate.z, Math.min(1.5, clearance))) return candidate;
      }
      if (kind === "impact-crater" || kind === "caldera") {
        const band = index % (kind === "caldera" ? 3 : 4);
        const radii = kind === "caldera"
          ? [craterRadius * 0.55, craterRadius * 0.83, craterRadius * 1.05]
          : [craterRadius * 0.42, craterRadius * 0.64, craterRadius * 0.83, craterRadius * 1.05];
        const angle = phase + index * 2.399963229728653;
        const candidate = { x: craterCx + Math.cos(angle) * (radii[band] ?? craterRadius), z: craterCz + Math.sin(angle) * (radii[band] ?? craterRadius) };
        if (clearanceBuildable(candidate.x, candidate.z, Math.min(1, clearance))) return candidate;
      }
      if (kind === "river") {
        const z = 3 + ((index * 7.31 + Math.abs(phase) * 2) % Math.max(4, depth - 6));
        const side = index % 2 === 0 ? -1 : 1;
        const x = warpedRiverX(z, width, depth, phase) + side * (5.2 + (index % 3) * 1.6);
        const candidate = { x, z };
        if (clearanceBuildable(candidate.x, candidate.z, Math.min(1, clearance))) return candidate;
      }
      if (kind === "underdark") {
        const side = index % 2 === 0 ? -1 : 1;
        const z = depth * (0.17 + ((index * 0.173 + Math.abs(phase) * 0.03) % 0.66));
        const x = ravineX + side * (5 + (index % 4) * 2.2);
        const candidate = { x, z };
        if (clearanceBuildable(candidate.x, candidate.z, Math.min(1, clearance))) return candidate;
      }
      if (clearanceBuildable(requested.x, requested.z, clearance)) return requested;
      for (let radius = 1; radius <= 12; radius += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const candidate = { x: requested.x + dx, z: requested.z + dz };
          if (clearanceBuildable(candidate.x, candidate.z, clearance)) return candidate;
        }
      }
      return undefined;
    },
    render(scene) {
      const bottomFeet = Math.min(-20, summary.minimumElevationFeet - 5);
      for (let z = 0; z < depth; z += 1) for (let x = 0; x < width; x += 1) {
        const cell = cellAt(x, z);
        if (cell.surface === "void") continue;
        const height = feetToMeters(cell.elevationFeet - bottomFeet);
        const craterDx = x + 0.5 - craterCx;
        const craterDz = z + 0.5 - craterCz;
        const craterAngle = Math.atan2(craterDz, craterDx);
        const craterWarp = 1 + Math.sin(craterAngle * 3 + phase) * 0.1 + Math.sin(craterAngle * 7 - phase) * 0.045;
        const craterRadial = Math.hypot(craterDx, craterDz) / (craterRadius * craterWarp);
        const radialFractureCell = kind === "impact-crater" && radialFractureAt(craterAngle, craterRadial);
        const riverCliffBank = coastalCanal
          && cell.surface !== "water"
          && cell.elevationFeet >= 15
          && Math.abs(x + 0.5 - warpedRiverX(z + 0.5, width, depth, phase)) < 9;
        scene.primitives.push(box(`terrain-field-${x}-${z}`, 0, x + 0.5, feetToMeters(bottomFeet), z + 0.5, 0.98, Math.max(FLOOR_SLAB_METERS, height), 0.98, riverCliffBank ? "rock" : materialFor(cell, kind), ["floor", "terrain", "terrain-program", `terrain:${kind}`, `surface:${cell.surface}`, `elevation:${cell.elevationFeet}`, ...(riverCliffBank ? ["coastal-cliff", "cliff-bank", "vertical-face"] : []), ...(cell.surface === "lava" ? ["lava", "lava-flow"] : []), ...(kind === "impact-crater" && cell.elevationFeet >= 20 ? ["impact-crater", "crater-rim"] : []), ...(radialFractureCell ? ["impact-crater", "radial-fracture", "fracture-bottom"] : []), ...(kind === "caldera" && cell.elevationFeet >= 20 ? ["caldera-rim"] : []), ...(kind === "ice-crevasse" ? ["ice-crevasse", "rift-bank"] : []), ...(kind === "ice-crevasse" && cell.elevationFeet <= -10 ? ["rift-bottom"] : []), ...(cell.buildable ? ["buildable", "standable"] : []), ...(cell.hazard ? ["hazard"] : [])]));
        if (cell.surface === "lava") {
          scene.primitives.push(box(`terrain-lava-surface-${x}-${z}`, 0, x + 0.5, feetToMeters(cell.elevationFeet) + 0.08, z + 0.5, 0.94, 0.12, 0.94, "warmLight", ["lava", "lava-flow", "lava-surface", "hazard", "terrain-program"]));
        }
        if (cell.surface === "water") {
          const mainDistance = Math.abs(x + 0.5 - warpedRiverX(z + 0.5, width, depth, phase));
          scene.primitives.push(water(`terrain-water-${x}-${z}`, 0, x + 0.5, feetToMeters(cell.elevationFeet + (kind === "river" ? 7.5 : 0.5)), z + 0.5, 0.98, 0.12, 0.98, kind === "river"
            ? ["terrain-program", "watercourse", "water-city", mainDistance < 3.4 ? "main-canal" : "branch-canal", ...(saltMarsh ? ["swamp", "wetland", "salt-marsh"] : [])]
            : kind === "underdark" ? ["terrain-program", "watercourse", "underdark", "underground-lake", "hazard"]
              : ["terrain-program", "coastal-cliff", "harbor-basin", "sea", "hazard"]));
        }
      }
      if (kind === "river") {
        const bridgeRows = [depth * 0.28, depth * 0.56, depth * 0.81];
        for (const [index, row] of bridgeRows.entries()) {
          const cx = warpedRiverX(row, width, depth, phase);
          const y = feetToMeters(cellAt(cx + 4, row).elevationFeet) + FLOOR_SLAB_METERS + 0.12;
          scene.primitives.push(corridor(`terrain-river-bridge-${index + 1}`, 0, cx - 5.2, row, cx + 5.2, row, y, index === 1 ? 2.5 : 1.7, index === 1 ? "stone" : "wood", ["bridge", "terrain-program", "standable", index === 1 ? "stone-bridge" : "wood-bridge", ...(saltMarsh && index !== 1 ? ["boardwalk", "raised-boardwalk"] : [])]));
        }
        const route = Array.from({ length: depth }, (_, index) => {
          const z = index + 0.5;
          const desiredX = warpedRiverX(z, width, depth, phase);
          const candidates = Array.from({ length: width }, (__, x) => x + 0.5).filter((x) => cellAt(x, z).surface === "water");
          const x = candidates.sort((a, b) => Math.abs(a - desiredX) - Math.abs(b - desiredX))[0] ?? desiredX;
          return { x, z, y: feetToMeters(cellAt(x, z).elevationFeet + 7.5) };
        });
        const routeBands: typeof route[] = [];
        for (const point of route) {
          const current = routeBands[routeBands.length - 1];
          if (!current || Math.abs((current[0]?.y ?? point.y) - point.y) > 0.01) routeBands.push([point]);
          else current.push(point);
        }
        routeBands.filter((band) => band.length >= 2).forEach((band, index) => scene.routes.push(createRoute(index === 0 ? "water-city-canal-route" : `water-city-canal-route-${index + 1}`, "waterflow", band, { purpose: "water", traffic: 0.8, schedule: "all" })));
        for (const [side, offset] of [["west", -5], ["east", 5]] as const) {
          for (let index = 4; index < route.length; index += 4) {
            const from = route[index - 4]!; const to = route[index]!;
            const mx = (from.x + to.x) / 2 + offset; const mz = (from.z + to.z) / 2;
            scene.primitives.push(corridor(`terrain-${side}-bank-${index}`, 0, from.x + offset, from.z, to.x + offset, to.z, feetToMeters(cellAt(mx, mz).elevationFeet) + FLOOR_SLAB_METERS + 0.04, 1.4, saltMarsh ? "wood" : "stone", ["water-city", "bank-route", "quay", "standable", "terrain-program", ...(saltMarsh ? ["boardwalk", "raised-boardwalk", "wetland"] : [])]));
          }
        }
        if (coastalCanal) {
          const cliffRoutePoints = route
            .filter((_, index) => index % 3 === 0 || index === route.length - 1)
            .map((point) => {
              const x = Math.max(1.5, Math.min(width - 1.5, point.x + cliffBankSide * 7.2));
              return { x, z: point.z, y: feetToMeters(cellAt(x, point.z).elevationFeet) + FLOOR_SLAB_METERS + 0.08 };
            });
          for (let index = 1; index < cliffRoutePoints.length; index += 1) {
            const from = cliffRoutePoints[index - 1]!;
            const to = cliffRoutePoints[index]!;
            const deckY = Math.max(from.y, to.y);
            const dx = to.x - from.x;
            const dz = to.z - from.z;
            const length = Math.max(1, Math.hypot(dx, dz));
            const rotation = Math.atan2(dx, dz);
            const outerOffset = cliffBankSide * 0.92;
            scene.primitives.push(
              corridor(`coastal-cliff-upper-road-${index}`, 0, from.x, from.z, to.x, to.z, deckY, 1.8, "stone", ["water-city", "coastal-cliff", "cliff-upper-route", "standable", "high-ground", "terrain-program"]),
              box(`coastal-cliff-parapet-${index}`, 0, (from.x + to.x) / 2 + outerOffset, deckY + FLOOR_SLAB_METERS, (from.z + to.z) / 2, 0.24, feetToMeters(3.4), length, "stone", ["water-city", "coastal-cliff", "cliff-parapet", "cover", "terrain-program"], rotation),
            );
          }
          const descentRows = [depth * 0.34, depth * 0.71];
          for (const [index, row] of descentRows.entries()) {
            const riverX = warpedRiverX(row, width, depth, phase);
            const lowerX = riverX + cliffBankSide * 4.2;
            const upperX = riverX + cliffBankSide * 7.2;
            const lowerY = feetToMeters(cellAt(lowerX, row).elevationFeet) + FLOOR_SLAB_METERS;
            const upperY = feetToMeters(cellAt(upperX, row).elevationFeet) + FLOOR_SLAB_METERS;
            const rise = Math.max(feetToMeters(5), upperY - lowerY);
            const centerX = (lowerX + upperX) / 2;
            scene.primitives.push(
              stairs(
                `coastal-cliff-switchback-${index + 1}`,
                0,
                centerX,
                lowerY,
                row,
                1.35,
                rise,
                Math.max(4.5, Math.abs(upperX - lowerX) + 2.2),
                "stone",
                ["water-city", "coastal-cliff", "cliff-descent", "vertical-route", "standable", "terrain-program"],
                cliffBankSide > 0 ? Math.PI / 2 : -Math.PI / 2,
              ),
              ...[0, 0.5, 1].map((t) => box(
                `coastal-cliff-switchback-${index + 1}-landing-${Math.round(t * 2) + 1}`,
                0,
                lowerX + (upperX - lowerX) * t,
                lowerY + rise * t - 0.12,
                row,
                1.55,
                0.24,
                1.55,
                "stone",
                ["water-city", "coastal-cliff", "stair-landing", "stair-opening", "vertical-opening", "opening-frame", "standable", "terrain-program"],
              )),
            );
            scene.routes.push(createRoute(`coastal-cliff-access-route-${index + 1}`, "vertical", [
              { x: lowerX, z: row, y: lowerY },
              { x: centerX, z: row, y: lowerY + rise / 2 },
              { x: upperX, z: row, y: upperY },
            ], { purpose: "movement", traffic: 0.46, schedule: "all" }));
          }
          scene.routes.push(createRoute("coastal-cliff-upper-route", "alternate", cliffRoutePoints, { purpose: "movement", traffic: 0.58, schedule: "all" }));
          scene.tactical.push(tacticalFeature("coastal-cliff-upper-overwatch", "highGround", cliffRoutePoints[Math.floor(cliffRoutePoints.length / 2)]?.x ?? width * 0.2, depth * 0.5, cliffRoutePoints[Math.floor(cliffRoutePoints.length / 2)]?.y ?? feetToMeters(15), 3, "The parapeted upper-bank road overlooks the canal and has two legal descents."));
        }
        // A water-city needs a functional waterfront node, not only blue
        // channel cells. Keep the market dock on a legal bank beside the
        // middle crossing so it participates in the same route/elevation
        // contract as the canal and never becomes a floating slab.
        const marketRow = Math.round(depth * 0.56);
        const marketRiverX = warpedRiverX(marketRow, width, depth, phase);
        const marketSide = marketRiverX < width * 0.5 ? 1 : -1;
        const marketX = marketRiverX + marketSide * 7;
        const marketCell = cellAt(Math.max(0, Math.min(width - 1, marketX)), marketRow);
        const marketY = feetToMeters(marketCell.elevationFeet) + FLOOR_SLAB_METERS + 0.08;
        scene.primitives.push(
          box("terrain-water-city-market-dock", 0, marketX, marketY, marketRow, 6.5, FLOOR_SLAB_METERS, 4, "wood", ["water-city", "market-dock", "dock", "quay", "standable", "terrain-program", ...(saltMarsh ? ["boardwalk", "wetland"] : [])]),
          corridor("terrain-water-city-market-approach", 0, marketX, marketRow + marketSide * 2.5, marketRiverX + marketSide * 3.2, marketRow, marketY, 1.2, "wood", ["water-city", "market-route", "dock", "standable", "terrain-program", ...(saltMarsh ? ["boardwalk", "raised-boardwalk", "wetland"] : [])]),
        );
      }
      if (kind === "ice-crevasse") {
        const bridgeRows = [depth * 0.28, depth * 0.57, depth * 0.82];
        for (const [index, row] of bridgeRows.entries()) {
          const gapCenter = crevasseAt(row);
          const bridgeY = feetToMeters(index === 2 ? 30 : 25) + FLOOR_SLAB_METERS;
          scene.primitives.push(
            corridor(`ice-crevasse-ice-bridge-${index + 1}`, 0, gapCenter - crevasseHalfGap - 2, row, gapCenter + crevasseHalfGap + 2, row, bridgeY, index === 1 ? 2.2 : 1.5, "ice", ["ice-crevasse", "bridge", "rift-crossing", "standable", "supported", "terrain-program"]),
            cylinder(`ice-crevasse-bridge-anchor-${index + 1}-west`, 0, gapCenter - crevasseHalfGap - 2, 0, row, 0.42, bridgeY + feetToMeters(2), "ice", ["ice-crevasse", "bridge-anchor", "support", "terrain-program"]),
            cylinder(`ice-crevasse-bridge-anchor-${index + 1}-east`, 0, gapCenter + crevasseHalfGap + 2, 0, row, 0.42, bridgeY + feetToMeters(2), "ice", ["ice-crevasse", "bridge-anchor", "support", "terrain-program"]),
          );
        }
        const descentZ = depth * 0.46;
        const descentX = crevasseAt(descentZ) - crevasseHalfGap - 1;
        scene.primitives.push(
          stairs("ice-crevasse-cargo-lift", 0, descentX, feetToMeters(20), descentZ, 2.4, feetToMeters(35), 12, "metal", ["ice-crevasse", "cargo-lift", "cliff-descent", "vertical-route", "supported", "terrain-program"]),
          corridor("ice-crevasse-rock-tunnel-west", 0, descentX - 7, descentZ, descentX - 1, descentZ, feetToMeters(20) + FLOOR_SLAB_METERS, 2.2, "rock", ["ice-crevasse", "rock-tunnel", "cliff-descent", "standable", "terrain-program"]),
          water("ice-crevasse-hot-spring", 0, crevasseAt(depth * 0.72), feetToMeters(-14.4), depth * 0.72, 3.5, 0.25, 5.5, ["ice-crevasse", "hot-spring", "watercourse", "hazard", "terrain-program"]),
          box("ice-crevasse-bottom-mine-portal", 0, crevasseAt(depth * 0.84), feetToMeters(-15), depth * 0.84, 4.8, feetToMeters(10), 3.2, "darkStone", ["ice-crevasse", "rift-bottom", "mine-entrance", "portal", "terrain-program"]),
        );
        if (includesAny(normalizedPrompt, ["熔炉", "锻炉", "forge", "smelter"])) {
          const forgeZ = depth * 0.36;
          const forgeX = crevasseAt(forgeZ) + crevasseHalfGap + 7;
          const forgeY = feetToMeters(30) + FLOOR_SLAB_METERS;
          scene.primitives.push(
            box("ice-crevasse-forge-yard", 0, forgeX, forgeY, forgeZ, 8, FLOOR_SLAB_METERS, 6, "metal", ["ice-crevasse", "forge-hall", "industrial-platform", "standable", "terrain-program"]),
            cylinder("ice-crevasse-forge-furnace-a", 0, forgeX - 2, forgeY, forgeZ, 1.2, feetToMeters(7), "warmLight", ["ice-crevasse", "forge-hall", "furnace", "landmark", "terrain-program"]),
            cylinder("ice-crevasse-forge-furnace-b", 0, forgeX + 1.4, forgeY, forgeZ + 0.8, 1, feetToMeters(6), "warmLight", ["ice-crevasse", "forge-hall", "furnace", "landmark", "terrain-program"]),
            cylinder("ice-crevasse-forge-chimney", 0, forgeX + 2.7, forgeY, forgeZ - 1.2, 0.75, feetToMeters(18), "darkStone", ["ice-crevasse", "forge-hall", "chimney", "vertical-landmark", "terrain-program"]),
          );
        }
        scene.tactical.push(
          tacticalFeature("ice-crevasse-bank-west", "highGround", crevasseAt(depth * 0.5) - crevasseHalfGap - 5, depth * 0.5, feetToMeters(20), 3, "The west ice shelf holds the main settlement and overlooks the fracture."),
          tacticalFeature("ice-crevasse-bank-east", "highGround", crevasseAt(depth * 0.5) + crevasseHalfGap + 5, depth * 0.5, feetToMeters(30), 3, "The east ice shelf is a separated firing line across the crevasse."),
          tacticalFeature("ice-crevasse-bottom", "hazard", crevasseAt(depth * 0.55), depth * 0.55, feetToMeters(-15), 3, "The deep crevasse floor is reachable only by the supported cargo descent."),
        );
        scene.routes.push(createRoute("ice-crevasse-bottom-route", "vertical", [{ x: descentX, z: descentZ, y: feetToMeters(20) }, { x: crevasseAt(descentZ), z: descentZ, y: feetToMeters(-15) }], { purpose: "service", traffic: 0.25, schedule: "all" }));
      }
      if (kind === "impact-crater" || kind === "caldera") {
        const coreMaterial: MaterialKey = kind === "caldera" ? "hazard" : "metal";
        scene.primitives.push(primitive(`${kind}-core`, "cylinder", 0, craterCx, feetToMeters(kind === "caldera" ? -5 : 0), craterCz, craterRadius * 0.32 * 1.524, feetToMeters(kind === "caldera" ? 1 : 7), craterRadius * 0.32 * 1.524, coreMaterial, [kind, kind === "caldera" ? "lava" : "meteor-fragment", "landmark", "terrain-program"]));
        for (const [index, angle] of breachAngles.entries()) {
          const outer = { x: craterCx + Math.cos(angle) * craterRadius * 1.18, z: craterCz + Math.sin(angle) * craterRadius * 1.18 };
          const inner = { x: craterCx + Math.cos(angle) * craterRadius * 0.5, z: craterCz + Math.sin(angle) * craterRadius * 0.5 };
          for (let segment = 0; segment < 3; segment += 1) {
            const t0 = segment / 3; const t1 = (segment + 1) / 3;
            const from = { x: outer.x + (inner.x - outer.x) * t0, z: outer.z + (inner.z - outer.z) * t0 };
            const to = { x: outer.x + (inner.x - outer.x) * t1, z: outer.z + (inner.z - outer.z) * t1 };
            const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
            scene.primitives.push(corridor(`${kind}-breach-ramp-${index + 1}-${segment + 1}`, 0, from.x, from.z, to.x, to.z, feetToMeters(cellAt(mid.x, mid.z).elevationFeet) + FLOOR_SLAB_METERS, 1.8, "rock", [kind, segment === 0 ? "crater-ramp" : "crater-ramp-continuation", "alternate-route", "standable", "terrain-program", "surface-following"]));
          }
        }
        const ringSegments = 18;
        for (let index = 0; index < ringSegments; index += 1) {
          const fromAngle = (Math.PI * 2 * index) / ringSegments + phase;
          const toAngle = (Math.PI * 2 * (index + 1)) / ringSegments + phase;
          const radius = craterRadius * 0.84;
          const from = { x: craterCx + Math.cos(fromAngle) * radius, z: craterCz + Math.sin(fromAngle) * radius };
          const to = { x: craterCx + Math.cos(toAngle) * radius, z: craterCz + Math.sin(toAngle) * radius };
          const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
          if (cellAt(mid.x, mid.z).surface === "void") continue;
          scene.primitives.push(corridor(`${kind}-ring-road-${index + 1}`, 0, from.x, from.z, to.x, to.z, feetToMeters(cellAt(mid.x, mid.z).elevationFeet) + FLOOR_SLAB_METERS + 0.05, 1.45, "rock", [kind, "crater-ring-road", "primary-route", "standable", "terrain-program", "surface-following"]));
        }
        if (kind === "impact-crater" && wantsRadialFractures) {
          for (const [fracture, angle] of fractureAngles.entries()) {
            const innerRadius = craterRadius * rng.float(0.18, 0.34);
            const outerRadius = craterRadius * rng.float(1.08, 1.38);
            const segments = 4 + Math.round(density * 2);
            for (let segment = 0; segment < segments; segment += 1) {
              const t0 = segment / segments;
              const t1 = (segment + 1) / segments;
              const wobble0 = Math.sin(fracture * 1.7 + segment * 0.83) * craterRadius * 0.035;
              const wobble1 = Math.sin(fracture * 1.7 + (segment + 1) * 0.83) * craterRadius * 0.035;
              const from = {
                x: craterCx + Math.cos(angle) * (innerRadius + (outerRadius - innerRadius) * t0) - Math.sin(angle) * wobble0,
                z: craterCz + Math.sin(angle) * (innerRadius + (outerRadius - innerRadius) * t0) + Math.cos(angle) * wobble0,
              };
              const to = {
                x: craterCx + Math.cos(angle) * (innerRadius + (outerRadius - innerRadius) * t1) - Math.sin(angle) * wobble1,
                z: craterCz + Math.sin(angle) * (innerRadius + (outerRadius - innerRadius) * t1) + Math.cos(angle) * wobble1,
              };
              const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
              if (cellAt(mid.x, mid.z).surface === "void") continue;
              const y = feetToMeters(cellAt(mid.x, mid.z).elevationFeet) + 0.015;
              scene.primitives.push(
                box(`impact-radial-fracture-${fracture}-${segment}`, 0, mid.x, y - feetToMeters(0.9), mid.z, 0.28, feetToMeters(1.8), Math.max(0.8, Math.hypot(to.x - from.x, to.z - from.z)), "darkStone", ["impact-crater", "radial-fracture", "vertical-face", "hazard", "non-walkable-facade", "terrain-program"], Math.atan2(to.z - from.z, to.x - from.x)),
              );
              reserveLinearTerrain(scene, `impact-radial-fracture-reservation-${fracture}-${segment}`, "unstable", from.x, from.z, to.x, to.z, 0.6, 0.35, "Radial impact fracture owns this unstable slot and blocks ordinary foundations.");
            }
            scene.tactical.push(tacticalFeature(`impact-radial-fracture-${fracture}-hazard`, "hazard", craterCx + Math.cos(angle) * craterRadius * 0.72, craterCz + Math.sin(angle) * craterRadius * 0.72, feetToMeters(2), 1, "A deep radial impact fracture splits the crater rim and creates a dangerous crossing."));
          }
        }
        if (kind === "impact-crater" && wantsOrePiles) {
          const oreCount = 4 + Math.round(density * 4);
          for (let ore = 0; ore < oreCount; ore += 1) {
            const angle = breachAngle + ore * 2.19;
            const radius = craterRadius * (0.38 + (ore % 3) * 0.12);
            const x = craterCx + Math.cos(angle) * radius;
            const z = craterCz + Math.sin(angle) * radius;
            scene.primitives.push(
              primitive(`impact-ore-pile-${ore + 1}`, "cone", 0, x, feetToMeters(cellAt(x, z).elevationFeet) + feetToMeters(1.2), z, 0.75 + (ore % 3) * 0.2, feetToMeters(2.5 + (ore % 4)), 0.7 + (ore % 2) * 0.18, "metal", ["impact-crater", "ore-pile", "meteor-fragment", "cover", "terrain-program"]),
            );
          }
        }
        if (kind === "impact-crater" && wantsCraterBridge) {
          const bridgeAngle = breachAngle + Math.PI * 0.42;
          const bridgeRadius = craterRadius * 0.78;
          const from = { x: craterCx + Math.cos(bridgeAngle) * bridgeRadius, z: craterCz + Math.sin(bridgeAngle) * bridgeRadius };
          const to = { x: craterCx - Math.cos(bridgeAngle) * bridgeRadius, z: craterCz - Math.sin(bridgeAngle) * bridgeRadius };
          const bridgeY = feetToMeters(13) + FLOOR_SLAB_METERS;
          scene.primitives.push(
            corridor("impact-crater-suspension-bridge", 0, from.x, from.z, to.x, to.z, bridgeY, 1.45, "wood", ["impact-crater", "suspension-bridge", "bridge", "standable", "site-program", "supported"]),
            cylinder("impact-crater-bridge-anchor-a", 0, from.x, 0, from.z, 0.55, bridgeY + feetToMeters(3), "wood", ["impact-crater", "bridge-anchor", "support", "site-program"]),
            cylinder("impact-crater-bridge-anchor-b", 0, to.x, 0, to.z, 0.55, bridgeY + feetToMeters(3), "wood", ["impact-crater", "bridge-anchor", "support", "site-program"]),
          );
        }
        if (kind === "impact-crater" && wantsCraterShrine) {
          scene.primitives.push(
            cylinder("impact-crater-basin-shrine", 0, craterCx + craterRadius * 0.22, feetToMeters(1), craterCz - craterRadius * 0.12, 1.7, feetToMeters(4), "plaster", ["impact-crater", "basin-shrine", "shrine", "landmark", "cover", "site-program"]),
            corridor("impact-crater-shrine-path", 0, craterCx + craterRadius * 0.5, craterCz - craterRadius * 0.12, craterCx + craterRadius * 0.22, craterCz - craterRadius * 0.12, feetToMeters(5) + FLOOR_SLAB_METERS, 1.2, "rock", ["impact-crater", "shrine-route", "standable", "site-program"]),
          );
        }
        if (kind === "impact-crater" && wantsCraterMine) {
          const mineAngle = breachAngle - Math.PI * 0.83;
          const mineX = craterCx + Math.cos(mineAngle) * craterRadius * 0.96;
          const mineZ = craterCz + Math.sin(mineAngle) * craterRadius * 0.96;
          const mineY = feetToMeters(cellAt(mineX, mineZ).elevationFeet);
          scene.primitives.push(
            box("impact-crater-mine-portal", 0, mineX, mineY, mineZ, 4.8, feetToMeters(11), 3.4, "darkStone", ["impact-crater", "mine-entrance", "portal", "site-program"]),
            corridor("impact-crater-mine-approach", 0, craterCx + Math.cos(mineAngle) * craterRadius * 0.72, craterCz + Math.sin(mineAngle) * craterRadius * 0.72, mineX, mineZ, mineY + FLOOR_SLAB_METERS + 0.04, 1.4, "rock", ["impact-crater", "mine-route", "standable", "site-program"]),
          );
        }
        if (kind === "caldera") {
          const outlet = breachAngles[0] ?? 0;
          scene.primitives.push(
            corridor("caldera-chain-bridge", 0, craterCx + Math.cos(outlet + 0.28) * craterRadius * 0.48, craterCz + Math.sin(outlet + 0.28) * craterRadius * 0.48, craterCx + Math.cos(outlet - 0.28) * craterRadius * 0.48, craterCz + Math.sin(outlet - 0.28) * craterRadius * 0.48, feetToMeters(6), 1.25, "metal", ["caldera", "chain-bridge", "bridge", "standable", "terrain-program"]),
            primitive("caldera-rim-altar", "cylinder", 0, craterCx - craterRadius * 0.78, feetToMeters(25), craterCz, 3.6 * 1.524, feetToMeters(5), 3.6 * 1.524, "darkStone", ["caldera", "high-altar", "landmark", "high-ground", "terrain-program"]),
          );
        }
        scene.tactical.push(tacticalFeature(`${kind}-basin-hazard`, "hazard", craterCx, craterCz, feetToMeters(kind === "caldera" ? -5 : 0), Math.ceil(craterRadius * 0.3), `The ${kind} basin is the parent hazard shaping every district and route.`));
      }
      if (kind === "underdark") {
        for (let index = 0; index < 18; index += 1) {
          const angle = Math.PI * 2 * index / 18;
          const x = width / 2 + Math.cos(angle) * width * 0.48;
          const z = depth / 2 + Math.sin(angle) * depth * 0.47;
          scene.primitives.push(primitive(
            `cavern-wall-${index}`,
            "cone",
            0,
            x,
            feetToMeters(-15),
            z,
            4.2 * 1.524,
            feetToMeters(45 + index % 4 * 5),
            4.2 * 1.524,
            isSaltCrystal && index % 3 === 0 ? "ice" : "darkStone",
            ["underdark", "cavern-wall", "vertical-face", "terrain-program", ...(isSaltCrystal ? ["salt-crystal", "tidal-cavern"] : [])],
          ));
        }
        scene.primitives.push(
          primitive("underdark-lake-surface", "sphere", 0, width * 0.22, feetToMeters(-4.5), depth * 0.72, width * 0.27 * 1.524, 0.22, depth * 0.22 * 1.524, "water", ["terrain-program", "watercourse", "underdark", "underground-lake", "hazard", ...(isSaltCrystal ? ["salt-crystal", "cavern-tide-pool", "tidal-cavern"] : [])]),
          corridor("underdark-ravine-bridge-north", 0, ravineX - 4, depth * 0.3, ravineX + 4, depth * 0.3, feetToMeters(10) + FLOOR_SLAB_METERS, 1.8, "stone", ["underdark", "ravine-bridge", "bridge", "standable", "terrain-program"]),
          corridor("underdark-ravine-bridge-south", 0, ravineX - 4, depth * 0.72, ravineX + 4, depth * 0.72, feetToMeters(5) + FLOOR_SLAB_METERS, 1.5, "wood", ["underdark", "ravine-bridge", "bridge", "standable", "terrain-program"]),
        );
        for (let index = 0; index < (isSaltCrystal ? 20 : 12); index += 1) {
          const x = width * (0.12 + ((index * 7) % 11) / 14);
          const z = depth * (0.14 + ((index * 5) % 9) / 12);
          if (cellAt(x, z).surface === "void") continue;
          scene.primitives.push(isSaltCrystal
            ? primitive(`settlement-salt-crystal-${index}`, "cone", 0, x, feetToMeters(cellAt(x, z).elevationFeet), z, feetToMeters(0.7 + index % 3 * 0.25), feetToMeters(5 + index % 5 * 2), feetToMeters(0.7 + (index + 1) % 3 * 0.22), index % 4 === 0 ? "warmLight" : "ice", ["underdark", "salt-crystal", "crystal-spire", "cover", "tidal-cavern", "terrain-program"])
            : primitive(`settlement-fungus-${index}`, "cone", 0, x, feetToMeters(cellAt(x, z).elevationFeet), z, feetToMeters(1.2 + index % 3), feetToMeters(5 + index % 4), feetToMeters(1.2 + index % 3), index % 3 === 0 ? "warmLight" : "moss", ["underdark", "fungal-forest", "cover", "terrain-program"]));
        }
      }
      if (kind === "megastructure" && !isHollowTree && !isSaltCrystal) {
        scene.primitives.push(
          primitive("megastructure-central-core", "cylinder", 0, megaCx, feetToMeters(-30), megaCz, megaRadius * 0.32 * 1.524, feetToMeters(115), megaRadius * 0.32 * 1.524, "darkStone", ["megastructure", "tower-core", "support", "vertical-city", "terrain-program"]),
          primitive("megastructure-lower-ring", "cylinder", 0, megaCx, feetToMeters(0), megaCz, megaRadius * 1.95 * 1.524, FLOOR_SLAB_METERS, megaRadius * 1.95 * 1.524, "darkStone", ["floor", "platform", "standable", "megastructure", "lower-ring", "terrain-program"]),
          primitive("megastructure-middle-ring", "cylinder", 1, megaCx, feetToMeters(20), megaCz, megaRadius * 1.5 * 1.524, FLOOR_SLAB_METERS, megaRadius * 1.5 * 1.524, "stone", ["floor", "platform", "standable", "megastructure", "middle-ring", "terrain-program"]),
          primitive("megastructure-upper-ring", "cylinder", 2, megaCx, feetToMeters(40), megaCz, megaRadius * 1.04 * 1.524, FLOOR_SLAB_METERS, megaRadius * 1.04 * 1.524, "metal", ["floor", "platform", "standable", "megastructure", "upper-ring", "terrain-program"]),
          primitive("megastructure-crown", "cylinder", 3, megaCx, feetToMeters(60), megaCz, megaRadius * 0.58 * 1.524, FLOOR_SLAB_METERS, megaRadius * 0.58 * 1.524, "warmLight", ["floor", "platform", "standable", "megastructure", "tower-crown", "high-ground", "terrain-program"]),
        );
        const ringSpecs = [
          { radius: megaRadius * 0.78, yFeet: 0, level: 0 },
          { radius: megaRadius * 0.56, yFeet: 20, level: 1 },
          { radius: megaRadius * 0.34, yFeet: 40, level: 2 },
        ];
        for (const [ringIndex, spec] of ringSpecs.entries()) {
          for (let segment = 0; segment < 12; segment += 1) {
            const a0 = phase + segment * Math.PI / 6;
            const a1 = phase + (segment + 1) * Math.PI / 6;
            scene.primitives.push(corridor(`megastructure-ring-route-${ringIndex}-${segment}`, spec.level,
              megaCx + Math.cos(a0) * spec.radius, megaCz + Math.sin(a0) * spec.radius,
              megaCx + Math.cos(a1) * spec.radius, megaCz + Math.sin(a1) * spec.radius,
              feetToMeters(spec.yFeet) + FLOOR_SLAB_METERS + 0.06, 1.7, "stone", ["megastructure", "ring-route", "standable", "high-ground", "terrain-program"]));
          }
        }
        for (let spoke = 0; spoke < 4; spoke += 1) {
          const angle = phase + spoke * Math.PI / 2;
          scene.primitives.push(
            corridor(`megastructure-lower-spoke-${spoke}`, 0, megaCx + Math.cos(angle) * megaRadius * 0.2, megaCz + Math.sin(angle) * megaRadius * 0.2, megaCx + Math.cos(angle) * megaRadius * 0.92, megaCz + Math.sin(angle) * megaRadius * 0.92, feetToMeters(0) + FLOOR_SLAB_METERS + 0.09, 2.2, "metal", ["megastructure", "radial-bridge", "standable", "terrain-program"]),
            corridor(`megastructure-upper-spoke-${spoke}`, 2, megaCx + Math.cos(angle + 0.35) * megaRadius * 0.17, megaCz + Math.sin(angle + 0.35) * megaRadius * 0.17, megaCx + Math.cos(angle + 0.35) * megaRadius * 0.52, megaCz + Math.sin(angle + 0.35) * megaRadius * 0.52, feetToMeters(40) + FLOOR_SLAB_METERS + 0.09, 1.6, "metal", ["megastructure", "radial-bridge", "standable", "high-ground", "terrain-program"]),
          );
        }
        scene.primitives.push(
          stairs("megastructure-rise-lower-middle", 1, megaCx + megaRadius * 0.61, feetToMeters(0), megaCz, 2.2, feetToMeters(20), 8, "metal", ["megastructure", "vertical-route", "vertical-opening", "supported", "terrain-program"], Math.PI / 2),
          stairs("megastructure-rise-middle-upper", 2, megaCx, feetToMeters(20), megaCz - megaRadius * 0.43, 2.2, feetToMeters(20), 8, "metal", ["megastructure", "vertical-route", "vertical-opening", "supported", "terrain-program"], 0),
          stairs("megastructure-rise-upper-crown", 3, megaCx - megaRadius * 0.27, feetToMeters(40), megaCz, 2, feetToMeters(20), 7, "metal", ["megastructure", "vertical-route", "vertical-opening", "supported", "terrain-program"], -Math.PI / 2),
        );
        scene.routes.push(
          createRoute("megastructure-vertical-stack", "vertical", [
            { x: megaCx + megaRadius * 0.61, z: megaCz, y: feetToMeters(0) },
            { x: megaCx + megaRadius * 0.5, z: megaCz, y: feetToMeters(20) },
            { x: megaCx, z: megaCz - megaRadius * 0.43, y: feetToMeters(20) },
            { x: megaCx, z: megaCz - megaRadius * 0.32, y: feetToMeters(40) },
            { x: megaCx - megaRadius * 0.27, z: megaCz, y: feetToMeters(40) },
            { x: megaCx - megaRadius * 0.18, z: megaCz, y: feetToMeters(60) },
          ], { purpose: "movement", traffic: 0.75, schedule: "all" }),
        );
      }
      if (kind === "bridge-megastructure") {
        const ravineWidth = width * 0.44;
        scene.primitives.push(
          water("bridge-megastructure-ravine-water", 0, width / 2, -feetToMeters(8), depth / 2, ravineWidth, 0.2, depth * 0.86, ["bridge-megastructure", "ravine", "hazard", "terrain-program"]),
        );
        scene.routes.push(createRoute("bridge-megastructure-market-route", "primary", [
          { x: width * 0.3, z: depth * 0.3, y: feetToMeters(12) },
          { x: width * 0.5, z: depth * 0.3, y: feetToMeters(12) },
          { x: width * 0.7, z: depth * 0.3, y: feetToMeters(12) },
        ], { purpose: "crowd", traffic: 0.78, schedule: "all" }));
      }
      if (kind === "coastal-cliff") {
        for (let dock = 0; dock < 4; dock += 1) {
          const x = width * (0.18 + dock * 0.2);
          scene.primitives.push(corridor(`coastal-cliff-dock-${dock + 1}`, 0, x, depth * 0.77, x + (dock % 2 ? 0.8 : -0.8), depth * 0.95, feetToMeters(-4.5), 1.8, "wood", ["coastal-cliff", "dock", "harbor", "standable", "terrain-program"]));
        }
        scene.primitives.push(
          primitive("coastal-cliff-lighthouse", "cylinder", 2, width * 0.82, feetToMeters(30), depth * 0.18, 5.5, feetToMeters(34), 5.5, "stone", ["coastal-cliff", "lighthouse", "landmark", "high-ground", "terrain-program"]),
          corridor("coastal-cliff-maintenance-walk", 1, width * 0.76, depth * 0.22, width * 0.9, depth * 0.72, feetToMeters(20) + FLOOR_SLAB_METERS, 1.4, "wood", ["coastal-cliff", "maintenance-boardwalk", "standable", "high-ground", "terrain-program"]),
          stairs("coastal-cliff-switchback-upper", 1, width * 0.72, feetToMeters(20), depth * 0.29, 2, feetToMeters(10), 7, "stone", ["coastal-cliff", "switchback", "vertical-opening", "standable", "terrain-program"], 0),
          stairs("coastal-cliff-switchback-lower", 0, width * 0.66, feetToMeters(10), depth * 0.56, 2, feetToMeters(10), 7, "stone", ["coastal-cliff", "switchback", "vertical-opening", "standable", "terrain-program"], 0),
        );
        if (program.requiredFeatures.includes("whalebone-landmark")) {
          const boneY = feetToMeters(23);
          const spineStart = { x: width * 0.16, z: depth * 0.44 };
          const spineEnd = { x: width * 0.62, z: depth * 0.33 };
          scene.primitives.push(
            corridor("coastal-whalebone-spine", 1, spineStart.x, spineStart.z, spineEnd.x, spineEnd.z, boneY, 1.65, "plaster", ["coastal-cliff", "whalebone", "spine", "standable", "high-ground", "terrain-program"]),
            primitive("coastal-whalebone-skull", "sphere", 1, width * 0.14, feetToMeters(16), depth * 0.45, 8.5, feetToMeters(9), 6.5, "plaster", ["coastal-cliff", "whalebone", "whale-skull", "landmark", "cover", "terrain-program"], -0.22),
          );
          const spineAngle = Math.atan2(spineEnd.z - spineStart.z, spineEnd.x - spineStart.x);
          for (let rib = 0; rib < 6; rib += 1) {
            const t = (rib + 1) / 7;
            const cx = spineStart.x + (spineEnd.x - spineStart.x) * t;
            const cz = spineStart.z + (spineEnd.z - spineStart.z) * t;
            const ribLength = 7.5 + (rib % 3) * 1.7;
            for (const side of [-1, 1]) {
              const endX = cx + Math.cos(spineAngle + side * (Math.PI / 2 - 0.25)) * ribLength;
              const endZ = cz + Math.sin(spineAngle + side * (Math.PI / 2 - 0.25)) * ribLength;
              scene.primitives.push(corridor(`coastal-whalebone-rib-${rib}-${side}`, 1, cx, cz, endX, endZ, boneY - feetToMeters(1.5), 0.9, "plaster", ["coastal-cliff", "whalebone", "rib", "cover", "terrain-program"]));
              scene.primitives.push(cylinder(`coastal-whalebone-rib-post-${rib}-${side}`, 0, endX, feetToMeters(10), endZ, 0.48, feetToMeters(14 + (rib % 3) * 3), "plaster", ["coastal-cliff", "whalebone", "rib", "vertical-bone", "cover", "terrain-program"]));
            }
          }
        }
        if (program.requiredFeatures.includes("tide-pools")) {
          for (let pool = 0; pool < 4; pool += 1) {
            scene.primitives.push(water(
              `coastal-tide-pool-${pool + 1}`,
              0,
              width * (0.18 + pool * 0.19),
              feetToMeters(0.4),
              depth * (0.74 + (pool % 2) * 0.035),
              2.4 + (pool % 2) * 0.8,
              0.08,
              1.7 + ((pool + 1) % 2) * 0.7,
              ["coastal-cliff", "tide-pool", "hazard", "terrain-program"],
            ));
          }
        }
        if (program.requiredFeatures.includes("storm-cableway")) {
          const cableY = feetToMeters(28);
          scene.primitives.push(
            corridor("coastal-storm-cableway", 2, width * 0.58, depth * 0.3, width * 0.72, depth * 0.7, cableY, 0.32, "metal", ["coastal-cliff", "storm-cableway", "elevated", "high-ground", "terrain-program"]),
            box("coastal-storm-cable-station-upper", 2, width * 0.58, cableY - 0.1, depth * 0.3, 3.2, FLOOR_SLAB_METERS, 3.2, "wood", ["coastal-cliff", "storm-cableway", "station-platform", "standable", "supported", "terrain-program"]),
            box("coastal-storm-cable-station-lower", 2, width * 0.72, cableY - 0.1, depth * 0.7, 3.2, FLOOR_SLAB_METERS, 3.2, "wood", ["coastal-cliff", "storm-cableway", "station-platform", "standable", "supported", "terrain-program"]),
            box("coastal-storm-cable-gondola", 2, width * 0.65, cableY - feetToMeters(3), depth * 0.5, 2.2, feetToMeters(3.5), 2.6, "metal", ["coastal-cliff", "storm-cableway", "gondola", "cover", "terrain-program"]),
            cylinder("coastal-storm-cable-pylon-a", 0, width * 0.58, 0, depth * 0.3, 0.35, cableY, "metal", ["coastal-cliff", "storm-cableway", "support", "terrain-program"]),
            cylinder("coastal-storm-cable-pylon-b", 0, width * 0.72, 0, depth * 0.7, 0.35, cableY, "metal", ["coastal-cliff", "storm-cableway", "support", "terrain-program"]),
          );
        }
        if (program.requiredFeatures.includes("sea-cave")) {
          const caveX = width * 0.34;
          const caveZ = depth * 0.66;
          const caveY = -feetToMeters(12);
          scene.primitives.push(
            box("coastal-sea-cave-floor-main", 3, caveX, caveY, caveZ, 9, FLOOR_SLAB_METERS, 7, "darkStone", ["coastal-cliff", "sea-cave", "underground", "floor", "standable", "terrain-program"]),
            box("coastal-sea-cave-floor-tidal", 3, caveX - 4.8, caveY, caveZ + 1.1, 5.5, FLOOR_SLAB_METERS, 4.8, "darkStone", ["coastal-cliff", "sea-cave", "underground", "floor", "standable", "terrain-program"]),
            corridor("coastal-sea-cave-entry-path", 3, caveX + 1.1, caveZ - 4.4, caveX + 1.1, caveZ - 1.4, caveY + FLOOR_SLAB_METERS, 1.8, "stone", ["coastal-cliff", "sea-cave", "underground", "standable", "terrain-program"]),
            stairs("coastal-sea-cave-entry", 3, caveX + 1.1, caveY, caveZ - 4.5, 1.8, feetToMeters(12), 7, "stone", ["coastal-cliff", "sea-cave", "underground", "vertical-opening", "standable", "terrain-program"], 0),
            water("coastal-sea-cave-pool", 3, caveX - 4.7, caveY + 0.1, caveZ + 1.2, 3.7, 0.08, 3.2, ["coastal-cliff", "sea-cave", "tidal-pool", "hazard", "terrain-program"]),
            primitive("coastal-sea-cave-wall-north", "sphere", 3, caveX, caveY, caveZ - 4.1, 12, feetToMeters(8), 4.5, "rock", ["coastal-cliff", "sea-cave", "cave-wall", "cover", "terrain-program"]),
            primitive("coastal-sea-cave-wall-south", "sphere", 3, caveX - 0.8, caveY, caveZ + 4.1, 12, feetToMeters(9), 4.8, "rock", ["coastal-cliff", "sea-cave", "cave-wall", "cover", "terrain-program"]),
            primitive("coastal-sea-cave-wall-west", "sphere", 3, caveX - 6.2, caveY, caveZ - 0.3, 5.2, feetToMeters(10), 10, "rock", ["coastal-cliff", "sea-cave", "cave-wall", "cover", "terrain-program"]),
            primitive("coastal-sea-cave-wall-east", "sphere", 3, caveX + 5.2, caveY, caveZ + 0.2, 5, feetToMeters(11), 9, "rock", ["coastal-cliff", "sea-cave", "cave-wall", "cover", "terrain-program"]),
            primitive("coastal-sea-cave-pillar-a", "sphere", 3, caveX - 2.4, caveY, caveZ - 1.7, 3.2, feetToMeters(7), 3.2, "rock", ["coastal-cliff", "sea-cave", "stone-pillar", "cover", "terrain-program"]),
            primitive("coastal-sea-cave-pillar-b", "sphere", 3, caveX + 2.7, caveY, caveZ + 1.9, 3.5, feetToMeters(8), 3.5, "rock", ["coastal-cliff", "sea-cave", "stone-pillar", "cover", "terrain-program"]),
          );
          for (const primitive of scene.primitives) {
            if (!primitive.id.startsWith("coastal-sea-cave-")) continue;
            primitive.tags = [...(primitive.tags ?? []), "focus-cluster:sea-cave"];
          }
          scene.routes.push(createRoute("coastal-sea-cave-route", "alternate", [
            { x: caveX + 1.1, z: caveZ - 7.8, y: 0 },
            { x: caveX + 1.1, z: caveZ - 4.5, y: caveY },
            { x: caveX + 1.1, z: caveZ - 1.4, y: caveY + FLOOR_SLAB_METERS },
            { x: caveX - 2.4, z: caveZ + 0.4, y: caveY + FLOOR_SLAB_METERS },
            { x: caveX - 4.7, z: caveZ + 1.2, y: caveY + FLOOR_SLAB_METERS },
          ], { purpose: "movement", traffic: 0.2, schedule: "all" }));
        }
      }
      if (kind === "swamp-bone") {
        const spinePoints = Array.from({ length: 8 }, (_, index) => ({ x: width * (0.2 + index * 0.085), z: depth * (0.2 + index * 0.075) + Math.sin(index + phase) * 1.4 }));
        for (let index = 1; index < spinePoints.length; index += 1) {
          const from = spinePoints[index - 1]!; const to = spinePoints[index]!;
          scene.primitives.push(corridor(`dragonbone-spine-${index}`, 1, from.x, from.z, to.x, to.z, feetToMeters(10), 2.3, "plaster", ["swamp-bone", "dragonbone", "spine-walkway", "standable", "high-ground", "terrain-program"]));
          const angle = Math.atan2(to.z - from.z, to.x - from.x);
          for (const side of [-1, 1]) {
            const ribEnd = { x: to.x + Math.cos(angle + side * Math.PI / 2) * (5 + index % 3), z: to.z + Math.sin(angle + side * Math.PI / 2) * (5 + index % 3) };
            scene.primitives.push(corridor(`dragonbone-rib-${index}-${side}`, 1, to.x, to.z, ribEnd.x, ribEnd.z, feetToMeters(8 + index % 2 * 2), 1.1, "plaster", ["swamp-bone", "fossil-rib", "rib-walkway", "standable", "cover", "terrain-program"]));
          }
        }
        scene.primitives.push(
          primitive("dragonbone-skull-platform", "sphere", 1, width * 0.78, feetToMeters(7), depth * 0.72, 9, feetToMeters(10), 7, "plaster", ["swamp-bone", "dragon-skull", "bone-platform", "landmark", "high-ground", "terrain-program"]),
          box("dragonbone-marrow-altar", 3, width * 0.5, -feetToMeters(10), depth * 0.52, 7, FLOOR_SLAB_METERS, 6, "plaster", ["swamp-bone", "marrow-altar", "underground", "floor", "standable", "terrain-program"]),
          stairs("dragonbone-altar-stair", 3, width * 0.5, -feetToMeters(10), depth * 0.46, 1.6, feetToMeters(10), 5, "plaster", ["swamp-bone", "vertical-opening", "underground", "terrain-program"]),
        );
      }
      if (kind === "wreck-field") {
        const beamY = feetToMeters(15);
        scene.primitives.push(
          corridor("airship-main-keel", 1, width * 0.12, depth * 0.35, width * 0.82, depth * 0.62, beamY, 3.2, "metal", ["wreck-field", "airship-wreck", "main-beam", "standable", "high-ground", "terrain-program"]),
          primitive("airship-broken-hull-a", "sphere", 1, width * 0.3, feetToMeters(5), depth * 0.42, 18 * 1.524, feetToMeters(12), 7 * 1.524, "metal", ["wreck-field", "airship-wreck", "broken-hull", "cover", "terrain-program"], 0.36),
          primitive("airship-broken-hull-b", "sphere", 1, width * 0.7, feetToMeters(8), depth * 0.57, 15 * 1.524, feetToMeters(9), 6 * 1.524, "metal", ["wreck-field", "airship-wreck", "broken-hull", "cover", "terrain-program"], 0.36),
          primitive("airship-tail-fin", "gable", 1, width * 0.78, feetToMeters(10), depth * 0.61, 5 * 1.524, feetToMeters(16), 2 * 1.524, "metal", ["wreck-field", "airship-wreck", "tail-fin", "landmark", "terrain-program"], 0.36),
          corridor("airship-hanging-platform", 1, width * 0.54, depth * 0.5, width * 0.7, depth * 0.34, feetToMeters(20), 2.2, "wood", ["wreck-field", "hanging-platform", "standable", "high-ground", "terrain-program"]),
          box("wreck-mine-portal", 0, width * 0.86, 0, depth * 0.2, 6, feetToMeters(12), 4, "darkStone", ["wreck-field", "mine-entrance", "portal", "terrain-program"]),
          box("wreck-freight-tunnel", 3, width * 0.72, -feetToMeters(10), depth * 0.22, 15, FLOOR_SLAB_METERS, 5, "darkStone", ["wreck-field", "underground-freight", "underground", "floor", "standable", "terrain-program"]),
        );
        for (let support = 0; support < 5; support += 1) scene.primitives.push(cylinder(`airship-keel-support-${support}`, 0, width * (0.2 + support * 0.13), 0, depth * (0.38 + support * 0.05), 0.6, beamY, "metal", ["wreck-field", "support", "airship-wreck", "terrain-program"]));
      }
    },
  };
}
