# Customer Zero Measurement Contract

## North-star question

Can AIVaultsAI turn website traffic into useful, qualified commercial conversations and measurable next actions?

## Funnel

```text
Visitor
  -> AI conversation
  -> commercial intent
  -> lead
  -> qualified lead
  -> follow-up
  -> appointment
  -> customer
```

## Event vocabulary

| Event | Meaning |
|---|---|
| `conversation_started` | A visitor starts an AI assistant conversation |
| `assistant_response_succeeded` | The assistant successfully returns a response |
| `assistant_response_failed` | The assistant fails to return a response |
| `commercial_intent_detected` | The conversation contains a meaningful business need |
| `lead_created` | A lead record is created |
| `lead_qualified` | A qualification decision is recorded |
| `followup_task_created` | A follow-up action is created |
| `appointment_requested` | The visitor requests a commercial appointment |
| `appointment_created` | An appointment is actually created by a connected workflow |
| `conversion_recorded` | A known business conversion is recorded |

## Data minimization

Do not store unnecessary conversation content or sensitive personal information.

Lead data should be limited to information required to operate the commercial workflow. Secrets, API keys, authentication tokens, and credentials must never be stored as lead data.

## Success criteria for Phase 1

Phase 1 is successful when the complete path from an actual website conversation to a persisted, reviewable lead and qualification result works reliably in production-like conditions.

A successful technical test is not a successful business result. Business results must be measured separately.
