import { mkdirSync, writeFileSync } from "node:fs";
import { generateScene } from "../src/generators";
import type { GenerationRequest, SceneKind } from "../src/schema";

const kinds: readonly Exclude<SceneKind, "adaptive" | "dungeon">[] = [
  "tavern",
  "tower",
  "sewer",
  "cave",
  "building",
  "settlement",
  "wilderness",
];
const sizes: readonly GenerationRequest["size"][] = ["small", "medium", "large"];
const densities = [0.28, 0.62, 0.94] as const;
const prompts: Record<typeof kinds[number], string> = {
  tavern: "河港酒馆，有后厨、客房、密道和二层伏击点",
  tower: "多层塔楼，有环形平台、楼梯、地下温室和屋顶神殿",
  sewer: "工业下水道，有主渠、支渠、泵房、闸门和竖井",
  cave: "废弃矿洞，有矿车巷道、地下湖、竖井和坍塌区",
  building: "带熔炉、作业跨、上层猫道、仓储间和地下室的工坊",
  settlement: "河桥边境村庄，有酒馆、铁匠铺、神殿和木墙",
  wilderness: "冰川森林交界，有冰裂隙、溪流、倒木和树冠平台",
};

type Row = {
  kind: string;
  size: string;
  density: number;
  seed: string;
  valid: boolean;
  warnings: string[];
  connectorCount: number;
  connectorClearanceErrorCount: number;
  geometryErrorCount: number;
  primitiveCount: number;
};

const rows: Row[] = [];
for (const kind of kinds) {
  for (const size of sizes) {
    for (let seedIndex = 0; seedIndex < 3; seedIndex += 1) {
      const density = densities[seedIndex] as number;
      const seed = `regression-27-${kind}-${size}-seed-${seedIndex + 1}`;
      const request: GenerationRequest = {
        prompt: prompts[kind],
        seed,
        size,
        density,
      };
      const scene = generateScene(request, kind);
      rows.push({
        kind,
        size,
        density,
        seed,
        valid: scene.diagnostics.valid,
        warnings: scene.diagnostics.warnings,
        connectorCount: scene.diagnostics.metrics.connectorCount ?? 0,
        connectorClearanceErrorCount: scene.diagnostics.metrics.connectorClearanceErrorCount ?? 0,
        geometryErrorCount: scene.diagnostics.metrics.geometryErrorCount ?? 0,
        primitiveCount: scene.primitives.length,
      });
    }
  }
}

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-27";
mkdirSync(outputDir, { recursive: true });
const summary = {
  sampleCount: rows.length,
  expectedSampleCount: kinds.length * sizes.length * 3,
  kindCount: kinds.length,
  kinds,
  sizeCount: sizes.length,
  sizes,
  seedCountPerKindAndSize: 3,
  connectorCount: rows.reduce((sum, row) => sum + row.connectorCount, 0),
  clearanceErrorCount: rows.reduce((sum, row) => sum + row.connectorClearanceErrorCount, 0),
  geometryErrorCount: rows.reduce((sum, row) => sum + row.geometryErrorCount, 0),
  invalidRows: rows.filter((row) => !row.valid).length,
  rows,
};
writeFileSync(`${outputDir}/matrix-audit.json`, JSON.stringify(summary, null, 2));
if (summary.sampleCount !== summary.expectedSampleCount || summary.invalidRows > 0 || summary.clearanceErrorCount > 0) {
  throw new Error(`Regression 27 matrix failed: ${JSON.stringify({
    sampleCount: summary.sampleCount,
    invalidRows: summary.invalidRows,
    clearanceErrorCount: summary.clearanceErrorCount,
  })}`);
}
console.log(JSON.stringify(summary, null, 2));
