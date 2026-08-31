import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimConversationRuntimeRun,
  runConversationRuntimeTask,
  type RuntimeSql,
} from "../lib/agent-runtime/runtime-adapter.ts";

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

test("atomically claims only one runtime run per conversation", async () => {
  let claimed = false;
  const sql: RuntimeSql = async () => {
    if (claimed) return [];
    claimed = true;
    return [{ conversation_id: "11111111-1111-4111-8111-111111111111" }];
  };

  const first = await claimConversationRuntimeRun(
    sql,
    "11111111-1111-4111-8111-111111111111",
    "run_11111111-1111-4111-8111-111111111111",
  );
  const second = await claimConversationRuntimeRun(
    sql,
    "11111111-1111-4111-8111-111111111111",
    "run_11111111-1111-4111-8111-111111111111",
  );

  assert.equal(first, true);
  assert.equal(second, false);
});
