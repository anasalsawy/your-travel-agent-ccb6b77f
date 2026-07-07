import type { MissionStatus, TaskStatus } from "./types.js";

const missionTransitions: Record<MissionStatus, MissionStatus[]> = {
  queued: ["planning", "failed"],
  planning: ["delegating", "blocked", "failed"],
  delegating: ["executing", "blocked", "escalated", "failed"],
  executing: ["verifying", "blocked", "escalated", "failed"],
  verifying: ["completed", "executing", "blocked", "failed"],
  completed: [],
  blocked: ["delegating", "escalated", "failed"],
  escalated: ["delegating", "failed"],
  failed: [],
};

const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  todo: ["assigned", "failed"],
  assigned: ["running", "blocked", "failed"],
  running: ["review", "retrying", "blocked", "escalated", "failed"],
  review: ["done", "running", "retrying", "failed"],
  done: [],
  retrying: ["running", "blocked", "escalated", "failed"],
  blocked: ["retrying", "escalated", "failed"],
  escalated: ["assigned", "failed"],
  failed: [],
};

export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  return missionTransitions[from].includes(to);
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return taskTransitions[from].includes(to);
}
