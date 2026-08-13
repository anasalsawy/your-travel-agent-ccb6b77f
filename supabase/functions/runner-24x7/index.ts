// runner-24x7 — the never-sleeping heartbeat.
// One cron entry drives the whole organization: it wakes every minute, keeps
// the browser identity alive, works due leads, pushes missions forward, and
// runs the memory lifecycle (fill → finetune → free). Every beat is recorded,
// so "is the agency awake?" is an evidence question, not a feeling.
import { gsb } from "../_shared/governor.ts";
import { broadcastUpdate, esc } from "../_shared/telegram-council.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function call(fn: string, body: Record<string, unknown>, timeoutMs = 55000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${URL_}/functions/v1/${fn}`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", Authorization: "Bearer " + SR },
      body: JSON.stringify(body),
    });
    const text = (await r.text()).slice(0, 2000);
    let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* keep */ }
    return { fn, status: r.status, ok: r.ok, body: parsed };
  } catch (e) {
    return { fn, ok: false, error: (e as Error).message };
  } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  const s = gsb();
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "full" ? "full" : "safe";
  const jobs: Record<string, unknown> = {};

  // 1. Keep the Facebook identity warm; re-verify at most every 15 minutes.
  const { data: sess } = await s.from("ao_channel_sessions")
    .select("id,status,last_verified_at").eq("channel", "facebook").eq("label", "primary").maybeSingle();
  const staleMin = sess?.last_verified_at ? (Date.now() - new Date(sess.last_verified_at).getTime()) / 60000 : 999;
  if (sess && sess.status !== "disconnected" && staleMin > 15) {
    jobs.session = await call("fb-session", { action: "verify" }, 40000);
  } else {
    jobs.session = { skipped: true, status: sess?.status ?? "none" };
  }

  // 2. Inbox: real humans who messaged the Page, commented, or filled a lead
  //    ad. Application identity (Graph token) — works with no browser at all.
  jobs.inbox = await call("inbox-tick", { mode, limit: 20, max: 8 }, 50000);

  // 2a. Outreach: contact and follow up every lead that is due.
  const outreach = await call("outreach-tick", { limit: 6, mode });
  jobs.outreach = outreach;
  const leadsTouched = Number((outreach as any)?.body?.processed ?? 0)
    + Number((jobs.inbox as any)?.body?.admitted ?? 0);

  // 2b. Prospecting: go FIND buyers (every 5th minute — search is expensive).
  if (new Date().getUTCMinutes() % 5 === 0) {
    jobs.prospect = await call("prospect-tick", { mode, max_posts: 10 }, 50000);
  } else {
    jobs.prospect = { skipped: true };
  }

  // 2c. Council: chief issues delegations, specialists execute, supervisor grades.
  // The provider plan is unit-capped, so the council gets its own slow lane.
  jobs.council = new Date().getUTCMinutes() % 2 === 0
    ? await call("council", { action: "tick", mode, limit: 2 }, 55000)
    : { skipped: true };

  // 2d. Engineering department: audit → vote → ship website changes.
  //     Slowest lane of all: the site changes deliberately, not constantly.
  jobs.dev = new Date().getUTCMinutes() % 20 === 0
    ? await call("dev-council", { action: "tick" }, 55000)
    : { skipped: true };


  // 3. Push missions through the pipeline.
  const agency = await call("agency-os", { action: "tick", mode, limit: 3, cycles: 2 });
  jobs.agency = agency;
  const missionsTouched = Number((agency as any)?.body?.processed ?? 0);

  // 4. Memory lifecycle: fill → finetune → free. Only every 10th minute.
  let memoryOps = 0;
  if (new Date().getUTCMinutes() % 10 === 0) {
    const mem = await call("memory-lifecycle-tick", {});
    jobs.memory = mem;
    memoryOps = Number((mem as any)?.body?.promoted ?? 0) + Number((mem as any)?.body?.retired ?? 0) + Number((mem as any)?.body?.compressed ?? 0);
  } else {
    jobs.memory = { skipped: true };
  }

  const ok = Object.values(jobs).every((j: any) => j?.ok !== false);
  await s.from("ao_runner_beats").insert({
    jobs, leads_touched: leadsTouched, missions_touched: missionsTouched,
    memory_ops: memoryOps, duration_ms: Date.now() - started, ok,
    notes: ok ? null : "one or more jobs reported failure",
  });

  // 5. Owner briefing over Telegram: new customers as they arrive, and an
  //    hourly line on the board. The owner never has to open a dashboard.
  try {
    const admitted = Number((jobs.inbox as any)?.body?.admitted ?? 0);
    if (admitted > 0) {
      const names = ((jobs.inbox as any)?.body?.leads ?? [])
        .map((l: any) => `• ${l.who}: ${l.headline}`).join("\n").slice(0, 1200);
      await notifyOwner(`🟢 <b>${admitted} new customer(s)</b>\n${esc(names)}`);
    }
    const { data: esc10 } = await s.from("ao_missions")
      .select("title").eq("needs_human", true).limit(3);
    if (new Date().getUTCMinutes() === 0) {
      await notifyOwner(
        `⏱ <b>Hourly</b> — leads touched ${leadsTouched}, missions ${missionsTouched}` +
        (esc10?.length ? `\n⚠️ needs human: ${esc10.map((m: any) => esc(m.title)).join(", ")}` : ""),
      );
    }
  } catch { /* the heartbeat never dies for a notification */ }

  // Keep the beat log bounded (the same fill-then-free rule applied to telemetry).
  const { data: old } = await s.from("ao_runner_beats")
    .select("id").order("beat_at", { ascending: false }).range(5000, 5200);
  if (old?.length) await s.from("ao_runner_beats").delete().in("id", old.map((o: any) => o.id));


  return json({ ok, mode, duration_ms: Date.now() - started, jobs });
});
