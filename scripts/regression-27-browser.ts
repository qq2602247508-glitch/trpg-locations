import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

type BrowserCase = {
  id: string;
  kind: string;
  size: "medium" | "large";
  density: number;
  seed: string;
  prompt: string;
  focusModule?: "submerged-room" | "greenhouse" | "archive";
};

const cases: readonly BrowserCase[] = [
  {
    id: "submerged-clinic",
    kind: "adaptive",
    size: "medium",
    density: 0.84,
    seed: "round-88-peat-telegraph-clinic-a",
    prompt: "酸雾泥炭湿地里的旧电报诊疗站，有治疗室、发报室、半淹药品库、架高木栈道和观察塔。",
    focusModule: "submerged-room",
  },
  {
    id: "underground-greenhouse",
    kind: "adaptive",
    size: "large",
    density: 0.78,
    seed: "regression-27-browser-greenhouse",
    prompt: "建在火山灰峡谷边缘的炼金采矿营地，有试金实验室、矿物档案库、冷凝塔、地下菌类温室和熔岩上方维护桥",
    focusModule: "greenhouse",
  },
  {
    id: "archive-station",
    kind: "adaptive",
    size: "medium",
    density: 0.7,
    seed: "unknown-field-station",
    prompt: "高山冻土湿地上的无线电研究站，有样本实验室、通信塔、发电机棚、架高栈道和地下样本库",
    focusModule: "archive",
  },
  {
    id: "forest",
    kind: "wilderness",
    size: "large",
    density: 0.35,
    seed: "regression-27-browser-forest",
    prompt: "茂密古老森林，有溪流、倒木、树冠平台和高低林地",
  },
];

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-27";
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
  await page.screenshot({ path: `${outputDir}/${entry.id}-overview.png`, fullPage: true });
  snapshots.push(`${entry.id}-overview.png`);

  const lowCamera = page.locator('[data-role="camera-toggle"]');
  await lowCamera.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-low.png`, fullPage: true });
  snapshots.push(`${entry.id}-low.png`);

  const supportView = page.locator('[data-role="transparency-toggle"]');
  await supportView.click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${entry.id}-low-support.png`, fullPage: true });
  snapshots.push(`${entry.id}-low-support.png`);

  if (entry.focusModule) {
    const targetBuildingId = await page.evaluate((moduleKind) => (
      window.__TRPG_SCENE__?.buildingInstances?.find((building) => (
        building.functionalModules?.some((module) => module.kind === moduleKind)
      ))?.id
    ), entry.focusModule);
    if (!targetBuildingId) {
      throw new Error(`${entry.id}: no building owns functional module ${entry.focusModule}`);
    }
    await page.locator('[data-role="building-focus"]').selectOption(targetBuildingId);
    await page.locator('[data-role="building-focus-button"]').click();
    await page.waitForTimeout(450);
    const basementOption = await page.locator('[data-role="floor"] option').evaluateAll((options) => (
      options.find((option) => /\bB\d+\b/u.test(option.textContent ?? ""))?.value
    ));
    if (!basementOption) {
      throw new Error(`${entry.id}: target building has no basement floor option`);
    }
    await page.locator('[data-role="floor"]').selectOption(basementOption);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${outputDir}/${entry.id}-focused-basement.png`, fullPage: true });
    snapshots.push(`${entry.id}-focused-basement.png`);
  }

  const diagnostics = scene?.diagnostics;
  const row = {
    ...entry,
    sceneValid: diagnostics?.valid,
    geometryErrors: diagnostics?.metrics?.geometryErrorCount ?? -1,
    connectorCount: diagnostics?.metrics?.connectorCount ?? -1,
    connectorClearanceErrorCount: diagnostics?.metrics?.connectorClearanceErrorCount ?? -1,
    primitives: scene?.primitives?.length ?? 0,
    snapshots,
    networkFailures,
    consoleErrors,
  };
  if ((row.connectorCount as number) <= 0) {
    throw new Error(`${entry.id}: browser connector audit requires at least one connector`);
  }
  report.push(row);
  await page.close();
}
await browser.close();
writeFileSync(`${outputDir}/browser-audit.json`, JSON.stringify({ cases: report }, null, 2));

const failures = report.filter((row) => (
  row.sceneValid !== true
  || row.geometryErrors !== 0
  || row.connectorClearanceErrorCount !== 0
  || (row.networkFailures as string[]).length > 0
  || (row.consoleErrors as string[]).length > 0
));
if (failures.length > 0) {
  throw new Error(`Regression 27 browser audit failed: ${JSON.stringify(failures, null, 2)}`);
}
console.log(JSON.stringify({ caseCount: report.length, failures: 0, report }, null, 2));
