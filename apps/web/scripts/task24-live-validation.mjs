// TASK 24 live validation (FASE 20-22): pages, assistant, booking, then
// a controlled commercial test with DB read-back proving the full chain:
// conversation -> lead -> qualification -> lead_qualifications -> events
// -> agent runtime -> execution -> evidence.
// No PII. DATABASE_URL is read from .env.local and never printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const BASE = "https://www.aivaultsai.one";
const PAGES = ["/", "/websites", "/ai-assistenten", "/leadautomatisering", "/robots.txt", "/sitemap.xml"];

for (const p of PAGES) {
  try {
    const res = await fetch(BASE + p, { redirect: "follow", headers: { "user-agent": "aivaultsai-task24" } });
    const text = await res.text();
    const title = /<title[^>]*>([^<]+)<\/title>/.exec(text);
    const ld = (text.match(/application\/ld\+json/g) || []).length;
    console.log(p + " -> " + res.status + (title ? " | " + title[1].slice(0, 40) : "") + " | jsonld=" + ld);
  } catch (e) {
    console.log(p + " -> ERROR " + e.message);
  }
}

// Booking behavior (unchanged: honest unavailable)
try {
  const av = await fetch(BASE + "/api/booking/availability", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "aivaultsai-task24" },
    body: JSON.stringify({ startDate: "2026-10-01T09:00:00Z", endDate: "2026-10-01T17:00:00Z", timezone: "Europe/Amsterdam", durationMinutes: 30 }),
  });
  const avj = await av.json();
  console.log("booking availability -> " + av.status + " | available=" + avj.available);
  const ap = await fetch(BASE + "/api/booking/appointments", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "aivaultsai-task24" },
    body: JSON.stringify({ leadId: crypto.randomUUID(), conversationId: crypto.randomUUID(), start: "2026-10-01T10:00:00Z", end: "2026-10-01T10:30:00Z", timezone: "Europe/Amsterdam", contactMethod: "video" }),
  });
  console.log("booking appointments -> " + ap.status);
} catch (e) {
  console.log("booking ERROR " + e.message);
}

// Controlled commercial test (HIGH intent via the existing classifier, no PII)
console.log("--- assistant commercial test ---");
const sessionId = crypto.randomUUID();
let conversationId = null;
try {
  const started = Date.now();
  const res = await fetch(BASE + "/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "aivaultsai-task24" },
    body: JSON.stringify({
      message: "Ik wil graag een afspraak plannen voor een kennismaking over een nieuwe website die meer leads oplevert.",
      sessionId,
      attribution: {
        referrer: "https://www.google.com/search?q=aivaultsai",
        landing_page: "https://www.aivaultsai.one/websites",
        utm_source: "google",
        utm_medium: "organic",
        utm_campaign: "task24",
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  conversationId = json.conversationId ?? null;
  console.log("assistant -> " + res.status + " | conversationId=" + conversationId + " | durationMs=" + (Date.now() - started));
  console.log("message=" + (typeof json.message === "string" ? json.message.slice(0, 60) : JSON.stringify(json).slice(0, 100)));
} catch (e) {
  console.log("assistant ERROR " + e.message);
}

if (conversationId) {
  console.log("--- DB read-back (chain proof) ---");
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf8");
  let databaseUrl = null;
  for (const line of envContent.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) databaseUrl = m[1].trim();
  }
  if (!databaseUrl) {
    console.log("LIVE_DB_VERIFICATION = NOT_AVAILABLE (geen DATABASE_URL)");
  } else {
    const sql = postgres(databaseUrl, { prepare: false, max: 2 });
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const conv = await sql`
        SELECT conversation_id, source, visitor_session_id, metadata
        FROM conversations WHERE conversation_id = ${conversationId}::uuid
      `;
      console.log("conversation: " + (conv.length > 0 ? "found" : "MISSING"));
      if (conv[0]) {
        const meta = conv[0].metadata ?? {};
        console.log("metadata.runtime_run_id: " + (meta.runtime_run_id ?? "MISSING"));
      }
      const msgs = await sql`
        SELECT role, sequence_number FROM conversation_messages
        WHERE conversation_id = ${conversationId}::uuid ORDER BY sequence_number
      `;
      console.log("messages: " + msgs.map((m) => m.role + "#" + m.sequence_number).join(", "));
      const lead = await sql`
        SELECT lead_id, status, intent FROM leads WHERE conversation_id = ${conversationId}::uuid
      `;
      console.log("lead: " + (lead.length > 0 ? lead[0].status + " / " + lead[0].intent + " (" + lead[0].lead_id + ")" : "MISSING"));
      const events = await sql`
        SELECT event_type, message_id IS NOT NULL AS has_message, occurred_at
        FROM lead_events WHERE conversation_id = ${conversationId}::uuid ORDER BY occurred_at
      `;
      console.log("lead_events: " + (events.length > 0 ? events.map((e) => e.event_type + (e.has_message ? "*" : "")).join(" -> ") : "NONE"));
      const quals = await sql`
        SELECT qualification_id, score, confidence, qualified_by, cardinality(supporting_event_ids) AS sup
        FROM lead_qualifications WHERE lead_id = ${lead.length > 0 ? lead[0].lead_id : "00000000-0000-0000-0000-000000000000"}::uuid
      `;
      console.log("lead_qualifications: " + (quals.length > 0 ? quals.map((q) => "score=" + q.score + " conf=" + q.confidence + " by=" + q.qualified_by + " sup=" + q.sup).join("; ") : "NONE"));
      const runs = await sql`
        SELECT state, task_id, tool_id FROM agent_runs WHERE external_run_id = ${"run_" + conversationId} ORDER BY created_at
      `;
      console.log("agent_runs (" + runs.length + "): " + (runs.length > 0 ? runs.map((r) => r.state + (r.tool_id ? "[" + r.tool_id + "]" : "")).join(" -> ") : "NONE"));
      const execs = await sql`
        SELECT execution_id, status, execution_occurred, input_hash IS NOT NULL AS has_input_hash, output_hash IS NOT NULL AS has_output_hash
        FROM runtime_executions WHERE run_id = ${"run_" + conversationId}
      `;
      console.log("runtime_executions (" + execs.length + "): " + (execs.length > 0 ? execs.map((e) => e.status + " occurred=" + e.execution_occurred + " ihash=" + e.has_input_hash + " ohash=" + e.has_output_hash).join("; ") : "NONE"));
      const evid = await sql`
        SELECT evidence_id, claim, type, confidence FROM runtime_evidence WHERE run_id = ${"run_" + conversationId}
      `;
      console.log("runtime_evidence (" + evid.length + "): " + (evid.length > 0 ? evid.map((e) => e.type + "/" + e.confidence + ": " + e.claim.slice(0, 50)).join("; ") : "NONE"));
      const tasks = await sql`
        SELECT task_id, status, priority, assigned_to FROM runtime_tasks WHERE run_id = ${"run_" + conversationId}
      `;
      console.log("runtime_tasks (" + tasks.length + "): " + (tasks.length > 0 ? tasks.map((t) => t.status + " p=" + t.priority + " " + t.assigned_to).join("; ") : "NONE"));
    } finally {
      await sql.end();
    }
  }
} else {
  console.log("LIVE_DB_VERIFICATION = NOT_AVAILABLE (geen conversationId)");
}
