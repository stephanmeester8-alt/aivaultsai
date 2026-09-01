# AIVaultsAI — Launch-sessie "Test commerciële intententie"

> Analyse van gedeelde ChatGPT-conversatie: `https://chatgpt.com/share/6a96389b-591c-83eb-ae20-8b81b56d24f8`
> Titel: **"Test commerciële intententie"** · Model: GPT-5.6 (gpt-5-6) · 408 berichten (74 user / 174 assistant / 97 tool / 63 system) · 230k tekens
> Datum: 19 augustus 2026 · Branch: `feat/customer-zero-booking-engine` · Opgeslagen: 1 september 2026

---

## 1. Wat deze chat is

Een volledige **development- en launchsessie** van AIVaultsAI (repo `C:\aivaultsai-new`, web-app `apps/web`): van het repareren van de commerciële-intent-classifier, via contactkanalen (e-mail + LinkedIn) op de website, Vercel-deployment op `aivaultsai.one`, social media (LinkedIn-post, TikTok, Instagram/Facebook, logo), tot de eerste **TASK 01: Customer Zero Orchestrator** inclusief een testroute en een echte databasefout (`leads_conversation_id_fkey`) die is gediagnosticeerd.

---

## 2. Belangrijkste operationele informatie

### Contactkanalen (definitief, live op de site)
- **E-mail:** `aivaultsai@gmail.com`
- **LinkedIn:** `https://www.linkedin.com/in/stephan-meester-758566374/`
- Centraal geregeld in `apps/web/lib/site.ts` (`CONTACT_EMAIL`, `LINKEDIN_URL`, `SITE_DOMAIN`, `SITE_NAME`) en getoond in `components/site-footer.tsx` en de commerciële homepage.
- Commit: `6036d4f` **"feat: add AIVaultsAI contact channels"** (2 bestanden, +47/−7).

### Deployment (Vercel)
- Vercel is gekoppeld aan het eigen domein: **`aivaultsai.one` → "Valid"** (de verwarring tussen `aivaultsai.vercel.app` en het eigen domein is opgelost; het eigen domein is de productie-URL).
- Werkwijze: feature-branch pushen → GitHub PR → checks → merge → Vercel deployt automatisch. In deze sessie: **PR #2** ("feat: customer zero booking engine") en **PR #3** ("fix: improve contact email actions") gemerged en gedeployed.
- Na elke code-wijziging + push moet Vercel opnieuw deployen (niet handmatig nodig, wel controleren).

### Bekende commits (branch `feat/customer-zero-booking-engine`)
| Commit | Message | Inhoud |
|---|---|---|
| `5c48542` | feat: customer zero booking and commercial intent | uitgangspunt sessie |
| `bce0aea` | fix: align commercial intent tests with production classifier | classifier-fix, 20/20 tests |
| `6036d4f` | feat: add AIVaultsAI contact channels | e-mail + LinkedIn op de site |
| `8ffefdc` | fix: improve contact email actions | "Plan een kennismaking" → Gmail-compose |

### Commerciële-intent-classifier
- De fout zat **niet** in `lib/customer-zero/commercial-intent.ts` maar in het testscript (`scripts/test-commercial-intent.mjs`): de test-verwachtingen waren niet afgestemd op de productie-classifier. Na de fix: **20/20 tests PASS** (informatief/commercieel onderscheid correct).

### "Plan een kennismaking" (mailto)
- De knop opent een Gmail-composevenster: **Aan:** `aivaultsai@gmail.com`, **Onderwerp:** `Kennismaking AIVaultsAI`. Werkte na `8ffefdc` correct (geverifieerd via screenshot).

---

## 3. TASK 01 — Customer Zero Orchestrator (oorsprong van de testroute)

De sessie stelde vast dat er **nog geen centrale orchestrator** bestond die de losse onderdelen bestuurde (AI-chat, conversations/messages, commercial intent, lead repository, booking service, database-migratie). De eerste versie van de orchestrator is in deze sessie aangemaakt:

- `apps/web/lib/customer-zero/orchestrator.ts` (eerste versie, 1702 bytes) — intent detecteren → lead aanmaken → events.
- **`apps/web/app/api/customer-zero/test-orchestrator/route.ts`** — testroute die:
  1. eerst een **echte `conversations`-rij aanmaakt** (`INSERT INTO conversations DEFAULT VALUES RETURNING id`),
  2. daarna `runCustomerZeroOrchestrator({ conversationId, messages: [...] })` aanroept,
  3. resultaat als JSON teruggeeft; fouten non-fataal als `{ ok: false }` met 500.

### Gevonden databasefout (belangrijk)
`NeonDbError: insert or update on table "leads" violates foreign key constraint "leads_conversation_id_fkey"`

- Oorzaak: de test gebruikte `crypto.randomUUID()` als `conversationId`, maar die conversation bestond niet in de tabel `conversations` → FK-fout.
- Fix-richting (vastgelegd): alleen `test-orchestrator/route.ts` aanpassen (eerst conversation aanmaken); **niet** de orchestrator, database of `/api/assistant` wijzigen.
- Testprocedure: `npm run dev` (local `http://localhost:3000`) + `Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/customer-zero/test-orchestrator"`.

> **Relatie met de huidige repository:** deze testroute is de ongetrackte map `apps/web/app/api/customer-zero/test-orchestrator/` in de `release/attribution`-checkout. De orchestrator is later (na de merge) uitgebreid met dependency injection (commit `eec0e6e`).

---

## 4. Commercieel funnel-ontwerp (uit de chat)

De website moet functioneren als **geautomatiseerde sales-/intake-machine**:

```
Bezoeker → AI-assistent → (Informatief: antwoord | Commercieel: intent herkennen)
→ Interesse/Lead/Hoge intent → Lead kwalificeren → PostgreSQL/Neon
→ "Wil je een kennismaking?" → Ja → Availability → Afspraak boeken → PostgreSQL
```

Meetbaar per lead: `source, session_id, company, email, commercial_intent, intent_score, qualification_status, requested_service, conversation_summary, appointment_status, created_at`.

Doel-funnel: `100 bezoekers → 32 gesprekken → 14 commerciële intents → 8 gekwalificeerde leads → 5 afspraken → 2 klanten`.

---

## 5. Social media & branding (vastgelegde keuzes)

- **LinkedIn-post (finale, professionele versie zonder AI-plaatjes/emoji)** — volledig opgeslagen in de chat; kern: "AIVaultsAI is live", aanbod (AI-assistenten, procesautomatisering, AI-agents, leadopvolging, afspraken/planning, API-integraties, maatwerk), link `https://www.aivaultsai.one`, contact e-mail + LinkedIn, hashtags `#AIVaultsAI #AI #Automatisering #Softwareontwikkeling #AIagents #MKB`.
- De post is gepubliceerd; er is ook een **TikTok** gemaakt. Volgende stap was Instagram + Facebook-profielen (naam, bio, beschrijving, CTA, branding, eerste 5 posts).
- **Logo:** ontwerp **#5** gekozen; daarnaast banner voor LinkedIn/Facebook gegenereerd.

---

## 6. Werkwijze (vastgelegd protocol)

- **1 taak → bouwen → testen → controleren → commit → pushen**; geen subtaken (geen 01A/01B); pas na afronding van een taak verder met de volgende.
- Codesuggesties worden als **volledige bestanden** aangeleverd (kopiëren/plakken), niet als losse diff-fragmenten.
- Bij fouten: eerst de werkelijke oorzaak bewijzen (terminaloutput/screenshots), dan pas fixen; "vertel niet wat er allemaal mis is, vertel wat ik moet doen om het te fixen".
- Geen tools met credits veronderstellen (Cursor-credits waren op); alles via PowerShell + editor.

---

## 7. Praktische leerpunten (omgeving)

- `.ts`-bestanden openen op deze machine in **Cursor** (of Media Player) — niet "uitvoeren" maar openen in de editor; paden met `cd`/`Set-Location` benaderen, niet als commando typen.
- PowerShell raakt "bevroren" midden in `git diff`/`Get-Content`-output — eerst `q` of een nieuwe prompt afwachten.
- Per ongeluk aangemaakte artefacten (`ai-newappsweb`, `ai-new`) zijn opgeruimd; werkboom schoonhouden vóór commits.
- E-mailadressen die een zoekactie in `node_modules` vond, zijn **package-metadata** (auteursinformatie), geen echte klant-e-mails.
- Lokale tests tegen de database vereisen dat `npm run dev` draait (anders "Kan geen verbinding met de externe server maken").

---

## 8. Hoe verder (volgende stappen uit de chat)

1. TASK 01 afronden: testroute laten werken (conversation eerst aanmaken) en end-to-end bewijzen: `conversation → orchestrator → commercial intent → lead creation → PostgreSQL`.
2. Daarna de commerciële funnel meetbaar maken (leadvelden + funnel-tracking) en de afspraak-flow (booking) aan de orchestrator koppelen.
3. Social: Instagram/Facebook-profielen invullen en publiceren; naamsbekendheid + klantenwerving.
4. Deze onderdelen zijn inmiddels (in latere taken/commits) doorontwikkeld naar customer-zero DI (`eec0e6e`), prospect-run (`6c7a469`/`1fffc55`) en de agent-runtime.

---

*Dit document is gegenereerd uit de gedeelde chat-payload (react-router-stream gedecodeerd). Feiten zijn overgenomen uit de conversatie; geen secrets opgenomen.*
