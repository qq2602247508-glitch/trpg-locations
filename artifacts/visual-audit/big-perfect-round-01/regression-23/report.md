# Big Perfect Round 01 · Regression 23

日期：2026-08-13

## 范围

本轮针对目标 4、5、10 检查建筑透明、进入内部、楼层/相机/可见性/路线范围改变，以及退出后恢复原城镇上下文。选用项目既有回归记录中的混合城镇场景：`browser-r18-entry`，其中包含 `full-interior` 与 `facade` 建筑。

## 修改文件

- `tests/ui.building-entry-session.test.ts`
  - 增加透明模式不是 no-op、进入后楼层/透明状态改变、进入前快照保持不变、低角度状态可恢复的最小回归契约。
- 未修改核心渲染逻辑、生成器逻辑、依赖或 Promptfoo 配置。

## 自动化结果

- `npm test -- --run tests/ui.building-entry-session.test.ts`
  - 3/3 tests passed。
- `npm test -- --run tests/ui.building-entry-session.test.ts tests/generators.test.ts`
  - 2 个测试文件、153/153 tests passed。
- `npm run build`
  - TypeScript 与 Vite production build passed。
- `git diff --check`
  - passed。

## 真实浏览器结果

本轮尝试使用现有真实浏览器验收方式，但未能获得可交付的浏览器证据：

1. 本机 in-app browser connector 可建立连接，但本会话返回的 tab、DOM、截图和 page-evaluate 结果为空，无法可靠落盘。
2. 本机已缓存 Chromium 存在，但通过 CDP 启动时受到系统进程权限限制；申请启动该缓存浏览器的精确权限又被安全审核拒绝。
3. 本轮再次按浏览器 skill 连接 in-app browser：`agent.browsers.get("iab")`
   和带明确 URL 的 `agent.browsers.getForUrl("http://127.0.0.1:5241/")`
   都只返回空工具 payload，没有可读 tab、DOM、page-evaluate 或截图。
4. `npm run dev` 的 Vite PTY 输出显示 `ready`，但从当前执行面运行
   `curl -I --max-time 5 http://127.0.0.1:5241/` 返回：
   `curl: (7) Failed to connect to 127.0.0.1 port 5241 after 0 ms`。
   因此无法证明应用已经被真实浏览器打开。

因此本轮没有伪造截图或把内部工具结果当作真实浏览器报告。`browser-audit.json` 记录了尝试、阻断原因和剩余风险。

## 截图 / JSON 资产

- [browser-audit.json](./browser-audit.json)
- 目标截图：未生成

本轮新增的阻塞命令与结果已同步写入 `browser-audit.json`；没有生成空文件、
占位图片或伪造 hook 快照。

所缺截图为：

- overview
- transparency / cutaway
- focused interior floor
- returned settlement context

## 发现与剩余风险

未发现新的核心渲染或生成器 bug。现有代码和针对性测试支持快照深拷贝及进入状态变化的契约；但目标 4、5、10 的“真实可见证据”仍未完成，必须在 Chromium 可启动且截图/窗口 hooks 可落盘的环境中重跑。
