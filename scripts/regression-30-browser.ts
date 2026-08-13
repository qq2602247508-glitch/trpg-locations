import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

type ForestVillageCase = {
  id: string;
  size: "small" | "medium" | "large";
  density: number;
  seed: string;
};

const cases: readonly ForestVillageCase[] = [
  { id: "forest-village-small", size: "small", density: 0.28, seed: "regression-30-forest-village-a" },
  { id: "forest-village-medium", size: "medium", density: 0.62, seed: "regression-30-forest-village-b" },
  { id: "forest-village-large-dense", size: "large", density: 0.94, seed: "regression-30-forest-village-c" },
  { id: "forest-village-large-seed-variant", size: "large", density: 0.62, seed: "regression-30-forest-village-d" },
];

const prompt = "森林村庄";
const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-30";
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
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
    kind: "adaptive",
    size: entry.size,
    density: String(entry.density),
    seed: entry.seed,
    prompt,
  });
  await page.goto(`http://127.0.0.1:5241/?${query}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__TRPG_SCENE__?.diagnostics), { timeout: 90000 });
  const scene = await page.evaluate(() => window.__TRPG_SCENE__);
  const tags = new Set((scene?.primitives ?? []).flatMap((primitive) => primitive.tags ?? []));
  const semantic = {
    domain: scene?.sceneProgram?.domain,
    terrainKind: scene?.terrainProgram?.kind ?? scene?.siteProgram?.terrainKind,
    siteType: scene?.siteProgram?.siteType,
    forestTagged: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("forest")).length,
    terrainTagged: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("terrain")).length,
    buildings: scene?.buildingInstances?.length ?? 0,
    rooms: scene?.rooms?.length ?? 0,
    routes: scene?.routes?.length ?? 0,
    primaryRoutes: (scene?.routes ?? []).filter((route) => route.kind === "primary").length,
    alternateRoutes: (scene?.routes ?? []).filter((route) => route.kind === "alternate").length,
    treeTrunks: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("tree-trunk")).length,
    treeCanopies: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("tree-canopy")).length,
    canopyPlatforms: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("canopy-platform")).length,
    bridges: (scene?.primitives ?? []).filter((primitive) => primitive.tags?.includes("bridge") || primitive.tags?.includes("wood-bridge")).length,
    tags: [...tags].filter((tag) => ["forest", "stream", "stream-crossing", "wood-bridge", "canopy-platform", "settlement-building"].includes(tag)),
  };

  if (scene?.diagnostics?.valid !== true) throw new Error(`${entry.id}: scene invalid`);
  if (semantic.domain !== "settlement") throw new Error(`${entry.id}: expected settlement domain`);
  if (semantic.terrainKind !== "forest-clearing") throw new Error(`${entry.id}: expected forest-clearing parent terrain`);
  if (semantic.siteType !== "village") throw new Error(`${entry.id}: expected village site`);
  if (semantic.forestTagged <= 0 || semantic.terrainTagged <= 0 || semantic.buildings <= 0 || semantic.rooms <= 0) {
    throw new Error(`${entry.id}: missing forest/terrain/settlement semantic atoms`);
  }
  if (semantic.primaryRoutes <= 0 || semantic.alternateRoutes <= 0 || semantic.treeTrunks <= 0 || semantic.treeCanopies <= 0 || semantic.canopyPlatforms <= 0 || semantic.bridges <= 0) {
    throw new Error(`${entry.id}: missing tactical/vertical/vegetation atoms`);
  }
  if (!tags.has("stream") || !tags.has("wood-bridge") || !tags.has("stream-crossing")) {
    throw new Error(`${entry.id}: missing stream crossing evidence`);
  }

  const snapshots = [`${entry.id}-overview.png`];
  await page.screenshot({ path: `${outputDir}/${entry.id}-overview.png`, fullPage: true });
  await page.locator('[data-role="camera-toggle"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-low-angle.png`, fullPage: true });
  snapshots.push(`${entry.id}-low-angle.png`);
  await page.locator('[data-role="transparency-toggle"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-grid-close.png`, fullPage: true });
  snapshots.push(`${entry.id}-grid-close.png`);

  const buildingSelect = page.locator('[data-role="building-focus"]');
  let focusedSnapshot: string | undefined;
  if (await buildingSelect.count()) {
    const options = await buildingSelect.locator("option").evaluateAll((items) => items.map((item) => ({
      value: (item as HTMLOptionElement).value,
      label: item.textContent ?? "",
    })).filter((item) => item.value));
    const selected = options[0];
    if (selected) {
      await buildingSelect.selectOption(selected.value);
      await page.locator('[data-role="building-focus-button"]').click();
      await page.waitForTimeout(350);
      focusedSnapshot = `${entry.id}-focused-building.png`;
      await page.screenshot({ path: `${outputDir}/${focusedSnapshot}`, fullPage: true });
      snapshots.push(focusedSnapshot);
    }
  }

  report.push({
    ...entry,
    prompt,
    sceneValid: scene?.diagnostics?.valid,
    geometryErrors: scene?.diagnostics?.metrics?.geometryErrorCount ?? -1,
    warnings: scene?.diagnostics?.warnings ?? [],
    semantic,
    snapshots,
    networkFailures,
    consoleErrors,
    generationMs: scene?.generationMs,
  });
  await page.close();
}
await browser.close();

const macroSignatures = report.map((row) => JSON.stringify({
  size: row.size,
  density: row.density,
  seed: row.seed,
  semantic: (row.semantic as Record<string, unknown>).terrainTagged,
  buildings: (row.semantic as Record<string, unknown>).buildings,
  rooms: (row.semantic as Record<string, unknown>).rooms,
  routes: (row.semantic as Record<string, unknown>).routes,
}));
if (new Set(macroSignatures).size < 3) throw new Error("Regression 30: forest village cases collapsed to one macro signature");

const audit = { regression: 30, prompt, cases: report };
writeFileSync(`${outputDir}/browser-audit.json`, JSON.stringify(audit, null, 2));
const failures = report.filter((row) => (
  row.sceneValid !== true
  || row.geometryErrors !== 0
  || (row.warnings as string[]).length > 0
  || (row.networkFailures as string[]).length > 0
  || (row.consoleErrors as string[]).length > 0
));
if (failures.length > 0) throw new Error(`Regression 30 browser audit failed: ${JSON.stringify(failures, null, 2)}`);
console.log(JSON.stringify(audit, null, 2));
