# Customer Zero Lead Qualification Contract

## Purpose

Lead qualification determines whether an existing Lead contains sufficient observable commercial signals to justify follow-up.

Qualification is an assessment. It is not proof that a Lead will become a customer.

## Required qualification fields

- `score` — numeric qualification score from 0 to 100.
- `confidence` — confidence in the qualification assessment.
- `reason` — concise explanation of the observed signals.
- `qualifiedAt` — timestamp of the qualification decision.
- `qualifiedBy` — component or agent that produced the assessment.

## Score interpretation

Initial interpretation:

- `0–39` — LOW
- `40–69` — MEDIUM
- `70–100` — HIGH

The score is an internal prioritization signal.

It must not be presented to a customer as an objective probability of conversion.

## Confidence

Allowed values:

- `LOW`
- `MEDIUM`
- `HIGH`

Confidence describes confidence in the assessment, not confidence that the visitor will purchase.

## Qualification signals

Initial observable signals may include:

- explicit request for a service;
- explicit request for pricing;
- explicit request for a consultation;
- explicit request for an AI solution;
- explicit request for automation;
- voluntarily provided business context;
- voluntarily provided contact information;
- explicit appointment intent.

## Negative signals

Qualification may be reduced by observable signals such as:

- purely informational question;
- no identifiable commercial intent;
- request unrelated to AIVaultsAI services;
- visitor explicitly stating no current need.

Negative signals must be based on observed interaction data.

## AI qualification rules

AI may propose a qualification assessment.

AI must not:

- invent missing information;
- assume a budget that was not provided;
- assume a company size;
- assume purchase intent;
- mark a Lead as `CONVERTED`;
- fabricate contact information.

## Human review

A qualification assessment does not authorize commercial actions by itself.

Actions with external side effects remain subject to the applicable policy and approval rules.

## Requalification

A Lead may be requalified when new observable events provide materially different information.

Previous qualification results must remain traceable.

The system must not silently overwrite historical qualification decisions.

## Customer Zero

For AIVaultsAI, each qualification decision must be traceable to:

- the Lead;
- the supporting Lead Event(s);
- the qualification score;
- the confidence;
- the reason;
- the timestamp;
- the component or agent responsible.

This allows us to compare:

`AI assessment → follow-up → actual outcome`

## Evidence standard

Qualification is classified as an assessment.

It must not be stored or reported as factual proof of customer intent or future conversion.

## Non-goals

This contract does not define:

- the AI provider;
- the scoring algorithm implementation;
- database schema;
- CRM integration;
- email sending;
- appointment booking;
- autonomous outbound communication;
- billing.
