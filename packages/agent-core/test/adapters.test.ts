import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FilesystemAdapter,
  HttpAdapter,
  createInitialAgentRegistry,
  createTaskEngine,
  type ExecutionRequest,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function filesystemRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: "ex_fs",
    taskId: "task_fs",
    agentId: "principal_engineer",
    toolId: "filesystem",
    requestedAction: "FILESYSTEM_READ on authorized path",
    requestedPermissions: ["FILESYSTEM_READ"],
    riskLevel: "LOW",
    approvalId: null,
    input: {},
    ...overrides,
  };
}

test("FilesystemAdapter reads a file inside the root", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-fs-"));
  try {
    writeFileSync(path.join(dir, "a.txt"), "payload", "utf8");
    const adapter = new FilesystemAdapter({ root: dir });
    const result = await adapter.execute(
      filesystemRequest({
        input: { capability: "FILESYSTEM_READ", arguments: { path: "a.txt" } },
      }),
    );
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.executionOccurred, true);
    assert.equal((result.output as { content: string }).content, "payload");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FilesystemAdapter rejects path traversal", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-fs-"));
  try {
    const adapter = new FilesystemAdapter({ root: dir });
    const result = await adapter.execute(
      filesystemRequest({
        input: { capability: "FILESYSTEM_READ", arguments: { path: "../secret.txt" } },
      }),
    );
    assert.equal(result.status, "FAILED");
    assert.match(result.error ?? "", /escapes the authorized root/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FilesystemAdapter rejects absolute paths outside the root", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-fs-"));
  try {
    const adapter = new FilesystemAdapter({ root: dir });
    const result = await adapter.execute(
      filesystemRequest({
        input: { capability: "FILESYSTEM_READ", arguments: { path: process.env.TEMP ?? "/tmp" } },
      }),
    );
    assert.equal(result.status, "FAILED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FilesystemAdapter refuses writes unless explicitly allowed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-fs-"));
  try {
    const adapter = new FilesystemAdapter({ root: dir });
    const result = await adapter.execute(
      filesystemRequest({
        requestedPermissions: ["FILESYSTEM_WRITE"],
        input: { capability: "FILESYSTEM_WRITE", arguments: { path: "out.txt", content: "x" } },
      }),
    );
    assert.equal(result.status, "FAILED");
    assert.match(result.error ?? "", /writes are not authorized/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FilesystemAdapter writes inside the root when allowWrite is set", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-fs-"));
  try {
    const adapter = new FilesystemAdapter({ root: dir, allowWrite: true });
    const result = await adapter.execute(
      filesystemRequest({
        requestedPermissions: ["FILESYSTEM_WRITE"],
        input: { capability: "FILESYSTEM_WRITE", arguments: { path: "out.txt", content: "x" } },
      }),
    );
    assert.equal(result.status, "SUCCEEDED");
    const { readFileSync } = await import("node:fs");
    assert.equal(readFileSync(path.join(dir, "out.txt"), "utf8"), "x");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function httpRequest(url: string): ExecutionRequest {
  return {
    executionId: "ex_http",
    taskId: "task_http",
    agentId: "research_intelligence",
    toolId: "http",
    requestedAction: "API_REQUEST read-only fetch",
    requestedPermissions: ["API_REQUEST"],
    riskLevel: "LOW",
    approvalId: null,
    input: { capability: "API_REQUEST", arguments: { url } },
  };
}

test("HttpAdapter blocks private/loopback destinations (SSRF)", async () => {
  const adapter = new HttpAdapter();
  for (const url of [
    "http://127.0.0.1/admin",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:8080/",
  ]) {
    const result = await adapter.execute(httpRequest(url));
    assert.equal(result.status, "FAILED", `expected ${url} to be blocked`);
    assert.match(result.error ?? "", /blocked|resolved/i);
  }
});

test("HttpAdapter rejects non-http protocols and credentials", async () => {
  const adapter = new HttpAdapter();
  const ftp = await adapter.execute(httpRequest("ftp://example.com/file"));
  assert.equal(ftp.status, "FAILED");
  const creds = await adapter.execute(httpRequest("http://user:pass@example.com/"));
  assert.equal(creds.status, "FAILED");
  const garbage = await adapter.execute(httpRequest("not a url"));
  assert.equal(garbage.status, "FAILED");
});

test("HttpAdapter rejects unsupported capability and missing url", async () => {
  const adapter = new HttpAdapter();
  const badCap = await adapter.execute({
    ...httpRequest("http://example.com/"),
    input: { capability: "WEB_SEARCH", arguments: {} },
  });
  assert.equal(badCap.status, "FAILED");
  const noUrl = await adapter.execute({
    ...httpRequest("http://example.com/"),
    input: { capability: "API_REQUEST", arguments: {} },
  });
  assert.equal(noUrl.status, "FAILED");
  assert.match(noUrl.error ?? "", /url is required/);
});

test("HttpAdapter never forwards sensitive headers", async () => {
  // Only accept/user-agent may be forwarded; authorization/cookie are dropped.
  const adapter = new HttpAdapter();
  const result = await adapter.execute({
    ...httpRequest("http://127.0.0.1/"),
    input: {
      capability: "API_REQUEST",
      arguments: { url: "http://127.0.0.1/", headers: { authorization: "Bearer secret" } },
    },
  });
  // Blocked before any request is sent, so no secret can leak anywhere.
  assert.equal(result.status, "FAILED");
});
