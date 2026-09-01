# Agent Tool Platform — Browser Adapter Architecture (TASK 11)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de GitHub read-only tests (TASK 10).
> Doel (FASE 5): een **dedicated browser adapter** onder de ExecutionGate — read-only capabilities zonder approval; formulier-interactie, accounts, orders, betalingen en contracten als side effects met verplichte approval. De browser is een **tool**, geen agent (AGENTS.md-principe); geen willekeurige browser-automation rechtstreeks vanuit de LLM. Implementatie van de read-only set volgt in TASK 12.

---

## 1. Uitgangspunt: bestaande browser-code (FACT)

```ts
// packages/agent-core/src/tools/definitions.ts
BROWSER_TOOL: ToolDefinition = {
  id: "browser", name: "Browser", category: "BROWSER",
  description: "Conceptual browser-execution tool. … Not installed and not enabled.",
  capabilities: [WEB_SEARCH, WEB_READ, WEB_NAVIGATE, WEB_CLICK, WEB_TYPE, WEB_DOWNLOAD, WEB_UPLOAD],
  riskLevel: "HIGH", enabled: false,
}
// geen adapter geregistreerd → ExecutionGate retourneert NOT_IMPLEMENTED
// agents: browser staat in prohibitedTools van de meeste agent-definities
```

- Bestaande SSRF-bouwstenen (hergebruik, geen herbouw): `validateUrl` (`apps/web/lib/seo/url-policy.ts`), `checkHostnamePolicy` (`apps/web/lib/prospect-run/website-research.ts`), en de HttpAdapter-core-checks (scheme/localhost/IP-literal/DNS-private via injectable `lookup`).
- De website-assistent gebruikt vandaag de HttpAdapter (`assistant_website_research`) — die kan geen JavaScript-rendered pagina's lezen. De browser-adapter vult precies die gap (TASK 13-koppeling).

## 2. Principe (FASE 5)

```text
MODEL → REGISTRY (browser_* ToolSpecs) → INPUT VALIDATIE → POLICY (WEB_*-permissions)
  → RISK / APPROVAL (alleen side-effect-tools) → GATE → BROWSER ADAPTER → pagina
  → genormaliseerd resultaat → EVIDENCE / AUDIT
```

- **De browser is een tool.** De LLM krijgt géén directe DOM/DevTools-toegang; elke actie gaat door de adapter-API (open, extract, screenshot, …).
- **Read ≠ side effect.** Lezen/navigeren/screenshot = geen wijziging buiten de browser-sandbox. Clicken, typen, formulier-submit, download/upload = zichtbare of persistente effecten → approval.
- **Pagina-inhoud is onvertrouwde data** (FASE 19): "ignore previous instructions…" in een pagina is data, nooit een instructie — zelfde regel als bij research-summary.

## 3. Capability-splitsing (TASK 2/4/5-tabellen)

| Tool (specId) | Klasse | Risk | Approval | Permission | enabled |
|---|---|---|---|---|---|
| `browser_open` | READ | MEDIUM | nee | WEB_NAVIGATE | **TASK 12: true** |
| `browser_extract` | READ | MEDIUM | nee | WEB_READ | **TASK 12: true** |
| `browser_screenshot` | READ | MEDIUM | nee | WEB_READ | **TASK 12: true** |
| `browser_click` | WRITE | HIGH | **altijd** | WEB_CLICK | false (later, met approval-flow) |
| `browser_fill` | WRITE | HIGH | **altijd** | WEB_TYPE | false (later) |
| `browser_download` / `browser_upload` | WRITE | HIGH | **altijd** | WEB_DOWNLOAD / WEB_UPLOAD | false (later) |

- De bestaande `BROWSER_TOOL` (risk HIGH, alle permissions) blijft als conceptuele eenheid in agent-core; de **app-registry** (TASK 3) registreert de gesplitste `browser_*` ToolSpecs met bovenstaande per-tool risk/approval. De gate blijft de enige poort.
- Per-tool risk is nodig omdat de TASK 2-matrix risk per actie stelt (browser: WEB_READ MEDIUM, WEB_UPLOAD CRITICAL) — niet één blob-risk voor de hele browser.

## 4. Adapter-ontwerp

```ts
interface BrowserClient {          // injectable, Playwright-achtig — tests gebruiken FakeBrowserClient
  open(url: string, opts: { timeoutMs, maxBytes }): Promise<PageSnapshot>;
  extract(): Promise<PageSnapshot>;                    // genormaliseerd
  screenshot(): Promise<{ bytes: number; ref: string }>; // bounded, evidence-ref
  // click/fill/submit: pas in de write-fase (TASK 17+ approval-koppeling)
}

class BrowserAdapter implements ToolAdapter {
  // execute(request): request.toolId → browser_open | browser_extract | browser_screenshot
  // per call: NIEUWE incognito context (geen cookies/sessie-overdracht tussen calls)
}
```

**Bounded (FASE 6-regels, per call):**
- `timeoutMs` per actie (default 15s; totaal per run begrensd);
- `maxBytes` op tekst-extractie (bounded + truncated-flag, nooit raw onbeperkte HTML naar de LLM);
- `maxPages` per run (TASK 13-koppeling; default 3);
- redirects: elke hop opnieuw gevalideerd (SSRF-regel uit de HttpAdapter blijft gelden);
- screenshots: bytes-cap (bv. 2 MB) + evidence-ref in audit, geen base64 in prompts.

**SSRF (hergebruik, geen herbouw):**
- URL-invoer door `validateUrl` + `checkHostnamePolicy` + DNS-private-check (injectable `lookup`) vóór elke navigatie — zelfde regels als de HttpAdapter: alleen http(s), geen localhost/private/IP-literal/metadata-adressen.

**Sessie-isolatie:**
- Elke tool-call opent een verse incognito context; cookies/localStorage/navigatie-historie worden **nooit** tussen calls of agents gedeeld. Geen inloggen, geen credentials — tenzij een expliciete (goedgekeurde) write-flow dat later toestaat.

## 5. Genormaliseerde output (extract)

`browser_extract` retourneert een `PageSnapshot` (structuur gelijk aan research-summary, TASK 14-koppeling):

```ts
{ url, title, metaDescription, headings[], visibleText (bounded 4000), links[], forms[],
  contactSignals (mailto/tel), detectAiAssistant (YES/NO/UNKNOWN + confidence + evidence),
  truncated: boolean, fetchedAt }
```

- `forms[]` bevat **alleen structuur-analyse** (velden, labels, action) — invullen/submit is een write-actie met approval.
- Raw HTML/DOM gaat nooit naar de LLM.

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Onbekende browser-tool (bv. `browser_click` zonder binding) | DENY / NOT_IMPLEMENTED |
| Write-tool zonder approval (HIGH) | APPROVAL_REQUIRED (bestaande flow) |
| Disabled write-tool | DENY ("tool is disabled") |
| SSRF-adres (localhost/private/IP-literal) | DENY vóór navigatie |
| Timeout / browser hang | FAILED — geen retry |
| Response > cap | truncated resultaat |
| Sessie-overdracht-poging (cookie) | onmogelijk: verse incognito context per call |

## 7. Security (FASE 19-koppeling)

| Risico | Beheersing |
|---|---|
| SSRF | validateUrl + hostname-policy + DNS-private-check per hop (hergebruik) |
| Prompt-injectie via pagina | pagina = data; genormaliseerde output; geen instructies doorgeven |
| Credential-exfiltratie | geen credentials in browser-context; geen inloggen zonder goedgekeurde write-flow; screenshot/tekst nooit in logs |
| CSRF via formulier | formulier-submit = write → altijd approval (PENDING → human) |
| Cross-tenant lekkage | verse context per call; geen gedeelde sessie/cookies |
| Malware/malicious content | browser in sandbox; downloads geblokkeerd in read-only-fase (WEB_DOWNLOAD disabled) |

## 8. Backwards compatibility & migratie

- `BROWSER_TOOL` in agent-core blijft ongewijzigd (conceptueel, disabled); de app-registry splitst per-tool specs; bestaande tests blijven geldig.
- De adapter registreert in de bestaande `ToolAdapterRegistry`; gate-interface ongewijzigd.
- Agents met `browser` in prohibitedTools blijven uitgesloten; nieuwe browser-tools krijgen expliciete grants (TASK 4-model).
- Geen database-migratie.

## 9. Voorgestelde bestanden (implementatie)

- `packages/agent-core/src/tools/adapters/browser-adapter.ts` — BrowserAdapter + BrowserClient-interface (injectable)
- `apps/web/lib/tool-registry/browser.ts` — browser_* ToolSpecs (split, per-tool risk/approval)
- `apps/web/lib/tool-registry/mcp-browser.ts` — optioneel later: browser MCP-server-koppeling (TASK 8-patroon)
- `packages/agent-core/test/adapters/browser-adapter.test.ts` + `apps/web/test/tool-registry-browser.test.ts` — testmatrix (TASK 12-koppeling)

## 10. Testmatrix (FASE 18, bij implementatie)

valid open/extract/screenshot · invalid input · missing permission · disabled write-tool · missing adapter/binding · wrong tenant · approval required (click/fill) · approval rejected · timeout (geen retry) · execution failure · budget exceeded · audit generated (url + evidence-ref) · secrets not logged · SSRF (localhost/private/IP-literal/DNS-private) · concurrent execution (parallelle contexten) · retry behavior (1 poging).

## 11. Consequenties

- TASK 12 (browser read-only implementatie): alleen `browser_open`/`browser_extract`/`browser_screenshot` aan (`enabled: true`); write-set blijft uit.
- TASK 13/14 (research-verbetering): `browser_extract` voedt de research-pipeline voor JavaScript-rendered sites; output-structuur sluit aan op normalized research results.
- TASK 17 (employee approval): browser-write-tools hangen aan dezelfde approval-flow.
