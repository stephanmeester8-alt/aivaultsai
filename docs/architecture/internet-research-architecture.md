# Agent Tool Platform — Internet Research Architecture (TASK 13)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de browser read-only implementatie (TASK 12).
> Doel (FASE 6): de bestaande website-research verbeteren tot een **volledige, veilige research-pipeline** (zoek → open → selecteer → extraheer → bewaar → evidence → conclusie) als gedeelde laag voor assistant, prospect-run en employee. De LLM krijgt **nooit** raw HTML — alleen genormaliseerde, bounded resultaten. Het output-contract zelf wordt in TASK 14 vastgelegd; deze taak legt de architectuur vast.

---

## 1. Uitgangspunt: bestaande research-stack (FACT)

`apps/web/lib/assistant/research-summary.ts`:

```ts
ResearchSummary {
  url, pagesChecked[],
  title, description, headings[], visibleText (bounded 4000),
  links[], contactSignals { mailto[], tel[] }, hasForm,
  iframeSrcs[], scriptSrcs[],
  chatbotDetection: AiDetectionResult | null,   // detectAiAssistant (hergebruikt)
  technologies[], truncated, limitations[]
}
// DEFAULT_LIMITS: visibleText 4000 · headings 20 · links 40 · contactSignals 10
//                 · scriptSrcs 20 · iframeSrcs 10 · title 200 · description 300
```

- Bounded subpage-research bestaat in de runtime-adapter (max 3 pagina's, subpage-lijst: /contact, /over-ons, /diensten, /prijzen, …).
- `HttpAdapter` (SSRF per hop, 2 MB cap → truncated), `checkHostnamePolicy`/`validateUrl` hergebruikt.
- `assistant_website_research` is de enige productie-tool; prospect-run heeft eigen research-code.

**Wat al goed is (behouden):** genormaliseerde output, deterministische extractie (geen LLM-kosten), bounded velden, SSRF, geen raw HTML naar de LLM.
**Wat verbetert:** zoekfase ontbreekt (web_search/sitemap P), geen fallback voor JavaScript-rendered sites (browser, TASK 12), evidence/bronregistratie is impliciet, totale run-limieten zijn deels impliciet, research zit verspreid over assistant/prospect-run/employee.

## 2. Doel (FASE 6-pipeline)

```text
1. ZOEK    intent → zoekresultaten (web_search / sitemap_discovery / subpage-lijst)
2. OPEN    pagina's openen via HttpAdapter (statisch) óf browser_extract (JS-rendered)
3. SELECTEER  relevante pagina's binnen maxPages
4. EXTRAHEER  genormaliseerde velden (ResearchSummary — bestaand)
5. BEWAAR  bronnen + evidence (url, title, fetchedAt, truncated, limitations, refs)
6. EVIDENCE  audit: welke pagina's, welke resultaten, welke limieten geraakt
7. CONCLUSIE  model vat samen op genormaliseerde output — nooit raw HTML
```

## 3. ResearchEngine (nieuwe gedeelde laag, `apps/web/lib/research/`)

```ts
interface ResearchQuery {
  targetUrl?: string;          // directe pagina (assistant-flow)
  intent?: string;             // zoekflow (employee/prospect)
  maxPages: number;            // default 3 (bestaand)
  maxBytesPerPage: number;     // 2 MB (bestaand) → truncated
  maxVisibleTextChars: number; // 4000 (bestaand)
  timeoutMs: number;           // per fetch, 10 s
  totalTimeMs: number;         // totale run, 60 s
}

interface ResearchRun {
  query: ResearchQuery;
  results: ResearchSummary[];          // genormaliseerd per pagina
  sources: { url: string; fetchedAt: string; truncated: boolean; via: "http" | "browser"; refs: string[] }[];
  limitations: string[];               // bv. "pagina X oversloeg: timeout"
  finishedAt: string;
}

class ResearchEngine {
  constructor(deps: {
    http: HttpFetcher;                 // injectable (fake in tests)
    browser?: BrowserExtractor;        // optioneel (TASK 12); zonder → alleen http
    search?: SearchProvider;           // optioneel; zonder → lege zoekresultaten
    summarize: (html, url, limits) => ResearchSummary;  // buildResearchSummary (bestaand)
  }) {}
  run(query: ResearchQuery): Promise<ResearchRun>;
}
```

- **Eén engine** voor assistant, prospect-run en employee (TASK 15) — bestaande functies worden erin geïnjecteerd, niet herbouwd.
- `SearchProvider`-interface (injectable, geen vendor hardcoded): `search(intent, opts) → { url, title, snippet }[]`; eerste provider later; fail-closed: geen provider → lege resultaten + limitation, geen crash.
- Browser-fallback (TASK 12): na http-fetch zonder bruikbare output (geen title/tekst) óf sterke JS-signalen (scriptSrcs zonder zichtbare tekst) → `browser_extract` (alleen read-only; elke call door de gate).

## 4. Bounded (harde limieten per run — FASE 6-verplichting)

| Limiet | Waarde | Gedrag |
|---|---|---|
| maxPages | 3 | verder niet openen; limitation |
| maxBytes per pagina | 2 MB | truncated (bestaand) |
| maxVisibleText | 4000 tekens | truncated (bestaand) |
| redirects | 3 per fetch | per hop SSRF-hervalidatie (bestaand) |
| timeout per fetch | 10 s | pagina overslaan + limitation (geen retry) |
| totale run-tijd | 60 s | run stopt; limitations[] |

## 5. Security (FASE 19-koppeling)

| Risico | Beheersing |
|---|---|
| SSRF | validateUrl + checkHostnamePolicy + DNS-private per hop (hergebruik; ook voor browser-fallback) |
| Prompt-injectie | pagina = data; alleen genormaliseerde velden naar de LLM; "ignore previous instructions" in een pagina is tekst, geen instructie |
| Credential-exfiltratie | geen credentials in fetchers/browser-context; genormaliseerde output alleen |
| Malware/malicious content | browser-fallback is read-only + incognito (TASK 12); downloads geblokkeerd |
| Zoekprovider-injectie | zoekresultaten = onvertrouwde data (URL's worden opnieuw gevalideerd vóór openen) |

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Geen SearchProvider | lege zoekresultaten + limitation (geen crash, geen gok-URL's) |
| Fetch timeout / fout | pagina overslaan + limitation; run gaat verder |
| Alle pagina's falen | lege run + limitations[]; model krijgt "geen betrouwbare bronnen" (geen conclusie verzinnen) |
| SSRF-adres | DENY vóór openen (via gate/adapter) |
| Browser-fallback ontbreekt (geen adapter) | alleen http-resultaten; limitation "JS-only pagina niet uitgelezen" |
| Raw HTML in output | onmogelijk: engine retourneert alleen ResearchSummary |

## 7. Backwards compatibility & migratie

- `assistant_website_research` en de prospect-run blijven werken; de engine wordt er stapsgewijs achter gezet (gedrag gelijk, limieten gelijk of strenger).
- Bestaande tests (research-summary, website-research, ai-detection, runtime-adapter) blijven groen — de engine injecteert de bestaande functies.
- Geen database-migratie; zoekprovider en browser zijn injectable deps (tests zonder netwerk).

## 8. Voorgestelde bestanden (implementatie)

- `apps/web/lib/research/engine.ts` — ResearchEngine + ResearchQuery/ResearchRun
- `apps/web/lib/research/search-provider.ts` — SearchProvider-interface
- `apps/web/test/research-engine.test.ts` — testmatrix §9
- Koppeling: runtime-adapter-brug (assistant_website_research → engine), prospect-run, employee (TASK 15)

## 9. Testmatrix (FASE 18-aanvulling)

valid run (http) · valid run met browser-fallback (fake extractor) · maxPages overschreden → limitation · maxBytes → truncated · timeout per pagina → overslaan · totale run-tijd → stop · SSRF-URL → DENY · zoekprovider leeg → lege resultaten + limitation · alle pagina's falen → lege run + limitations · concurrent runs (geen gedeelde staat) · secrets niet in output/audit · raw HTML nooit in resultaat · determinisme (zelfde input → zelfde structuur).

## 10. Consequenties

- TASK 14 (research normalized output): het formele `ResearchResult`-contract (uitbreiding van ResearchSummary met evidence/timestamp/refs) — engine-output wordt daaraan gestandaardiseerd.
- TASK 15 (employee registry-integratie): employee gebruikt dezelfde engine via de registry-tools (web_search/website_research/sitemap_discovery).
