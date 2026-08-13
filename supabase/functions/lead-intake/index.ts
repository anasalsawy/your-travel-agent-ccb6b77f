// lead-intake — paste raw lead text (Facebook group posts, DMs, a table, anything).
// An LLM parses it into structured leads, each of which opens a governed
// Agency-OS mission and enters the outreach cadence immediately.
import { llm, safeParse } from "../_shared/lobe-runtime.ts";
import { gsb, nextActionAt, recordSideEffect } from "../_shared/governor.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const PARSER = [
  "You are the Lead Intake officer of an autonomous travel agency.",
  "You receive raw pasted text containing one or MANY travel leads (facebook group posts, DMs, spreadsheets, bullet lists).",
  "Extract every distinct lead. Never invent contact details — omit what is not present.",
  "",
  'Return ONE JSON object: {"leads":[{',
  '  "headline":"short human title",',
  '  "summary":"2 sentences on what they want and why it needs an agent",',
  '  "priority":1-10 (1 = most valuable/urgent),',
  '  "estimated_value": number in USD of likely ticket revenue,',
  '  "contact":{"name":?, "email":?, "phone":?, "facebook_thread_id":?, "facebook_profile":?},',
  '  "itinerary":{"origin":?,"destination":?,"multi_city":?,"depart":?,"return":?,"adults":?,"children":?,"cabin":?,"notes":?}',
  "}]}",
  "Priority heuristic: multi-city, long-duration, group size, explicit 'I want an agent', and near-term departure raise value.",
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body.raw_text ?? "").trim();
    if (!raw) return json({ ok: false, error: "raw_text_required" }, 400);
    const source = body.source ?? "facebook";
    const channel = body.channel ?? "facebook";

    const out = safeParse(await llm(PARSER, [{ role: "user", content: raw.slice(0, 12000) }], "auto", { max_tokens: 2500 }));
    const parsed: any[] = Array.isArray(out.leads) ? out.leads : [];
    if (!parsed.length) return json({ ok: false, error: "no_leads_parsed", raw_model: out }, 422);

    const s = gsb();
    const created: any[] = [];

    for (const p of parsed) {
      const contact = p.contact ?? {};
      const { data: mission, error: mErr } = await s.from("ao_missions").insert({
        title: p.headline ?? "Inbound travel lead",
        stage: "lead",
        priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
        source,
        customer_name: contact.name ?? null,
        customer_email: contact.email ?? null,
        customer_phone: contact.phone ?? null,
        expected_value: Number(p.estimated_value) || 0,
        owner_agent: "scout",
        payload: { itinerary: p.itinerary ?? {}, summary: p.summary ?? "", origin_text: raw.slice(0, 2000) },
      }).select().single();
      if (mErr) throw mErr;

      const { data: lead, error: lErr } = await s.from("ao_leads").insert({
        source, channel, raw_text: raw.slice(0, 8000),
        headline: p.headline ?? "Inbound travel lead",
        summary: p.summary ?? null,
        priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
        contact, itinerary: p.itinerary ?? {},
        estimated_value: Number(p.estimated_value) || null,
        external_thread_id: contact.facebook_thread_id ?? null,
        mission_id: mission.id,
        status: "new", stage: "new",
        next_action_at: nextActionAt(0),
      }).select().single();
      if (lErr) throw lErr;

      await recordSideEffect(mission.id, "scout", "lead_admitted", `Lead admitted: ${lead.headline}`, { lead_id: lead.id });
      await s.from("ao_dialogue").insert({
        mission_id: mission.id, from_agent: "scout", kind: "route",
        content: `Lead admitted from ${source}. Opening outreach cadence immediately.`,
      });
      created.push(lead);
    }

    return json({ ok: true, created: created.length, leads: created });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
