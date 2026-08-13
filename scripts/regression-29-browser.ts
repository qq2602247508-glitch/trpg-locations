import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

type BrowserCase = {
  id: string;
  kind: "adaptive";
  size: "medium" | "large";
  density: number;
  seed: string;
  prompt: string;
};

const cases: readonly BrowserCase[] = [
  {
    id: "forest-low-angle",
    kind: "adaptive",
    size: "large",
    density: 0.78,
    seed: "regression-29-browser-pure-forest",
    prompt: "茂密古老森林，有溪流、倒木、树冠平台和高低林地",
  },
  {
    id: "mangrove-village-low-angle",
    kind: "adaptive",
    size: "medium",
    density: 0.62,
    seed: "regression-29-browser-mangrove-village",
    prompt: "隐藏在红树林沼泽中的走私港村，有蜿蜒水道、树根栈道、吊脚仓库、伪装酒馆、沉船码头、巡逻塔和水下秘密入口",
  },
];

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-29";
mkdirSync(outputDir, { recursive: true });
const executablePath = "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const report: Array<Record<string, unknown>> = [];

for (const entry of cases) {
  const page = await context.newPage();
  const networkFailures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (request) => networkFailures.push(`${request.method()} ${request.url()}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  const query = new URLSearchParams({
    kind: entry.kind,
    size: entry.size,
    density: String(entry.density),
    seed: entry.seed,
    prompt: entry.prompt,
  });
  await page.goto(`http://127.0.0.1:5241/?${query}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__TRPG_SCENE__?.diagnostics), { timeout: 90000 });
  const scene = await page.evaluate(() => window.__TRPG_SCENE__);
  const snapshots: string[] = [];
  const vegetation = await page.evaluate(() => {
    const scene = window.__TRPG_SCENE__;
    const trunks = (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("tree-trunk"));
    const canopies = (scene?.primitives ?? []).filter((primitive) => (
      primitive.tags?.includes("tree-canopy") && primitive.tags?.includes("canopy-layer")
    ));
    return {
      trunkCount: trunks.length,
      canopyCount: canopies.length,
      trunkIds: trunks.slice(0, 12).map((primitive) => primitive.id),
      canopyIds: canopies.slice(0, 12).map((primitive) => primitive.id),
    };
  });

  await page.screenshot({ path: `${outputDir}/${entry.id}-overview.png`, fullPage: true });
  snapshots.push(`${entry.id}-overview.png`);
  await page.locator('[data-role="camera-toggle"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-low-angle-trunk-base.png`, fullPage: true });
  snapshots.push(`${entry.id}-low-angle-trunk-base.png`);
  await page.locator('[data-role="transparency-toggle"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-low-angle-contact-emphasis.png`, fullPage: true });
  snapshots.push(`${entry.id}-low-angle-contact-emphasis.png`);

  const diagnostics = scene?.diagnostics;
  const row = {
    ...entry,
    sceneValid: diagnostics?.valid,
    geometryErrors: diagnostics?.metrics?.geometryErrorCount ?? -1,
    trunksChecked: diagnostics?.metrics?.vegetationTrunksChecked ?? 0,
    anchoredCanopyGroups: diagnostics?.metrics?.vegetationCanopyGroupsChecked ?? 0,
    groundedContactErrors: diagnostics?.metrics?.vegetationGroundContactErrorCount ?? -1,
    detachedCanopyErrors: diagnostics?.metrics?.vegetationDetachedCanopyErrorCount ?? -1,
    visibleVegetation: vegetation,
    snapshots,
    networkFailures,
    consoleErrors,
  };
  if (row.trunksChecked <= 0 || row.anchoredCanopyGroups <= 0) {
    throw new Error(`${entry.id}: browser audit requires nonzero audited vegetation counts`);
  }
  report.push(row);
  await page.close();
}
await browser.close();
const audit = { regression: 29, cases: report };
writeFileSync(`${outputDir}/browser-audit.json`, JSON.stringify(audit, null, 2));
const failures = report.filter((row) => (
  row.sceneValid !== true
  || row.geometryErrors !== 0
  || row.groundedContactErrors !== 0
  || row.detachedCanopyErrors !== 0
  || (row.networkFailures as string[]).length > 0
  || (row.consoleErrors as string[]).length > 0
));
if (failures.length > 0) throw new Error(`Regression 29 browser audit failed: ${JSON.stringify(failures, null, 2)}`);
console.log(JSON.stringify(audit, null, 2));
