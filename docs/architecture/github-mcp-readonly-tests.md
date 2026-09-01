# Agent Tool Platform — GitHub Read-Only Tests (TASK 10)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de GitHub MCP read-only integratie (TASK 9).
> Doel (FASE 18): de **fail-closed testmatrix** voor de GitHub read-only MCP-tools vastleggen — 16 verplichte cases plus de MCP-specifieke cases uit TASK 9 §10. Dit is het testplan dat bij de implementatietaak wordt uitgevoerd (adapter + registry-code), volledig met fake clients — geen echte GitHub/MCP-verbinding in tests.

---

## 1. Uitgangspunt (FACT)

- Bestaande test-infra: `node --test` met type-stripping; `apps/web/test/` (300 tests) en `packages/agent-core/test/` (239 tests); HttpAdapter-tests gebruiken injectable `fetchImpl`/`lookup` — nooit echt netwerk.
- TASK 8-ontwerp: `McpAdapter` krijgt een **injectable client** → tests gebruiken `FakeMcpClient`.
- TASK 9-mapping: read-only ToolSpecs (`mcp_github_*`, `GITHUB_READ`, READ/LOW–MEDIUM, `enabled: true`) + write-set (`enabled: false`).

## 2. Test-infrastructuur (voorstel)

```ts
class FakeMcpClient {
  tools: Map<string, McpTool>;            // tools/list-resultaat (alleen bij registratie)
  onCall: (name, args) => { result } | { error } | hang/oversized;
  callCount: number;                      // teller per test
  calls: { name, args }[];                // voor asserties
}
```

- Registry opgebouwd uit de TASK 9-catalogus (read-only enabled, write disabled).
- Agent: `allowedTools` + `allowedPermissions: ["GITHUB_READ"]`, `riskLevel` passend.
- Asserties op: `ExecutionResult.status` (SUCCESS/FAILED) + `PolicyResult`/DENY-reden + audit-record (serverId, toolId, argumentsHash, approvalId, geen secrets).
- Geen echte netwerk-calls; geen GitHub-token in tests (placeholder-token uitsluitend als injectie-check).

## 3. Testmatrix (FASE 18 — 16 verplichte cases)

| # | Case | Setup | Verwacht |
|---|---|---|---|
| 1 | valid call | read-only tool `mcp_github_issue_read`, agent met GITHUB_READ, fake client ok | SUCCESS; client.callCount=1; audit met toolId+serverId |
| 2 | invalid input | ontbrekend verplicht argument (bv. geen `owner/repo`) | DENY vóór client-call (callCount=0) |
| 3 | missing permission | agent zonder GITHUB_READ | DENY (`missingPermissions`), callCount=0 |
| 4 | disabled tool | write-tool `mcp_github_issue_create` (enabled:false) | DENY ("tool is disabled"), callCount=0 |
| 5 | missing adapter/binding | tool zonder McpToolBinding (niet geregistreerd) | NOT_IMPLEMENTED |
| 6 | wrong tenant | tenant-policy-hook (TASK 25) retourneert OFF | DENY (fail-closed placeholder) |
| 7 | approval required | write-tool HIGH per ongeluk enabled, geen approval | APPROVAL_REQUIRED, callCount=0 |
| 8 | approval rejected | zelfde + approval REJECTED | DENY, callCount=0 |
| 9 | timeout | fake client hangt > timeoutMs | FAILED ("timeout"); **geen retry** (callCount=1) |
| 10 | execution failure | fake client error / server offline | FAILED; geen retry (callCount=1) |
| 11 | budget exceeded | run-budget (TASK 16) op | STOP; callCount=0 |
| 12 | audit generated | succesvolle call | audit-record: executionId, toolId, serverId, argumentsHash, riskLevel, approvalId=null |
| 13 | secrets not logged | response bevat token-achtige waarde (`ghp_…`) | audit/logs bevatten de waarde NIET (redactie/resultSummary) |
| 14 | SSRF / config-only | poging endpoint in tool-argumenten te wijzigen | onmogelijk: endpoint is configuratie; test bevestigt dat client-endpoint niet door args wordt aangepast |
| 15 | concurrent execution | 5 parallelle calls (Promise.all) | alle SUCCESS; eigen audit-record per call; callCount=5 |
| 16 | retry behavior | eerste call faalt | FAILED, **geen automatische retry** (callCount=1); expliciete herkansing is nieuwe call |

## 4. MCP-specifieke cases (TASK 9 §10-koppeling)

| Case | Setup | Verwacht |
|---|---|---|
| binding mismatch | client geeft tool terug die niet in onze binding staat | NOT_IMPLEMENTED — nooit auto-map |
| tools/list alleen bij registratie | call-sequentie | `listTools`-count = 1 (bij init), 0 per call; elke call gebruikt de gebufferde catalogus |
| truncated response | response > maxResultBytes (1 MB) | SUCCESS met `truncated: true`; geen crash |
| /readonly-bevestiging | verbindingsconfiguratie met `/readonly`-endpoint | config-test: endpoint-string bevat readonly-suffix (beschermingslaag 2 aanwezig) |
| token-injectie | client krijgt token via injectie | token verschijnt nergens in registry/descriptions/audit (placeholder-check) |

## 5. Acceptatiecriteria

- Alle cases in §3–4 groen.
- Bestaande suites blijven groen: **300/300 web, 239/239 agent-core** — geen tests verwijderd.
- Lint 0 warnings; `git diff --check` schoon.
- Tests draaien zonder netwerk, zonder echte tokens, zonder DB.

## 6. Voorgestelde bestanden (bij implementatie)

- `apps/web/test/tool-registry-mcp-github.test.ts` — testmatrix §3–4 (registry + gate + audit)
- `apps/web/test/helpers/fake-mcp-client.ts` — FakeMcpClient
- `packages/agent-core/test/adapters/mcp-adapter.test.ts` — adapter-eenheidstests (timeout, truncation, geen retry)
- `packages/agent-core/test/permissions/permissions.test.ts` — uitbreiding: GITHUB_READ/WRITE/ADMIN in PERMISSIONS (fail-closed: onbekend → DENY)

## 7. Consequenties

- TASK 11/12 (browser-adapter) gebruiken hetzelfde testpatroon (injectable client + fail-closed matrix).
- FASE 19 (security review) kan op deze matrix leunen: auth, tenant-isolatie, secret-leakage en retry-gedrag zijn per case gedekt.
