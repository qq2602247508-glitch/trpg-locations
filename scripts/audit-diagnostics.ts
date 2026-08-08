import { generateScene } from "../src/generators";

const prompts = process.argv.slice(2);
const auditSeed = process.env.AUDIT_SEED ?? "audit-diagnostics";
const auditDensity = Number(process.env.AUDIT_DENSITY ?? "0.62");
for (const prompt of prompts) {
  for (const size of ["small", "medium", "large"] as const) {
  const scene = generateScene({ prompt, seed: auditSeed, size, density: auditDensity });
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
