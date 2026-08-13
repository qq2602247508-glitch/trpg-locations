import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Row = {
  label: string;
  kind: string;
  size: string;
  density: number;
  seed: string;
};

const rows = JSON.parse(readFileSync("artifacts/visual-audit/big-perfect-round-01/regression-25/node-matrix.json", "utf8")).rows as Row[];
const prompts = {
  "settlement-harbor": "深水城港区，有仓库、鱼市、码头和巡逻路线",
  "settlement-village": "河桥边境村庄，有酒馆、铁匠铺、神殿和木墙",
  "wilderness-forest": "茂密古老森林，有溪流、倒木和树冠平台",
  "wilderness-rift": "冰川巨大裂隙两侧，有冰桥、升降货梯和矿道",
  "cave-crystal": "幽暗洞窟，有水晶桥、地下湖和分支洞室",
  "cave-mine": "废弃矿洞，有矿车巷道、竖井和坍塌区",
  "sewer-tidal": "潮汐下水道，有主渠、支渠、闸门和巡逻路线",
  "sewer-industrial": "工业排水隧道，有泵房、维护道和危险泄漏区",
  "building-church": "有中轴圣所、钟楼、侧翼和地下墓室的教堂",
  "building-workshop": "带熔炉、作业跨、上层猫道和仓储间的工坊",
  "adaptive-forest": "森林村庄，有木屋、林间小径和溪桥",
  "adaptive-tower": "塔楼城市，有三层环形平台、吊桥和塔顶神殿",
} as Record<string, string>;
const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-25";
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const failures: string[] = [];
const chosen = rows.filter((row) => (
  (row.label === "wilderness-forest" && row.size === "large" && row.density === 0.35)
  || (row.label === "adaptive-forest" && row.size === "medium" && row.density === 0.82)
  || (row.label === "adaptive-tower" && row.size === "large" && row.density === 0.35)
  || (row.label === "building-workshop" && row.size === "large" && row.density === 0.82)
));
const report = [];
for (const row of chosen) {
  const id = `${row.label}-${row.size}-${String(row.density).replace(".", "")}`;
  const url = `http://127.0.0.1:5241/?kind=${encodeURIComponent(row.kind)}&size=${row.size}&density=${row.density}&seed=${encodeURIComponent(row.seed)}&prompt=${encodeURIComponent(prompts[row.label])}`;
  const networkFailures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (request) => networkFailures.push(`${request.method()} ${request.url()}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__TRPG_SCENE__?.diagnostics?.valid === true, { timeout: 60000 });
  const scene = await page.evaluate(() => window.__TRPG_SCENE__);
  await page.screenshot({ path: `${outputDir}/${id}-overview.png`, fullPage: true });
  const lowCamera = page.locator("button").filter({ hasText: "低角度体量" });
  if (await lowCamera.count()) {
    await lowCamera.click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `${outputDir}/${id}-low-angle.png`, fullPage: true });
  await page.locator("canvas").hover();
  await page.mouse.wheel(0, -2200);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}/${id}-grid-close.png`, fullPage: true });
  report.push({ ...row, sceneValid: scene?.diagnostics?.valid, primitives: scene?.primitives?.length, generationMs: scene?.generationMs, networkFailures, consoleErrors });
}
await browser.close();
writeFileSync(`${outputDir}/browser-runtime.json`, JSON.stringify({ cases: report, failures }, null, 2));
