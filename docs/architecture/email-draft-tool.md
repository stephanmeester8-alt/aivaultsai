# Agent Tool Platform — Email Draft Tool (TASK 18)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de employee approval-integratie (TASK 17).
> Doel: de eerste centrale **EMAIL-tool** — `email_draft` als ToolSpec in de registry met een adapter over de **bestaande** `draftOutreach`-generator, plus `EMAIL_DRAFT` in de centrale `PERMISSIONS`. De tool **verstuurt NOOIT** — er is geen netwerk-I/O en geen verzendpad in deze adapter; send volgt in TASK 19 met approval.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// apps/web/lib/prospect-run/prospect-agent.ts  (geverifieerd)
draftOutreach(input: ProspectInput, intelligence: ProspectIntelligence): OutreachDraft
  // deterministische, pure template-generator (geen LLM, geen I/O)
  // retourneert { subject, body, optOutLine } (optOutLine is een vaste zin)

// apps/web/lib/prospect-run/email-dispatcher.ts  (geverifieerd)
EmailProvider.send({ to, subject, text, idempotencyKey })  // interface; mode HUMAN_REVIEW = alleen queue
DispatchRequest { …, draft: OutreachDraft, … }

// apps/web/lib/autonomous-employee/tools.ts
createOutreachDraft(input, ctx)  // wikkelt draftOutreach; employee-only, geen centrale registratie
```

- TASK 4-catalogus: `EMAIL_DRAFT` bestaat als permission-ontwerp, maar is **nog niet** in de gesloten `PERMISSIONS`-union van agent-core.
- TASK 15-mapping: `employee_outreach_draft` (WRITE / MEDIUM / `EMAIL_DRAFT` / enabled / adapter `employee-draft`).
- Drafts worden vandaag uitsluitend bewaard in de employee-sessie-summary (`OutreachActionRecord`) en prospect-run-manifests — **geen** centrale, herbruikbare draft-opslag.

**Gevolg (FACT):** er is geen centrale `email_draft`-tool die *elke* agent (assistant, employee, DeepSeek-agent) via dezelfde registry+gate kan aanroepen; drafts bestaan alleen in de employee-flow. TASK 18 maakt de tool centraal zonder de bestaande generator te herbouwen.

## 2. Doel & principe

```text
AGENT → REGISTRY (email_draft, enabled)
  → INPUT VALIDATION (schema §4, bounded)
  → POLICY (EMAIL_DRAFT — centrale PERMISSIONS)
  → EXECUTION GATE (enabled ∧ adapter ∧ valid)
  → ADAPTER (bestaande draftOutreach; pure functie, geen netwerk)
  → EVIDENCE (draftId, argsHash, lengtes — nooit volledige body)
  → DRAFT-OPSLAG (email_drafts, idempotent) → draftId
```

- **Eén centrale tool** voor alle agents; de employee gebruikt dezelfde tool (TASK 15-mapping `employee_outreach_draft` wordt vervangen door `email_draft` in `allowedTools` — zie §6).
- **Send is in deze tool structureel onmogelijk:** de adapter heeft geen fetch/provider/client; het enige uitvoerpad is de draft-opslag. TASK 19 leest die opslag.
- Drafts zijn **bounded**: afgewezen i.p.v. afgekapt (een afgekapte e-mail mag nooit worden goedgekeurd/verstuurd).

## 3. ToolSpec (copy-ready, centrale catalogus)

```ts
const EMAIL_DRAFT: ToolSpec = {
  id: "email_draft",
  name: "Email Draft",
  description:
    "Stel een outreach-e-maildraft op via de bestaande deterministische generator. " +
    "Verstuurt NOOIT e-mail; de draft wordt idempotent opgeslagen en is het invoercontract voor email_send (TASK 19).",
  version: "1.0.0",
  category: "EMAIL",
  inputSchema: {
    type: "object",
    properties: {
      to:        { type: "string", minLength: 3, maxLength: 320 },  // e-mailadres ontvanger
      companyName: { type: "string", minLength: 1, maxLength: 200 },
      domain:    { type: "string", minLength: 1, maxLength: 253 },
      evidenceRefs: { type: "array", items: { type: "string" }, maxItems: 10 },
    },
    required: ["to", "companyName", "domain"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string" },         // email_draft_{uuid}
      subject: { type: "string" },          // ≤ 200 tekens
      body: { type: "string" },             // ≤ 5 000 tekens
      optOutLine: { type: "string" },
      status: { const: "DRAFT" },
    },
    required: ["draftId", "subject", "body", "optOutLine", "status"],
  },
  permissions: ["EMAIL_DRAFT"],
  class: "WRITE",
  riskLevel: "MEDIUM",
  requiresApproval: false,                  // draft = geen side effect; send (HIGH) wel (TASK 19)
  enabled: true,
  adapter: "email-draft",
  tenantPolicy: "TENANT",                   // per-tenant schakelaar in TASK 25
  auditEnabled: true,
  timeoutMs: 5_000,                          // pure functie; ruim budget
  rateLimit: { max: 60, windowMs: 60_000 }, // per tenant
};
```

## 4. Adapter & validatie (`apps/web/lib/tool-registry/adapters/email-draft.ts`)

```ts
async function executeEmailDraft(input: EmailDraftInput, ctx: ToolContext): Promise<ToolResult<EmailDraftOutput>> {
  // 1. schema-validatie (fail-closed): onbekende velden → DENY (additionalProperties: false)
  // 2. permission-check: EMAIL_DRAFT via PolicyEngine (centrale PERMISSIONS, niet employee-policy)
  // 3. boundary-check: subject ≤ 200, body ≤ 5 000, to ≤ 320 → overschrijding = DENY (nooit afkappen)
  // 4. generator: HERGEBRUIK draftOutreach (prospect-run) via een minimal shape-mapping
  //    (companyName/domain → ProspectInput-velden; intelligence uit evidenceRefs of lege fallback)
  // 5. idempotente opslag: INSERT INTO email_drafts … ON CONFLICT (tenant_id, session_id, action_id) DO NOTHING
  // 6. evidence: { draftId, toHash: sha256(to), subjectLength, bodyLength, domain }
}
```

- **Geen netwerk-I/O, geen provider, geen fetch** — een send-poging is binnen deze adapter onmogelijk (er is geen pad naar `EmailProvider`).
- `toHash` (SHA-256) i.p.v. het ruwe adres in audit/evidence: PII-minimalisatie; de draft-opslag zelf bevat `to` (nodig voor TASK 19), maar logs/audit alleen de hash.

## 5. Draft-opslag (migratie 006, voorstel)

```sql
CREATE TABLE IF NOT EXISTS email_drafts (
  draft_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  session_id    UUID,                          -- employee-sessie (nullable: ook losse calls)
  action_id     TEXT,                          -- employee-actie (nullable)
  to_address    TEXT NOT NULL,
  subject       TEXT NOT NULL CHECK (char_length(subject) <= 200),
  body          TEXT NOT NULL CHECK (char_length(body) <= 5000),
  opt_out_line  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','SENT','CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_drafts_session_action_unique UNIQUE (tenant_id, session_id, action_id)
);
-- idempotent: herhaalde draft-call voor dezelfde (tenant, sessie, actie) overschrijft niets
-- status SENT wordt alleen door TASK 19 (email_send) gezet, na approval
```

- **Geen nieuwe executie-laag:** opslag is alleen het contract tussen `email_draft` en `email_send` (TASK 19) + HITL-UI (TASK 17-kaart leest de draft).
- Bestaande employee-sessies blijven werken: `OutreachActionRecord` blijft de sessie-summary; de tabel is de duurzame bron voor send/approval.

## 6. Employee-koppeling (TASK 15-update)

| TASK 15-mapping | TASK 18-beslissing |
|---|---|
| `employee_outreach_draft` (eigen tool) | **vervangen** door centrale `email_draft` in `allowedTools` van de employee-agent |
| adapter `employee-draft` | adapter `email-draft` (zelfde implementatiefunctie) |
| `EMAIL_DRAFT` (ontwerp) | toegevoegd aan `PERMISSIONS` (agent-core) bij implementatie — additive, gesloten union blijft fail-closed |

- De employee `createOutreachDraft`-functie wordt een dunne doorgave naar de centrale adapter (geen parallelle generator).
- `email_send` blijft **buiten** `allowedTools` (TASK 15/17: alleen via approval-poort).

## 7. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `EMAIL_DRAFT` niet in agent-permissions | DENY (policy) |
| Tool disabled / adapter ontbreekt | DENY / NOT_IMPLEMENTED (gate) |
| Input ongeldig (missend `to`/`companyName`/`domain`, onbekend veld) | DENY (schema) |
| subject > 200 / body > 5 000 / to > 320 | DENY — nooit afkappen (afgekapte e-mail is onverstuurbaar) |
| Herhaalde call zelfde (tenant, sessie, actie) | idempotent: zelfde draftId, geen duplicate rij |
| Send-poging binnen deze tool | onmogelijk: geen provider/netwerkpad in de adapter |
| PII in audit | `toHash` i.p.v. ruw adres; body nooit in audit |

## 8. Security

- Drafts zijn data zonder side effect (WRITE/MEDIUM, geen approval) — de risk-classificatie (TASK 5) blijft leidend; send (EXTERNAL_SIDE_EFFECT/HIGH + approval) komt pas in TASK 19.
- PII-minimalisatie: audit/evidence bevat `toHash` + lengtes + domain, nooit volledige body; de tabel is de enige plek met `to_address` (tenant-gescoped, FK naar tenant).
- Geen LLM-directe generatie: de generator is deterministische code (`draftOutreach`); prompt-injectie kan de draft niet laten "versturen" (geen pad).
- `additionalProperties: false` in het schema → model kan geen velden smokkelen (bv. `send: true`).

## 9. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `EMAIL_DRAFT` in `PERMISSIONS` (additive)
- `apps/web/lib/tool-registry/tools.ts` — `EMAIL_DRAFT` ToolSpec (§3)
- `apps/web/lib/tool-registry/adapters/email-draft.ts` — adapter §4
- `apps/web/lib/db/migrations/006_email_drafts.sql` — §5
- `apps/web/test/email-draft-tool.test.ts` — testmatrix §10

## 10. Testmatrix (FASE 18)

valid draft → draftId + DRAFT-status · invalid input (missing to/companyName/domain) → DENY · onbekend veld (additionalProperties) → DENY · subject > 200 → DENY · body > 5 000 → DENY · missing permission (agent zonder EMAIL_DRAFT) → DENY · disabled tool → DENY · missing adapter → NOT_IMPLEMENTED · wrong tenant (FK) → DENY · idempotent (zelfde sessie/actie → zelfde draftId) · audit bevat toHash + lengtes, géén body/ruw adres · send onmogelijk (geen provider in adapter) · determinisme (zelfde input → zelfde subject/body) · concurrent calls (unieke draftIds) · bestaande employee-tests groen (dunne doorgave).

## 11. Consequenties

- TASK 19 (email_send): leest `email_drafts` op `draftId`; approval (TASK 17-flow) bindt aan de draft; status → SENT.
- TASK 21/23 (CRM/calendar write): zelfde patroon — centrale ToolSpec + adapter over bestaande logica + idempotente opslag.
- TASK 26 (e2e): draft → approval → send is de volledige email-keten.
