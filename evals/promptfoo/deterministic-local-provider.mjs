import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default class DeterministicLocalProvider {
  constructor(options = {}) {
    this.providerId = options.id ?? "deterministic-local-baseline";
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const sceneRequest = String(context.vars?.scene_request ?? prompt);
    const { stdout } = await execFileAsync(
      `${process.cwd()}/node_modules/.bin/vite-node`,
      [
        "--root",
        "/private/tmp",
        `${process.cwd()}/evals/promptfoo/deterministic-local-runner.ts`,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, PROMPTFOO_SCENE_REQUEST: sceneRequest },
        maxBuffer: 1024 * 1024,
      },
    );
    return { output: stdout.trim() };
  }
}
