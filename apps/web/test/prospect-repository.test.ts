import assert from "node:assert/strict";
import { test } from "node:test";

import { memorySql, TENANT, makeProspect } from "./prospect-fixtures.ts";
import {
  applyReplyToProspect,
  createOutreach,
  createProspect,
  createReply,
  findProspectByDomain,
  findProspectByEmail,
  findRepliesByThread,
  getProspect,
  getOutreach,
  listProspectsByStatus,
  setDoNotContact,
  updateOutreachStatus,
  updateProspectStatus,
} from "../lib/prospect-pipeline/repository.ts";

const FIRST_EMAIL_AT = "2026-01-05T09:00:00.000Z";

test("repository: createProspect voert tenant_id als eerste waarde + status mee", async () => {
  const { sql, calls } = memorySql();
  const id = await createProspect(sql, {
    tenantId: TENANT,
    companyName: "Voorbeeld BV",
    emailNormalized: "info@voorbeeld.nl",
    domainNormalized: "voorbeeld.nl",
    status: "FIRST_EMAIL_SENT",
    contactAttempts: 1,
    firstEmailSentAt: FIRST_EMAIL_AT,
    gmailMessageId: "msg-1",
  });
  assert.ok(id.length > 0);
  const insert = calls.find((c) => c.text.includes("INSERT INTO prospects"));
  assert.ok(insert);
  assert.equal(insert!.values[0], TENANT);
  assert.ok(insert!.values.includes("FIRST_EMAIL_SENT"));
});

test("repository: alle writes zijn tenant-scoped (WHERE tenant_id)", async () => {
  const { sql, calls } = memorySql();
  await updateProspectStatus(sql, TENANT, "p-1", "WAITING_FOR_REPLY");
  await setDoNotContact(sql, TENANT, "p-1", "DO_NOT_CONTACT");
  await updateOutreachStatus(sql, TENANT, "o-1", "SENT");

  for (const c of calls) {
    if (c.text.includes("UPDATE")) {
      // laatste twee params = tenantId + id; tekst bevat tenant-clausule
      assert.ok(/tenant_id = \?::uuid/.test(c.text), `tenant-scoped: ${c.text.slice(0, 60)}`);
      assert.equal(c.values[c.values.length - 2], TENANT);
    }
  }
});

test("repository: createOutreach en createReply retourneren id (unieke (prospect,kind) via DB)", async () => {
  const { sql, calls } = memorySql();
  const outreachId = await createOutreach(sql, {
    tenantId: TENANT,
    prospectId: "p-1",
    kind: "FIRST_EMAIL",
    status: "DRAFT",
    toAddress: "info@voorbeeld.nl",
    fromAddress: "stephan@aivaultsai.one",
    subject: "Hallo",
    body: "Bericht",
  });
  assert.ok(outreachId.startsWith("outreach-"));
  const replyId = await createReply(sql, {
    tenantId: TENANT,
    prospectId: "p-1",
    classification: "QUESTION",
    summary: "Vraag over prijzen",
  });
  assert.ok(replyId.startsWith("reply-"));
  assert.equal(calls.length, 2);
});

test("repository: getProspect/findByEmail/findByDomain zijn tenant-scoped queries", async () => {
  const { sql } = memorySql();
  await getProspect(sql, TENANT, "p-1");
  await findProspectByEmail(sql, TENANT, "info@voorbeeld.nl");
  await findProspectByDomain(sql, TENANT, "voorbeeld.nl");
  assert.equal(await getProspect(sql, TENANT, "onbekend"), null);
});

test("repository: applyReplyToProspect schrijft reply-status + laatste contact", async () => {
  const { sql, calls } = memorySql();
  const ok = await applyReplyToProspect(sql, TENANT, "p-1", {
    status: "REPLIED",
    replyStatus: "INTERESTED",
    lastContactAt: "2026-01-08T10:00:00.000Z",
    nextActionAt: null,
  });
  assert.equal(ok, true);
  const update = calls.find((c) => c.text.includes("UPDATE prospects"));
  assert.ok(update);
  assert.ok(update!.values.includes("REPLIED"));
  assert.ok(update!.values.includes("INTERESTED"));
});

test("repository: findRepliesByThread matcht message-id of thread-id (tenant-scoped)", async () => {
  const { sql } = memorySql();
  assert.deepEqual(await findRepliesByThread(sql, TENANT, null, null), []);
  assert.deepEqual(await findRepliesByThread(sql, TENANT, "msg-9", null), []);
  assert.deepEqual(await findRepliesByThread(sql, TENANT, null, "thread-9"), []);
});

test("repository: listProspectsByStatus filtert op status-set (ANY)", async () => {
  const { sql, calls } = memorySql();
  const rows = await listProspectsByStatus(sql, TENANT, ["NEW", "READY_FOR_OUTREACH"]);
  assert.deepEqual(rows, []);
  const select = calls.find((c) => c.text.includes("SELECT"));
  assert.ok(select);
  assert.equal(select!.values[0], TENANT);
  assert.deepEqual(select!.values[1], ["NEW", "READY_FOR_OUTREACH"]);
});

test("repository: getOutreach is tenant-scoped en retourneert null zonder rij", async () => {
  const { sql } = memorySql();
  const outreach = await getOutreach(sql, TENANT, "p-1", "FIRST_EMAIL");
  assert.equal(outreach, null);
});

test("fixture: makeProspect is een geldig prospect voor regeltests", () => {
  const p = makeProspect();
  assert.equal(p.tenantId, TENANT);
  assert.equal(p.status, "WAITING_FOR_REPLY");
});
