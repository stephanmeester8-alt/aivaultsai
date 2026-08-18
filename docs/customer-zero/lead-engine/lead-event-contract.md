# Customer Zero Lead Event Contract

## Purpose

A Lead Event is an observable interaction or system event that may provide evidence for creating, updating, or qualifying a Lead.

A Lead Event is not automatically a Lead.

## Required fields

- `eventId` — unique immutable identifier.
- `occurredAt` — timestamp at which the event occurred.
- `eventType` — type of observable event.
- `source` — originating channel.
- `origin` — component or interaction that produced the event.

## Initial event types

- `assistant_conversation_started`
- `assistant_commercial_intent_detected`
- `contact_information_provided`
- `contact_request_submitted`
- `appointment_request_submitted`
- `lead_created`
- `lead_qualified`
- `follow_up_requested`

## Event source

Initial sources:

- `website`
- `ai_assistant`
- `linkedin`
- `instagram`
- `organic_search`
- `direct`
- `referral`
- `other`

## Origin

Origin identifies where the event came from.

Examples:

- `live_assistant`
- `contact_form`
- `appointment_flow`
- `manual`
- `system`

The origin must not claim an action that did not occur.

## Evidence relationship

Events are observations.

An event such as:

`assistant_commercial_intent_detected`

means that the system detected commercial intent.

It does not prove that the visitor is a qualified lead.

A qualified lead requires a separate qualification decision.

## Lead creation

A Lead may be created when one or more observable events provide sufficient evidence of identifiable commercial interest.

The exact qualification policy is defined separately.

## Contact information

Contact information may only be associated with an event when it was voluntarily provided through the originating interaction.

The system must not infer:

- email addresses;
- phone numbers;
- names;
- companies;

from unsupported information.

## Immutability

Lead Events are append-only.

Events must not be silently rewritten after creation.

Corrections are represented by a new event.

## Customer Zero traceability

For AIVaultsAI, every Lead must be traceable to one or more Lead Events.

The minimum trace must allow reconstruction of:

`event → lead → qualification → follow-up → outcome`

## Non-goals

This contract does not define:

- database schema;
- event bus implementation;
- AI provider implementation;
- lead scoring algorithm;
- CRM integration;
- email sending;
- calendar integration;
- authentication;
- billing.
