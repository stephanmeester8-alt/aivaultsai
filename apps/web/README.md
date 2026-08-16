# AIVaultsAI website

Isolated public marketing site for [AIVaultsAI](https://www.aivaultsai.one).

This application is **presentation-only**. It does not import `packages/agent-core`, does not run agents, and does not call tools, Browser Use, Hermes, or any backend.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS

No database, authentication, payments, or APIs.

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

## Early access CTA

The **Request Access** control is a non-functional placeholder.

No contact email is configured in this repository, so the button does not use `mailto:` and does not submit a form. Document a real address here before wiring the CTA.

## Accuracy

Copy distinguishes **Built**, **In development**, and **Planned**. Tool execution, Browser Use, Hermes, and the public product platform are not claimed as live.

## Deploy to www.aivaultsai.one

Still required:

1. Host the `apps/web` Next.js app (for example Vercel), with this folder as the project root.
2. Point DNS for `aivaultsai.one` and `www.aivaultsai.one` at the host.
3. Confirm TLS for `www.aivaultsai.one`.
4. Optionally connect a real early-access channel (email or form) — none exists yet.
