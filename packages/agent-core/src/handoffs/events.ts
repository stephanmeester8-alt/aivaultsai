import type { AgentId } from "../agents/ids.ts";

export const HANDOFF_EVENT_TYPES = ["HANDOFF_CREATED"] as const;

export type HandoffEventType = (typeof HANDOFF_EVENT_TYPES)[number];

export type HandoffEvent = {
  readonly eventId: string;
  readonly handoffId: string;
  readonly taskId: string;
  readonly fromAgent: AgentId;
  readonly toAgent: AgentId;
  readonly timestamp: string;
};
