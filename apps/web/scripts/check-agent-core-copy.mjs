// Stale agent-core copy guard (TASK 25 — runtime release safety).
//
// The web app consumes @aivaultsai/agent-core through a file: dependency
// (install-links). Vercel caches node_modules and npm skips re-copying
// same-version file: deps, so the INSTALLED copy can silently lag the
// SOURCE package. This script compares the source package with the
// installed copy (version + content hash over package.json and src/) and
// exits non-zero on any mismatch. Wired as `prebuild`, a mismatch FAILS
// the build: better a failed deployment than a deployment with an old
// runtime.
//
// CLI: node scripts/check-agent-core-copy.mjs
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolve relative to this script so the check works from any cwd.
export const AGENT_CORE_SOURCE_DIR = resolve(HERE, "../../../packages/agent-core");
export const AGENT_CORE_INSTALLED_DIR = resolve(
  HERE,
  "../node_modules/@aivaultsai/agent-core",
);

function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue; // installed deps of the source package
      if (entry === "package-lock.json") continue; // lock artifact, not copied by npm
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

function hashTree(root) {
  const hash = createHash("sha256");
  for (const file of collectFiles(root)) {
    const rel = relative(root, file);
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readVersion(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

/** Pure check used by tests; explicit dirs, no side effects. */
export function checkAgentCoreCopy({ sourceDir, installedDir }) {
  const sourceVersion = readVersion(sourceDir);
  const installedVersion = readVersion(installedDir);
  if (!sourceVersion || !installedVersion) {
    return { ok: false, reason: "agent-core package.json missing in one of the trees" };
  }
  if (sourceVersion !== installedVersion) {
    return {
      ok: false,
      reason: `agent-core version mismatch: source ${sourceVersion} vs installed ${installedVersion}`,
    };
  }
  const sourceHash = hashTree(sourceDir);
  const installedHash = hashTree(installedDir);
  if (sourceHash !== installedHash) {
    return {
      ok: false,
      reason: "agent-core installed copy is STALE (content differs from source)",
    };
  }
  return { ok: true, reason: `agent-core ${sourceVersion} matches the installed copy` };
}

function main() {
  const result = checkAgentCoreCopy({
    sourceDir: AGENT_CORE_SOURCE_DIR,
    installedDir: AGENT_CORE_INSTALLED_DIR,
  });
  console.log(`[agent-core guard] ${result.reason}`);
  if (!result.ok) {
    console.error(
      "[agent-core guard] Build aborted. Refresh the installed copy " +
        "(npm ci in apps/web) and bump the version if the source changed.",
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
