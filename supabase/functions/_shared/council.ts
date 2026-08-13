// COUNCIL — orchestration, delegation and supervision over the agent roster.
//
//   Chief of Staff  : reads the board, decides WHO does WHAT next, writes a
//                     delegation row (an auditable order, not a chat message).
//   Specialists     : execute their delegation through the Agency-OS runtime.
//   Supervisor      : grades the outcome; failures are retried once with the
//                     grader's correction, then escalated to a human.
//
// Nothing here is vendor-specific: models come from the Featherless router,
// capabilities come from the tool catalog.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { routeChatSafe } from "./model-router.ts";
import { playbookBlock } from "./playbook.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const csb = () => createClient(SB_URL, SR);

export const MAX_ATTEMPTS = 2;

export type Delegation = {
  id: string;
  mission_id: string | null;
  lead_id: string | null;
  to_agent: string;
  directive: string;
  rationale: string | null;
  status: string;
  attempts: number;
  result: Record<string, unknown>;
};

function jparse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

async function think(system: string, user: string, maxTokens = 900) {
  const r = await routeChatSafe({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: maxTokens,
  }, "auto", "council");
  return { json: jparse(r.content), model: r.model };
}

// ── 1. CHIEF: read the board, issue orders ─────────────────────────────────
const CHIEF_SYS = [
  "You are the CHIEF OF STAFF of an autonomous travel sales agency. You do not sell; you decide who acts next and why.",
  playbookBlock(),
  "",
  "You are given: the open missions, the due leads, unfinished delegations, and the agent roster with each agent's charter.",
  "Issue only orders that move money: prospecting, contact, qualification, sourcing, quoting, follow-up, closing, handover.",
  "Never issue an order that duplicates an unfinished delegation. Never order more than one action per mission per round.",
  "",
  'Return ONE JSON object: {"orders":[{"to_agent":"agent_key","mission_id":"uuid or null","lead_id":"uuid or null",',
  ' "directive":"one concrete, verifiable action","rationale":"one line","priority":1-10}],"board_note":"one line on the state of the business"}',
  "Max 5 orders. Fewer, sharper orders beat many vague ones.",
  "",
  "HARD RULES ON IDS: mission_id and lead_id must be copied verbatim from the BOARD. Never invent, reformat or guess an id.",
  "If a lead is not in the BOARD it does not exist — do not order work on it.",
  "One order per lead per round, and one order per mission per round.",
  "If the BOARD has no workable leads, order prospecting/inbox work instead (lead_id null, mission_id null):",
  "the scout must find prospects that come WITH a reachable contact path (Messenger thread, email or phone). A lead nobody can message is worthless.",
].join("\n");

export async function chiefRound(limit = 5) {
  const s = csb();
  const [agentsR, missionsR, leadsR, openR] = await Promise.all([
    s.from("ao_agents").select("agent_key,display_name,department,charter").eq("status", "active"),
    s.from("ao_missions").select("id,title,stage,priority,expected_value,needs_human")
      .eq("status", "open").neq("stage", "closed").order("priority").limit(12),
    s.from("ao_leads").select("id,headline,stage,status,priority,next_action_at,mission_id")
      .not("status", "in", '("won","lost","archived","stopped","unreachable","blocked","escalated")')
      .order("priority").limit(12),
    s.from("ao_delegations").select("id,to_agent,directive,status,mission_id,lead_id")
      .in("status", ["assigned", "running", "retry"]).limit(20),
  ]);

  // Missions whose only customer is unreachable cannot be advanced by anyone.
  // Keeping them on the board makes the chief order ghost work every round.
  const missionRows = missionsR.data ?? [];
  const { data: parked } = await s.from("ao_leads")
    .select("mission_id").in("status", ["unreachable", "stopped", "archived"]).limit(500);
  const parkedM = new Set((parked ?? []).map((l: any) => l.mission_id).filter(Boolean));
  const { data: liveLeads } = await s.from("ao_leads")
    .select("mission_id").not("status", "in", '("won","lost","archived","stopped","unreachable")').limit(500);
  const liveM = new Set((liveLeads ?? []).map((l: any) => l.mission_id).filter(Boolean));
  const workableMissions = missionRows.filter((m: any) => !parkedM.has(m.id) || liveM.has(m.id));

  const roster = (agentsR.data ?? []).map((a: any) => `${a.agent_key} (${a.department}): ${a.charter}`).join("\n").slice(0, 3000);
  const board = JSON.stringify({
    missions: workableMissions,
    leads: leadsR.data ?? [],
    open_delegations: openR.data ?? [],
    now: new Date().toISOString(),
  }).slice(0, 6000);

  const { json, model } = await think(CHIEF_SYS, `ROSTER:\n${roster}\n\nBOARD:\n${board}`);
  const known = new Set((agentsR.data ?? []).map((a: any) => a.agent_key));
  const leadRows = leadsR.data ?? [];
  const leadById = new Map(leadRows.map((l: any) => [l.id, l]));
  const missionIds = new Set(workableMissions.map((m: any) => m.id));

  // GROUNDING — a model that invents an id wastes a whole round. Only ids that
  // came off the board survive, and a lead order always inherits its own
  // mission so the two can never disagree.
  const seenLead = new Set<string>();
  const seenMission = new Set<string>();
  const orders: any[] = [];
  for (const o of Array.isArray(json.orders) ? json.orders : []) {
    if (!o?.to_agent || !known.has(o.to_agent) || !o?.directive) continue;
    let lead_id = o.lead_id && leadById.has(o.lead_id) ? o.lead_id : null;
    if (o.lead_id && !lead_id) continue;                        // hallucinated lead
    let mission_id = o.mission_id && missionIds.has(o.mission_id) ? o.mission_id : null;
    if (lead_id) mission_id = (leadById.get(lead_id) as any)?.mission_id ?? mission_id;
    // TARGETING — a contact order with no target cannot send anything. Rather
    // than burn a specialist turn on a ghost, it becomes prospecting work.
    if (!lead_id && !mission_id && /outreach|concierge|quote|book/.test(o.to_agent)) {
      o.to_agent = "scout";
      o.directive = "Find new reachable travel buyers (Messenger thread, email, or phone required) — the board had no contactable target for: " + String(o.directive).slice(0, 300);
    }
    if (lead_id) { if (seenLead.has(lead_id)) continue; seenLead.add(lead_id); }
    else if (mission_id) { if (seenMission.has(mission_id)) continue; seenMission.add(mission_id); }
    else { if (seenMission.has("prospect")) continue; seenMission.add("prospect"); }
    orders.push({ ...o, lead_id, mission_id });

    if (orders.length >= limit) break;
  }

  // COOLDOWN — an order that already failed twice on the same target is not
  // re-issued for 6 hours. Repeating a dead order is the single biggest waste
  // of model concurrency in the system.
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: recentFails } = await s.from("ao_delegations")
    .select("to_agent,lead_id,mission_id")
    .eq("status", "escalated").gte("created_at", since).limit(200);
  const cold = new Set((recentFails ?? []).map((r: any) => `${r.to_agent}|${r.lead_id ?? ""}|${r.mission_id ?? ""}`));
  const fresh = orders.filter((o: any) => !cold.has(`${o.to_agent}|${o.lead_id ?? ""}|${o.mission_id ?? ""}`));

  const rows = fresh.map((o: any) => ({
    mission_id: o.mission_id || null,
    lead_id: o.lead_id || null,
    from_agent: "chief",
    to_agent: o.to_agent,
    directive: String(o.directive).slice(0, 1200),
    rationale: String(o.rationale ?? "").slice(0, 500),
    status: "assigned",
  }));
  // NEVER IDLE — if grounding or cooldown left nothing to do, the round still
  // produces the one order that always creates value: go find reachable buyers.
  if (!rows.length) {
    rows.push({
      mission_id: null, lead_id: null, from_agent: "chief", to_agent: "scout",
      directive: "Find new travel buyers and admit only prospects that come with a reachable contact path (Messenger thread id/psid, email, or phone).",
      rationale: "No workable lead on the board; pipeline must be refilled.",
      status: "assigned",
    } as any);
  }

  const { data: created } = rows.length
    ? await s.from("ao_delegations").insert(rows).select()
    : { data: [] as any[] };

  return { board_note: String(json.board_note ?? ""), model, delegations: created ?? [] };
}

// ── 2. SPECIALIST: execute one delegation ──────────────────────────────────
export async function executeDelegation(d: Delegation, mode: "safe" | "full") {
  const s = csb();
  await s.from("ao_delegations").update({ status: "running", attempts: d.attempts + 1 }).eq("id", d.id);

  let outcome: any = {};
  try {
    if (d.lead_id) {
      // A lead-scoped order means "talk to this person". Outreach is the only
      // path that actually sends a message, so it always wins over mission work.
      const r = await fetch(SB_URL + "/functions/v1/outreach-tick", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + SR },
        body: JSON.stringify({ limit: 1, lead_id: d.lead_id, mode }),
      });
      outcome = { via: "outreach-tick", status: r.status, body: (await r.text()).slice(0, 2500) };
    } else if (d.mission_id) {
      const r = await fetch(SB_URL + "/functions/v1/agency-os", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + SR },
        body: JSON.stringify({ action: "run_mission", mission_id: d.mission_id, mode, cycles: 1 }),
      });
      outcome = { via: "agency-os", status: r.status, body: (await r.text()).slice(0, 2500) };
    } else {
      const r = await fetch(SB_URL + "/functions/v1/prospect-tick", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + SR },
        body: JSON.stringify({ directive: d.directive, mode }),
      });
      outcome = { via: "prospect-tick", status: r.status, body: (await r.text()).slice(0, 2500) };
    }
  } catch (e) {
    outcome = { error: (e as Error).message };
  }
  return outcome;
}

// ── 3. SUPERVISOR: grade the delegation outcome ────────────────────────────
const GRADER_SYS = [
  "You are the SUPERVISOR of an autonomous travel sales agency. You grade whether a delegated order was actually carried out.",
  "Evidence beats narrative: a report with no tool result, no message sent and no state change is NOT done.",
  "",
  'Return ONE JSON object: {"done":true|false,"quality":0..1,"finding":"one line of evidence-based judgement",',
  ' "correction":"if not done, the sharper directive to retry with","escalate":false|"reason a human is required"}',
].join("\n");

export async function gradeDelegation(d: Delegation, outcome: unknown) {
  const { json, model } = await think(
    GRADER_SYS,
    `ORDER: ${d.directive}\nASSIGNED TO: ${d.to_agent}\nATTEMPT: ${d.attempts + 1} of ${MAX_ATTEMPTS}\n\nOUTCOME:\n${JSON.stringify(outcome).slice(0, 3000)}`,
    500,
  );
  return {
    done: Boolean(json.done),
    quality: Math.max(0, Math.min(1, Number(json.quality) || 0)),
    finding: String(json.finding ?? "").slice(0, 800),
    correction: json.correction ? String(json.correction).slice(0, 800) : null,
    escalate: json.escalate ? String(json.escalate).slice(0, 400) : null,
    model,
  };
}

/** Execute + grade + settle one delegation. Retry once, then escalate. */
export async function workDelegation(d: Delegation, mode: "safe" | "full") {
  const s = csb();
  const outcome = await executeDelegation(d, mode);
  const grade = await gradeDelegation(d, outcome);
  const attempts = d.attempts + 1;

  let status = "done";
  if (grade.escalate) status = "escalated";
  else if (!grade.done) status = attempts >= MAX_ATTEMPTS ? "escalated" : "retry";

  await s.from("ao_delegations").update({
    status,
    attempts,
    result: { outcome, grade },
    directive: status === "retry" && grade.correction ? grade.correction : d.directive,
    escalation_reason: status === "escalated" ? (grade.escalate ?? grade.finding) : null,
  }).eq("id", d.id);

  if (status === "escalated" && d.mission_id && !d.lead_id) {
    await s.from("ao_missions").update({
      needs_human: true, status: "escalated",
      escalation_reason: (grade.escalate ?? grade.finding).slice(0, 500),
    }).eq("id", d.mission_id);
  }

  await s.from("ao_dialogue").insert({
    mission_id: d.mission_id,
    from_agent: "chief",
    lobe: "supervisor",
    kind: status === "done" ? "report" : status === "retry" ? "advice" : "escalation",
    content: `[${d.to_agent}] ${grade.finding || "no finding"}`.slice(0, 1500),
  });

  return { delegation_id: d.id, to_agent: d.to_agent, status, quality: grade.quality, finding: grade.finding };
}

export async function dueDelegations(limit = 6): Promise<Delegation[]> {
  const { data } = await csb().from("ao_delegations")
    .select("id,mission_id,lead_id,to_agent,directive,rationale,status,attempts,result")
    .in("status", ["assigned", "retry"])
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as Delegation[];
}
