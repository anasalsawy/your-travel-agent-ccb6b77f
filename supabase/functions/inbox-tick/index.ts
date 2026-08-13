// INBOX-TICK — real inbound customers, application identity only.
//
// Everything here comes from the Facebook Page under a system-user/page token:
//   • Messenger conversations (people who messaged the business)
//   • Comments left on our posts and ads
//   • Lead Ads form submissions
//
// Each new human becomes an ao_lead + ao_mission, which drops straight into the
// governed outreach cadence — so a real person messaging the page at 3am is
// contacted by the agency without anyone waking up.
import { gsb, nextActionAt, recordSideEffect } from "../_shared/governor.ts";
import {
  graphConfigured, listConversations, readConversation, recentComments,
  privateReplyToComment, leadgenForms, leadgenLeads, whoami,
} from "../_shared/graph-fb.ts";
import { routeChatSafe } from "../_shared/model-router.ts";
import { playbookBlock } from "../_shared/playbook.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const TRIAGE_SYS = [
  "You are the INTAKE ANALYST of a travel agency. You read an inbound message and extract the deal.",
  playbookBlock(),
  "",
  'Return ONE JSON object: {"headline":"short label","summary":"one line","priority":1-10,"estimated_value":number,',
  ' "itinerary":{"origin":?,"destination":?,"depart":?,"return":?,"adults":?,"children":?,"cabin":?,"notes":?},',
  ' "qualified":true|false,"opening_reply":"one short human reply that moves them forward, no prices, no links"}',
  "Spam, job seekers, other agents and abuse are qualified:false.",
].join("\n");

const jparse = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

async function triage(text: string) {
  const r = await routeChatSafe({
    messages: [{ role: "system", content: TRIAGE_SYS }, { role: "user", content: text.slice(0, 4000) }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 700,
  }, "auto");
  return jparse(r.content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    if (!graphConfigured()) return json({ ok: false, error: "meta_not_configured" }, 200);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "safe";
    const s = gsb();

    const id = await whoami();
    if (!id.ok) return json({ ok: false, error: id.error, hint: "META_ACCESS_TOKEN / META_PAGE_ID rejected by Meta" });

    // What we already know about — never double-admit a human.
    const { data: known } = await s.from("ao_leads")
      .select("external_thread_id,external_url").limit(1000);
    const seenThreads = new Set((known ?? []).map((k: any) => k.external_thread_id).filter(Boolean));
    const seenUrls = new Set((known ?? []).map((k: any) => k.external_url).filter(Boolean));

    type Candidate = { key: string; source: string; who: string; psid: string | null; text: string; url: string | null; comment_id?: string };
    const candidates: Candidate[] = [];

    // 1. Messenger.
    try {
      for (const c of await listConversations(Number(body.limit ?? 20))) {
        if (!c.psid || seenThreads.has(c.psid)) continue;
        if (c.last_from === "us") continue;
        const history = await readConversation(c.id, 12).catch(() => []);
        const text = history.map((m: any) => `${m.who}: ${m.body}`).join("\n") || c.last_message;
        if (!text.trim()) continue;
        candidates.push({ key: c.psid, source: "facebook_dm", who: c.name, psid: c.psid, text, url: null });
      }
    } catch (e) { /* one surface failing must not stop the rest */ }

    // 2. Comments on our posts and ads.
    try {
      for (const c of await recentComments(25)) {
        const url = c.permalink + "#" + c.id;
        if (seenUrls.has(url) || !c.message.trim()) continue;
        candidates.push({
          key: c.id, source: "facebook_comment", who: c.from_name,
          psid: null, text: c.message, url, comment_id: c.id,
        });
      }
    } catch (e) { /* ignore */ }

    // 3. Lead Ads submissions.
    try {
      for (const f of await leadgenForms()) {
        for (const l of await leadgenLeads(f.id, 20)) {
          const url = "leadgen:" + l.id;
          if (seenUrls.has(url)) continue;
          const text = Object.entries(l.fields).map(([k, v]) => `${k}: ${v}`).join("\n");
          candidates.push({
            key: l.id, source: "facebook_leadad", who: l.fields.full_name ?? l.fields.name ?? "lead",
            psid: null, text, url,
          });
        }
      }
    } catch (e) { /* leadgen permission may be absent */ }

    const admitted: any[] = [];
    for (const c of candidates.slice(0, Number(body.max ?? 12))) {
      const t = await triage(c.text);
      if (t.qualified === false) continue;

      const { data: mission } = await s.from("ao_missions").insert({
        title: t.headline ?? c.text.slice(0, 80),
        stage: "lead",
        priority: Math.min(10, Math.max(1, Number(t.priority) || 5)),
        source: c.source,
        customer_name: c.who,
        expected_value: Number(t.estimated_value) || 0,
        owner_agent: "intake",
        payload: { itinerary: t.itinerary ?? {}, summary: t.summary ?? "", origin_url: c.url },
      }).select().single();

      const { data: lead } = await s.from("ao_leads").insert({
        source: c.source,
        channel: c.psid ? "facebook" : (c.source === "facebook_leadad" ? "email" : "facebook"),
        raw_text: c.text.slice(0, 4000),
        headline: t.headline ?? c.text.slice(0, 80),
        summary: t.summary ?? null,
        priority: Math.min(10, Math.max(1, Number(t.priority) || 5)),
        contact: {
          name: c.who, psid: c.psid,
          email: (t.itinerary?.email ?? null) || (c.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null),
          phone: c.text.match(/\+?\d[\d\s().-]{8,}\d/)?.[0] ?? null,
          comment_id: c.comment_id ?? null,
        },
        itinerary: t.itinerary ?? {},
        estimated_value: Number(t.estimated_value) || null,
        external_thread_id: c.psid,
        external_url: c.url,
        mission_id: mission?.id ?? null,
        status: "new", stage: "new",
        next_action_at: nextActionAt(0),
      }).select().single();

      await s.from("ao_outreach").insert({
        lead_id: lead?.id, mission_id: mission?.id, direction: "in",
        channel: "facebook", agent_key: "intake", body: c.text.slice(0, 4000), status: "received",
      });

      // A public comment gets an immediate private reply — that is how a
      // commenter becomes a DM thread we can actually work.
      let touched: any = { skipped: mode !== "full" };
      if (mode === "full" && c.comment_id && t.opening_reply) {
        try {
          const r = await privateReplyToComment(c.comment_id, String(t.opening_reply));
          if (r.recipient_id) {
            await s.from("ao_leads").update({
              external_thread_id: r.recipient_id,
              contact: { ...(lead?.contact ?? {}), psid: r.recipient_id },
            }).eq("id", lead!.id);
          }
          await s.from("ao_outreach").insert({
            lead_id: lead?.id, mission_id: mission?.id, direction: "out",
            channel: "facebook", agent_key: "intake", body: String(t.opening_reply),
            status: "sent", evidence: JSON.stringify(r).slice(0, 500), sent_at: new Date().toISOString(),
          });
          touched = { private_reply: true };
        } catch (e) { touched = { error: (e as Error).message }; }
      }

      if (mission?.id) {
        await recordSideEffect(mission.id, "intake", "lead_received", `Inbound ${c.source}: ${lead?.headline}`, { url: c.url });
      }
      admitted.push({ lead_id: lead?.id, source: c.source, who: c.who, headline: lead?.headline, touched });
    }

    return json({
      ok: true, page: id.page?.name, candidates: candidates.length,
      admitted: admitted.length, leads: admitted, duration_ms: Date.now() - started,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
