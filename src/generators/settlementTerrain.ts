import type { SeededRandom } from "../core/random";
import type { GeneratedScene, MaterialKey } from "../schema";
import type { SiteProgram, TerrainProgramSummary } from "../site-program";
import { FLOOR_SLAB_METERS, box, corridor, createRoute, cylinder, feetToMeters, primitive, stairs, tacticalFeature, water } from "./shared";

export type TerrainSurface = "ground" | "rock" | "water" | "lava" | "void" | "platform";

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
  placementFor(index: number, total: number, requested: { x: number; z: number }, clearance?: number): { x: number; z: number; elevationFeet?: number } | undefined;
  render(scene: GeneratedScene): void;
}

const includesAny = (text: string, terms: readonly string[]): boolean => terms.some((term) => text.includes(term));

function terrainKind(program: SiteProgram, prompt: string): TerrainProgramSummary["kind"] {
  const text = prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  if (program.requiredFeatures.includes("tower-city") || includesAny(text, ["巨型塔楼结构", "巨塔城市", "tower city", "megastructure city"])) return "megastructure";
  if (program.requiredFeatures.includes("vertical-slum") || includesAny(text, ["桥墩之间", "垂直贫民", "bridge-pier settlement"])) return "bridge-megastructure";
  if (program.requiredFeatures.includes("coastal-cliff") || includesAny(text, ["海崖港镇", "分层海崖", "sea-cliff port", "cliff port"])) return "coastal-cliff";
  if (program.requiredFeatures.includes("bone-swamp-settlement") || includesAny(text, ["石化龙骨", "肋骨栈道", "dragonbone swamp", "fossil ribs"])) return "swamp-bone";
  if (program.requiredFeatures.includes("airship-wreck-settlement") || includesAny(text, ["坠毁飞艇", "飞艇残骸", "crashed airship", "airship wreck"])) return "wreck-field";
  if (program.requiredFeatures.includes("underdark-settlement") || includesAny(text, ["幽暗地域", "underdark", "地下聚落"])) return "underdark";
  if (program.requiredFeatures.includes("volcanic-settlement") || includesAny(text, ["火山口村", "火山聚落", "volcanic settlement", "caldera village"])) return "caldera";
  if (program.requiredFeatures.includes("impact-crater-settlement")) return "impact-crater";
  if (program.requiredFeatures.includes("water-city")) return "river";
  return program.terrain.kind;
}

function materialFor(cell: TerrainCell, kind: TerrainProgramSummary["kind"]): MaterialKey {
  if (cell.surface === "lava") return "hazard";
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

export function compileSettlementTerrain(program: SiteProgram, prompt: string, rng: SeededRandom): SettlementTerrain {
  const width = Math.max(12, Math.round(program.bounds.x));
  const depth = Math.max(12, Math.round(program.bounds.z));
  const kind = terrainKind(program, prompt);
  const phase = rng.float(-Math.PI, Math.PI);
  const craterCx = width * rng.float(0.46, 0.54);
  const craterCz = depth * rng.float(0.43, 0.55);
  const craterRadius = Math.min(width, depth) * rng.float(0.27, 0.34);
  const breachAngle = rng.float(-Math.PI, Math.PI);
  const breachAngles = [breachAngle, breachAngle + Math.PI * 0.72, breachAngle - Math.PI * 0.69];
  const ravineX = width * rng.float(0.46, 0.57);
  const megaCx = width / 2;
  const megaCz = depth / 2;
  const megaRadius = Math.min(width, depth) * 0.42;
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
      elevationFeet = downhill + (distance > activeHalfWidth + 3.2 ? 5 : 0);
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
      if (kind === "caldera" && outletDelta < 0.065 && radial < 1.45) {
        elevationFeet = radial < 0.3 ? -5 : radial < 0.75 ? 0 : 5;
        surface = "lava";
        buildable = false;
        standable = false;
        hazard = true;
      }
      if (radial > 0.7 && radial < 1.12 && !breach) buildable = Math.abs(radial - 0.83) < 0.07 || Math.abs(radial - 1.04) < 0.055;
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
      if (radial > megaRadius) {
        surface = "void"; buildable = false; standable = false;
      } else {
        elevationFeet = radial < megaRadius * 0.3 ? 60 : radial < megaRadius * 0.56 ? 40 : radial < megaRadius * 0.78 ? 20 : 0;
        surface = "platform";
        buildable = radial > megaRadius * 0.18;
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

  return {
    summary,
    elevationAt: (x, z) => feetToMeters(cellAt(x, z).elevationFeet),
    elevationFeetAt: (x, z) => cellAt(x, z).elevationFeet,
    buildableAt: clearanceBuildable,
    surfaceAt: (x, z) => cellAt(x, z).surface,
    placementFor(index, total, requested, clearance = 0) {
      if (kind === "megastructure") {
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
        scene.primitives.push(box(`terrain-field-${x}-${z}`, 0, x + 0.5, feetToMeters(bottomFeet), z + 0.5, 0.98, Math.max(FLOOR_SLAB_METERS, height), 0.98, materialFor(cell, kind), ["floor", "terrain", "terrain-program", `terrain:${kind}`, `elevation:${cell.elevationFeet}`, ...(kind === "impact-crater" && cell.elevationFeet >= 20 ? ["impact-crater", "crater-rim"] : []), ...(kind === "caldera" && cell.elevationFeet >= 20 ? ["caldera-rim"] : []), ...(cell.buildable ? ["buildable", "standable"] : []), ...(cell.hazard ? ["hazard"] : [])]));
        if (cell.surface === "water") {
          const mainDistance = Math.abs(x + 0.5 - warpedRiverX(z + 0.5, width, depth, phase));
          scene.primitives.push(water(`terrain-water-${x}-${z}`, 0, x + 0.5, feetToMeters(cell.elevationFeet + (kind === "river" ? 7.5 : 0.5)), z + 0.5, 0.98, 0.12, 0.98, kind === "river"
            ? ["terrain-program", "watercourse", "water-city", mainDistance < 3.4 ? "main-canal" : "branch-canal"]
            : kind === "underdark" ? ["terrain-program", "watercourse", "underdark", "underground-lake", "hazard"]
              : ["terrain-program", "coastal-cliff", "harbor-basin", "sea", "hazard"]));
        }
      }
      if (kind === "river") {
        const bridgeRows = [depth * 0.28, depth * 0.56, depth * 0.81];
        for (const [index, row] of bridgeRows.entries()) {
          const cx = warpedRiverX(row, width, depth, phase);
          const y = feetToMeters(cellAt(cx + 4, row).elevationFeet) + FLOOR_SLAB_METERS + 0.12;
          scene.primitives.push(corridor(`terrain-river-bridge-${index + 1}`, 0, cx - 5.2, row, cx + 5.2, row, y, index === 1 ? 2.5 : 1.7, index === 1 ? "stone" : "wood", ["bridge", "terrain-program", "standable", index === 1 ? "stone-bridge" : "wood-bridge"]));
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
            scene.primitives.push(corridor(`terrain-${side}-bank-${index}`, 0, from.x + offset, from.z, to.x + offset, to.z, feetToMeters(cellAt(mx, mz).elevationFeet) + FLOOR_SLAB_METERS + 0.04, 1.4, "stone", ["water-city", "bank-route", "quay", "standable", "terrain-program"]));
          }
        }
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
          scene.primitives.push(primitive(`cavern-wall-${index}`, "cone", 0, x, feetToMeters(-15), z, 4.2 * 1.524, feetToMeters(45 + index % 4 * 5), 4.2 * 1.524, "darkStone", ["underdark", "cavern-wall", "vertical-face", "terrain-program"]));
        }
        scene.primitives.push(
          primitive("underdark-lake-surface", "sphere", 0, width * 0.22, feetToMeters(-4.5), depth * 0.72, width * 0.27 * 1.524, 0.22, depth * 0.22 * 1.524, "water", ["terrain-program", "watercourse", "underdark", "underground-lake", "hazard"]),
          corridor("underdark-ravine-bridge-north", 0, ravineX - 4, depth * 0.3, ravineX + 4, depth * 0.3, feetToMeters(10) + FLOOR_SLAB_METERS, 1.8, "stone", ["underdark", "ravine-bridge", "bridge", "standable", "terrain-program"]),
          corridor("underdark-ravine-bridge-south", 0, ravineX - 4, depth * 0.72, ravineX + 4, depth * 0.72, feetToMeters(5) + FLOOR_SLAB_METERS, 1.5, "wood", ["underdark", "ravine-bridge", "bridge", "standable", "terrain-program"]),
        );
        for (let index = 0; index < 12; index += 1) {
          const x = width * (0.12 + ((index * 7) % 11) / 14);
          const z = depth * (0.14 + ((index * 5) % 9) / 12);
          if (cellAt(x, z).surface === "void") continue;
          scene.primitives.push(primitive(`settlement-fungus-${index}`, "cone", 0, x, feetToMeters(cellAt(x, z).elevationFeet), z, feetToMeters(1.2 + index % 3), feetToMeters(5 + index % 4), feetToMeters(1.2 + index % 3), index % 3 === 0 ? "warmLight" : "moss", ["underdark", "fungal-forest", "cover", "terrain-program"]));
        }
      }
      if (kind === "megastructure") {
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
