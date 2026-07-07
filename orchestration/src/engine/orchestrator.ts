import { randomUUID, createHash } from "node:crypto";
import { canTransitionMission, canTransitionTask } from "../domain/stateMachine.js";
import type { AgentRole, Mission, RetryPolicy, Task, TickResult } from "../domain/types.js";
import type { FoundryClient } from "../adapters/foundryClient.js";

type Store = {
  missions: Map<string, Mission>;
  tasks: Map<string, Task[]>;
};

export class OrchestratorEngine {
  private readonly store: Store = {
    missions: new Map(),
    tasks: new Map(),
  };

  private readonly retryPolicy: RetryPolicy = {
    maxAttempts: 2,
    baseDelayMs: 500,
  };

  private readonly roster: AgentRole[] = [
    { name: "assistant", type: "lead", authority: "normal", specialties: ["customer", "triage"] },
    { name: "YTA-ASSISTANT", type: "lead", authority: "normal", specialties: ["booking"] },
    { name: "BUILDEROFAGENTS", type: "lead", authority: "normal", specialties: ["build", "integration"] },
    { name: "shopper-lead", type: "lead", authority: "normal", specialties: ["shopping"] },
    { name: "internal-app-test-buildrunner", type: "worker", authority: "high", specialties: ["infra", "deployment", "azure"] },
  ];

  constructor(private readonly foundryClient: FoundryClient) {}

  createMission(objective: string, lead = "assistant"): Mission {
    const now = new Date().toISOString();
    const mission: Mission = {
      id: randomUUID(),
      objective,
      status: "queued",
      lead,
      createdAt: now,
      updatedAt: now,
      repeatDirectiveCount: 0,
    };
    this.store.missions.set(mission.id, mission);
    this.store.tasks.set(mission.id, []);
    return mission;
  }

  getMission(missionId: string): { mission?: Mission; tasks: Task[] } {
    return {
      mission: this.store.missions.get(missionId),
      tasks: this.store.tasks.get(missionId) ?? [],
    };
  }

  async tick(missionId: string): Promise<TickResult> {
    const mission = this.store.missions.get(missionId);
    if (!mission) {
      throw new Error("mission_not_found");
    }

    const tasks = this.store.tasks.get(missionId) ?? [];

    if (mission.status === "queued") {
      this.transitionMission(mission, "planning");
      return { missionId, status: mission.status, action: "plan_start", details: "Mission moved to planning." };
    }

    if (mission.status === "planning") {
      const worker = this.routeWorker(mission.objective);
      const task = this.createTask(missionId, worker, mission.objective);
      this.transitionMission(mission, "delegating");
      return { missionId, status: mission.status, action: "task_created", details: `Delegated to ${task.assignee}.` };
    }

    const open = tasks.find((t) => ["todo", "assigned", "running", "retrying", "review", "blocked"].includes(t.status));
    if (!open) {
      if (mission.status !== "completed") {
        this.transitionMission(mission, "completed");
      }
      return { missionId, status: mission.status, action: "mission_complete", details: "No open tasks remain." };
    }

    if (open.status === "todo") {
      this.transitionTask(open, "assigned");
      this.transitionMission(mission, "executing");
      return { missionId, status: mission.status, action: "task_assigned", details: `Task assigned to ${open.assignee}.` };
    }

    if (open.status === "assigned" || open.status === "retrying") {
      this.transitionTask(open, "running");
      const directive = this.buildDirective(mission.objective, open);
      this.trackDirectiveRepetition(mission, directive);

      if (mission.repeatDirectiveCount > 2) {
        this.transitionTask(open, "escalated");
        this.transitionMission(mission, "escalated");
        mission.escalationReason = "directive_repeated_more_than_2";
        mission.updatedAt = new Date().toISOString();
        return {
          missionId,
          status: mission.status,
          action: "auto_escalation",
          details: "Repeated directive exceeded threshold; escalated.",
        };
      }

      const result = await this.foundryClient.runWorker({
        agentName: open.assignee,
        directive,
        missionId,
        taskId: open.id,
      });

      if (result.ok) {
        this.transitionTask(open, "review");
        this.transitionMission(mission, "verifying");
        return { missionId, status: mission.status, action: "worker_ok", details: result.text.slice(0, 180) };
      }

      open.lastError = result.error ?? "unknown_worker_error";
      open.attempt += 1;
      open.updatedAt = new Date().toISOString();

      if (open.attempt > this.retryPolicy.maxAttempts) {
        this.transitionTask(open, "escalated");
        this.transitionMission(mission, "escalated");
        mission.escalationReason = `retry_exhausted:${open.lastError}`;
        mission.updatedAt = new Date().toISOString();
        return { missionId, status: mission.status, action: "retry_exhausted", details: open.lastError };
      }

      this.transitionTask(open, "retrying");
      this.transitionMission(mission, "executing");
      return { missionId, status: mission.status, action: "retry_scheduled", details: open.lastError };
    }

    if (open.status === "review") {
      this.transitionTask(open, "done");
      this.transitionMission(mission, "executing");
      return { missionId, status: mission.status, action: "task_done", details: "Task verified and closed." };
    }

    if (open.status === "blocked") {
      this.transitionMission(mission, "blocked");
      return { missionId, status: mission.status, action: "mission_blocked", details: open.lastError ?? "task blocked" };
    }

    return { missionId, status: mission.status, action: "no_op", details: "No transition fired." };
  }

  private createTask(missionId: string, assignee: string, objective: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      missionId,
      title: objective.slice(0, 120),
      description: objective,
      assignee,
      status: "todo",
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.store.tasks.get(missionId) ?? [];
    list.push(task);
    this.store.tasks.set(missionId, list);
    return task;
  }

  private routeWorker(objective: string): string {
    const t = objective.toLowerCase();
    if (/deploy|azure|infra|function|foundry|secret|rbac/.test(t)) return "internal-app-test-buildrunner";
    if (/booking|flight|hotel|car|pnr/.test(t)) return "YTA-ASSISTANT";
    if (/shop|cart|buy|coupon/.test(t)) return "shopper-lead";
    if (/build|code|refactor|agent/.test(t)) return "BUILDEROFAGENTS";
    return "assistant";
  }

  private buildDirective(objective: string, task: Task): string {
    const leadRules = [
      "You are operating in lead/worker mode.",
      "If you are a lead agent, do not get consumed by long execution.",
      "Create, delegate, supervise, assist, verify, then report evidence.",
    ].join(" ");
    return `${leadRules}\nObjective: ${objective}\nTask: ${task.title}\nDeliver one concrete step with evidence.`;
  }

  private trackDirectiveRepetition(mission: Mission, directive: string): void {
    const sig = createHash("sha1").update(directive).digest("hex");
    if (mission.lastDirectiveSignature === sig) {
      mission.repeatDirectiveCount += 1;
    } else {
      mission.repeatDirectiveCount = 1;
      mission.lastDirectiveSignature = sig;
    }
    mission.updatedAt = new Date().toISOString();
  }

  private transitionMission(mission: Mission, next: Mission["status"]): void {
    if (!canTransitionMission(mission.status, next)) return;
    mission.status = next;
    mission.updatedAt = new Date().toISOString();
  }

  private transitionTask(task: Task, next: Task["status"]): void {
    if (!canTransitionTask(task.status, next)) return;
    task.status = next;
    task.updatedAt = new Date().toISOString();
  }
}
