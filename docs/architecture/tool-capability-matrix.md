# Agent Tool Platform — Tool Capability Matrix (TASK 2)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de architecture audit (TASK 1).
> Classificatie per tool: **READ / WRITE / DESTRUCTIVE / EXTERNAL_SIDE_EFFECT** → risk → approval.
> Status: **I** = implemented/operational · **D** = gedefinieerd in agent-core (disabled) · **P** = planned (FASE 2, nog niet in code) · **M** = missing.

---

## 1. Classificatieregels (consistent met de bestaande engine)

| Klasse | Betekenis | Risk-bereik | Approval |
|---|---|---|---|
| READ | geen wijziging, alleen lezen | LOW–MEDIUM | Nee |
| WRITE | wijzigt eigen/tenant-data of maakt content aan | MEDIUM–HIGH | Tenant-policy (default: Nee bij MEDIUM, Ja bij HIGH) |
| DESTRUCTIVE | verwijdert data of is onomkeerbaar | HIGH–CRITICAL | Altijd (HIGH) / altijd + tweede ogen (CRITICAL) |
| EXTERNAL_SIDE_EFFECT | actie zichtbaar buiten het platform (mail, deploy, merge, betaling) | HIGH–CRITICAL | Altijd |

De bestaande `requiresHumanApproval(risk)` in de ExecutionGate vereist al approval voor HIGH en CRITICAL — deze matrix mapt daarop; WRITE-middel-risico wordt tenant-policy (FASE 9/TASK 25).

## 2. WEB

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| http_get | READ | MEDIUM | Nee | API_REQUEST | **I** | HttpAdapter (SSRF, bounded 2 MB) | productie: assistant + runtime |
| website_research | READ | LOW–MEDIUM | Nee | API_REQUEST | **I** | HttpAdapter + research-summary + ai-detection | genormaliseerde output, ruwe HTML nooit naar LLM |
| web_search | READ | MEDIUM | Nee | WEB_SEARCH | **P** | zoekprovider (later; geen vendor-afhankelijkheid hardcoden) | eerste zoekadapter |
| sitemap_discovery | READ | LOW | Nee | API_REQUEST | **P** | HttpAdapter (bestaat al als runtime-taak: sitemap.xml) | formaliseren als registry-tool |

## 3. BROWSER

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| browser_open | READ | MEDIUM | Nee | WEB_NAVIGATE | **D** | — (BROWSER_TOOL gedefinieerd, geen adapter) | dedicated browser-adapter (TASK 11/12) |
| browser_extract | READ | MEDIUM | Nee | WEB_READ | **D** | — | publieke info, genormaliseerd |
| browser_screenshot | READ | MEDIUM | Nee | WEB_READ | **P** | — | — |
| browser_click | WRITE | HIGH | Ja | WEB_CLICK | **P** | — | alleen na expliciete approval |
| browser_fill | WRITE | HIGH | Ja | WEB_TYPE | **P** | — | formulieren = side effect |

## 4. FILES

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| file_read | READ | MEDIUM | Nee | FILESYSTEM_READ | **I-P** | FilesystemAdapter (root-scoped) | alleen binnen geautoriseerde root |
| file_search | READ | MEDIUM | Nee | FILESYSTEM_READ | **P** | FilesystemAdapter | — |
| file_write | WRITE | MEDIUM | Tenant-policy | FILESYSTEM_WRITE | **I-P** | FilesystemAdapter (opt-in) | default uit in productie |
| file_delete | DESTRUCTIVE | HIGH | Ja | FILESYSTEM_WRITE | **P** | — | — |

## 5. CODE / TERMINAL

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| code_search / code_analysis | READ | LOW–MEDIUM | Nee | FILESYSTEM_READ | **P** | FilesystemAdapter | Coding Agent (FASE 15) |
| test_runner / formatter / linter | WRITE (lokale artefacten) | MEDIUM | Tenant-policy | TERMINAL_EXECUTE | **P** | — | alleen in sandbox |
| terminal_readonly | READ | MEDIUM | Nee | TERMINAL_EXECUTE | **P** | — | read-only commando's alleen |
| terminal_command | WRITE/EXTERNAL_SIDE_EFFECT | HIGH | Ja | TERMINAL_EXECUTE | **D** | — | nooit willekeurige shell; sandbox-gebonden |

## 6. GITHUB

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| repository_read / file_read / issue_read / pull_request_read / workflow_read | READ | LOW | Nee | GITHUB_READ | **P** | GitHub (MCP of REST, TASK 8–10) | read-only toolsets eerst |
| issue_create / pull_request_create | WRITE | MEDIUM | Tenant-policy | GITHUB_WRITE | **P** | GitHub | write niet automatisch aan |
| pull_request_review | WRITE | MEDIUM | Tenant-policy | GITHUB_WRITE | **P** | GitHub | — |
| workflow_rerun | WRITE | MEDIUM | Tenant-policy | GITHUB_WRITE | **P** | GitHub | CI-herstel |
| pull_request_merge | EXTERNAL_SIDE_EFFECT | HIGH | Ja | GITHUB_WRITE | **P** | GitHub | altijd approval |
| secret_management / branch_delete / repo_delete | DESTRUCTIVE | CRITICAL | Ja (+ tweede ogen) | GITHUB_ADMIN | **P** | GitHub | nooit automatisch |

## 7. DATABASE

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| database_read / database_query | READ | MEDIUM | Nee | DATABASE_READ | **P** | database-adapter (read-only) | SQL-validatie, geen DDL |
| database_insert / database_update | WRITE | MEDIUM–HIGH | Tenant-policy | DATABASE_WRITE | **P** | database-adapter | app-repositories bestaan; model-tool later |
| database_delete | DESTRUCTIVE | CRITICAL | Ja (+ tweede ogen) | DATABASE_WRITE | **P** | database-adapter | nooit automatisch |

## 8. CRM / EMAIL / CALENDAR

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| contact_search / lead_read | READ | MEDIUM | Nee | CRM_READ | **P** | CRM-adapter | PII-bewust |
| contact_create / contact_update / lead_create / lead_update | WRITE | MEDIUM–HIGH | Tenant-policy | CRM_WRITE | **P** | CRM-adapter | — |
| email_search | READ | MEDIUM | Nee | EMAIL_READ | **P** | e-mailadapter | — |
| email_draft | WRITE | LOW–MEDIUM | Nee | EMAIL_DRAFT | **I-P** | draftOutreach (bestaand) | formaliseren als registry-tool |
| email_send | EXTERNAL_SIDE_EFFECT | HIGH | **Ja** | EMAIL_SEND | **I-P** | email-dispatcher (fail-closed, provider vereist) | employee approveAction = bestaande HITL-poort |
| calendar_read | READ | LOW | Nee | CALENDAR_READ | **I-P** | booking service (availability) | formaliseren |
| calendar_create / calendar_update | WRITE | MEDIUM–HIGH | Tenant-policy | CALENDAR_WRITE | **P** | calendar-adapter | — |
| calendar_cancel | WRITE | HIGH | Ja | CALENDAR_WRITE | **P** | calendar-adapter | — |

## 9. AI / OBSERVABILITY / DEPLOYMENT

| Tool | Klasse | Risk | Approval | Permissions | Status | Adapter | Notities |
|---|---|---|---|---|---|---|---|
| model_call / embedding / classification / summarization | READ (geen externe side effect) | LOW–MEDIUM | Nee | MODEL_CALL | **I-P** | openai-analyzer / Responses API | als code-laag; formaliseren |
| logs_read / metrics_read / traces_read | READ | MEDIUM | Nee | OBSERVABILITY_READ | **P** | observability-adapter | alleen eigen tenant |
| deployment_status | READ | LOW | Nee | DEPLOYMENT_READ | **P** | Vercel-adapter | — |
| deployment_preview | WRITE | MEDIUM | Tenant-policy | DEPLOYMENT_WRITE | **P** | Vercel-adapter | preview-omgeving |
| deployment_production | EXTERNAL_SIDE_EFFECT | CRITICAL | **Ja** (+ tweede ogen) | DEPLOYMENT_WRITE | **P** | Vercel-adapter | nooit automatisch |

## 10. Samenvatting per klasse

| Klasse | Aantal (gepland totaal) | Approval-regel |
|---|---|---|
| READ | ~24 | Nee (LOW/MEDIUM) |
| WRITE | ~17 | Tenant-policy; HIGH → altijd |
| DESTRUCTIVE | ~4 | Altijd (CRITICAL: + tweede ogen) |
| EXTERNAL_SIDE_EFFECT | ~5 | Altijd |

**Productie vandaag (I):** http_get, website_research (READ, geen approval). **Eerste volgende tools voor implementatie (FASE 20-volgorde):** sitemap_discovery (WEB), daarna GitHub read-only-set (TASK 9–10), browser read-only (TASK 11–12), email_draft/email_send (TASK 18–19), CRM/calendar read-only (TASK 20/22).

## 11. Consequenties voor TASK 3–6

- TASK 3 (registry-design): metadata per tool uit deze matrix (id, klasse, risk, permissions, approval-regel, adapter, status).
- TASK 4 (permission-model): permissions per klasse (READ/WRITE/DESTRUCTIVE/EXTERNAL_SIDE_EFFECT) + tenant-scope.
- TASK 5 (risk-classificatie): deze tabel is de bron; risk wordt statisch per tool vastgelegd (geen model-invloed).
- TASK 6 (approval-integratie): WRITE-medium → tenant-policy; HIGH/CRITICAL → bestaande ApprovalEngine (reeds gekoppeld in de gate).
