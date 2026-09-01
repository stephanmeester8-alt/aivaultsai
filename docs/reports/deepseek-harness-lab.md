# DeepSeek Harness — Learning Lab & AIVaultsAI Productieplan

> Analyse van gedeelde ChatGPT-conversatie: `https://chatgpt.com/share/6a9637c7-6bc4-83eb-8343-2b7fb4c0f283`
> Titel: **"Onderzoek naar DeepSeek"** · Model: GPT-5.6 (gpt-5-6) · 189 berichten (29 user / 84 assistant / 40 tool / 36 system) · 227k tekens
> Periode: 19 augustus 2026 – 31 augustus 2026 · Opgeslagen: 1 september 2026

---

## 1. Wat deze chat is

De gebruiker (Stephan, AIVaultsAI) heeft met ChatGPT een **leer- en productietraject rond DeepSeek Harness** doorlopen:

1. **Opzetten** van DeepSeek Harness (`dsh`) als lokale agent-runtime op Windows in `C:\deepseek-lab` — "spelenderwijs leren", bewust gescheiden van het AIVaultsAI-project.
2. **Diagnosticeren** van een vastlopende `npx`-start.
3. **Configureren** (workspace, permissions, model, API-key).
4. **Praktijktesten** van de agent-loop (codegeneratie, debugging, sandbox-boundaries).
5. **Productieplan** voor AIVaultsAI: DeepSeek Harness inzetten als gecontroleerde junior/mid-level software engineer, taak voor taak, inclusief gegenereerde prompts (Taak 1–3) en een SEO/GEO-agentontwerp.

---

## 2. Installatie- en opstartstatus (praktische kennis)

| Onderdeel | Waarde |
|---|---|
| Workspace-root | `C:\deepseek-lab` (bewust minimaal: `package.json` 66 bytes, `package-lock.json` 317 KB, `node_modules` ~483 packages) |
| Pakket | `@deepseek-ai/dsh@0.1.0-rc.7` (npm `latest`; `next` = `0.1.0-rc.8`; installatie: `npm install @deepseek-ai/dsh@latest`, 451 packages) |
| Web-interface | `http://127.0.0.1:3080` |
| Workspace in UI | `deepseek-lab` (zonder geselecteerde workspace blijft de composer uitgeschakeld) |
| Agent preset | `Standard mode` |
| Permission | `Workspace Write` |
| CLI | `dsh web` = alias voor `--profile web`; `--dump-default-config` toont de samengestelde plugin-tree zonder te booten |

**Opnieuw starten (vastgelegde instructies uit de chat):**

```powershell
cd C:\deepseek-lab
npx @deepseek-ai/dsh web
```

Open daarna `http://127.0.0.1:3080`. Het PowerShell-venster moet open blijven zolang de harness draait.

**Als `npx` weer problemen geeft (fallback):**

```powershell
cd C:\deepseek-lab
.\node_modules\.bin\dsh.cmd web
```

### Bekende npx-diagnose (19 aug 2026)

- Symptoom: `node.exe → npx-cli.js @deepseek-ai/dsh web` (PID 33556) draaide maar er was **geen** TCP-listener op poort 3080 en **0** child-processen → `npx` hing vóór de daadwerkelijke harness-boot (vermoedelijk bij de eerste-keer-initialisatie/installatie).
- Oplossing: `npx` omzeilen door expliciet `npm install @deepseek-ai/dsh@latest` in `C:\deepseek-lab` en daarna `npx dsh` (of de `.cmd`-fallback).

---

## 3. API-key & security (KRITIEK — actie vereist)

1. **Correcte key-aanmaak**: DeepSeek API-keys worden gemaakt op **https://platform.deepseek.com** (API Keys). Een OpenAI/Gemini-key of het gewone chat-account werkt niet. Saldo: **€2 tegoed was voldoende** om te testen (accountgebonden, niet per key).
2. **⚠️ Key is gelekt in de chat**: tijdens het plakken van een trajectory kwam een **volledige DeepSeek API-key** in de chatgeschiedenis terecht. De ChatGPT-assistent waarschuwde: behandel de key als **gecompromitteerd** en:
   - revoke/delete de key op platform.deepseek.com;
   - maak een nieuwe key aan (voorbeeldnaam: `deepseek-harness-lab`);
   - zet die in **DeepSeek Harness → Settings → Models → DeepSeek**;
   - test met: `Respond with exactly: DeepSeek Harness API connection is working.`
   - plaats de nieuwe key nooit in chat of logs.
3. **Security-observatie (belangrijk)**: de harness-agent kon het credential-bestand `C:\Users\Startklaar\.dsh\.credentials.yaml` **lokaliseren en lezen** (de agent zei "I won't print it", maar technisch kan de `read`-tool de secretwaarde aan het model blootstellen). Boundary om later te onderzoeken:

   ```
   Credential file → Filesystem tool → Model context → Agent
   ```

4. **Empirische sandbox-test**: een `write` naar een pad buiten de workspace werd onder `workspace-write`-beleid geblokkeerd (`svgWriteError: [sandbox: file access denied under workspace-write mode]`); de agent escaleerde niet en het bestand werd niet aangemaakt → de boundary werkt zoals bedoeld.

---

## 4. Architectuur-inzichten (DeepSeek Harness)

- **Agent = Model + Harness**: het model levert intelligentie; de harness regelt omgeving (tools, files, shell, sessies, loops, skills, sandboxing, UI).
- **"Everything is a plugin"**: geen monolithische agent; de hele runtime is een compositie van plugin-bundles op basis van **Cordis** (plugin/microkernel-framework).
- **Profielen/modi = plugin-composities**: `web`, `headless`, `tui`, … zijn verschillende bundels; een eigen vijfde profiel is samen te stellen (`--patch` overlays; `--dump-default-config` om de boom te inspecteren).
- **Package-splitsing op npm** (leerzaam voor AIVaultsAI):
  - `@deepseek-ai/dsh-agent` — agent-interface (bewust géén concrete loop)
  - `@deepseek-ai/dsh-agent-loop` — concrete execution loop
  - `@deepseek-ai/dsh-tools` — tool-pipeline: `tool call → pre-execute → guards → execute → post-execute → finalize → result`
  - `@deepseek-ai/dsh-session`, `dsh-subagent`, `dsh-skill`, `dsh-host-*` (webserver, frontend-static, apiproxy), `dsh-llm`, `dsh-headless`, `dsh-credentials-local`, …
- **Harness beïnvloedt prestaties**: studie "StateM" — DeepSeek-V4 Flash verbeterde van 82,7% → 88,1% door betere runtime/state/runbooks, zonder modelwijziging. Beter gedrag komt dus ook uit betere tools, state, memory, loops, context, recovery en sandboxing.

---

## 5. Praktijktests (bewijs uit de chat)

1. **Debug-lab-oefening**: `debug-lab/{package.json, tsconfig.json, src/string-utils.ts, test/string-utils.test.ts}`; 11/11 tests; de harness lokaliseerde een bug, fixte `src/string-utils.ts` (plus een test-side correctie voor `wordCount`) en rapporteerde. De "trajectory" (executielog) liet voor het eerst de echte agent-loop zien.
2. **Security-boundary-test**: zie §3.4 — write-denial buiten de workspace empirisch bevestigd.
3. **Eerste video-review**: de assistant bekeek een opname van een harness-sessie en gaf verbeterpunten voor de werkwijze.

---

## 6. Productieplan voor AIVaultsAI (uit de chat)

Kern: gebruik de harness **niet als chatbot, maar als gecontroleerde junior/mid-level software engineer** binnen een afgebakende workspace — eerst inspecteren, dan ontwerpen, dan één taak uitvoeren, testen en rapporteren. **Nooit direct op de productieomgeving**: gebruik een lab-workspace (`C:\aivaultsai-lab`) of een Git worktree/branch.

**Vijf rollen:**
1. **Codebase analyst** — read-only: architectuur, dependencies, TODO's, duplicaten, security-risico's, performance, ontbrekende tests, documentatie.
2. **Coding agent** — feature-workspace: inspecteer → plan → implementeer minimaal → tests → run → fix → wijzigingsoverzicht.
3. **QA / debugging agent** — diagnoseer testfailures zonder wijzigingen, groepeer per root cause, fix per root cause, draai volledige suite, analyseer regressies.
4. **Code reviewer** — dagelijks gebruik: review PR's op correctness, security, authorization, error handling, race conditions, performance, DB-queries, API-contracten, typing, coverage, backwards compatibility; per finding: severity + bewijs.
5. **Research / intelligence** — onderzoek en rapporteer.

**Takenlijst (vastgelegd in de chat):**
- Taak 1 → beveiliging/permissions (uitgevoerd: architectuur-audit)
- Taak 2 → AIVaultsAI SEO/GEO-agent
- Taak 3 → commerciële intelligence
- Taak 4 → prospect discovery & qualification
- Taak 5 → outreach/e-mail
- Taak 6 → learning/feedback loop

---

## 7. De gegenereerde prompts (kernregels)

De prompts volgen één streng patroon (herbruikbaar):

- Werk **alleen aan de huidige taak**; start geen toekomstige taken automatisch.
- Wijzig niets tenzij de taak het expliciet vereist; Taak 1 en 3 waren **read-only**.
- **Geen secrets**: geen API-keys, wachtwoorden, tokens, credentials, `.env`-waarden tonen; geen harness-config wijzigen; niets buiten de workspace wijzigen; geen packages installeren.
- **Evidence-based**: geen aannames zonder de echte broncode; gebruik de repository als source of truth.
- Onderscheid expliciet `FACT` / `INFERENCE` / `RECOMMENDATION`; niet-bestaande dingen als `NOT CURRENTLY IMPLEMENTED`, niet-verifieerbare als `NOT VERIFIED`.
- Traceer één request door de hele pipeline (user → frontend → API → orchestrator → agent → model → tools → execution → result).
- Security-checklijst: auth, authorization, sandboxing, command execution, filesystem, secrets, prompt injection, tool abuse, path traversal, privilege escalation, unsafe subprocesses.

**Taak 1 – AIVaultsAI Architecture Audit**: complete technische audit (structuur, applicatie-architectuur, AI-architectuur, execution pipeline, security, database, testing). Status in de chat: compleet.

**Taak 2 – Assistant API Security**: beveiliging van `/api/assistant`; status in de chat: compleet — 22/22 security-tests, typecheck groen, security boundary geïmplementeerd, resterende risico's gedocumenteerd.

**Taak 3 – SEO/GEO-agent (design, read-only)**: ontwerp van een productie-grade SEO/GEO/AEO-agent voor aivaultsai.one met cyclus `ANALYZE → PLAN → RECOMMEND → REQUEST APPROVAL → IMPLEMENT → TEST → MEASURE → LEARN → REPEAT` (implementatie pas in een latere taak); rolcombinatie van Technical SEO Engineer, GEO/AEO-specialist, AI Agent Architect, Full-Stack- en Security Engineer.

---

## 8. Hoe verder (volgende stappen)

1. **API-key roteren** (zie §3) — eerst de gecompromitteerde key intrekken.
2. Harness opstarten via §2 en controleren op `http://127.0.0.1:3080`.
3. Taak voor taak verder: **Taak 2: SEO/GEO-agent voor AIVaultsAI** (design-prompt staat klaar), daarna commerciële intelligence, prospect discovery & qualification, outreach en feedback-loop.
4. Die taken sluiten aan op de bestaande repository-modules: customer-zero, prospect-run (`apps/web/lib/prospect-run/*`), agent-runtime, booking, attribution/analytics.
5. De security-observatie rond `.dsh/.credentials.yaml` meenemen in elk volgend experiment: credentials nooit binnen een workspace leggen die een agent kan lezen.

---

*Dit document is gegenereerd uit de gedeelde chat-payload (react-router-stream gedecodeerd). Feiten zijn overgenomen uit de conversatie; waar de chat zelf een waarschuwing of aanbeveling bevat, is dat als zodanig gemarkeerd. Geen secrets zijn in dit document opgenomen.*
