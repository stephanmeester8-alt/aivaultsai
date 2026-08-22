import assert from "node:assert/strict";
import { test } from "node:test";

import { runConversationRuntimeTask } from "../lib/agent-runtime/runtime-adapter.ts";

test("invalid conversation id is refused before any database access", async () => {
  const outcome = await runConversationRuntimeTask("not-a-uuid");
  assert.equal(outcome.ran, false);
  assert.equal(outcome.skipped, "invalid_conversation_id");
  assert.equal(outcome.error, undefined);
});

test("missing input is refused (empty string)", async () => {
  const outcome = await runConversationRuntimeTask("");
  assert.equal(outcome.ran, false);
  assert.equal(outcome.skipped, "invalid_conversation_id");
});
