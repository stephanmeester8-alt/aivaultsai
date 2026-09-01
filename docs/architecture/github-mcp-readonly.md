# Agent Tool Platform — GitHub MCP Read-Only Integration (TASK 9)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de MCP-adapter-architectuur (TASK 8).
> Doel (FASE 3/4): de GitHub MCP-server aansluiten als **read-only** extensielaag: verbindingsconfiguratie, authenticatie-injectie en de read-only tool-mapping. Write-capabilities worden NIET aangezet. Implementatie van de adapter zelf volgt in de bijbehorende codetaak; dit document legt de integratie vast.

---

## 1. Uitgangspunt (FACT)

- TASK 8-ontwerp: `McpAdapter` (ToolAdapter-interface, injectable client), `McpServerConnection`, `McpToolBinding`; MCP-tools draaien volledig achter de ExecutionGate.
- agent-core: `MCP_TOOL` (conceptueel, `enabled: false`), `MCP_EXECUTE`-permission; gate → NOT_IMPLEMENTED zonder adapter.
- TASK 4-catalogus: `GITHUB_READ` / `GITHUB_WRITE` / `GITHUB_ADMIN` (nog niet in agent-core `PERMISSIONS` — dat is een implementatietaak).

## 2. Verificatie officiële GitHub MCP-server (EVIDENCE)

Bron: `github/github-mcp-server` (officieel), opgehaald 1 september 2026 via de repository zelf (README + `docs/remote-server.md`):

| Vastgesteld | Waarde |
|---|---|
| Remote server (door GitHub gehost) | `https://api.githubcopilot.com/mcp/` — auth via OAuth of PAT (`Authorization: Bearer`) |
| Lokale server | `ghcr.io/github/github-mcp-server` (Docker, stdio) |
| Toolsets (remote, officiële lijst) | `default`, `all`, `actions`, `code_quality`, `code_security`, `copilot`, `copilot_issue_intents`, `dependabot`, `discussions`, `gists`, `git`, `issues`, `labels`, `notifications`, `orgs`, `projects`, `pull_requests`, `repos`, `secret_protection`, `security_advisories`, `stargazers`, `users` |
| **Read-only-modus** | **`/readonly`-suffix op elke toolset-URL** (bv. `…/mcp/x/repos/readonly`) — server-side restrictie tot read-tools (34 read-only links in de docs) |
| FASE 3-toolset "context" | komt in de huidige remote-lijst niet voor; de `default` toolset dekt de context-achtige tools — bij implementatie via `tools/list` verifiëren |

**Consequentie:** de verbinding kan dubbel worden beveiligd: (a) een PAT met alleen-lezen scope, én (b) het `/readonly`-endpoint van GitHub zelf — onze gate blijft daar bovenop de derde laag.

## 3. Verbindingsconfiguratie (McpServerConnection "github")

```ts
const GITHUB_MCP: McpServerConnection = {
  id: "github",
  name: "GitHub MCP (official)",
  transport: "http",                       // remote endpoint; stdio-alternatief: lokale docker
  endpoint: "https://api.githubcopilot.com/mcp/x/repos/readonly", // per toolset-specifieke verbinding
  timeoutMs: 15_000,
  maxResultBytes: 1_048_576,               // 1 MB cap, truncated-flag
};
```

- **Credentials:** `GITHUB_MCP_TOKEN` (PAT) wordt bij runtime geïnjecteerd in de client (secret-store), nooit in code, prompts, descriptions of logs. Minimaal benodigde scope: **alleen-lezen** (metadata:read / public-read; geen `repo`-write-scope).
- Per toolset één verbinding (repos/readonly, issues/readonly, …) of één default-verbinding met `/readonly` — keuze bij implementatie; beide voldoen aan dit ontwerp.
- Geen OAuth-flow in deze fase (PAT-injectie); OAuth kan later als optie (server ondersteunt het, maar vereist redirect-flow).

## 4. Read-only tool-mapping (enabled: true — de enige set die aan gaat)

Exacte toolnamen worden bij implementatie uit `tools/list` gelezen en per binding vastgelegd; de mapping hier is het **contract** (server-tool → specId → classificatie):

| Toolset | Server-tools (verwacht) | specId (onze registry) | Klasse/Risk | Approval | Permission |
|---|---|---|---|---|---|
| repos | get_repository, list_repositories, search_repositories, get_file_contents, list_branches, list_commits | `mcp_github_repo_read`, `mcp_github_repo_search`, `mcp_github_file_read`, … | READ / LOW | nee | GITHUB_READ |
| issues | get_issue, list_issues, search_issues | `mcp_github_issue_read`, `mcp_github_issue_search`, … | READ / LOW | nee | GITHUB_READ |
| pull_requests | get_pull_request, list_pull_requests, search_pull_requests, get_pull_request_files, get_pull_request_reviews | `mcp_github_pr_read`, `mcp_github_pr_search`, … | READ / LOW | nee | GITHUB_READ |
| actions | list_workflows, get_workflow, list_workflow_runs, get_workflow_run | `mcp_github_workflow_read`, `mcp_github_workflow_run_read`, … | READ / LOW–MEDIUM (run-logs kunnen secrets bevatten → logs-tool MEDIUM) | nee | GITHUB_READ |
| code_security | code-scanning alerts lezen, Dependabot-alerts lezen | `mcp_github_security_alerts_read`, … | READ / MEDIUM (gevoelige data; alleen eigen tenant-repo's) | nee | GITHUB_READ |
| secret_protection | secret-scanning **status** lezen (geen waarden) | `mcp_github_secret_scanning_status`, … | READ / MEDIUM | nee | GITHUB_READ |

- `adapter: "mcp"`, `tenantPolicy: "TENANT"` (per-tenant repo-scope in TASK 25), `auditEnabled: true`, `rateLimit` per tool (bv. 60/min).
- Toolbeschrijvingen: geen credentials, geen interne details — alleen wat het model moet weten om de call correct te doen.
- Discovery (TASK 7) toont deze tools pas als ze `enabled: true` zijn — dus pas na deze mapping.

## 5. Write/high-set (geregistreerd maar `enabled: false` — NOOIT automatisch aan)

| Set | Voorbeelden | Klasse/Risk | Approval |
|---|---|---|---|
| write | issue_create, issue_update, pr_create, pr_update, pr_review, workflow_rerun | WRITE / MEDIUM | tenant-policy (TASK 25) |
| high | merge_pull_request | EXTERNAL_SIDE_EFFECT / HIGH | altijd |
| destructive | branch/repo delete, secrets muteren | DESTRUCTIVE / HIGH–CRITICAL | altijd (+ tweede ogen bij CRITICAL) |

Regel (FASE 3): write-capabilities worden niet automatisch aangezet; per tool een eigen registratie- en approval-route (TASK 6-koppeling). `GITHUB_WRITE`/`GITHUB_ADMIN`-permissions blijven ongebruikt tot die route bestaat.

## 6. Security (FASE 19-koppeling)

| Laag | Beheersing |
|---|---|
| 1. Token | PAT met alleen-lezen scope; injectie via secret-store; nooit in code/logs/prompts |
| 2. Endpoint | `/readonly`-URL's (GitHub server-side read-only) |
| 3. Gate | registry → policy → risk → approval → gate; `GITHUB_READ` per agent expliciet gegund |
| 4. Output | 1 MB cap + truncated; output = data (geen instructies) |
| 5. Audit | serverId + toolId + argumentsHash; geen credentials |
| 6. Tenant | repo-scope per tenant in TASK 25; geen cross-tenant repo-toegang |

## 7. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| MCP-tool zonder binding/spec | niet registreerbaar |
| Write-tool in read-only-modus | niet beschikbaar (enabled: false / /readonly endpoint) |
| Agent zonder GITHUB_READ | DENY (policy) |
| Server offline / timeout | FAILED — geen retry |
| Response > cap | truncated |
| Onbekende server-tool uit tools/list | binding-match faalt → NOT_IMPLEMENTED (nooit "auto-map") |

## 8. Backwards compatibility & migratie

- agent-core ongewijzigd in deze taak (adapter-implementatie = eigen codetaak); `MCP_TOOL` blijft conceptueel.
- `GITHUB_READ` toevoegen aan `PERMISSIONS` (agent-core) is een non-breaking uitbreiding (onbekend → DENY blijft); bestaande agents krijgen de permission niet automatisch.
- Geen database-migratie; verbindingsconfiguratie is code/env.

## 9. Voorgestelde bestanden (implementatie)

- `apps/web/lib/tool-registry/mcp-github.ts` — GITHUB_MCP-verbinding + McpToolBinding[] + read-only ToolSpecs (§3–4)
- `apps/web/lib/tool-registry/permissions.ts` — GITHUB_READ-afleiding (TASK 4-koppeling)
- `packages/agent-core/src/permissions/types.ts` — `GITHUB_READ/WRITE/ADMIN` in PERMISSIONS (met fail-closed tests)
- `apps/web/test/tool-registry-mcp-github.test.ts` — testmatrix → TASK 10

## 10. Testmatrix (TASK 10-koppeling)

valid read-call · invalid input · missing GITHUB_READ → DENY · disabled write-tool → DENY · missing binding → NOT_IMPLEMENTED · wrong tenant · approval required (write-set, indien per ongeluk enabled) · timeout · server offline (geen retry) · truncated response · audit (serverId+toolId) · secrets niet gelogd · tools/list alleen bij registratie.

## 11. Consequenties

- TASK 10 (GitHub read-only tests): testmatrix §10 met fake MCP-client.
- FASE 4 (GitHub Agent): deze read-only set is de basis voor repository-inspectie, code-zoeken, issues/PR-analyse, CI-failure-analyse — write/high blijft achter approval.
