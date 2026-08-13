// SKYVERN — emergency browser capability.
//
// Ladder position (EDR-001): when the Graph/API path does not exist AND the
// CDP browser identity is unavailable (out of minutes, session dead, vendor
// gone), the council can still act on the open web by describing the GOAL in
// English and letting Skyvern drive a real browser.
//
// Callers never import a vendor SDK; they ask for `browse(goal)`.
const BASE = (Deno.env.get("SKYVERN_BASE_URL") ?? "https://api.skyvern.com").replace(/\/+$/, "");
const KEY = Deno.env.get("SKYVERN_API_KEY") ?? "";

export function skyvernAvailable() {
  return Boolean(KEY);
}

async function sk(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { "x-api-key": KEY, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  if (!r.ok) throw new Error(`skyvern_${r.status}: ${String(text).slice(0, 300)}`);
  return body;
}

export type BrowseTask = {
  url: string;
  goal: string;                              // navigation_goal, plain English
  extract?: string;                          // data_extraction_goal
  schema?: Record<string, unknown>;          // extracted_information_schema
  payload?: Record<string, unknown>;         // navigation_payload (credentials, form values)
  maxSteps?: number;
};

/** Fire-and-store: create the task and return its id immediately. */
export async function createTask(t: BrowseTask) {
  const body = {
    url: t.url,
    navigation_goal: t.goal,
    data_extraction_goal: t.extract ?? null,
    extracted_information_schema: t.schema ?? null,
    navigation_payload: t.payload ?? null,
    proxy_location: "RESIDENTIAL",
    max_steps_override: t.maxSteps ?? 12,
  };
  const res = await sk("/api/v1/tasks", { method: "POST", body: JSON.stringify(body) });
  return { task_id: res.task_id ?? res.id, raw: res };
}

export async function getTask(taskId: string) {
  return await sk(`/api/v1/tasks/${taskId}`);
}

const TERMINAL = new Set(["completed", "failed", "terminated", "canceled", "cancelled", "timed_out"]);

/** Run to completion inside one edge invocation (bounded — default ~2 minutes). */
export async function runTask(t: BrowseTask, timeoutMs = 120_000) {
  if (!skyvernAvailable()) return { ok: false, error: "skyvern_not_configured" };
  try {
    const { task_id } = await createTask(t);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const s = await getTask(task_id);
      const status = String(s.status ?? "").toLowerCase();
      if (TERMINAL.has(status)) {
        return {
          ok: status === "completed",
          status,
          task_id,
          extracted: s.extracted_information ?? null,
          failure: s.failure_reason ?? null,
          recording_url: s.recording_url ?? null,
        };
      }
    }
    return { ok: false, status: "running", task_id, error: "timeout_still_running" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
