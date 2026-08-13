import { mkdirSync, writeFileSync } from "node:fs";
import { generateScene } from "../src/generators/index.ts";

type CaseFamily = "pure-forest" | "short-forest-settlement" | "mangrove-swamp" | "woodland-facility";
type Size = "small" | "medium" | "large";

const cases: readonly { family: CaseFamily; kind: "adaptive"; prompt: string }[] = [
  { family: "pure-forest", kind: "adaptive", prompt: "茂密古老森林，有溪流、倒木、树冠平台和高低林地" },
  { family: "short-forest-settlement", kind: "adaptive", prompt: "森林边缘短小聚落，有木屋、林间道路、林冠平台和根桥" },
  { family: "mangrove-swamp", kind: "adaptive", prompt: "红树林走私港村，有潮汐水道、架高木栈道、船坞和树根" },
  { family: "woodland-facility", kind: "adaptive", prompt: "林地中的无线电研究站，有实验室、通信塔、发电机棚、架高栈道和地下样本库" },
];
const sizes: readonly Size[] = ["small", "medium", "large"];
const densities = [0.28, 0.62, 0.94] as const;

const rows = cases.flatMap((entry) => sizes.map((size, index) => {
  const density = densities[index] as number;
  const seed = `regression-29-${entry.family}-${size}-seed-${index + 1}`;
  const scene = generateScene({
    prompt: entry.prompt,
    seed,
    size,
    density,
  }, entry.kind);
  const metrics = scene.diagnostics.metrics;
  return {
    family: entry.family,
    kind: entry.kind,
    prompt: entry.prompt,
    size,
    density,
    seed,
    valid: scene.diagnostics.valid,
    warnings: scene.diagnostics.warnings,
    trunksChecked: metrics.vegetationTrunksChecked ?? 0,
    anchoredCanopyGroups: metrics.vegetationCanopyGroupsChecked ?? 0,
    groundedContactErrors: metrics.vegetationGroundContactErrorCount ?? 0,
    detachedCanopyErrors: metrics.vegetationDetachedCanopyErrorCount ?? 0,
    geometryErrors: metrics.geometryErrorCount ?? 0,
    invalidRows: scene.diagnostics.valid ? 0 : 1,
    primitiveCount: scene.primitives.length,
  };
}));

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-29";
mkdirSync(outputDir, { recursive: true });
const summary = {
  regression: 29,
  contract: {
    trustedVegetation: "tree-trunk unless explicitly magical-floating/levitating/floating-island/decorative",
    trustedContactSurface: "non-water primitive tagged terrain/floor/support-surface/standable",
    canopyAttachment: "tree-canopy + canopy-layer must spatially overlap a trunk; tree-anchor:* must match when present",
    decorativeCanopyExemption: "canopy-only blobs without tree-canopy + canopy-layer, or explicitly floating vegetation, are excluded",
  },
  sampleCount: rows.length,
  expectedSampleCount: cases.length * sizes.length,
  familyCount: cases.length,
  seedCountPerFamily: sizes.length,
  trunksChecked: rows.reduce((sum, row) => sum + row.trunksChecked, 0),
  anchoredCanopyGroups: rows.reduce((sum, row) => sum + row.anchoredCanopyGroups, 0),
  groundedContactErrors: rows.reduce((sum, row) => sum + row.groundedContactErrors, 0),
  detachedCanopyErrors: rows.reduce((sum, row) => sum + row.detachedCanopyErrors, 0),
  geometryErrors: rows.reduce((sum, row) => sum + row.geometryErrors, 0),
  invalidRows: rows.reduce((sum, row) => sum + row.invalidRows, 0),
  rows,
};
writeFileSync(`${outputDir}/matrix-audit.json`, JSON.stringify(summary, null, 2));
if (
  summary.sampleCount !== summary.expectedSampleCount
  || summary.invalidRows > 0
  || summary.geometryErrors > 0
  || summary.groundedContactErrors > 0
  || summary.detachedCanopyErrors > 0
  || summary.trunksChecked === 0
  || summary.anchoredCanopyGroups === 0
) {
  throw new Error(`Regression 29 matrix failed: ${JSON.stringify({
    sampleCount: summary.sampleCount,
    invalidRows: summary.invalidRows,
    geometryErrors: summary.geometryErrors,
    groundedContactErrors: summary.groundedContactErrors,
    detachedCanopyErrors: summary.detachedCanopyErrors,
    trunksChecked: summary.trunksChecked,
    anchoredCanopyGroups: summary.anchoredCanopyGroups,
  })}`);
}
console.log(JSON.stringify(summary, null, 2));
