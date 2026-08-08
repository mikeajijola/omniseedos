import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [omniformArtifact, engineArtifact] = process.argv.slice(2).map(value => resolve(value));
if (!omniformArtifact || !engineArtifact) {
  console.error("Usage: npm run test:distribution -- <omniform.tgz> <engine.tgz>");
  process.exit(2);
}
const root = mkdtempSync(join(tmpdir(), "omniseedos-distribution-"));
try {
  const artifacts = join(root, "artifacts"), consumer = join(root, "consumer");
  mkdirSync(artifacts); mkdirSync(consumer);
  const packed = execFileSync("npm", ["pack", "--pack-destination", artifacts], { encoding: "utf8" }).trim().split("\n").at(-1);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", omniformArtifact, engineArtifact, join(artifacts, packed)], { cwd: consumer, stdio: "ignore" });
  execFileSync("node", ["--input-type=module", "-e", "const os = await import('@omniseed/os'); if (!os.createOmniSeedOs) process.exit(1)"], { cwd: consumer });
  console.log("Packaged OmniSeed OS loaded from versioned artifacts without sibling repositories.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
