import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createQualification,
  type QualificationSql,
} from "../lib/customer-zero/persistence/qualification-repository.ts";

interface RecordedCall {
  leadId: unknown;
  score: unknown;
  confidence: unknown;
  reason: unknown;
  qualifiedBy: unknown;
  supportingEventIds: unknown;
}

function fakeSql(returnValue: unknown[] = [{ qualification_id: "qual-1" }]): {
  sql: QualificationSql;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const sql: QualificationSql = async (_strings, ...values) => {
    calls.push({
      leadId: values[0],
      score: values[1],
      confidence: values[2],
      reason: values[3],
      qualifiedBy: values[4],
      supportingEventIds: values[5],
    });
    return returnValue;
  };
  return { sql, calls };
}

test("persists a qualification with score, confidence, reason and supporting events", async () => {
  const { sql, calls } = fakeSql();
  const result = await createQualification(sql, {
    leadId: "lead-1",
    score: 90,
    confidence: "HIGH",
    reason: "appointment request",
    qualifiedBy: "customer_zero_orchestrator",
    supportingEventIds: ["evt-lead-created-1"],
  });
  assert.equal(result.qualificationId, "qual-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.leadId, "lead-1");
  assert.equal(calls[0]!.score, 90);
  assert.equal(calls[0]!.confidence, "HIGH");
  assert.equal(calls[0]!.qualifiedBy, "customer_zero_orchestrator");
  assert.deepEqual(calls[0]!.supportingEventIds, ["evt-lead-created-1"]);
});

test("throws when no qualification record is returned", async () => {
  const { sql } = fakeSql([]);
  await assert.rejects(
    () =>
      createQualification(sql, {
        leadId: "lead-1",
        score: 50,
        confidence: "MEDIUM",
        reason: "commercial goal",
        qualifiedBy: "customer_zero_orchestrator",
        supportingEventIds: ["evt-1"],
      }),
    /returned no record/,
  );
});

test("score 0-100 is passed through unchanged (business rule lives in DB CHECK)", async () => {
  const { sql, calls } = fakeSql();
  await createQualification(sql, {
    leadId: "lead-1",
    score: 0,
    confidence: "LOW",
    reason: "informational only",
    qualifiedBy: "system",
    supportingEventIds: ["evt-1"],
  });
  assert.equal(calls[0]!.score, 0);
});
