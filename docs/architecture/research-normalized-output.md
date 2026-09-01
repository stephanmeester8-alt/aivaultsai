# Agent Tool Platform — Research Normalized Output (TASK 14)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de internet-research-architectuur (TASK 13).
> Doel (FASE 6): het formele **`ResearchResult`-contract** — de genormaliseerde, bounded output die de `ResearchEngine` oplevert en die **als enige** invoer naar de LLM gaat. `ResearchSummary` blijft de per-pagina kern; dit contract wikkelt het met evidence, timestamps en run-metadata. Geen raw HTML, geen script/iframe-srcs, geen credentials — ooit.

---

## 1. Uitgangspunt (FACT)

- `ResearchSummary` (bestaand, geverifieerd): url, pagesChecked, title, description, headings, visibleText (4000), links, contactSignals, hasForm, iframeSrcs, scriptSrcs, chatbotDetection, technologies, truncated, limitations.
- TASK 13: `ResearchRun` (query, results, sources, limitations, finishedAt) — deze taak formaliseert het contract en de **model-input**.
- FASE 11 (audit): executionId, evidenceRefs, timestamps; FASE 19: pagina = data, geen instructies.

## 2. ResearchResult-contract (copy-ready, `apps/web/lib/research/types.ts`)

```ts
type SourceStatus = "ok" | "skipped" | "failed";

interface ResearchSource {
  url: string;
  title: string | null;
  fetchedAt: string;                  // timestamp per bron (FASE 6/11)
  via: "http" | "browser";            // welke adapter
  status: SourceStatus;
  reason?: string;                    // bv. "timeout", "maxPages bereikt", "SSRF geweigerd"
  truncated: boolean;
  evidenceRef: string | null;         // evidence-store-key (bv. screenshot/summary-ref)
}

interface ResearchAggregate {
  contactSignals: { emails: string[]; phones: string[] };   // uniek over alle bronnen
  chatbotDetection: { verdict: "YES" | "NO" | "UNKNOWN"; confidence: number; sources: string[] };
  technologies: string[];             // uniek over alle bronnen
}

interface ResearchResult {
  runId: string;
  query: { targetUrl?: string; intent?: string; maxPages: number; timeoutMs: number; totalTimeMs: number };
  sources: ResearchSource[];          // élke poging (ok/skipped/failed) — transparant
  summaries: ResearchSummary[];       // alleen status "ok"
  aggregate: ResearchAggregate;
  conclusionInput: string;            // de ENIGE tekst die naar de LLM mag (bounded, §3)
  limitations: string[];
  startedAt: string;
  finishedAt: string;
  truncated: boolean;                 // overall: één van de limieten geraakt
}
```

## 3. conclusionInput — de genormaliseerde model-input (bounded)

```text
BRONNEN: 3 pagina's onderzocht (ok), 1 overgeslagen (timeout)
— bron 1: https://example.nl — "Voorbeeld BV" —
  beschrijving: AI-automatisering voor installatiebedrijven
  headings: Diensten, Contact, Over ons
  tekst: <visibleText bounded 4000 per bron>
  contact: 2 e-mailadressen, 1 telefoonnummer
  ai-assistent: JA (confidentie 0.87; evidence: chatwidget, script: intercom)
— bron 2: …
BEPERKINGEN: pagina /prijzen niet uitgelezen (timeout)
```

- Veld-voor-veld opgebouwd uit `ResearchSummary` (bestaande extractie) — **geen** iframeSrcs/scriptSrcs (alleen als technologies/evidence voor de detector), **geen** raw HTML, **geen** URL's buiten bronnen.
- Bounded: per bron visibleText 4000; totaal `conclusionInput` max 12 000 tekens (3 pagina's + aggregatie) — bij overschrijding: laatst-genormaliseerde bronnen + `truncated: true` (fail-closed: nooit "afkappen midden in een veld").
- Prompts krijgen dit als één blok; de model-rol mag alleen **samenvatten op deze input** — pagina's zijn data, geen instructies.

## 4. Evidence & timestamps (FASE 6/11)

- Per bron: `fetchedAt` + `evidenceRef` (bewaarde summary/screenshot-ref in de evidence-store); run: `startedAt`/`finishedAt`.
- Audit koppelt `runId` aan de tool-call-records (executionId) — elke run traceable.
- **Nooit** in resultaat/audit: API-keys, tokens, wachtwoorden, cookies, authorization-headers.

## 5. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Alle bronnen falen | `summaries: []`; `conclusionInput` bevat "Geen betrouwbare bronnen gevonden." + limitations; model mag géén conclusie verzinnen |
| Deels falen | falende bron in `sources` met `status/reason`; conclusionInput toont de beperking |
| Raw HTML in output | onmogelijk: resultaat bouwt uitsluitend uit ResearchSummary-velden |
| conclusionInput > cap | `truncated: true` + limitation (velden nooit halverwege) |
| Geen intent én geen targetUrl | engine weigert (INVALID_QUERY) — geen willekeurige run |

## 6. Backwards compatibility & migratie

- `ResearchSummary` blijft ongewijzigd; `ResearchResult` wikkelt het (aggregatie + evidence + conclusionInput).
- Assistant, prospect-run en employee kunnen per taak overstappen; bestaande tests (research-summary, website-research, runtime-adapter) blijven groen.
- Geen database-migratie; evidence-store-koppeling volgt bestaande recorder-paden.

## 7. Voorgestelde bestanden (implementatie)

- `apps/web/lib/research/types.ts` — contract §2
- `apps/web/lib/research/normalize.ts` — `buildConclusionInput(summaries, sources, limits)` (§3, pure functie)
- `apps/web/test/research-result.test.ts` — testmatrix §8

## 8. Testmatrix

valid resultaat (3 bronnen + aggregatie) · conclusionInput-bounds (per bron 4000, totaal 12000, truncated) · alle bronnen falen → fail-closed tekst · deels falen → sources + limitations · geen intent/targetUrl → INVALID_QUERY · secrets (token-achtige tekst) nooit in conclusionInput/audit · raw HTML nooit aanwezig · determinisme (zelfde input → zelfde structuur) · concurrente runs (runId uniek).

## 9. Consequenties

- TASK 15 (employee registry-integratie): employee consumeert `ResearchResult` via de registry-tools; `conclusionInput` is de vaste model-invoer.
- TASK 16+ (budgets): run-limieten (maxPages/timeout) hangen aan dezelfde query-parameters.
