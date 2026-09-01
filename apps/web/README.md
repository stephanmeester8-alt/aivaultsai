# AIVaultsAI website

Isolated public marketing site for [AIVaultsAI](https://www.aivaultsai.one).

This is the public AIVaultsAI marketing site and commercial-assistant application. Server-side routes provide assistant conversations, Customer Zero lead capture and qualification, analytics instrumentation, and a narrowly scoped Agent Runtime integration.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Postgres/Neon persistence for Customer Zero and runtime audit records
- `@aivaultsai/agent-core` for the server-only runtime boundary

There is no public account, payment, or self-service agent-platform UI. The assistant and persistence paths are server-side; the runtime currently enables only a bounded HTTP verification task after lead creation. Browser Use, Hermes, and general-purpose tool execution are not connected.

## Develop

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

## Customer Zero

The assistant funnel classifies commercial intent, creates a lead, appends lead events, and persists a traceable qualification for high-intent leads. It is designed to be non-fatal to assistant replies. The optional runtime follow-up is atomically claimed per conversation before it can execute.

## Accuracy

Copy distinguishes **Built**, **In development**, and **Planned**. Browser Use, Hermes, and the public product platform are not claimed as live.

## Deploy to www.aivaultsai.one

Still required:

1. Host the `apps/web` Next.js app (for example Vercel), with this folder as the project root.
2. Point DNS for `aivaultsai.one` and `www.aivaultsai.one` at the host.
3. Confirm TLS for `www.aivaultsai.one`.
4. Optionally connect a real early-access channel (email or form) — none exists yet.
