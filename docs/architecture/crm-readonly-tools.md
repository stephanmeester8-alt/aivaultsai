# Agent Tool Platform — CRM Read-Only Tools (TASK 20)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de email send-tool (TASK 19).
> Doel: de eerste CRM-capability — centrale **`contact_search`** en **`lead_read`** als ToolSpecs met een **read-only** adapter achter een injectable, vendor-agnostische `CrmClient`. Geen write-pad in deze adapter; writes volgen in TASK 21 met approval.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```text
TASK 2-matrix (tool-capability-matrix.md, regels 80–81, geverifieerd):
  contact_search / lead_read    READ  | MEDIUM | geen approval | CRM_READ | P (planned)
                                 | CRM-adapter | PII-bewust
  contact_create/update, lead_create/update   WRITE | MEDIUM–HIGH | tenant-policy | CRM_WRITE | P
```

- **Geen CRM-clientcode in de repo** (geverifieerd): `crmSignals` bestaat alleen als *invoerveld* in de prospect-run (`types.ts`, `openai-analyzer.ts` — "redacts public/crm signals") — data, geen integratie.
- TASK 4-catalogus: `CRM_READ` (READ/MEDIUM) en `CRM_WRITE` (WRITE/MEDIUM–HIGH) zijn ontworpen maar **nog niet** in de gesloten `PERMISSIONS`-union van agent-core.
- Patroon (TASK 18/19): injectable clients (`EmailProvider`) — geen vendor-key in code; provider-keys horen in Vercel env + `.env.local` (gitignored).
- Prospect-run heeft een bewezen `sanitizeIntelligenceContext`-redactiepatroon (PII-bewust prompten) dat we hergebruiken.

**Gevolg (FACT):** CRM is volledig groenfield qua integratie — deze taak legt de tool-laag vast (registry + adapter + contracten) zonder enige vendor-afhankelijkheid; de `CrmClient` is een injectable interface, zoals `EmailProvider` en `lookup` dat al zijn.

## 2. Doel & principe

```text
AGENT → REGISTRY (contact_search | lead_read, enabled)
  → INPUT VALIDATION (bounded: query/email/company/leadId/limit)
  → POLICY (CRM_READ — centrale PERMISSIONS)
  → EXECUTION GATE (enabled ∧ adapter ∧ valid)   // adapter ontbreekt → NOT_IMPLEMENTED
  → CRM-ADAPTER (injectable CrmClient; tenant-gescoped)
  → PII-REDACTIE (sanitize-velden, bounded output)
  → EVIDENCE (query-hash, aantal records, nooit ruwe contactdata)
```

- **Read-only is structureel:** de adapter-interface bevat alleen `searchContacts`/`getLead` — geen create/update/delete-methoden, geen write-pad.
- **PII-bewust** (matrix-vereiste): output is bounded en gefilterd; audit bevat nooit ruwe contactdata.
- Geen approval (READ/MEDIUM — risico-classificatie TASK 5 blijft leidend); writes krijgen approval in TASK 21.

## 3. ToolSpecs (copy-ready, centrale catalogus)

```ts
const CONTACT_SEARCH: ToolSpec = {
  id: "contact_search",
  name: "Contact Search",
  description:
    "Zoek CRM-contacten (bounded, tenant-gescoped, PII-bewust). Read-only: " +
    "deze tool kan geen contacten aanmaken of wijzigen.",
  version: "1.0.0",
  category: "CRM",
  inputSchema: {
    type: "object",
    properties: {
      q:       { type: "string", maxLength: 200 },           // vrije zoekterm
      email:   { type: "string", maxLength: 320 },           // exacte match (optioneel)
      company: { type: "string", maxLength: 200 },           // bedrijfsnaam (optioneel)
      limit:   { type: "integer", minimum: 1, maximum: 20 }, // default 10
    },
    anyOf: [{ required: ["q"] }, { required: ["email"] }, { required: ["company"] }],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      contacts: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", maxLength: 200 },
            email: { type: "string", maxLength: 320 },
            company: { type: ["string", "null"], maxLength: 200 },
            role: { type: ["string", "null"], maxLength: 120 },
          },
          required: ["id", "name", "email"],
        },
      },
      truncated: { type: "boolean" },
    },
    required: ["contacts", "truncated"],
  },
  permissions: ["CRM_READ"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,                        // adapter ontbreekt → NOT_IMPLEMENTED (fail-closed)
  adapter: "crm",
  tenantPolicy: "TENANT",               // TASK 25-hook
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 60, windowMs: 60_000 },
};

const LEAD_READ: ToolSpec = {
  id: "lead_read",
  name: "Lead Read",
  description: "Lees één CRM-lead op id (bounded, tenant-gescoped). Read-only.",
  version: "1.0.0",
  category: "CRM",
  inputSchema: {
    type: "object",
    properties: { leadId: { type: "string", minLength: 1, maxLength: 200 } },
    required: ["leadId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      lead: {
        type: ["object", "null"],        // null = niet gevonden (geen gok)
        properties: {
          id: { type: "string" },
          company: { type: ["string", "null"], maxLength: 200 },
          status: { type: ["string", "null"], maxLength: 60 },
          owner: { type: ["string", "null"], maxLength: 120 },
          updatedAt: { type: ["string", "null"] },
        },
        required: ["id"],
      },
    },
    required: ["lead"],
  },
  permissions: ["CRM_READ"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "crm",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 120, windowMs: 60_000 },
};
```

## 4. CrmClient-interface (injectable, vendor-agnostisch)

```ts
// apps/web/lib/crm/client.ts — geen vendor-key, geen vendor-types; net als EmailProvider
interface CrmClient {
  searchContacts(
    query: { q?: string; email?: string; company?: string; limit: number },
    ctx: { tenantId: string },
  ): Promise<CrmContact[]>;                       // client is verplicht tenant-gefiltterd te retourneren
  getLead(leadId: string, ctx: { tenantId: string }): Promise<CrmLead | null>;
}

interface CrmContact { id: string; name: string; email: string; company: string | null; role: string | null; }
interface CrmLead     { id: string; company: string | null; status: string | null; owner: string | null; updatedAt: string | null; }
```

- **Read-only contract:** de interface heeft géén create/update/delete — een write is binnen deze adapter structureel onmogelijk (zelfde patroon als `email_draft` zonder send-pad).
- **Tenancy:** `tenantId` zit in elke call-context; de adapter weigert als de tenant ontbreekt (fail-closed); de client-verplichting "tenant-gefiltreerd retourneren" is een contract-eis (implementatie-check in de testmatrix).
- Een concrete provider (HubSpot/Salesforce/Pipedrive/…) implementeert deze interface later — key alleen in Vercel env + `.env.local` (gitignored), nooit in code/prompts/logs.

## 5. Adapter & redactie (`apps/web/lib/tool-registry/adapters/crm.ts`)

```ts
async function executeContactSearch(input, ctx): Promise<ToolResult> {
  // 1. schema-validatie (fail-closed, additionalProperties: false)
  // 2. permission-check: CRM_READ via PolicyEngine
  // 3. tenant-check: ctx.tenantId verplicht
  // 4. client.searchContacts({ ...input, limit: min(input.limit ?? 10, 20) }, { tenantId })
  // 5. PII-redactie: sanitize per record (naam/email/company/role bounded, vrije tekstvelden
  //    zoals notes/gesprekshistorie worden NIET geretourneerd — hergebruik prospect-run-redactiepatroon)
  // 6. evidence: { queryHash: sha256(genormaliseerde query), count, truncated } — nooit ruwe data
}
```

- **Notities/gesprekshistorie/privé-velden staan niet in de output-schema's**: het model krijgt alleen de gevraagde kernvelden — PII-bewust en token-bewust (FASE 16).
- `truncated: true` bij `limit`-overschrijding (bounded, geen paginatie-loop voor het model).

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `CRM_READ` niet in agent-permissions | DENY (policy) |
| Tool disabled / adapter ontbreekt | DENY / NOT_IMPLEMENTED (gate) |
| Input zonder zoekterm/email/company of onbekend veld | DENY (schema) |
| `limit` > 20 / lege strings | DENY (schema) |
| `tenantId` ontbreekt | DENY (tenant-check) |
| Lead niet gevonden | `lead: null` (geen gok, geen inventie) |
| Client-fout / timeout | gecontroleerde fout; geen ongecontroleerde retry (REGEL 5) |
| Write-poging binnen deze adapter | onmogelijk: interface heeft geen write-methoden |

## 7. Security

- PII-redactie in de adapter (output-schema's + sanitize); audit bevat alleen `queryHash` + count + truncated — nooit namen/e-mails/notities.
- Geen credentials: `CrmClient` wordt geïnjecteerd (provider-key buiten de tool-laag); niets in ToolSpec-descriptions of logs.
- Tenancy: elke call draagt `tenantId`; cross-tenant contacten kunnen niet worden opgevraagd (contract + tests).
- Read-only contract voorkomt per-ongeluk-writes door het model of een toekomstige adapter-variant.

## 8. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `CRM_READ` in `PERMISSIONS` (additive; `CRM_WRITE` pas in TASK 21)
- `apps/web/lib/crm/client.ts` — `CrmClient`/`CrmContact`/`CrmLead` (§4)
- `apps/web/lib/tool-registry/tools.ts` — beide ToolSpecs (§3)
- `apps/web/lib/tool-registry/adapters/crm.ts` — adapter + redactie (§5)
- `apps/web/test/crm-readonly-tools.test.ts` — testmatrix §9

## 9. Testmatrix (FASE 18)

valid contact_search (q/email/company) → bounded contacts · valid lead_read → lead · limit > 20 → DENY · geen zoekterm → DENY · onbekend veld → DENY · missing permission → DENY · disabled/missing adapter → DENY/NOT_IMPLEMENTED · tenantId ontbreekt → DENY · lead niet gevonden → null (geen gok) · client retourneert cross-tenant-data → test faalt (contract) · PII: notes/gesprekshistorie nooit in output · audit: queryHash + count, nooit ruwe data · truncated bij limiet · client-fout → gecontroleerd, geen auto-retry · concurrent calls · bestaande tests groen (adapter optioneel injecteerbaar).

## 10. Consequenties

- TASK 21 (CRM write — approval): `CrmClient` krijgt write-methoden in een **apart** write-contract (`CrmWriteClient`), approval-binding op toolId/argumentsHash (TASK 6/17-patroon), `CRM_WRITE` in `PERMISSIONS`.
- TASK 25 (tenant): `tenantPolicy` per tenant bepaalt of CRM-tools bestaan.
- TASK 26 (e2e): contact_search + lead_read als read-route in de e2e-keten.
