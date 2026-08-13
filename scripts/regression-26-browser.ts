import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-26";
mkdirSync(outputDir, { recursive: true });

type BrowserCase = {
  label: string;
  kind: string;
  prompt: string;
  seed: string;
  forceLocalModel?: boolean;
};

const cases: BrowserCase[] = [
  { label: "ordinary-rules", kind: "building", prompt: "带熔炉、作业跨、上层猫道和仓储间的工坊", seed: "regression-26-ordinary" },
  { label: "forced-ollama", kind: "adaptive", prompt: "一个陌生的地下研究设施，有实验室、逃生路线和秘密档案室", seed: "regression-26-forced", forceLocalModel: true },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const report: unknown[] = [];
for (const entry of cases) {
  const page = await context.newPage();
  const networkFailures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (request) => networkFailures.push(`${request.method()} ${request.url()}`));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const query = new URLSearchParams({
    kind: entry.kind,
    size: "medium",
    density: "0.6",
    seed: entry.seed,
    prompt: entry.prompt,
  });
  if (entry.forceLocalModel) query.set("forceLocalModel", "true");
  await page.goto(`http://127.0.0.1:5241/?${query}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__TRPG_SCENE__?.diagnostics?.valid === true, { timeout: 90000 });
  const scene = await page.evaluate(() => window.__TRPG_SCENE__);
  const statusDetail = await page.locator('[data-role="status-detail"]').textContent();
  const screenshot = `${outputDir}/${entry.label}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const timing = scene?.timing;
  if (!timing || scene.generationMs !== timing.totalMs || timing.totalMs < timing.planningMs + timing.geometryMs) {
    throw new Error(`${entry.label}: invalid timing contract ${JSON.stringify({ generationMs: scene?.generationMs, timing })}`);
  }
  const expectedTransportMs = Math.max(0, timing.totalMs - timing.planningMs - timing.geometryMs);
  if (Math.abs((timing.transportMs ?? 0) - expectedTransportMs) > 0.25) {
    throw new Error(`${entry.label}: transport residual mismatch ${JSON.stringify({ timing, expectedTransportMs })}`);
  }
  if (entry.forceLocalModel && !scene.semantic?.status?.startsWith("ollama-")) {
    throw new Error(`${entry.label}: forced model status missing`);
  }
  report.push({
    ...entry,
    sceneValid: scene.diagnostics.valid,
    primitives: scene.primitives.length,
    generationMs: scene.generationMs,
    timing,
    semantic: scene.semantic,
    planningSource: scene.sceneProgram?.source ?? scene.semantic?.source,
    statusDetail,
    screenshot,
    networkFailures,
    consoleErrors,
  });
  await page.close();
}
await browser.close();
writeFileSync(`${outputDir}/browser-runtime.json`, JSON.stringify({ cases: report }, null, 2));
