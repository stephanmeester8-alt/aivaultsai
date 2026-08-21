// TASK 25 live verification (FASE 14-16): test endpoints must be gone/404,
// pages + assistant + Customer-Zero + agent runtime regression-free.
// No PII. No production test data beyond the normal assistant flow.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const BASE = "https://www.aivaultsai.one";

// FASE 14 — test endpoints must NOT be reachable
for (const path of ["/api/customer-zero/test-lead", "/api/customer-zero/test-orchestrator"]) {
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "aivaultsai-task25" },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    console.log(path + " -> " + res.status + " | " + text.slice(0, 80));
  } catch (e) {
    console.log(path + " -> ERROR " + e.message);
  }
}

// FASE 15 — pages
for (const p of ["/", "/websites", "/ai-assistenten", "/leadautomatisering", "/robots.txt", "/sitemap.xml"]) {
  try {
    const res = await fetch(BASE + p, { redirect: "follow", headers: { "user-agent": "aivaultsai-task25" } });
    const text = await res.text();
    const title = /<title[^>]*>([^<]+)<\/title>/.exec(text);
    console.log(p + " -> " + res.status + (title ? " | " + title[1].slice(0, 35) : ""));
  } catch (e) {
    console.log(p + " -> ERROR " + e.message);
  }
}

// FASE 15 — safe assistant test (no lead expected)
try {
  const res = await fetch(BASE + "/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "aivaultsai-task25" },
    body: JSON.stringify({ message: "Hallo, werkt de site nog?", sessionId: crypto.randomUUID() }),
  });
  const json = await res.json().catch(() => ({}));
  console.log("assistant (neutral) -> " + res.status + " | conversationId=" + (json.conversationId || "MISSING"));
} catch (e) {
  console.log("assistant neutral ERROR " + e.message);
}

// FASE 16 — controlled commercial test -> Customer-Zero + runtime chain
console.log("--- commercial chain test ---");
let conversationId = null;
try {
  const res = await fetch(BASE + "/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "aivaultsai-task25" },
    body: JSON.stringify({
      message: "Ik wil graag een afspraak plannen voor een kennismaking over een nieuwe website die meer leads oplevert.",
      sessionId: crypto.randomUUID(),
    }),
  });
  const json = await res.json().catch(() => ({}));
  conversationId = json.conversationId ?? null;
  console.log("assistant (commercial) -> " + res.status + " | conversationId=" + conversationId);
} catch (e) {
  console.log("assistant commercial ERROR " + e.message);
}

if (conversationId) {
  const envPath = resolve(process.cwd(), ".env.local");
  let databaseUrl = null;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) databaseUrl = m[1].trim();
  }
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const lead = await sql`SELECT status, intent FROM leads WHERE conversation_id = ${conversationId}::uuid`;
    console.log("lead:", lead.length > 0 ? lead[0].status + "/" + lead[0].intent : "MISSING");
    const events = await sql`
      SELECT event_type FROM lead_events WHERE conversation_id = ${conversationId}::uuid ORDER BY occurred_at
    `;
    console.log("events:", events.length > 0 ? events.map((e) => e.event_type).join(" -> ") : "NONE");
    const quals = await sql`
      SELECT score, confidence FROM lead_qualifications
      WHERE lead_id = (SELECT lead_id FROM leads WHERE conversation_id = ${conversationId}::uuid)
    `;
    console.log("qualifications:", quals.length > 0 ? quals.map((q) => q.score + "/" + q.confidence).join("; ") : "NONE");
    const runs = await sql`SELECT state, tool_id FROM agent_runs WHERE external_run_id = ${"run_" + conversationId} ORDER BY created_at`;
    console.log("agent_runs:", runs.length > 0 ? runs.map((r) => r.state + (r.tool_id ? "[" + r.tool_id + "]" : "")).join(" -> ") : "NONE");
    const execs = await sql`SELECT status, execution_occurred FROM runtime_executions WHERE run_id = ${"run_" + conversationId}`;
    console.log("executions:", execs.length > 0 ? execs.map((e) => e.status + "/occurred=" + e.execution_occurred).join("; ") : "NONE");
    const evid = await sql`SELECT type, confidence FROM runtime_evidence WHERE run_id = ${"run_" + conversationId}`;
    console.log("evidence:", evid.length > 0 ? evid.map((e) => e.type + "/" + e.confidence).join("; ") : "NONE");
    const meta = await sql`SELECT metadata FROM conversations WHERE conversation_id = ${conversationId}::uuid`;
    console.log("metadata runtime_run_id:", meta[0]?.metadata?.runtime_run_id ? "present" : "MISSING");
  } finally {
    await sql.end();
  }
}
