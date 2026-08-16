import type { TaskCreatedBy, TaskStatus } from "./types.ts";

export const TASK_EVENT_TYPES = [
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export type TaskEvent = {
  readonly eventId: string;
  readonly taskId: string;
  readonly type: TaskEventType;
  readonly fromStatus: TaskStatus | null;
  readonly toStatus: TaskStatus | null;
  readonly actor: TaskCreatedBy;
  readonly timestamp: string;
};
