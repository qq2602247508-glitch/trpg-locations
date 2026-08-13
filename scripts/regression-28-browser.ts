import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-28";
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const networkFailures: string[] = [];
const consoleErrors: string[] = [];
page.on("requestfailed", (request) => networkFailures.push(`${request.method()} ${request.url()}`));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

const query = new URLSearchParams({
  kind: "tower",
  size: "medium",
  density: "0.72",
  seed: "regression-28-circular-wizard-roof",
  prompt: "三层法师塔，有圆形屋顶决斗平台、炼金室和地下储藏室",
});
await page.goto(`http://127.0.0.1:5241/?${query}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForFunction(() => Boolean(window.__TRPG_SCENE__?.diagnostics), { timeout: 90000 }).catch((error) => {
  throw new Error(`${error.message}; consoleErrors=${JSON.stringify(consoleErrors)}; networkFailures=${JSON.stringify(networkFailures)}`);
});
const scene = await page.evaluate(() => window.__TRPG_SCENE__);

const circularSurfaces = (scene?.primitives ?? []).filter((primitive) => (
  primitive.shape === "cylinder"
  && primitive.tags?.includes("standable")
));
if (circularSurfaces.length === 0) throw new Error("regression-28: expected a standable cylindrical platform");
const targetSurface = circularSurfaces.find((primitive) => primitive.id === "wizard-roof-duel-platform")
  ?? circularSurfaces[0];
if (!targetSurface) throw new Error("regression-28: no circular target surface");

await page.screenshot({ path: `${outputDir}/circular-platform-overview.png`, fullPage: true });
await page.locator('[data-role="floor"]').selectOption(String(targetSurface.level));
await page.locator('[data-role="top-camera-toggle"]').click();
await page.locator("canvas").hover({ position: { x: 560, y: 360 } });
await page.mouse.wheel(0, -2600);
await page.waitForTimeout(500);
await page.screenshot({ path: `${outputDir}/circular-platform-grid-close.png`, fullPage: true });

const report = {
  case: {
    kind: "tower",
    size: "medium",
    density: 0.72,
    seed: "regression-28-circular-wizard-roof",
    prompt: "三层法师塔，有圆形屋顶决斗平台、炼金室和地下储藏室",
  },
  sceneValid: scene?.diagnostics?.valid === true,
  geometryErrors: scene?.diagnostics?.metrics?.geometryErrorCount ?? -1,
  warnings: scene?.diagnostics?.warnings ?? [],
  circularSurfaceCount: circularSurfaces.length,
  circularSurfaceIds: circularSurfaces.map((primitive) => primitive.id),
  targetSurface: {
    id: targetSurface.id,
    level: targetSurface.level,
    position: targetSurface.position,
    size: targetSurface.size,
  },
  snapshots: [
    `${outputDir}/circular-platform-overview.png`,
    `${outputDir}/circular-platform-grid-close.png`,
  ],
  networkFailures,
  consoleErrors,
};
writeFileSync(`${outputDir}/browser-audit.json`, JSON.stringify(report, null, 2));
await browser.close();

if (!report.sceneValid || report.geometryErrors !== 0 || networkFailures.length > 0 || consoleErrors.length > 0) {
  throw new Error(`Regression 28 browser audit failed: ${JSON.stringify(report, null, 2)}`);
}
console.log(JSON.stringify(report, null, 2));
