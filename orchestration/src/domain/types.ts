export type MissionStatus =
  | "queued"
  | "planning"
  | "delegating"
  | "executing"
  | "verifying"
  | "completed"
  | "blocked"
  | "escalated"
  | "failed";

export type TaskStatus =
  | "todo"
  | "assigned"
  | "running"
  | "review"
  | "done"
  | "retrying"
  | "blocked"
  | "failed"
  | "escalated";

export type RoleType = "lead" | "worker";

export type AgentRole = {
  name: string;
  type: RoleType;
  authority: "normal" | "high";
  specialties: string[];
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
};

export type Task = {
  id: string;
  missionId: string;
  title: string;
  description: string;
  assignee: string;
  status: TaskStatus;
  attempt: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type Mission = {
  id: string;
  objective: string;
  status: MissionStatus;
  lead: string;
  createdAt: string;
  updatedAt: string;
  repeatDirectiveCount: number;
  lastDirectiveSignature?: string;
  escalationReason?: string;
};

export type TickResult = {
  missionId: string;
  status: MissionStatus;
  action: string;
  details: string;
};
