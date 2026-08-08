import { GRID_FEET, GRID_METERS } from "../schema";
import type { GeneratedScene, GenerationRequest, SceneKind } from "../schema";
import type { RenderStats } from "../render/SceneRenderer";
import { GenerationClient } from "../workers/GenerationClient";

const KIND_LABELS: Record<SceneKind, string> = {
  adaptive: "自适应题材",
  tavern: "酒馆与驿站",
  tower: "塔楼与要塞",
  sewer: "下水道与遗迹",
  cave: "洞窟与地底",
  dungeon: "多层地牢与迷宫",
  building: "专用建筑语法",
  settlement: "城镇与街区",
  wilderness: "自然与特殊战术空间",
};

const DEFAULT_PROMPT = "一座雨夜里仍灯火通明的河港酒馆，包含后厨密道与二层伏击点";

interface AppElements {
  form: HTMLFormElement;
  prompt: HTMLTextAreaElement;
  kind: HTMLSelectElement;
  seed: HTMLInputElement;
  randomSeed: HTMLButtonElement;
  size: HTMLSelectElement;
  density: HTMLInputElement;
  densityValue: HTMLElement;
  generate: HTMLButtonElement;
  status: HTMLElement;
  statusDetail: HTMLElement;
  stageTitle: HTMLElement;
  stageDescription: HTMLElement;
  seedBadge: HTMLElement;
  floor: HTMLSelectElement;
  buildingFocus: HTMLSelectElement;
  buildingFocusButton: HTMLButtonElement;
  buildingFocusExit: HTMLButtonElement;
  time: HTMLSelectElement;
  exportScene: HTMLButtonElement;
  transparencyToggle: HTMLButtonElement;
  cameraToggle: HTMLButtonElement;
  topCameraToggle: HTMLButtonElement;
  planningToggle: HTMLButtonElement;
  routesToggle: HTMLButtonElement;
  tacticalToggle: HTMLButtonElement;
  metrics: HTMLElement;
  diagnostics: HTMLElement;
  roomList: HTMLElement;
  viewport: HTMLElement;
}

export async function mountApp(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <a class="brand" href="#generator" aria-label="TRPG Locations 首页">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><strong>TRPG LOCATIONS</strong><small>程序化战术场景工作台</small></span>
        </a>
        <div class="topbar-actions">
          <span class="engine-label"><span class="pulse-dot" aria-hidden="true"></span>本地确定性生成</span>
          <span class="status-pill" data-role="status">准备就绪</span>
        </div>
      </header>

      <div class="workspace" id="generator">
        <aside class="side-panel composer-panel" aria-label="生成参数">
          <div class="panel-heading">
            <p class="eyebrow">01 · 设定</p>
            <h1>把灵感变成<br /><em>可玩的场景。</em></h1>
            <p>每次生成都可由相同种子复现，并遵循 5 英尺战术格。</p>
          </div>

          <form class="scene-form" data-role="scene-form">
            <label class="field field-prompt">
              <span>场景提示</span>
              <textarea data-role="prompt" rows="5" maxlength="280" spellcheck="false" placeholder="例如：被熔岩切开的矮人矿井…"></textarea>
              <small>氛围、用途、冲突和地形都会影响布局。</small>
            </label>

            <label class="field">
              <span>场景原型</span>
              <select data-role="kind">
                <option value="adaptive">自适应题材</option>
                <option value="tavern">酒馆与驿站</option>
                <option value="tower">塔楼与要塞</option>
                <option value="sewer">下水道与遗迹</option>
                <option value="cave">洞窟与地底</option>
                <option value="dungeon">多层地牢与迷宫</option>
                <option value="building">专用建筑语法</option>
                <option value="settlement">城镇与街区</option>
                <option value="wilderness">自然与特殊战术空间</option>
              </select>
            </label>
            <label class="field">
              <span>城市时段</span>
              <select data-role="time" aria-label="城市时段">
                <option value="day">白昼 · 市场与通勤</option>
                <option value="night">夜间 · 巡逻与暗路</option>
              </select>
            </label>

            <div class="field-row">
              <label class="field seed-field">
                <span>Seed</span>
                <input data-role="seed" type="text" maxlength="64" spellcheck="false" autocomplete="off" />
              </label>
              <button data-role="random-seed" class="icon-button" type="button" title="生成随机 Seed" aria-label="生成随机 Seed">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.7 5.3A8 8 0 0 0 5.2 7.2L3.5 5.5v5h5L6.6 8.6A6 6 0 0 1 17.9 6l1.8-.7Zm.8 3.2h-5l1.9 1.9A6 6 0 0 1 6.1 18l-1.8.7A8 8 0 0 0 18.8 16l1.7 1.7v-5Z" /></svg>
              </button>
            </div>

            <div class="field-row field-row-split">
              <label class="field">
                <span>规模</span>
                <select data-role="size">
                  <option value="small">小型 · 遭遇</option>
                  <option value="medium" selected>中型 · 地点</option>
                  <option value="large">大型 · 迷宫</option>
                </select>
              </label>
              <label class="field density-field">
                <span>密度 <output data-role="density-value">62%</output></span>
                <input data-role="density" type="range" min="20" max="100" value="62" step="1" />
              </label>
            </div>

            <button data-role="generate" class="generate-button" type="submit">
              <span class="button-orbit" aria-hidden="true"></span>
              <span>生成战术场景</span>
              <kbd>⌘ ↵</kbd>
            </button>
          </form>

          <div class="composer-note">
            <span class="note-icon">◇</span>
            <p><strong>确定性布局</strong><br />相同输入与 Seed，得到相同拓扑和尺寸。</p>
          </div>
        </aside>

        <section class="stage" aria-label="场景预览">
          <div class="stage-header">
            <div>
              <p class="eyebrow">实时预览 · THREE.JS</p>
              <h2 data-role="stage-title">正在布置场景…</h2>
              <p data-role="stage-description">请稍候，生成器正在构筑战术空间。</p>
            </div>
            <span class="seed-badge" data-role="seed-badge">SEED —</span>
          </div>

          <div class="viewport-frame">
            <div class="scene-viewport" data-role="viewport" aria-label="可旋转的三维战术场景"></div>
            <div class="viewport-wash" aria-hidden="true"></div>
            <div class="viewport-corner viewport-corner-tl" aria-hidden="true"></div>
            <div class="viewport-corner viewport-corner-br" aria-hidden="true"></div>
            <div class="grid-legend"><strong>5 FT</strong><span>每格 · 1.524m</span></div>
            <div class="orbit-help"><span class="orbit-help-mouse">↻</span><span>拖拽旋转 · 滚轮缩放</span></div>
          </div>

          <div class="stage-footer">
            <span data-role="status-detail">正在生成初始场景…</span>
            <span class="grid-key"><i></i> 5 英尺网格已锁定</span>
          </div>
        </section>

        <aside class="side-panel inspector-panel" aria-label="场景诊断与视图控制">
          <section class="inspector-section inspector-controls">
            <div class="section-title">
              <p class="eyebrow">02 · 视图</p>
              <h2>楼层与调试</h2>
            </div>
            <label class="field">
              <span>观察层</span>
              <select data-role="floor" aria-label="观察楼层">
                <option value="cut">剖切 · 隐藏屋顶</option>
                <option value="roof">完整 · 显示屋顶</option>
              </select>
            </label>
            <label class="field building-focus-field">
              <span>进入建筑</span>
              <select data-role="building-focus" aria-label="选择聚落建筑"><option value="">当前场景没有可选建筑</option></select>
            </label>
            <div class="building-focus-actions">
              <button class="toggle-button" data-role="building-focus-button" type="button"><span><strong>聚焦内部</strong><small>按需显示该建筑的房间与交通</small></span></button>
              <button class="toggle-button" data-role="building-focus-exit" type="button"><span><strong>返回聚落</strong><small>恢复完整屋顶与城市上下文</small></span></button>
            </div>
            <div class="toggle-stack">
              <button class="toggle-button" data-role="routes-toggle" type="button" aria-pressed="false">
                <span class="toggle-glyph route-glyph" aria-hidden="true"></span>
                <span><strong>路线调试</strong><small>主路线、备用路径与水流</small></span>
                <i aria-hidden="true"></i>
              </button>
              <button class="toggle-button" data-role="tactical-toggle" type="button" aria-pressed="false">
                <span class="toggle-glyph tactical-glyph" aria-hidden="true"></span>
                <span><strong>战术标记</strong><small>掩体、高点、陷阱与入口</small></span>
                <i aria-hidden="true"></i>
              </button>
            </div>
            <button class="toggle-button export-button" data-role="export-scene" type="button">
              <span class="toggle-glyph export-glyph" aria-hidden="true">↓</span>
              <span><strong>导出场景 JSON</strong><small>保存 Seed、图元、房间与路线</small></span>
              <i aria-hidden="true"></i>
            </button>
            <button class="toggle-button" data-role="transparency-toggle" type="button" aria-pressed="false">
              <span class="toggle-glyph" aria-hidden="true">◈</span>
              <span><strong>建筑半透明</strong><small>查看墙体、楼板与内部战斗关系</small></span>
              <i aria-hidden="true"></i>
            </button>
            <button class="toggle-button" data-role="camera-toggle" type="button" aria-pressed="false">
              <span class="toggle-glyph" aria-hidden="true">◲</span>
              <span><strong>低角度体量</strong><small>检查高差、立面与悬空</small></span>
              <i aria-hidden="true"></i>
            </button>
            <button class="toggle-button" data-role="top-camera-toggle" type="button" aria-pressed="false">
              <span class="toggle-glyph" aria-hidden="true">▦</span>
              <span><strong>正交规划顶视图</strong><small>检查道路、节点、街区、地块与朝向</small></span>
              <i aria-hidden="true"></i>
            </button>
            <button class="toggle-button" data-role="planning-toggle" type="button" aria-pressed="false">
              <span class="toggle-glyph" aria-hidden="true">⌗</span>
              <span><strong data-role="planning-label">规划分层 · 全部</strong><small>循环查看道路、街区地块与建筑轮廓</small></span>
              <i aria-hidden="true"></i>
            </button>
          </section>

          <section class="inspector-section metrics-section">
            <div class="section-title section-title-inline">
              <div><p class="eyebrow">03 · 读数</p><h2>尺寸与性能</h2></div>
              <span class="live-chip"><i></i> LIVE</span>
            </div>
            <div class="metric-grid" data-role="metrics" aria-live="polite"></div>
          </section>

          <section class="inspector-section diagnostics-section">
            <div class="section-title section-title-inline">
              <div><p class="eyebrow">04 · 校验</p><h2>场景诊断</h2></div>
              <span class="score-badge">—</span>
            </div>
            <div class="diagnostic-content" data-role="diagnostics"></div>
          </section>

          <section class="inspector-section rooms-section">
            <div class="section-title section-title-inline">
              <div><p class="eyebrow">房间索引</p><h2>空间构成</h2></div>
              <span class="room-count">—</span>
            </div>
            <ol class="room-list" data-role="room-list"></ol>
          </section>
        </aside>
      </div>
    </main>
  `;

  const elements = getElements(root);
  setStatus(elements, "加载渲染核心", "working");
  const [{ SceneRenderer }] = await Promise.all([import("../render/SceneRenderer")]);
  const renderer = new SceneRenderer(elements.viewport);
  const generationClient = new GenerationClient();
  let activeScene: GeneratedScene | undefined;
  let routeDebug = false;
  let tacticalDebug = false;
  let lastStats: RenderStats = renderer.getStats();
  let planningView: "all" | "roads" | "parcels" | "buildings" = "all";

  elements.prompt.value = DEFAULT_PROMPT;
  elements.seed.value = createSeed();
  elements.kind.value = "adaptive";
  updateDensityLabel(elements);

  renderer.onStats = (stats) => {
    lastStats = stats;
    if (activeScene) renderMetrics(elements.metrics, activeScene, stats);
  };

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void generate();
  });
  elements.prompt.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void generate();
    }
  });
  elements.randomSeed.addEventListener("click", () => {
    elements.seed.value = createSeed();
    elements.seed.focus();
  });
  elements.density.addEventListener("input", () => updateDensityLabel(elements));
  elements.floor.addEventListener("change", () => {
    const raw = elements.floor.value;
    renderer.setFloorView(raw === "cut" || raw === "roof" ? raw : Number(raw));
  });
  elements.buildingFocusButton.addEventListener("click", () => {
    if (!activeScene || !elements.buildingFocus.value) return;
    renderer.setBuildingFocus(elements.buildingFocus.value);
    elements.floor.value = "cut";
    setToggle(elements.topCameraToggle, false);
    setToggle(elements.cameraToggle, false);
    setStatus(elements, "建筑内部聚焦", "ok");
  });
  elements.buildingFocusExit.addEventListener("click", () => {
    renderer.setBuildingFocus();
    elements.floor.value = "roof";
    setStatus(elements, "返回聚落总览", "ok");
  });
  elements.time.addEventListener("change", () => {
    renderer.setTimeOfDay(elements.time.value === "night" ? "night" : "day");
  });
  elements.exportScene.addEventListener("click", () => {
    if (!activeScene) {
      setStatus(elements, "暂无场景", "warn");
      return;
    }
    const payload = JSON.stringify(activeScene, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trpg-location-${activeScene.kind}-${activeScene.seed.replace(/[^a-z0-9_-]+/gi, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(elements, "已导出", "ok");
  });
  elements.transparencyToggle.addEventListener("click", () => {
    const enabled = elements.transparencyToggle.getAttribute("aria-pressed") !== "true";
    renderer.setBuildingTransparency(enabled);
    setToggle(elements.transparencyToggle, enabled);
  });
  elements.cameraToggle.addEventListener("click", () => {
    const enabled = elements.cameraToggle.getAttribute("aria-pressed") !== "true";
    renderer.setCameraPreset(enabled ? "low" : "overview");
    setToggle(elements.cameraToggle, enabled);
    setToggle(elements.topCameraToggle, false);
  });
  elements.topCameraToggle.addEventListener("click", () => {
    const enabled = elements.topCameraToggle.getAttribute("aria-pressed") !== "true";
    renderer.setCameraPreset(enabled ? "top" : "overview");
    setToggle(elements.topCameraToggle, enabled);
    setToggle(elements.cameraToggle, false);
  });
  elements.planningToggle.addEventListener("click", () => {
    const order = ["all", "roads", "parcels", "buildings"] as const;
    planningView = order[(order.indexOf(planningView) + 1) % order.length] ?? "all";
    renderer.setPlanningView(planningView);
    setToggle(elements.planningToggle, planningView !== "all");
    const label = elements.planningToggle.querySelector<HTMLElement>('[data-role="planning-label"]');
    if (label) label.textContent = `规划分层 · ${{ all: "全部", roads: "仅道路", parcels: "道路与地块", buildings: "建筑轮廓" }[planningView]}`;
  });
  elements.routesToggle.addEventListener("click", () => {
    routeDebug = !routeDebug;
    renderer.setRouteVisibility(routeDebug);
    setToggle(elements.routesToggle, routeDebug);
  });
  elements.tacticalToggle.addEventListener("click", () => {
    tacticalDebug = !tacticalDebug;
    renderer.setTacticalVisibility(tacticalDebug);
    setToggle(elements.tacticalToggle, tacticalDebug);
  });
  window.addEventListener("beforeunload", () => {
    generationClient.dispose();
    renderer.dispose();
  }, { once: true });

  async function generate(): Promise<void> {
    const prompt = elements.prompt.value.trim();
    if (!prompt) {
      setStatus(elements, "请先描述场景", "warn");
      elements.prompt.focus();
      return;
    }

    const request: GenerationRequest = {
      prompt,
      seed: elements.seed.value.trim() || createSeed(),
      size: elements.size.value as GenerationRequest["size"],
      density: Number(elements.density.value) / 100,
    };
    const kind = elements.kind.value as SceneKind;
    elements.seed.value = request.seed;
    elements.generate.disabled = true;
    elements.generate.classList.add("is-generating");
    setStatus(elements, "生成布局中", "working");
    elements.statusDetail.textContent = "正在布置房间、路线与战术节点…";

    try {
      const generationStartedAt = performance.now();
      const generated = await generationClient.generate(request, kind);
      // Generation stays deterministic in the rule layer; elapsed time is a UI-only readout.
      const scene: GeneratedScene = {
        ...generated,
        generationMs: Math.max(0, performance.now() - generationStartedAt),
      };
      activeScene = scene;
      renderer.setScene(scene);
      setToggle(elements.cameraToggle, false);
      setToggle(elements.topCameraToggle, false);
      renderer.setCameraPreset("overview");
      planningView = "all";
      renderer.setPlanningView("all");
      setToggle(elements.planningToggle, false);
      const planningLabel = elements.planningToggle.querySelector<HTMLElement>('[data-role="planning-label"]');
      if (planningLabel) planningLabel.textContent = "规划分层 · 全部";
      renderer.setRouteVisibility(routeDebug);
      renderer.setTacticalVisibility(tacticalDebug);
      renderSceneDetails(elements, scene, lastStats);
      if (scene.siteProgram && elements.floor.value === "cut") elements.floor.value = "roof";
      const floorView = elements.floor.value;
      renderer.setFloorView(floorView === "cut" || floorView === "roof" ? floorView : Number(floorView));
      setStatus(elements, scene.diagnostics.valid ? "校验通过" : "需要注意", scene.diagnostics.valid ? "ok" : "warn");
      const semanticLabel = scene.sceneProgram
        ? ` · SceneProgram v${scene.sceneProgram.version} · ${scene.sceneProgram.regionCount} 区域${scene.sceneProgram.source === "ollama" ? " · Ollama" : ""}`
        : scene.semantic?.source === "ollama" ? " · Ollama 语义" : "";
      elements.statusDetail.textContent = `${scene.primitives.length} 个可批处理图元 · ${scene.generationMs.toFixed(0)} ms 生成${semanticLabel}`;
    } catch (error) {
      const description = error instanceof Error ? error.message : "未知生成错误";
      setStatus(elements, "生成失败", "error");
      elements.statusDetail.textContent = description;
      elements.stageDescription.textContent = "生成器未返回有效场景。请调整提示或尝试新的 Seed。";
    } finally {
      elements.generate.disabled = false;
      elements.generate.classList.remove("is-generating");
    }
  }

  void generate();
}

function getElements(root: HTMLElement): AppElements {
  return {
    form: query(root, '[data-role="scene-form"]'),
    prompt: query(root, '[data-role="prompt"]'),
    kind: query(root, '[data-role="kind"]'),
    seed: query(root, '[data-role="seed"]'),
    randomSeed: query(root, '[data-role="random-seed"]'),
    size: query(root, '[data-role="size"]'),
    density: query(root, '[data-role="density"]'),
    densityValue: query(root, '[data-role="density-value"]'),
    generate: query(root, '[data-role="generate"]'),
    status: query(root, '[data-role="status"]'),
    statusDetail: query(root, '[data-role="status-detail"]'),
    stageTitle: query(root, '[data-role="stage-title"]'),
    stageDescription: query(root, '[data-role="stage-description"]'),
    seedBadge: query(root, '[data-role="seed-badge"]'),
    floor: query(root, '[data-role="floor"]'),
    buildingFocus: query(root, '[data-role="building-focus"]'),
    buildingFocusButton: query(root, '[data-role="building-focus-button"]'),
    buildingFocusExit: query(root, '[data-role="building-focus-exit"]'),
    time: query(root, '[data-role="time"]'),
    exportScene: query(root, '[data-role="export-scene"]'),
    transparencyToggle: query(root, '[data-role="transparency-toggle"]'),
    cameraToggle: query(root, '[data-role="camera-toggle"]'),
    topCameraToggle: query(root, '[data-role="top-camera-toggle"]'),
    planningToggle: query(root, '[data-role="planning-toggle"]'),
    routesToggle: query(root, '[data-role="routes-toggle"]'),
    tacticalToggle: query(root, '[data-role="tactical-toggle"]'),
    metrics: query(root, '[data-role="metrics"]'),
    diagnostics: query(root, '[data-role="diagnostics"]'),
    roomList: query(root, '[data-role="room-list"]'),
    viewport: query(root, '[data-role="viewport"]'),
  };
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

function createSeed(): string {
  const words = ["ember", "mist", "vault", "raven", "tide", "gloom", "cinder", "oak"];
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  const value = entropy[0] ?? Date.now();
  const word = words[value % words.length] ?? "scene";
  return `${word}-${value.toString(36).slice(-6)}`;
}

function updateDensityLabel(elements: Pick<AppElements, "density" | "densityValue">): void {
  elements.densityValue.textContent = `${elements.density.value}%`;
  elements.density.style.setProperty("--range-progress", `${elements.density.value}%`);
}

function setToggle(button: HTMLButtonElement, active: boolean): void {
  button.setAttribute("aria-pressed", String(active));
  button.classList.toggle("is-active", active);
}

function setStatus(
  elements: Pick<AppElements, "status">,
  label: string,
  state: "ok" | "working" | "warn" | "error",
): void {
  elements.status.textContent = label;
  elements.status.dataset.state = state;
}

function renderSceneDetails(elements: AppElements, scene: GeneratedScene, stats: RenderStats): void {
  elements.stageTitle.textContent = scene.title;
  elements.stageDescription.textContent = scene.description;
  elements.seedBadge.textContent = `SEED ${scene.seed}`;
  populateFloorOptions(elements.floor, scene);
  populateBuildingOptions(elements.buildingFocus, scene);
  renderMetrics(elements.metrics, scene, stats);
  renderDiagnostics(elements.diagnostics, scene);
  renderRooms(elements.roomList, scene);

  const score = query<HTMLElement>(elements.diagnostics.parentElement ?? elements.diagnostics, ".score-badge");
  score.textContent = `${Math.round(scene.diagnostics.score)} / 100`;
  score.classList.toggle("is-warning", !scene.diagnostics.valid);
  const roomCount = query<HTMLElement>(elements.roomList.parentElement ?? elements.roomList, ".room-count");
  roomCount.textContent = `${scene.rooms.length} 间`;
}

function populateBuildingOptions(select: HTMLSelectElement, scene: GeneratedScene): void {
  select.replaceChildren();
  const buildings = scene.buildingInstances ?? [];
  if (buildings.length === 0) {
    select.add(new Option("当前场景没有可选建筑", ""));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const [index, building] of buildings.entries()) {
    const detail = building.detailLevel === "full-interior" ? "完整" : building.detailLevel === "facade" ? "按需内部" : "远景/按需";
    select.add(new Option(`${index + 1}. ${building.archetype} · ${building.district} · ${detail}`, building.id));
  }
}

function floorLabel(scene: GeneratedScene, level: number): string {
  const authored = scene.floorLabels?.[level];
  if (authored) return authored;
  const groundLevel = scene.primitives.find((primitive) => primitive.tags?.includes("ground-floor"))?.level;
  if (groundLevel === undefined) return `${level + 1}F`;
  if (level < groundLevel) return `B${groundLevel - level}`;
  return `${level - groundLevel + 1}F`;
}

function roomFloorLabel(scene: GeneratedScene, room: GeneratedScene["rooms"][number]): string {
  if (room.center.y < -0.1) return "B1";
  return floorLabel(scene, room.level);
}

function formatCells(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function populateFloorOptions(select: HTMLSelectElement, scene: GeneratedScene): void {
  const previous = select.value;
  select.replaceChildren();
  select.add(new Option("剖切 · 隐藏屋顶", "cut"));
  select.add(new Option("完整 · 显示屋顶", "roof"));
  const maxFloor = Math.max(scene.floors, ...scene.primitives.map((primitive) => primitive.level + 1), 1);
  for (let level = 0; level < maxFloor; level += 1) {
    select.add(new Option(`仅查看 ${floorLabel(scene, level)}`, String(level)));
  }
  select.value = previous === "roof" || previous === "cut" || Number(previous) < maxFloor ? previous : "cut";
  if (!select.value) select.value = "cut";
}

function renderMetrics(container: HTMLElement, scene: GeneratedScene, stats: RenderStats): void {
  const widthFt = Math.round(scene.boundsCells.x * GRID_FEET);
  const depthFt = Math.round(scene.boundsCells.z * GRID_FEET);
  const cells = scene.boundsCells.x * scene.boundsCells.z;
  const meters = `${(scene.boundsCells.x * GRID_METERS).toFixed(1)} × ${(scene.boundsCells.z * GRID_METERS).toFixed(1)}m`;
  const metrics: Array<[string, string, string]> = [
    ["占地", `${widthFt} × ${depthFt} ft`, meters],
    ["楼层", `${scene.floors} 层`, `层高 ${scene.floorHeightFeet.join(" / ")} ft`],
    ["战术格", `${cells.toLocaleString()} 格`, `每格 ${GRID_FEET} ft`],
    ["图元", scene.primitives.length.toLocaleString(), `${stats.primitiveBatches} 个渲染批次`],
    ["Draw calls", stats.drawCalls.toLocaleString(), `${stats.triangles.toLocaleString()} triangles`],
    ["帧率", `${Math.round(stats.fps)} FPS`, `${stats.geometries} 几何体 · ${stats.textures} 纹理`],
  ];
  container.replaceChildren(
    ...metrics.map(([label, value, detail]) => {
      const item = document.createElement("div");
      item.className = "metric";
      const name = document.createElement("span");
      name.textContent = label;
      const primary = document.createElement("strong");
      primary.textContent = value;
      const secondary = document.createElement("small");
      secondary.textContent = detail;
      item.append(name, primary, secondary);
      return item;
    }),
  );
}

function renderDiagnostics(container: HTMLElement, scene: GeneratedScene): void {
  const diagnostics = scene.diagnostics;
  const summary = document.createElement("p");
  summary.className = `diagnostic-summary ${diagnostics.valid ? "is-valid" : "is-invalid"}`;
  summary.textContent = diagnostics.valid
    ? `拓扑与可达性已通过验证 · ${scene.routes.length} 条路线已建立。`
    : "场景已生成，但有待处理的验证项目。";
  const list = document.createElement("ul");
  list.className = "diagnostic-list";
  const notes = [
    ...(scene.sceneProgram ? [{ type: "规划", text: `${scene.sceneProgram.ruleset.toUpperCase()} · ${scene.sceneProgram.era} · ${scene.sceneProgram.gameplay} · ${scene.sceneProgram.morphology.join(" + ")}` }] : []),
    ...diagnostics.warnings.map((note) => ({ type: "警告", text: note })),
    ...diagnostics.repairs.map((note) => ({ type: "修复", text: note })),
  ];
  if (notes.length === 0) notes.push({ type: "通过", text: "未发现需要自动修复的结构冲突。" });
  for (const note of notes.slice(0, 4)) {
    const item = document.createElement("li");
    const tag = document.createElement("b");
    tag.textContent = note.type;
    const text = document.createElement("span");
    text.textContent = note.text;
    item.append(tag, text);
    list.append(item);
  }
  container.replaceChildren(summary, list);
}

function renderRooms(container: HTMLElement, scene: GeneratedScene): void {
  container.replaceChildren(
    ...scene.rooms.slice(0, 6).map((room, index) => {
      const item = document.createElement("li");
      const ordinal = document.createElement("span");
      ordinal.className = "room-ordinal";
      ordinal.textContent = String(index + 1).padStart(2, "0");
      const detail = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = room.name;
      const type = document.createElement("small");
      type.textContent = `${roomFloorLabel(scene, room)} · ${formatCells(room.sizeCells.x)} × ${formatCells(room.sizeCells.z)} 格`;
      detail.append(name, type);
      const role = document.createElement("span");
      role.className = "room-role";
      role.textContent = room.role;
      item.append(ordinal, detail, role);
      return item;
    }),
  );
}
