// Communication Governor + Execution Governor (Dialogue OS, deterministic half).
// These are runtime controls, not prompt suggestions: an agent physically
// cannot speak twice in a row, spam a lead, message at 3am, or silently
// abandon a mission, because the code refuses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const gsb = () => createClient(SB_URL, SR);

/** Follow-up ladder in hours. Never abandons: the last rung repeats forever. */
export const CADENCE_HOURS = [0, 3, 24, 72, 168, 336, 720];

export function nextActionAt(step: number, from = new Date()): string {
  const h = CADENCE_HOURS[Math.min(step, CADENCE_HOURS.length - 1)];
  return new Date(from.getTime() + h * 3600 * 1000).toISOString();
}

export const GOVERNOR = {
  quietStartHour: 21, // 21:00 – 08:00 local-ish (UTC-5 assumed for US leads)
  quietEndHour: 8,
  tzOffsetHours: -5,
  minGapMinutes: 90,          // never two outbound messages inside 90 minutes
  maxOutboundPerLeadPerDay: 2,
  maxOutboundPerTickGlobal: 8,
  maxUnansweredBeforeNurture: 5,
};

function localHour(now = new Date()) {
  return (now.getUTCHours() + 24 + GOVERNOR.tzOffsetHours) % 24;
}

export function inQuietHours(now = new Date()) {
  const h = localHour(now);
  return h >= GOVERNOR.quietStartHour || h < GOVERNOR.quietEndHour;
}

/** Next moment speech is permitted (start of the local morning window). */
export function afterQuietHours(now = new Date()): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  for (let i = 1; i <= 24; i++) {
    d.setUTCHours(d.getUTCHours() + 1);
    if (!inQuietHours(d)) return d.toISOString();
  }
  return new Date(now.getTime() + 3600_000).toISOString();
}

export type SpeechVerdict = { allowed: boolean; reason?: string; retryAt?: string };

export async function maySpeak(leadId: string, body?: string): Promise<SpeechVerdict> {
  const s = gsb();
  if (inQuietHours()) return { allowed: false, reason: "quiet_hours", retryAt: afterQuietHours() };

  const { data: recent } = await s.from("ao_outreach")
    .select("body,created_at,direction")
    .eq("lead_id", leadId).eq("direction", "out")
    .order("created_at", { ascending: false }).limit(10);

  const last = recent?.[0];
  if (last) {
    const gapMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
    if (gapMin < GOVERNOR.minGapMinutes) {
      return { allowed: false, reason: "min_gap", retryAt: new Date(Date.now() + (GOVERNOR.minGapMinutes - gapMin) * 60000).toISOString() };
    }
    if (body && normalize(last.body) === normalize(body)) {
      return { allowed: false, reason: "duplicate_message" };
    }
  }
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const today = (recent ?? []).filter((r) => new Date(r.created_at).getTime() > dayAgo).length;
  if (today >= GOVERNOR.maxOutboundPerLeadPerDay) {
    return { allowed: false, reason: "daily_cap", retryAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString() };
  }
  return { allowed: true };
}

function normalize(s: string) { return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 400); }

/** Execution Governor: every external side effect is logged with evidence. */
export async function recordSideEffect(
  missionId: string | null,
  agentKey: string,
  type: string,
  summary: string,
  detail: Record<string, unknown> = {},
) {
  await gsb().from("ao_events").insert({
    mission_id: missionId, agent_key: agentKey, event_type: type,
    summary: summary.slice(0, 500), detail,
  });
}
