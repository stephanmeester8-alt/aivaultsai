# Agent Tool Platform — Browser Read-Only Implementation (TASK 12)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de browser-adapter-architectuur (TASK 11).
> Doel (FASE 5 → implementatieonderlegger): de **concrete, copy-ready definities** voor de read-only browser-set — `browser_open`, `browser_extract`, `browser_screenshot` (`enabled: true`; READ/MEDIUM; WEB_NAVIGATE/WEB_READ) — plus het adapter-contract, de registratiestappen en de fail-closed testmatrix. Write-tools (`browser_click`, `browser_fill`, download/upload) blijven **uit** (`enabled: false`).

---

## 1. Uitgangspunt (FACT)

- TASK 11-ontwerp: `BrowserAdapter` (injectable `BrowserClient`), `PageSnapshot`, sessie-isolatie per call, SSRF-hergebruik (`validateUrl`, `checkHostnamePolicy`, DNS-private via injectable `lookup`).
- agent-core: `BROWSER_TOOL` (conceptueel, `enabled: false`), `WEB_NAVIGATE`/`WEB_READ` bestaan in `PERMISSIONS`; gate → NOT_IMPLEMENTED zonder adapter.
- TASK 3-schema: `ToolSpec` met alle metadata-velden; TASK 4: `WEB_NAVIGATE`/`WEB_READ` grants; TASK 5: READ/MEDIUM.

## 2. ToolSpec-definities (copy-ready, app-registry `apps/web/lib/tool-registry/browser.ts`)

```ts
const BROWSER_READ_TIMEOUT_MS = 15_000;
const BROWSER_MAX_TEXT_BYTES = 4_000;       // bounded visibleText
const BROWSER_MAX_PAGES = 3;                // per run (TASK 13-koppeling)
const BROWSER_RATE_LIMIT = { max: 30, windowMs: 60_000 };

const browserOpen: ToolSpec = {
  id: "browser_open",
  name: "Browser Open",
  description: "Open een publieke webpagina in een verse incognito browser-context (read-only).",
  version: "1.0.0",
  category: "BROWSER",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string", format: "uri" } },
    required: ["url"],
    additionalProperties: false,
  },
  outputSchema: { type: "object" },           // PageSnapshot
  permissions: ["WEB_NAVIGATE"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,                               // deze taak: read-only set aan
  adapter: "browser",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: BROWSER_READ_TIMEOUT_MS,
  rateLimit: BROWSER_RATE_LIMIT,
};

const browserExtract: ToolSpec = { ...browserOpen,
  id: "browser_extract", name: "Browser Extract",
  description: "Extraheer genormaliseerde publieke informatie uit de huidige pagina (bounded).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  permissions: ["WEB_READ"],
  // rest identiek (READ/MEDIUM/enabled/adapters)
};

const browserScreenshot: ToolSpec = { ...browserOpen,
  id: "browser_screenshot", name: "Browser Screenshot",
  description: "Maak een bounded screenshot van de huidige pagina (evidence-ref, geen base64 in prompts).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  permissions: ["WEB_READ"],
  // rest identiek
};
```

**Write-set (blijft `enabled: false`, géén adapter-binding):** `browser_click` (WEB_CLICK, HIGH, approval), `browser_fill` (WEB_TYPE, HIGH, approval), `browser_download`/`browser_upload` (WEB_DOWNLOAD/WEB_UPLOAD, HIGH, approval). Zij worden pas in een latere taak (TASK 17-koppeling) geactiveerd.

## 3. Adapter-contract (copy-ready, `packages/agent-core/src/tools/adapters/browser-adapter.ts`)

```ts
export interface PageSnapshot {
  url: string;
  title: string | null;
  metaDescription: string | null;
  headings: string[];
  visibleText: string;                 // bounded (BROWSER_MAX_TEXT_BYTES) + truncated-flag
  links: { text: string; href: string }[];
  forms: { action: string | null; fields: { name: string; type: string }[] }[]; // analyse, nooit invullen
  contactSignals: { emails: string[]; phones: string[] };   // mailto/tel + zichtbare patronen
  detectAiAssistant: { verdict: "YES" | "NO" | "UNKNOWN"; confidence: number; evidence: string[] };
  truncated: boolean;
  fetchedAt: string;
}

export interface BrowserClient {        // injectable; tests → FakeBrowserClient
  open(url: string, opts: { timeoutMs: number; maxBytes: number }): Promise<PageSnapshot>;
  extract(): Promise<PageSnapshot>;
  screenshot(): Promise<{ bytes: number; ref: string }>;   // ref = evidence-store-key
  close(): Promise<void>;               // context per call: open→…→close
}

export class BrowserAdapter implements ToolAdapter {
  constructor(private readonly clientFactory: () => Promise<BrowserClient>) {}
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // 1. pre-flight SSRF: validateUrl + checkHostnamePolicy + DNS-private (injectable lookup) → DENY
    // 2. client = await this.clientFactory()  (verse incognito context)
    // 3. toolId-switch: browser_open → client.open(url) | browser_extract → client.extract()
    //    | browser_screenshot → client.screenshot()
    // 4. try/finally: client.close()  (sessie-isolatie)
    // 5. foutmapping: timeout → FAILED (geen retry); crash → FAILED; >maxBytes → truncated
  }
}
```

- Registratie in `ToolAdapterRegistry` per tool-id (`browser_open`, `browser_extract`, `browser_screenshot` → dezelfde BrowserAdapter-instantie).
- `PageSnapshot.visibleText` wordt door de client al bounded + getruncateerd opgeleverd; de adapter garandeert dat **raw HTML/DOM nooit** in het resultaat of de audit terechtkomt.

## 4. Registratiestappen (implementatievolgorde)

1. `apps/web/lib/tool-registry/browser.ts` — ToolSpecs (§2) + `keywords` (bv. ["open","navigeren","website","pagina"], ["extract","lezen","inhoud","tekst"], ["screenshot","beeld"]) voor discovery (TASK 7).
2. `packages/agent-core/src/tools/adapters/browser-adapter.ts` — BrowserAdapter + BrowserClient (§3) + `createBrowserAdapter(clientFactory)`.
3. Adapter-registratie in de runtime-adapter-brug (`apps/web/lib/agent-runtime/runtime-adapter.ts`-patroon): `adapters.register("browser_open", adapter)` etc.
4. Agent-grants (TASK 4-model): agents die browser-read mogen, krijgen `allowedTools: [..., "browser_open", "browser_extract", "browser_screenshot"]` en `allowedPermissions: [..., "WEB_NAVIGATE", "WEB_READ"]` — expliciet, geen automatische grant.
5. Tests (§5) + lint + `git diff --check`; bestaande suites blijven groen.

## 5. Testmatrix (FASE 18 — 16 cases + browser-specifiek)

`FakeBrowserClient` (controleerbaar: ok/error/timeout/oversized; context-count-teller voor sessie-isolatie).

| # | Case | Setup | Verwacht |
|---|---|---|---|
| 1 | valid open | browser_open, agent met WEB_NAVIGATE | SUCCESS; PageSnapshot; audit (url, fetchedAt, geen raw HTML) |
| 2 | valid extract/screenshot | browser_extract / browser_screenshot | SUCCESS; bounded visibleText; screenshot bytes + ref |
| 3 | invalid input | ontbrekende `url` / extra property | DENY vóór client (context-count=0) |
| 4 | missing permission | agent zonder WEB_NAVIGATE/WEB_READ | DENY (`missingPermissions`), context-count=0 |
| 5 | disabled tool | browser_click (enabled:false) | DENY ("tool is disabled"), context-count=0 |
| 6 | missing adapter/binding | browser zonder adapter-registratie | NOT_IMPLEMENTED |
| 7 | wrong tenant | tenant-hook (TASK 25) → OFF | DENY (fail-closed placeholder) |
| 8 | approval required | browser_click per ongeluk enabled + HIGH | APPROVAL_REQUIRED, context-count=0 |
| 9 | approval rejected | zelfde + REJECTED approval | DENY, context-count=0 |
| 10 | timeout | client hangt > 15s | FAILED; **geen retry** (open-calls=1) |
| 11 | execution failure | client error / browser crash | FAILED; geen retry (open-calls=1) |
| 12 | budget exceeded | run-budget (TASK 16) op | STOP; context-count=0 |
| 13 | audit generated | succesvolle call | audit: executionId, toolId, url, argumentsHash, riskLevel MEDIUM, approvalId null |
| 14 | secrets not logged | pagina bevat token-achtige tekst | visibleText wordt bounded, maar audit/logs bevatten geen credentials; screenshot alleen als evidence-ref |
| 15 | SSRF | localhost / private-IP / IP-literal / DNS-private | DENY vóór client (context-count=0) |
| 16 | concurrent execution | 5 parallelle calls | alle SUCCESS; eigen context per call (context-count=5); eigen audit-record |
| 17 | retry behavior | eerste call faalt | FAILED; geen automatische retry (open-calls=1) |
| 18 | sessie-isolatie | call A en B na elkaar | context-count=2; geen gedeelde cookies (client-contract) |
| 19 | truncated | pagina > 4000 tekens | SUCCESS met `truncated: true`; geen crash |

## 6. Acceptatiecriteria

- Alle cases §5 groen; **bestaande suites blijven groen** (300/300 web, 239/239 agent-core) — geen tests verwijderd.
- Lint 0 warnings; `git diff --check` schoon.
- Write-set blijft `enabled: false` (assertie in test 5/8/9).
- Geen netwerk, geen echte browser, geen credentials in tests.

## 7. Consequenties

- TASK 13/14 (research-verbetering): `browser_extract`-output (PageSnapshot) voedt de research-pipeline voor JavaScript-rendered sites; `detectAiAssistant` hergebruikt de bestaande detector.
- TASK 17 (employee approval): browser-write-tools krijgen dan pas hun approval-route; deze taak raakt write-tools niet aan.
