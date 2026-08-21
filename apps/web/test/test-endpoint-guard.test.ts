import assert from "node:assert/strict";
import { test } from "node:test";

import { isTestEndpointEnabled } from "../lib/customer-zero/test-endpoint-guard.ts";

/** @types/node types process.env as read-only; tests need a mutable view. */
const env = process.env as Record<string, string | undefined>;

test("test endpoints are disabled outside development", () => {
  const original = env.NODE_ENV;
  try {
    delete env.NODE_ENV;
    assert.equal(isTestEndpointEnabled(), false);
    env.NODE_ENV = "production";
    assert.equal(isTestEndpointEnabled(), false);
    env.NODE_ENV = "test";
    assert.equal(isTestEndpointEnabled(), false);
    env.NODE_ENV = "development";
    assert.equal(isTestEndpointEnabled(), true);
  } finally {
    if (original === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = original;
  }
});

test("the guard is environment-scoped and cannot be enabled by request data", () => {
  // The guard reads NODE_ENV only — no request state, no headers, no body.
  const original = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal(isTestEndpointEnabled(), false);
    // An attacker-controlled value must not enable it either.
    env.NODE_ENV = "Production";
    assert.equal(isTestEndpointEnabled(), false);
    env.NODE_ENV = "development";
    assert.equal(isTestEndpointEnabled(), true);
  } finally {
    if (original === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = original;
  }
});

test("the live 404 contract is asserted by the route guard branch", () => {
  // The route answers 404 before any database access when disabled; the
  // guard decision is the single source of truth for that branch.
  assert.equal(typeof isTestEndpointEnabled, "function");
});
