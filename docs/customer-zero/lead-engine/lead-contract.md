# Customer Zero Lead Contract

## Purpose

A Lead represents a person or business that has shown identifiable commercial interest in AIVaultsAI.

The Lead model is an internal product contract. It is not a CRM implementation.

## Required fields

- `leadId` — unique immutable identifier.
- `createdAt` — creation timestamp.
- `status` — current lead lifecycle status.
- `source` — origin of the lead.
- `intent` — detected commercial intent.
- `contact` — contact information when voluntarily provided.

## Lead status

Initial lifecycle:

`NEW → QUALIFIED → FOLLOW_UP → CONVERTED`

Alternative terminal outcome:

`NEW → DISQUALIFIED`

A lead must never be marked `CONVERTED` merely because an AI agent predicts conversion.

Conversion requires an observable business outcome.

## Sources

Initial sources:

- `website`
- `ai_assistant`
- `linkedin`
- `instagram`
- `organic_search`
- `direct`
- `referral`
- `other`

## Intent

Initial intent categories:

- `website`
- `ai_assistant`
- `lead_generation`
- `automation`
- `appointment`
- `general_inquiry`
- `unknown`

## Qualification

Qualification is separate from lead creation.

A lead may exist without being qualified.

Qualification must record:

- `score`
- `confidence`
- `reason`
- `qualifiedAt`

The score is an assessment, not proof of commercial value.

## Contact information

Contact information is optional.

Possible fields:

- `name`
- `company`
- `email`
- `phone`

Only information voluntarily supplied by the visitor may be stored as customer-provided contact data.

## Evidence

Lead creation and qualification must remain traceable to an originating event.

Examples:

- AI conversation
- contact request
- explicit appointment request
- manually recorded source

The system must not invent contact information or commercial intent.

## Customer Zero

For AIVaultsAI itself, every lead must be attributable to:

- source
- timestamp
- originating interaction/event

This allows later measurement of:

`visitor → conversation → lead → qualification → follow-up → outcome`

## Non-goals

This contract does not define:

- database schema
- CRM integration
- email sending
- calendar integration
- AI provider implementation
- authentication
- billing
- multi-tenant persistence
