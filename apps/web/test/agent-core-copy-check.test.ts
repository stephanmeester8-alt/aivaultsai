import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  checkAgentCoreCopy,
} from "../scripts/check-agent-core-copy.mjs";

function makePackageDir(version: string, srcContent: string): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-core-check-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "@aivaultsai/agent-core", version }),
  );
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "index.ts"), srcContent);
  return dir;
}

test("identical source and installed copy passes", () => {
  const src = makePackageDir("0.0.1", "export const ok = 1;\n");
  const installed = makePackageDir("0.0.1", "export const ok = 1;\n");
  try {
    const result = checkAgentCoreCopy({ sourceDir: src, installedDir: installed });
    assert.equal(result.ok, true);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(installed, { recursive: true, force: true });
  }
});

test("version mismatch fails the build (expected vs installed)", () => {
  const src = makePackageDir("0.0.1", "export const ok = 1;\n");
  const installed = makePackageDir("0.0.2", "export const ok = 1;\n");
  try {
    const result = checkAgentCoreCopy({ sourceDir: src, installedDir: installed });
    assert.equal(result.ok, false);
    assert.match(result.reason, /version mismatch/);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(installed, { recursive: true, force: true });
  }
});

test("stale content fails the build even when versions match", () => {
  const src = makePackageDir("0.0.1", "export const ok = 1;\n");
  const installed = makePackageDir("0.0.1", "export const ok = 2;\n");
  try {
    const result = checkAgentCoreCopy({ sourceDir: src, installedDir: installed });
    assert.equal(result.ok, false);
    assert.match(result.reason, /STALE/);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(installed, { recursive: true, force: true });
  }
});

test("missing package.json in one tree fails", () => {
  const src = makePackageDir("0.0.1", "export const ok = 1;\n");
  const empty = mkdtempSync(join(tmpdir(), "agent-core-empty-"));
  try {
    const result = checkAgentCoreCopy({ sourceDir: src, installedDir: empty });
    assert.equal(result.ok, false);
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});
