import { chromium } from "/Users/inagi/codex/130 游戏/135-跑团助手 dnd/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

type BrowserCase = {
  id: string;
  size: "medium" | "large";
  density: number;
  seed: string;
  prompt: string;
  expected: {
    domain?: string;
    terrainKind?: string;
    siteType?: string;
    roomIds: string[];
    tags: string[];
    minimums: Record<string, number>;
  };
};

const outputDir = "artifacts/visual-audit/big-perfect-round-01/regression-32";
mkdirSync(outputDir, { recursive: true });

const cases: readonly BrowserCase[] = [
  {
    id: "forest-village-medium",
    size: "medium",
    density: 0.62,
    seed: "regression-32-forest-village-medium",
    prompt: "森林村庄",
    expected: {
      domain: "settlement",
      terrainKind: "forest-clearing",
      siteType: "village",
      roomIds: [],
      tags: ["forest", "stream", "stream-crossing", "wood-bridge", "canopy-platform"],
      minimums: { forest: 1, terrain: 1, "tree-trunk": 1, "tree-canopy": 1, "canopy-platform": 1, bridge: 1, building: 1, room: 1, primaryRoute: 1, alternateRoute: 1 },
    },
  },
  {
    id: "forest-village-large-seed-variant",
    size: "large",
    density: 0.62,
    seed: "regression-32-forest-village-large-variant",
    prompt: "森林村庄",
    expected: {
      domain: "settlement",
      terrainKind: "forest-clearing",
      siteType: "village",
      roomIds: [],
      tags: ["forest", "stream", "stream-crossing", "wood-bridge", "canopy-platform"],
      minimums: { forest: 1, terrain: 1, "tree-trunk": 1, "tree-canopy": 1, "canopy-platform": 1, bridge: 1, building: 1, room: 1, primaryRoute: 1, alternateRoute: 1 },
    },
  },
  {
    id: "flooded-opera",
    size: "large",
    density: 0.76,
    seed: "regression-32-drowned-opera",
    prompt: "被洪水淹没的歌剧院，有门厅、马蹄形观众席、下沉乐池、主舞台、后台、化妆间、半淹道具库和屋顶逃生路线",
    expected: {
      roomIds: ["opera-foyer", "opera-auditorium", "opera-orchestra", "opera-stage", "opera-backstage", "opera-dressing", "opera-props", "opera-roof"],
      tags: ["opera-house", "auditorium-seat", "orchestra-pit", "stage", "prop-store", "flooded"],
      minimums: { room: 9, route: 8 },
    },
  },
  {
    id: "canyon-embassy",
    size: "large",
    density: 0.78,
    seed: "browser-08-canyon-embassy",
    prompt: "倒挂在峡谷下方的使馆和索桥，岩壁平台、外交大厅、垂直升降梯、悬索桥、峡谷底部密道",
    expected: {
      terrainKind: "rift",
      roomIds: [],
      tags: ["embassy", "visa-archive", "suspended-office", "escape-platform", "cliff-lift", "shaft-access", "structural-support"],
      minimums: { room: 1, route: 1, building: 1, bridge: 2, cliffDescent: 2, cliffPlatform: 1 },
    },
  },
];

const executablePath = "/Users/inagi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const report: Array<Record<string, unknown>> = [];

function countTagged(scene: any, tag: string) {
  return (scene?.primitives ?? []).filter((primitive: any) => primitive.tags?.includes(tag)).length;
}

async function screenshot(page: any, path: string, delay = 250) {
  await page.waitForTimeout(delay);
  await page.screenshot({ path, fullPage: true });
}

for (const entry of cases) {
  const page = await context.newPage();
  const networkFailures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (request: any) => networkFailures.push(`${request.method()} ${request.url()}`));
  page.on("console", (message: any) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error: Error) => consoleErrors.push(`pageerror: ${error.message}`));

  const query = new URLSearchParams({
    kind: "adaptive",
    size: entry.size,
    density: String(entry.density),
    seed: entry.seed,
    prompt: entry.prompt,
  });
  const url = `http://127.0.0.1:5241/?${query}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(() => Boolean((window as any).__TRPG_SCENE__?.diagnostics), { timeout: 90000 });
  const scene = await page.evaluate(() => (window as any).__TRPG_SCENE__);
  const tags = new Set((scene?.primitives ?? []).flatMap((primitive: any) => primitive.tags ?? []));
  const semantic = {
    domain: scene?.sceneProgram?.domain,
    terrainKind: scene?.terrainProgram?.kind ?? scene?.siteProgram?.terrainKind,
    siteType: scene?.siteProgram?.siteType,
    title: scene?.title,
    floors: scene?.floors ?? 0,
    buildings: scene?.buildingInstances?.length ?? 0,
    rooms: scene?.rooms?.length ?? 0,
    routes: scene?.routes?.length ?? 0,
    primitives: scene?.primitives?.length ?? 0,
    requiredRoomIds: entry.expected.roomIds,
    presentRoomIds: entry.expected.roomIds.filter((id) => scene?.rooms?.some((room: any) => room.id === id)),
    presentTags: entry.expected.tags.filter((tag) => tags.has(tag)),
    tagCounts: Object.fromEntries([
      "forest", "terrain", "tree-trunk", "tree-canopy", "canopy-platform", "bridge",
      "settlement-building", "opera-house", "auditorium-seat", "orchestra-pit", "stage",
      "prop-store", "flooded", "embassy", "visa-archive", "suspended-office",
      "escape-platform", "cliff-lift", "shaft-access", "structural-support", "rope-bridge",
      "cliff-descent", "cliff-platform",
    ].map((tag) => [tag, countTagged(scene, tag)])),
    primaryRoutes: (scene?.routes ?? []).filter((route: any) => route.kind === "primary").length,
    alternateRoutes: (scene?.routes ?? []).filter((route: any) => route.kind === "alternate").length,
  };

  if (scene?.diagnostics?.valid !== true) throw new Error(`${entry.id}: scene diagnostics invalid`);
  if ((scene?.diagnostics?.metrics?.geometryErrorCount ?? -1) !== 0) throw new Error(`${entry.id}: geometry errors`);
  if ((scene?.diagnostics?.warnings ?? []).length > 0) throw new Error(`${entry.id}: warnings ${JSON.stringify(scene.diagnostics.warnings)}`);
  if (entry.expected.domain && semantic.domain !== entry.expected.domain) throw new Error(`${entry.id}: domain ${semantic.domain}`);
  if (entry.expected.terrainKind && semantic.terrainKind !== entry.expected.terrainKind) throw new Error(`${entry.id}: terrain ${semantic.terrainKind}`);
  if (entry.expected.siteType && semantic.siteType !== entry.expected.siteType) throw new Error(`${entry.id}: site type ${semantic.siteType}`);
  if (semantic.presentRoomIds.length !== entry.expected.roomIds.length) throw new Error(`${entry.id}: missing rooms ${JSON.stringify(entry.expected.roomIds.filter((id) => !semantic.presentRoomIds.includes(id)))}`);
  if (semantic.presentTags.length !== entry.expected.tags.length) throw new Error(`${entry.id}: missing tags ${JSON.stringify(entry.expected.tags.filter((tag) => !semantic.presentTags.includes(tag)))}`);
  if (semantic.rooms < entry.expected.minimums.room || semantic.routes < entry.expected.minimums.route || semantic.buildings < entry.expected.minimums.building) {
    throw new Error(`${entry.id}: missing scene counts ${JSON.stringify(semantic)}`);
  }
  for (const [tag, minimum] of Object.entries(entry.expected.minimums)) {
    if (["room", "route", "building", "primaryRoute", "alternateRoute"].includes(tag)) continue;
    if ((semantic.tagCounts as Record<string, number>)[tag] < minimum) throw new Error(`${entry.id}: ${tag} count below ${minimum}`);
  }
  if (semantic.primaryRoutes < entry.expected.minimums.primaryRoute || semantic.alternateRoutes < entry.expected.minimums.alternateRoute) {
    throw new Error(`${entry.id}: route variety missing`);
  }

  const snapshots: string[] = [];
  const save = async (suffix: string) => {
    const filename = `${entry.id}-${suffix}.png`;
    await screenshot(page, `${outputDir}/${filename}`);
    snapshots.push(filename);
  };
  await save("overview");
  await page.locator('[data-role="camera-toggle"]').click();
  await save("low-angle");
  await page.locator('[data-role="transparency-toggle"]').click();
  await save("grid-close");

  const floorSelect = page.locator('[data-role="floor"]');
  const floorOptions = await floorSelect.locator("option").evaluateAll((items: HTMLOptionElement[]) => items.map((item) => ({ value: item.value, label: item.textContent ?? "" })));
  const preferredFloor = floorOptions.find((option) => /B1|地下|屋顶|roof|cellar/i.test(option.label)) ?? floorOptions.find((option) => option.value !== "cut" && option.value !== "roof");
  let floorSnapshot: string | undefined;
  if (preferredFloor) {
    await floorSelect.selectOption(preferredFloor.value);
    floorSnapshot = `${entry.id}-floor-${preferredFloor.value}.png`;
    await screenshot(page, `${outputDir}/${floorSnapshot}`);
    snapshots.push(floorSnapshot);
  }

  const buildingSelect = page.locator('[data-role="building-focus"]');
  const buildingOptions = await buildingSelect.locator("option").evaluateAll((items: HTMLOptionElement[]) => items.map((item) => ({ value: item.value, label: item.textContent ?? "" })).filter((item) => item.value));
  let focusedSnapshot: string | undefined;
  if (buildingOptions[0]) {
    await buildingSelect.selectOption(buildingOptions[0].value);
    await page.locator('[data-role="building-focus-button"]').click();
    focusedSnapshot = `${entry.id}-focused-building.png`;
    await screenshot(page, `${outputDir}/${focusedSnapshot}`, 350);
    snapshots.push(focusedSnapshot);
  }

  const row = {
    ...entry,
    url,
    sceneValid: scene?.diagnostics?.valid === true,
    geometryErrors: scene?.diagnostics?.metrics?.geometryErrorCount ?? -1,
    warnings: scene?.diagnostics?.warnings ?? [],
    semantic,
    floorOptions,
    selectedFloor: preferredFloor ?? null,
    buildingOptions,
    snapshots,
    networkFailures,
    consoleErrors,
  };
  report.push(row);
  await page.close();
}
await browser.close();

const audit = { regression: 32, generatedAt: new Date().toISOString(), cases: report };
writeFileSync(`${outputDir}/browser-audit.json`, JSON.stringify(audit, null, 2));
const failures = report.filter((row) => (
  row.sceneValid !== true
  || row.geometryErrors !== 0
  || (row.warnings as string[]).length > 0
  || (row.networkFailures as string[]).length > 0
  || (row.consoleErrors as string[]).length > 0
));
if (failures.length > 0) throw new Error(`Regression 32 browser audit failed: ${JSON.stringify(failures, null, 2)}`);

const lines = [
  "# Regression 32 · Final hard-prompt browser visual audit",
  "",
  `Date: ${new Date().toISOString().slice(0, 10)}`,
  "",
  "Commit: `ff43cc1`",
  "",
  "## Scope",
  "",
  "Fresh Chromium evidence for the exact short forest-village prompt, the flooded opera house contract, and the hanging canyon embassy/rope-bridge contract. The forest prompt is exercised at medium and large seed-variant scales.",
  "",
  "## Result",
  "",
  ...report.map((row: any) => {
    const s = row.semantic;
    return `- **${row.id}** — ${s.title}; valid=${row.sceneValid}; geometry errors=${row.geometryErrors}; warnings=${row.warnings.length}; primitives=${s.primitives}; rooms=${s.rooms}; routes=${s.routes}; snapshots=${row.snapshots.length}.`;
  }),
  "",
  "All cases require valid scene diagnostics, zero geometry errors, empty warnings, zero request failures, and zero console/page errors. Semantic room/tag assertions are encoded in the browser script and passed when this report is written.",
  "",
  "## Screenshots",
  "",
  ...report.flatMap((row: any) => row.snapshots.map((snapshot: string) => `- [${snapshot}](./${snapshot})`)),
  "",
  "## Notes",
  "",
  "Floor and focused-building screenshots are conditional on the live selector exposing a usable option; the audit records the available options so a missing control is distinguishable from a failed interaction.",
];
writeFileSync(`${outputDir}/report.md`, `${lines.join("\n")}\n`);
console.log(JSON.stringify(audit, null, 2));
