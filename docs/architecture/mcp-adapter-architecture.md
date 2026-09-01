# Agent Tool Platform — MCP Adapter Architecture (TASK 8)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de tool-discovery (TASK 7).
> Doel (FASE 3): MCP als **extensielaag** aansluiten — nooit als vervanging van de PolicyEngine. Dit document legt de adapter-architectuur vast: AIVaultsAI Tool Registry → MCP Adapter → MCP Server → extern systeem. Implementatie volgt per taak (TASK 9+).
> **Bron-noot:** het onderzoek naar officiële MCP-bronnen (modelcontextprotocol.io, github/github-mcp-server) kon in deze taak niet live worden geverifieerd (web-search time-out). De genoemde GitHub-toolsets en protocol-details worden in TASK 9 geverifieerd tegen de MCP-server zelf (`tools/list`) voordat er code op gebouwd wordt.

---

## 1. Uitgangspunt: bestaande MCP-code (FACT)

`packages/agent-core` bevat vandaag:

```ts
MCP_TOOL: ToolDefinition = {
  id: "mcp", name: "MCP", category: "MCP",
  description: "Conceptual MCP tool. No adapter exists; never enabled.",
  capabilities: ["MCP_EXECUTE"],
  requiredPermissions: ["MCP_EXECUTE"],
  riskLevel: "HIGH", enabled: false,
}
// TOOL_IDS = [..., "mcp"]; permission MCP_EXECUTE bestaat
// ExecutionGate: geen adapter geregistreerd → NOT_IMPLEMENTED ("execution unavailable")
// agents: mcp staat in prohibitedTools van de meeste agent-definities
```

**Conclusie:** er is bewust nog geen MCP-adapter; de gate gedraagt zich fail-closed (NOT_IMPLEMENTED). Deze taak ontwerpt de laag die daar verandering in brengt — zonder de gate te omzeilen.

## 2. Principe: MCP is een extensielaag onder de gate

```text
MODEL
  → TOOL REGISTRY (ToolSpec, incl. mcp_* tools)
  → INPUT VALIDATION
  → POLICY ENGINE (permissions, max_risk)
  → RISK / APPROVAL (HIGH/CRITICAL → mens)
  → EXECUTION GATE (enige poort)
  → MCP ADAPTER        ← nieuw
  → MCP SERVER         (extern proces / remote endpoint)
  → EXTERNAL SYSTEM    (GitHub, filesystem, database, browser, …)
  → EVIDENCE / AUDIT
```

- De MCP-server is **alleen de uitvoerder** achter de gate. De server kent geen permissions, geen risk, geen approval.
- Een MCP-tool-call wordt **niet** anders behandeld dan een HTTP-tool-call: zelfde registry, zelfde policy, zelfde approval, zelfde audit.
- De PolicyEngine blijft fail-closed; MCP-connectiviteit kan nooit een policy-check "overslaan".

## 3. MCP-protocol (basis, te verifiëren in TASK 9)

MCP (Model Context Protocol) is een open client-server protocol (JSON-RPC 2.0-achtig):

| Aspect | Gebruik in dit ontwerp |
|---|---|
| Transports | stdio (lokaal proces) of Streamable HTTP (remote); per server geconfigureerd |
| Lifecycle | `initialize` → `tools/list` → `tools/call` |
| Primitives | `tools` (aanroepbaar), `resources` (data), `prompts` (sjablonen) — wij gebruiken alleen `tools` |
| Tool-shape | `{ name, description, inputSchema }` → mapt op onze ToolSpec/ToolDefinition |

De adapter implementeert een **minimale client**: `listTools()`, `callTool(name, arguments)`. Geen resources/prompts in fase 1 (fail-closed: niet gebruiken wat niet geclassificeerd is).

## 4. Adapter-ontwerp

```ts
interface McpServerConnection {
  id: string;                 // bv. "github"
  name: string;
  transport: "stdio" | "http";
  endpoint?: string;          // http(s)-URL (alleen remote); configuratie, geen model-input
  timeoutMs: number;          // per call, bounded (default 15s)
  maxResultBytes: number;     // response-cap (default 1 MB, truncated-flag)
}

interface McpToolBinding {    // expliciete mapping server-tool → onze registry
  serverId: string;
  serverTool: string;         // naam zoals de server hem noemt
  specId: string;             // onze ToolSpec-id (mcp_<server>_<tool>)
}

class McpAdapter implements ToolAdapter {   // zelfde interface als HttpAdapter
  // execute(request): request.toolId → binding → server → tools/call
  // resultaat: genormaliseerd JSON (capped, truncated-flag), nooit raw onbegrensde output
  // fouten: server offline → FAILED (geen retry); timeout → FAILED (STOP); onbekende tool → NOT_IMPLEMENTED
}
```

**Injectie:** net als bij de HttpAdapter (`fetchImpl`/`lookup`) krijgt de McpAdapter een **injectable client** (`clientFactory` / `transportFactory`) — tests gebruiken een fake client, geen echte MCP-server.

## 5. Registratie: expliciet, fail-closed

1. Een MCP-server wordt als **verbinding** geregistreerd (configuratie; credentials via secret-store-injectie, nooit in code/prompts).
2. `tools/list` wordt **alleen bij registratie** uitgelezen (of bij expliciete refresh) — nooit per model-call.
3. Elke server-tool krijgt een **handmatige ToolSpec** (via `McpToolBinding`): klasse/risk/approval/permissions uit de TASK 2/4/5-tabellen — **nooit automatisch afgeleid** uit server-metadata (fail-closed: een MCP-tool zonder spec is niet registreerbaar).
4. `enabled: false` default; pas na expliciete enablement wordt een MCP-tool zichtbaar voor discovery (TASK 7) en uitvoering.
5. Naamgevingsconventie: `mcp_<server>_<tool>` (bv. `mcp_github_get_issue`) — voorkomt collisions en maakt provenance in audit zichtbaar.

## 6. GitHub MCP-server (FASE 3-onderzoek; verificatie in TASK 9)

GitHub heeft een officiële MCP-server (github/github-mcp-server). **Voorstel classificatie** per toolset (exacte toolnamen te verifiëren via `tools/list` in TASK 9):

| Toolset (FASE 3) | Voorbeelden | Klasse / Risk / Approval |
|---|---|---|
| context | repository-context ophalen | READ / LOW / geen |
| repos | repository-info, files lezen | READ / LOW / geen |
| issues | issues lezen | READ / LOW / geen |
| pull_requests | PR's lezen, diffs bekijken | READ / LOW / geen |
| actions | workflows/runs lezen | READ / LOW / geen |
| code_security | security-scan-resultaten lezen | READ / LOW–MEDIUM / geen (gevoelige data: alleen eigen tenant-repo's) |
| secret_protection | status lezen | READ / MEDIUM / geen (geen waarden, alleen status) |
| **write-set (later)** | issue_create, PR_create, workflow_rerun | WRITE / MEDIUM / tenant-policy |
| **high-set (later)** | merge, branch/repo delete, secrets muteren | DESTRUCTIVE / HIGH–CRITICAL / altijd approval (+ tweede ogen) |

**Regel (FASE 3):** write-capabilities worden **NIET automatisch aangezet** — de read-only toolsets (context, repos, issues, pull_requests, actions) komen eerst (`enabled: true` per expliciete taak, TASK 9); write/high-sets blijven `enabled: false` en vereisen per tool een eigen classificatie- en approval-route.

## 7. Andere MCP-servers (overzicht, later per taak)

| Server-type | Gebruik | Status in dit ontwerp |
|---|---|---|
| filesystem MCP | lokale bestanden (root-scoped) | later; zelfde registratie + FILESYSTEM_READ/WRITE |
| database MCP (Postgres) | read-only queries eerst | later; DATABASE_READ; DDL nooit |
| browser MCP (Playwright) | navigatie, extractie (TASK 11/12-koppeling) | later; WEB_NAVIGATE/WEB_READ |
| documentation MCP | documentatie opzoeken | later; READ |
| cloud/devops MCP (Kubernetes, AWS) | status/read-only eerst | later; DEPLOYMENT/OBSERVABILITY |

Elke server doorloopt exact dezelfde registratie-, classificatie- en policy-regels (§4–5). Geen enkele server krijgt "automatisch" permissions.

## 8. Security (FASE 19-koppeling)

| Risico | Beheersing |
|---|---|
| Credentials in prompts/code | nooit: credentials zitten in de verbindingsconfiguratie (secret-store-injectie), niet in registry/descriptions |
| Remote server-URL als model-input | server-endpoints zijn **configuratie**, geen tool-argument; model kan geen server toevoegen/wijzigen |
| Onvertrouwde MCP-output | output = data, geen instructies (zelfde regel als webcontent); genormaliseerd + capped (truncated-flag) |
| Timeout / hang | per-call timeout (bounded); geen ongecontroleerde retry; timeout → FAILED/STOP |
| Grote respons | maxResultBytes-cap + truncation |
| Onbekende MCP-tool | NOT_IMPLEMENTED (bestaand gate-gedrag) |
| tools/list tijdens runtime | alleen bij registratie/refresh; nooit per model-call (perf + aanvalsoppervlak) |
| Tenant-isolatie | per tenant eigen serverconfiguratie/scope (TASK 25); geen cross-tenant servertoegang |

## 9. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| MCP-tool zonder ToolSpec | niet registreerbaar (registratie-fout) |
| MCP-tool disabled | DENY (gate) |
| MCP-tool zonder binding/adapter | NOT_IMPLEMENTED (gate) |
| Server offline | FAILED — geen retry |
| Timeout | FAILED/STOP |
| Response > cap | truncated resultaat (geen crash) |
| Write-tool zonder approval (HIGH/CRITICAL) | APPROVAL_REQUIRED (bestaande flow) |

## 10. Backwards compatibility & migratie

- `MCP_TOOL` in agent-core blijft bestaan (conceptueel, `enabled: false`) — bestaande tests ongewijzigd.
- De adapter wordt geregistreerd in de bestaande `ToolAdapterRegistry`; de gate-interface verandert niet.
- Bestaande agents met `mcp` in `prohibitedTools` blijven uitgesloten; nieuwe MCP-tools krijgen eigen `ToolSpec` + expliciete agent-grants (TASK 4-model).
- Geen database-migratie; serverconfiguratie is code/env (versieerbaar), tenant-overrides in TASK 25.

## 11. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/tools/adapters/mcp-adapter.ts` — McpAdapter + McpServerConnection + McpToolBinding (client injectable)
- `packages/agent-core/test/adapters/mcp-adapter.test.ts` — testmatrix §12 (fake client)
- `apps/web/lib/tool-registry/mcp.ts` — serverconfiguratie + bindings + GitHub-toolspecs (TASK 9)
- `apps/web/test/tool-registry-mcp.test.ts` — registratie/classificatie-tests

## 12. Testmatrix (FASE 18)

valid call · invalid input · missing permission · disabled tool · missing adapter (NOT_IMPLEMENTED) · wrong tenant · approval required (write/high) · approval rejected · timeout · execution failure (server offline, geen retry) · budget exceeded (TASK 16-koppeling) · audit generated (serverId + tool in audit) · secrets not logged · onbekende MCP-tool · truncated response · tools/list alleen bij registratie.

## 13. Consequenties voor volgende taken

- TASK 9 (GitHub MCP read-only): verificatie `tools/list`, verbindingsconfiguratie, read-only ToolSpecs, `enabled: true` alleen voor read-only set.
- TASK 10 (GitHub read-only tests): testmatrix §12 met fake client.
- TASK 7-koppeling: MCP-tools zijn gewone registry-tools → automatisch vindbaar via discovery (na enablement).
- TASK 25: per-tenant MCP-serverconfiguratie en -toolbeleid.
