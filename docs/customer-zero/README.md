# AIVaultsAI Customer Zero

## Purpose

AIVaultsAI is its own first customer.

We will use the public AIVaultsAI website as the first production-like environment for validating the product before selling the same capabilities to external customers.

The goal is not to create vanity metrics. The goal is to collect reproducible evidence that the product can:

1. attract visitors;
2. engage visitors with the AI assistant;
3. identify potential commercial intent;
4. create and qualify leads;
5. prepare appropriate follow-up actions;
6. measure outcomes;
7. document failures and improvements.

## Operating principle

> Build for AIVaultsAI first. Prove it on AIVaultsAI. Productize only what works.

## Phase 1 vertical slice

```text
VISITOR
  -> WEBSITE
  -> AI CONVERSATION
  -> LEAD SIGNAL
  -> LEAD RECORD
  -> QUALIFICATION
  -> FOLLOW-UP TASK
  -> OUTCOME
  -> EVIDENCE / METRICS
```

The first phase intentionally stops before autonomous outbound messaging, calendar booking, CRM synchronization, or browser automation.

## Measurement contract

For each customer-zero period we record, where technically available:

- website sessions / visitors;
- AI conversations;
- assistant response success/failure;
- conversations with commercial intent;
- leads created;
- qualification outcome;
- follow-up tasks created;
- appointments requested / created once supported;
- conversion outcomes when known;
- errors and incidents;
- product changes made because of observed evidence.

Metrics must identify their source and time window. No metric is presented as a result unless it was actually measured.

## Evidence standard

Customer-zero evidence is classified as one of:

- `FACT` — directly observed or measured by the product;
- `INFERENCE` — interpretation of observed data;
- `HYPOTHESIS` — proposed explanation or idea to test.

We do not convert inference or hypothesis into facts.

## Product-learning loop

```text
OBSERVE
  -> MEASURE
  -> ANALYZE
  -> CHANGE ONE THING
  -> RE-TEST
  -> DOCUMENT RESULT
```

Every meaningful improvement should have a before/after context and a short rationale.

## Non-goals for Phase 1

- full CRM platform;
- social media scheduler;
- SEO automation suite;
- autonomous outbound sales;
- Browser Use execution;
- multi-tenant billing;
- enterprise SSO;
- large-scale microservice decomposition.

Those are later product phases and must not be represented as implemented customer-zero functionality.
