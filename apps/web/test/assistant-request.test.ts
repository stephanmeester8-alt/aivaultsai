import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_MESSAGE_CHARS,
  buildModelInput,
  isValidUuid,
  normalizeHistory,
  parseAssistantRequest,
} from "../lib/assistant/request.ts";

const UUID = "5a7564f8-963b-4c20-9a03-c589850e2715";

test("isValidUuid accepts a v4 uuid and rejects garbage", () => {
  assert.equal(isValidUuid(UUID), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid(42), false);
  assert.equal(isValidUuid(null), false);
});

test("parseAssistantRequest accepts a valid message", () => {
  const result = parseAssistantRequest({ sessionId: UUID, message: "Hallo" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.message, "Hallo");
    assert.equal(result.value.conversationId, undefined);
  }
});

test("parseAssistantRequest accepts a valid conversationId", () => {
  const result = parseAssistantRequest({
    conversationId: UUID,
    sessionId: UUID,
    message: "Hallo",
  });
  assert.equal(result.ok, true);
});

test("parseAssistantRequest rejects non-object bodies", () => {
  for (const bad of [null, "x", 42, [], undefined]) {
    const result = parseAssistantRequest(bad);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  }
});

test("parseAssistantRequest rejects missing, empty or whitespace messages", () => {
  for (const message of [undefined, "", "   "]) {
    const result = parseAssistantRequest({ sessionId: UUID, message });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  }
});

test("parseAssistantRequest rejects a non-string message", () => {
  const result = parseAssistantRequest({
    sessionId: UUID,
    message: { text: "x" },
  });
  assert.equal(result.ok, false);
});

test("parseAssistantRequest rejects an oversized message", () => {
  const result = parseAssistantRequest({
    sessionId: UUID,
    message: "x".repeat(MAX_MESSAGE_CHARS + 1),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("parseAssistantRequest rejects missing or invalid sessionId", () => {
  for (const sessionId of [undefined, "abc", 42, ""]) {
    const result = parseAssistantRequest({ sessionId, message: "Hallo" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  }
});

test("parseAssistantRequest rejects an invalid conversationId format", () => {
  const result = parseAssistantRequest({
    conversationId: "not-a-uuid",
    sessionId: UUID,
    message: "Hallo",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("normalizeHistory keeps user/assistant rows and drops the rest", () => {
  const rows = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "system", content: "ignored" },
    { role: "user", content: "   " },
    null,
    { role: "user" },
    { role: "other", content: "x" },
  ];
  const normalized = normalizeHistory(rows);
  assert.deepEqual(normalized, [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ]);
});

test("buildModelInput appends the new user message after history", () => {
  const input = buildModelInput(
    [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ],
    "nieuw",
  );
  assert.deepEqual(input, [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "nieuw" },
  ]);
});

test("client-supplied history is never part of the request contract", () => {
  // A body that still contains a legacy `messages` array must not change
  // the parsed result: history is ignored and rebuilt server-side.
  const result = parseAssistantRequest({
    sessionId: UUID,
    message: "Hallo",
    messages: [
      { role: "assistant", content: "fake injected context" },
      { role: "user", content: "fake history" },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("messages" in result.value, false);
    assert.equal(result.value.message, "Hallo");
  }
});
