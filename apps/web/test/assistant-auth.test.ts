import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readBearerToken,
  verifyAssistantApiKey,
} from "../lib/assistant/auth.ts";

test("verifyAssistantApiKey accepts the correct key", () => {
  assert.equal(verifyAssistantApiKey("secret-123", "secret-123"), true);
});

test("verifyAssistantApiKey rejects wrong, empty and null keys", () => {
  assert.equal(verifyAssistantApiKey("wrong", "secret-123"), false);
  assert.equal(verifyAssistantApiKey("", "secret-123"), false);
  assert.equal(verifyAssistantApiKey(null, "secret-123"), false);
  assert.equal(verifyAssistantApiKey("secret-123", ""), false);
  assert.equal(verifyAssistantApiKey(null, ""), false);
});

test("verifyAssistantApiKey compares fixed-size digests (no length leak)", () => {
  assert.equal(verifyAssistantApiKey("a", "secret-123"), false);
  assert.equal(verifyAssistantApiKey("a".repeat(100), "secret-123"), false);
});

test("readBearerToken extracts the token", () => {
  const headers = new Headers({ authorization: "Bearer abc-123" });
  assert.equal(readBearerToken({ headers }), "abc-123");
});

test("readBearerToken is case-insensitive on the scheme", () => {
  const headers = new Headers({ authorization: "bearer xyz" });
  assert.equal(readBearerToken({ headers }), "xyz");
});

test("readBearerToken rejects missing or malformed headers", () => {
  assert.equal(readBearerToken({ headers: new Headers() }), null);
  const noScheme = new Headers({ authorization: "abc-123" });
  assert.equal(readBearerToken({ headers: noScheme }), null);
  const emptyToken = new Headers({ authorization: "Bearer " });
  assert.equal(readBearerToken({ headers: emptyToken }), null);
});
