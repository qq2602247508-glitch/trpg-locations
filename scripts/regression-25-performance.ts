import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { generateScene } from "../src/generators";
import { auditPerformance } from "../src/validation/performance";
import type { GenerationRequest, SceneKind } from "../src/schema";

const cases: Array<{ label: string; kind: SceneKind; prompt: string }> = [
  { label: "settlement-harbor", kind: "settlement", prompt: "深水城港区，有仓库、鱼市、码头和巡逻路线" },
  { label: "settlement-village", kind: "settlement", prompt: "河桥边境村庄，有酒馆、铁匠铺、神殿和木墙" },
  { label: "wilderness-forest", kind: "wilderness", prompt: "茂密古老森林，有溪流、倒木和树冠平台" },
  { label: "wilderness-rift", kind: "wilderness", prompt: "冰川巨大裂隙两侧，有冰桥、升降货梯和矿道" },
  { label: "cave-crystal", kind: "cave", prompt: "幽暗洞窟，有水晶桥、地下湖和分支洞室" },
  { label: "cave-mine", kind: "cave", prompt: "废弃矿洞，有矿车巷道、竖井和坍塌区" },
  { label: "sewer-tidal", kind: "sewer", prompt: "潮汐下水道，有主渠、支渠、闸门和巡逻路线" },
  { label: "sewer-industrial", kind: "sewer", prompt: "工业排水隧道，有泵房、维护道和危险泄漏区" },
  { label: "building-church", kind: "building", prompt: "有中轴圣所、钟楼、侧翼和地下墓室的教堂" },
  { label: "building-workshop", kind: "building", prompt: "带熔炉、作业跨、上层猫道和仓储间的工坊" },
  { label: "adaptive-forest", kind: "adaptive", prompt: "森林村庄，有木屋、林间小径和溪桥" },
  { label: "adaptive-tower", kind: "adaptive", prompt: "塔楼城市，有三层环形平台、吊桥和塔顶神殿" },
];

const rows: Array<Record<string, string | number>> = [];
for (const item of cases) {
  for (const size of ["medium", "large"] as const) {
    for (const density of [0.35, 0.82] as const) {
      const request: GenerationRequest = {
        prompt: item.prompt,
        seed: `regression-25-${item.label}-${size}-${density}`,
        size,
        density,
      };
      const started = performance.now();
      const scene = generateScene(request, item.kind);
      const generationMs = performance.now() - started;
      const audit = auditPerformance(scene, request);
      rows.push({
        label: item.label,
        kind: item.kind,
        size,
        density,
        seed: request.seed,
        bounds: `${scene.boundsCells.x}x${scene.boundsCells.z}`,
        areaCells: audit.areaCells,
        primitives: scene.primitives.length,
        primitiveDensity: Number(audit.primitiveDensity.toFixed(4)),
        semanticYield: Number(audit.semanticYield.toFixed(4)),
        rooms: scene.rooms.length,
        routes: scene.routes.length,
        tactical: scene.tactical.length,
        quality: audit.qualityScore,
        generationMs: Number(generationMs.toFixed(2)),
        valid: scene.diagnostics.valid ? "PASS" : "FAIL",
      });
    }
  }
}

const ordered = [...rows].sort((a, b) => Number(a.quality) - Number(b.quality));
const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-25";
mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/node-matrix.json`, JSON.stringify({ rows, worst: ordered.slice(0, 5), best: ordered.slice(-5).reverse() }, null, 2));
const headers = ["label", "kind", "size", "density", "bounds", "primitives", "areaCells", "primitiveDensity", "semanticYield", "rooms", "routes", "tactical", "quality", "generationMs", "valid"];
const markdown = [
  "# Regression 25 performance matrix",
  "",
  "Node generation time is measured for evidence only; it is not part of deterministic scene content or score.",
  "",
  `Cases: ${rows.length} (${cases.length} themes × 2 sizes × 2 densities).`,
  "",
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${headers.map((header) => row[header]).join(" | ")} |`),
  "",
  "## Worst five",
  "",
  ...ordered.slice(0, 5).map((row) => `- ${row.label} / ${row.size} / ${row.density}: quality ${row.quality}, ${row.primitives} primitives, density ${row.primitiveDensity}, yield ${row.semanticYield}`),
  "",
  "## Best five",
  "",
  ...ordered.slice(-5).reverse().map((row) => `- ${row.label} / ${row.size} / ${row.density}: quality ${row.quality}, ${row.primitives} primitives, density ${row.primitiveDensity}, yield ${row.semanticYield}`),
].join("\n");
writeFileSync(`${outputDir}/node-matrix.md`, markdown);
console.log(JSON.stringify({ count: rows.length, worst: ordered.slice(0, 3), best: ordered.slice(-3).reverse() }, null, 2));
