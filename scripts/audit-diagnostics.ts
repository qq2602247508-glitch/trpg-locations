import { generateScene } from "../src/generators";

const prompts = process.argv.slice(2);
for (const prompt of prompts) {
  for (const size of ["small", "medium", "large"] as const) {
  const scene = generateScene({ prompt, seed: "audit-diagnostics", size, density: 0.62 });
  console.log(JSON.stringify({
    prompt,
    size,
    archetype: scene.archetype,
    valid: scene.diagnostics.valid,
    errors: scene.diagnostics.errors,
    warnings: scene.diagnostics.warnings,
  }, null, 2));
  }
}
