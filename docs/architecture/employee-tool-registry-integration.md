# Agent Tool Platform — Autonomous Employee Tool Registry Integration (TASK 15)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de genormaliseerde research-output (TASK 14).
> Doel (FASE 7): de Autonomous AI Employee gaat door de **zelfde centrale securitylaag** als alle andere agents — Tool Registry → input-validatie → PolicyEngine → risk → approval → ExecutionGate → adapter → evidence. Geen eigen parallelle policy, geen directe API-calls. Deze taak legt het ontwerp vast; implementatie volgt in latere taken (TASK 16/17 + per-tool-taken).

---

## 1. Uitgangspunt: bestaande situatie (FACT)

De employee werkt vandaag met een **eigen, statische tool- en policy-laag**:

```ts
// apps/web/lib/autonomous-employee/tools.ts  — 5 tools
discoverProspects        // validate + dedupe kandidaten (geen externe side effect)
researchCompanyWebsite   // guarded fetch + deterministische AI-detectie (1 tool)
qualifyProspect          // bestaande scoring + route-matching
createOutreachDraft      // bestaande draft-generator (verstuurt NOOIT)
sendEmail                // structureel onmogelijk: policy DENY

// apps/web/lib/autonomous-employee/policy.ts — eigen permission-matrix
EmployeePermission = "discovery.read" | "website.research" | "ai.detect"
                   | "database.read" | "database.write" | "outreach.draft" | "email.send"
PERMISSION_POLICY: "email.send" = { allowed: false, reason: "EMAIL_SEND_REQUIRES_APPROVAL" }
```

Daarnaast roept de orchestrator **direct** DB-functies aan (`hasFreshResearch`, `getCompanyByDomain`, `upsertCompany`, `createProspectRun`, `persistRunManifest` — `orchestrator.ts`) en is `analyze()` (LLM-call) een directe dependency.

**Gevolg (FACT):** de employee-tools staan **buiten** de centrale Tool Registry (TASK 3-ontwerp), buiten discovery (TASK 7) en buiten de `ExecutionGate`. De fail-closed-eigenschappen (eigen policy-check per tool) zijn goed, maar er zijn **twee policy-systemen** naast elkaar — precies wat het einddoel ("één securitylaag voor elke tool-call") verbiedt.

## 2. Doel

```text
employee → planner → tool selectie (discovery) → policy (centraal) → approval
        → ExecutionGate → adapter → evidence → memory → next step
```

Elke employee-stap wordt een **ToolSpec in de centrale registry** (`apps/web/lib/tool-registry/`), met dezelfde velden en dezelfde gate als `assistant_website_research`. De bestaande implementatiefuncties in `tools.ts` worden de **adapters** achter die specs — geen nieuwe tweede executie-engine, geen herbouw.

## 3. Tool-mapping (huidig → centrale registry)

| Huidige employee-tool | Nieuwe ToolSpec-id | class | risk | permissions | requiresApproval | enabled | adapter |
|---|---|---|---|---|---|---|---|
| `discoverProspects` | `employee_discovery` | READ | LOW | `DATABASE_READ`¹ | false | true | `employee-prospect` |
| `researchCompanyWebsite` | `employee_website_research` | READ | MEDIUM | `API_REQUEST` | false | true | `employee-research` |
| `qualifyProspect` | `employee_qualify` | READ | LOW | `DATABASE_READ`¹ | false | true | `employee-prospect` |
| `createOutreachDraft` | `employee_outreach_draft` | WRITE | MEDIUM | `EMAIL_DRAFT`² | false | true | `employee-draft` |
| `sendEmail` | `employee_email_send` | EXTERNAL_SIDE_EFFECT | HIGH | `EMAIL_SEND`² | true | **false** | `email` (TASK 19) |
| directe DB-calls (orchestrator) | `employee_database_read` / `employee_database_write` | READ / WRITE | MEDIUM / MEDIUM | `DATABASE_READ` / `DATABASE_WRITE` | false | true | `employee-db` |

¹ `discovery.read`/`database.read` mappen op de centrale `DATABASE_READ`: de kandidatenlijst komt uit de sessieconfig (opgeslagen in `employee_work_sessions.config`) en kwalificatie leest opgeslagen research (`hasFreshResearch`/`getCompanyByDomain`).
² `EMAIL_DRAFT`/`EMAIL_SEND` staan in de centrale permission-catalogus (TASK 4) maar zijn **nog niet** in `PERMISSIONS` (agent-core) — dat is een implementatietaak (TASK 18/19), net als `GITHUB_*`.

**Kernregels (onveranderd uit vandaag):**
- `employee_email_send` staat **niet** in `allowedTools` van de employee-agent en is `enabled: false` — alleen bereikbaar via de approval-flow (TASK 17) en de bestaande fail-closed dispatcher.
- `employee_website_research` blijft 1 tool: **geen fetch zonder detectie-policy**.
- Onbekende tool / ontbrekende permission / disabled tool → DENY; ontbrekende adapter → NOT_IMPLEMENTED.

## 4. Employee-agent-definitie (centraal)

```ts
AgentDefinition {
  id: "autonomous-employee",
  riskLevel: "MEDIUM",                       // max_risk-filter in discovery (TASK 6)
  allowedTools: [
    "employee_discovery", "employee_website_research",
    "employee_qualify", "employee_outreach_draft",
    "employee_database_read", "employee_database_write",
    // GEEN employee_email_send — alleen via approval-port (TASK 17)
  ],
  allowedPermissions: ["API_REQUEST", "DATABASE_READ", "DATABASE_WRITE", "EMAIL_DRAFT"],
  prohibitedPermissions: ["EMAIL_SEND"],     // dubbel slot: denied + niet in allowedTools
}
```

- `allowedTools` is de **vastgelegde tool-set van de employee** (planner-keuze): de orchestrator selecteert tools uit deze set via `discoverTools` (TASK 7) — de intent is de sessie-`goal`; de filters (enabled ∧ adapter ∧ allowedTools ∧ permissions ∧ max_risk ∧ tenant-policy) bepalen wat de planner mag zien. Lege match → fail-closed: geen tools, stap BLOCKED.
- Discovery is **geen autorisatie**: elke call gaat alsnog door de gate.

## 5. Flow per employee-stap (na integratie)

```text
1. PLANNER        orchestrator: volgende stap uit sessiegoal (deterministisch,
                  bestaande volgorde discovery → research → qualify → draft)
2. TOOL SELECTIE  discoverTools({ intent: stap, agentId: "autonomous-employee",
                  tenantId }) → ToolSpec[] (bounded: maxTools per run, TASK 16)
3. POLICY         PolicyEngine: agent.allowedTools ∧ allowedPermissions ∧
                  tool.requiredPermissions (centrale PERMISSIONS, niet EmployeePermission)
4. APPROVAL       ApprovalEngine: requiresApproval=true → PENDING (TASK 17-koppeling;
                  vandaag alleen employee_email_send = HIGH)
5. EXECUTION      ExecutionGate: enabled ∧ adapter ∧ input-validatie (JSON-schema
                  uit ToolSpec) → adapter (bestaande functies in tools.ts)
6. EVIDENCE       session-steps (bestaand) + tool-call-record (FASE 11: executionId,
                  argumentsHash, status, approvalId, evidenceRefs)
7. MEMORY         bestaande intelligenceCache + opgeslagen research (cache-first)
8. NEXT STEP      loop binnen budget (TASK 16); einde → summary + status
```

**Model-input (TASK 14-koppeling):** `employee_website_research` retourneert het `ResearchResult`-contract; de **enige** tekst die naar `analyze()` gaat is `conclusionInput` (bounded 4000/bron, 12 000 totaal). `detectAiAssistant` draait binnen dezelfde tool op de bounded summary — pagina's blijven data, nooit instructies (FASE 19).

## 6. Migratie & backwards compatibility

| Stap | Wat | Effect op bestaande tests |
|---|---|---|
| 1 | `policy.ts` → compatibele shim: `checkPermission` delegateert naar centrale `checkAgentPermission` + registry (mapping-tabel §3) | `employee-policy.test.ts` blijft groen (zelfde uitkomsten, nieuwe bron) |
| 2 | `tools.ts` → adapter-implementaties achter de ToolSpecs; signatures ongewijzigd | `autonomous-employee.test.ts` blijft groen |
| 3 | `orchestrator.ts` → tool-resolutie via registry i.p.v. directe imports; DB-calls via `employee_database_*`-adapters | idem |
| 4 | `sendEmail`-poort onveranderd DENY | idem |
| 5 | `EmployeePermission`-type wordt deprecated alias; verwijderen in TASK 17 (approval-integratie) | na TASK 17 |

- Geen database-migratie: `employee_work_sessions`/`steps` (005) blijven ongewijzigd; de registry is code (versieerbaar).
- Geen wijzigingen aan agent-core of de ExecutionGate — alleen consumptie van de bestaande laag.
- Bestaande flows (assistant, prospect-run) raken niets.

## 7. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Tool niet in employee `allowedTools` | DENY (planner kan hem niet selecteren én gate weigert) |
| Tool disabled / adapter ontbreekt | nooit in discovery-output; directe call → DENY / NOT_IMPLEMENTED |
| Permission ontbreekt (`EMAIL_SEND` zonder approval) | DENY — structureel onmogelijk, zoals vandaag |
| Discovery-match leeg (onbekende intent) | lege set; stap BLOCKED (geen gok-tools) |
| Ongeldige argumenten | DENY (JSON-schema-validatie uit ToolSpec) |
| `conclusionInput` > cap | `truncated: true` + limitation (TASK 14-contract) |
| Tenant-policy OFF | uitgesloten (TASK 25-hook) |
| Budget op (TASK 16) | STOP |

## 8. Security

- Eén policy-bron: `EmployeePermission` verdwijnt als autorisatiebron; de centrale `PERMISSIONS` + registry bepalen alles.
- Geen credentials/API-keys in ToolSpec-descriptions, discovery-log of session-details (FASE 11: alleen executionId/argsHash/status).
- Tenant-isolatie: elke tool-call draagt `tenantId` (bestaand in `EmployeeToolContext`); registry/tenant-policy checkt per call (TASK 25-hook).
- `analyze()` (model-call) blijft een runtime-dependency, géén tool met model-keuze: het model kan geen eigen tool-calls starten.
- Prompt-injectie: webinhoud komt uitsluitend via `conclusionInput` binnen; intent-matching in discovery werkt op vaste metadata.

## 9. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/tool-registry/tools.ts` — employee-ToolSpecs (§3-tabel) in de centrale catalogus
- `apps/web/lib/autonomous-employee/registry-adapter.ts` — bindt bestaande tools.ts-functies als adapters aan de specs
- `apps/web/lib/autonomous-employee/policy.ts` — shim (§6-stap 1)
- `apps/web/lib/autonomous-employee/orchestrator.ts` — registry-resolutie + discovery per stap
- `apps/web/test/employee-registry.test.ts` — testmatrix §10

## 10. Testmatrix (FASE 18, per employee-tool)

valid call · invalid input (schema) · missing permission · disabled tool · missing adapter · wrong tenant · approval required (`employee_email_send`) · approval rejected · timeout · execution failure · budget exceeded (TASK 16-hook) · audit generated (session-step + tool-call-record) · secrets niet gelogd · SSRF (research-tool, bestaande lookup-injectie) · concurrent execution (twee sessies, unieke keys) · retry behavior (FAILED-sessie herstart veilig).

## 11. Consequenties

- TASK 16 (budget): discovery-limieten + tool-call-teller op de registry-resolutie.
- TASK 17 (approval): `employee_email_send`-call → ApprovalEngine-binding (vervangt de huidige `approveAction`-port als enige route).
- TASK 18/19 (email): `EMAIL_DRAFT`/`EMAIL_SEND` in `PERMISSIONS` + adapters.
- TASK 25 (tenant): `tenantPolicy`-veld wordt actief voor employee-tools.
- TASK 26 (e2e): employee-run door de volledige registry-laag.
