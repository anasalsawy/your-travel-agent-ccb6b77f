// outreach-tick — the autonomous salesperson.
// For every lead whose next_action_at has come due: pull the thread, decide
// (strategist lobe), write the actual message (executor lobe), pass it through
// the Communication Governor, deliver it down the channel ladder, log evidence,
// and schedule the next rung of the follow-up cadence. Never abandons a lead.
import { llm, safeParse } from "../_shared/lobe-runtime.ts";
import { gsb, maySpeak, nextActionAt, recordSideEffect, GOVERNOR } from "../_shared/governor.ts";
import { deliver, type Lead } from "../_shared/channels.ts";
import { fbDo, readThread } from "../_shared/facebook.ts";
import { playbookBlock } from "../_shared/playbook.ts";
import { reviewOutbound, recordReview } from "../_shared/supervisor.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const STRATEGIST = [
  "You are the STRATEGIST lobe of the agency's outreach agent.",
  playbookBlock(),
  "Goal: convert an inbound travel lead into a paying booking, without a human.",
  "You see the lead, the itinerary, the full conversation so far, and the cadence step.",
  "",
  'Return ONE JSON object: {"intent":"open|qualify|quote_nudge|answer|close|nurture|handoff",',
  ' "reasoning":"one line","ask":"the single most valuable question or next step",',
  ' "stage":"new|contacted|engaged|qualified|quoted|won|lost","escalate":false|"reason",',
  ' "stop":false}',
  "Rules: one question at a time. If the customer already gave dates+route+pax, move to quoting.",
  "Set stop=true only if the customer asked to stop, or the deal is won/lost.",
].join("\n");

const WRITER = [
  "You are Maya, a senior human travel agent at Your Travel Agent.",
  playbookBlock(),
  "Write the actual message that will be sent to this person right now.",
  "Voice: warm, concise, specific, zero corporate filler, no emojis, no markdown.",
  "2–5 short sentences. Reference their actual trip details. End with one clear question or next step.",
  "Never mention AI, automation, percentages off, vouchers, or credits. Say 'exclusive deals' or 'wholesale inventory'.",
  "Never ask for card numbers — payment always happens through a secure checkout link.",
  '',
  'Return ONE JSON object: {"message":"..."}',
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? GOVERNOR.maxOutboundPerTickGlobal, 20);
    const dry = body.dry_run === true;
    const s = gsb();

    let q = s.from("ao_leads")
      .select("*")
      .not("status", "in", '("won","lost","archived","stopped")');
    // A council delegation may target one specific lead; otherwise work the queue.
    if (body.lead_id) q = q.eq("id", body.lead_id);
    else q = q.lte("next_action_at", new Date().toISOString());
    const { data: due } = await q
      .order("priority", { ascending: true })
      .order("next_action_at", { ascending: true })
      .limit(limit);

    const results: any[] = [];

    for (const lead of due ?? []) {
      try {
        results.push(await workLead(lead, dry));
      } catch (e) {
        await s.from("ao_leads").update({
          next_action_at: nextActionAt(Math.min(lead.cadence_step + 1, 6)),
          notes: "worker error: " + (e as Error).message,
        }).eq("id", lead.id);
        results.push({ lead_id: lead.id, ok: false, error: (e as Error).message });
      }
    }

    return json({ ok: true, processed: results.length, duration_ms: Date.now() - started, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

async function workLead(lead: any, dry: boolean) {
  const s = gsb();

  // 1. Refresh the conversation from the channel (inbound replies matter most).
  let inbound = 0;
  if (lead.channel === "facebook" && lead.external_thread_id) {
    const { data: sess } = await s.from("ao_channel_sessions")
      .select("context_id,status").eq("channel", "facebook").eq("label", "primary").maybeSingle();
    if (sess?.context_id && sess.status === "connected") {
      try {
        const msgs = await fbDo(sess.context_id, (cdp) => readThread(cdp, lead.external_thread_id, 12));
        const { data: known } = await s.from("ao_outreach").select("body").eq("lead_id", lead.id).limit(200);
        const seen = new Set((known ?? []).map((k: any) => (k.body ?? "").slice(0, 120)));
        for (const m of msgs) {
          const key = m.body.slice(0, 120);
          if (seen.has(key)) continue;
          if (/^maya|your travel agent/i.test(m.who)) continue;
          await s.from("ao_outreach").insert({
            lead_id: lead.id, mission_id: lead.mission_id, direction: "in",
            channel: "facebook", body: m.body.slice(0, 4000), status: "received",
            sent_at: new Date().toISOString(),
          });
          inbound++;
        }
        if (inbound) await s.from("ao_leads").update({ last_reply_at: new Date().toISOString(), cadence_step: 0 }).eq("id", lead.id);
      } catch { /* thread read is best-effort; outreach still proceeds */ }
    }
  }

  // 2. Full transcript for the lobes.
  const { data: thread } = await s.from("ao_outreach")
    .select("direction,channel,body,created_at").eq("lead_id", lead.id)
    .order("created_at", { ascending: true }).limit(40);
  const transcript = (thread ?? []).map((t: any) => `${t.direction === "out" ? "MAYA" : "CUSTOMER"}: ${t.body}`).join("\n").slice(0, 6000);

  const card = JSON.stringify({
    headline: lead.headline, summary: lead.summary, itinerary: lead.itinerary,
    contact: { name: lead.contact?.name, has_email: !!lead.contact?.email, has_phone: !!lead.contact?.phone },
    cadence_step: lead.cadence_step, attempts: lead.attempts, stage: lead.stage,
    value_usd: lead.estimated_value, last_reply_at: lead.last_reply_at,
  });

  const strat = safeParse(await llm(STRATEGIST, [{ role: "user", content: `LEAD:\n${card}\n\nCONVERSATION:\n${transcript || "(no contact yet)"}` }], "auto", { max_tokens: 500 }));

  await s.from("ao_dialogue").insert({
    mission_id: lead.mission_id, from_agent: "concierge", lobe: "strategist", kind: "plan",
    content: `[${strat.intent ?? "open"}] ${strat.reasoning ?? ""} → ${strat.ask ?? ""}`.slice(0, 1500),
  });

  if (strat.escalate) {
    await s.from("ao_missions").update({ needs_human: true, escalation_reason: String(strat.escalate), status: "escalated" }).eq("id", lead.mission_id);
    await s.from("ao_leads").update({ status: "escalated", next_action_at: nextActionAt(3) }).eq("id", lead.id);
    return { lead_id: lead.id, ok: true, action: "escalated" };
  }

  if (strat.stop === true) {
    await s.from("ao_leads").update({ status: strat.stage === "won" ? "won" : "stopped", stage: strat.stage ?? "lost" }).eq("id", lead.id);
    return { lead_id: lead.id, ok: true, action: "stopped" };
  }

  // 3. Write the message.
  const writeOut = safeParse(await llm(WRITER, [{
    role: "user",
    content: `LEAD:\n${card}\n\nCONVERSATION:\n${transcript || "(first contact)"}\n\nINTENT: ${strat.intent}\nNEXT STEP TO ACHIEVE: ${strat.ask}`,
  }], "auto", { max_tokens: 500 }));
  const draft = String(writeOut.message ?? "").trim();
  if (!draft) throw new Error("writer_produced_nothing");

  // 3b. SUPERVISION — nothing reaches a customer unreviewed.
  const review = await reviewOutbound(draft, {
    lead: { headline: lead.headline, itinerary: lead.itinerary, stage: lead.stage, value: lead.estimated_value },
    stage: lead.stage, intent: strat.intent, transcript,
  });
  await recordReview(review, {
    mission_id: lead.mission_id, lead_id: lead.id, agent_key: "concierge",
    kind: "outbound_message", draft, delivered: review.verdict !== "block",
  });
  if (review.verdict === "block") {
    await s.from("ao_leads").update({ next_action_at: nextActionAt(Math.max(1, lead.cadence_step)) }).eq("id", lead.id);
    await s.from("ao_dialogue").insert({
      mission_id: lead.mission_id, from_agent: "chief", lobe: "supervisor", kind: "blocker",
      content: "Blocked outbound draft: " + JSON.stringify(review.issues).slice(0, 800),
    });
    return { lead_id: lead.id, ok: true, action: "blocked_by_supervisor", issues: review.issues };
  }
  const message = review.final;

  // 4. Communication Governor.
  const verdict = await maySpeak(lead.id, message);
  if (!verdict.allowed) {
    await s.from("ao_leads").update({ next_action_at: verdict.retryAt ?? nextActionAt(lead.cadence_step + 1) }).eq("id", lead.id);
    return { lead_id: lead.id, ok: true, action: "withheld", reason: verdict.reason };
  }
  if (dry) return { lead_id: lead.id, ok: true, action: "dry_run", message, supervision: review.verdict };

  // 5. Deliver down the ladder.
  const { delivery, attempts } = await deliver(lead as Lead, message);

  await s.from("ao_outreach").insert({
    lead_id: lead.id, mission_id: lead.mission_id, direction: "out",
    channel: delivery.channel, agent_key: "concierge", body: message,
    intent: strat.intent ?? null,
    status: delivery.ok ? "sent" : "failed",
    error: delivery.ok ? null : delivery.error ?? null,
    evidence: { attempts, snippet: delivery.evidence?.slice(0, 600) ?? null },
    sent_at: delivery.ok ? new Date().toISOString() : null,
  });

  await s.from("ao_dialogue").insert({
    mission_id: lead.mission_id, from_agent: "concierge", lobe: "executor",
    kind: delivery.ok ? "report" : "blocker",
    content: (delivery.ok ? `Sent via ${delivery.channel}: ` : `Delivery failed (${delivery.error}): `) + message.slice(0, 600),
  });

  const nextStep = delivery.ok ? Math.min(lead.cadence_step + 1, 6) : lead.cadence_step;
  const unanswered = delivery.ok && !inbound ? lead.attempts + 1 : 0;
  await s.from("ao_leads").update({
    status: delivery.ok
      ? (unanswered >= GOVERNOR.maxUnansweredBeforeNurture ? "nurture" : "working")
      : "blocked",
    stage: strat.stage ?? lead.stage,
    attempts: unanswered,
    cadence_step: nextStep,
    last_contact_at: delivery.ok ? new Date().toISOString() : lead.last_contact_at,
    next_action_at: nextActionAt(delivery.ok ? nextStep : Math.max(1, lead.cadence_step)),
    notes: delivery.ok ? null : `all channels failed: ${attempts.map((a) => a.channel + "=" + (a.error ?? "ok")).join(", ")}`,
  }).eq("id", lead.id);

  await recordSideEffect(lead.mission_id, "concierge",
    delivery.ok ? "outreach_sent" : "outreach_failed",
    `${lead.headline} via ${delivery.channel}`, { attempts });

  return { lead_id: lead.id, ok: delivery.ok, channel: delivery.channel, intent: strat.intent, supervision: review.verdict, message };
}
