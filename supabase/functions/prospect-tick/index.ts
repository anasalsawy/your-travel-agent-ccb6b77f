// PROSPECT-TICK — autonomous lead FINDING.
// The council does not wait for inbound: it searches Facebook for people who
// are actively asking about flights, scores each post for genuine buying
// intent, and admits only qualified ones as leads (which immediately enter the
// governed outreach cadence). Public commenting is optional and supervised.
import { gsb, nextActionAt, recordSideEffect } from "../_shared/governor.ts";
import { fbDo, searchPosts, commentOnPost, browserAvailable, type FoundPost } from "../_shared/facebook.ts";
import { routeChat } from "../_shared/model-router.ts";
import { playbookBlock, INTENT_SIGNALS } from "../_shared/playbook.ts";
import { reviewOutbound, recordReview } from "../_shared/supervisor.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const QUERIES = [
  "need a flight travel agent",
  "looking for cheap flights help",
  "need airfare deal",
  "flying to Dubai need agent",
  "multi city flight agent",
  "business class deal agent",
];

const SCORER_SYS = [
  "You are the SCOUT of an elite travel sales agency. You read raw social posts and decide which are real buyers.",
  playbookBlock(),
  "",
  "For each post decide: is this a person who wants to BUY air travel soon? Sellers, agencies, spam, memes and old posts are rejected.",
  "",
  'Return ONE JSON object: {"leads":[{"index":0,"qualified":true,"class":"HOT|WARM|COLD","headline":"...","summary":"...",',
  ' "priority":1-10,"estimated_value":number,"itinerary":{"origin":?,"destination":?,"depart":?,"return":?,"adults":?,"children":?,"cabin":?,"notes":?},',
  ' "opening_comment":"one short public comment offering help, no prices, no links"}]}',
  "Only include posts you would spend the agency's time on. Fewer, better leads.",
].join("\n");

function jparse(s: string) { try { return JSON.parse(s); } catch { return {}; } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "safe";
    const maxPosts = Math.min(Number(body.max_posts ?? 10), 25);
    const queries: string[] = Array.isArray(body.queries) && body.queries.length
      ? body.queries.slice(0, 4)
      : [QUERIES[new Date().getUTCMinutes() % QUERIES.length], QUERIES[(new Date().getUTCMinutes() + 3) % QUERIES.length]];
    const s = gsb();

    // 1. Discover. Capability ladder: persistent browser identity first, then
    //    Skyvern (goal-driven browser) as the emergency path. Prospecting is
    //    never blocked by a single vendor being down or out of minutes.
    let posts: FoundPost[] = [];
    let sess: { context_id?: string; status?: string } | null = null;
    let discovery = "cdp";

    if (browserAvailable()) {
      const r = await s.from("ao_channel_sessions")
        .select("context_id,status").eq("channel", "facebook").eq("label", "primary").maybeSingle();
      sess = r.data as any;
    }

    if (sess?.context_id && sess.status === "connected") {
      try {
        await fbDo(sess.context_id, async (cdp) => {
          for (const q of queries) {
            try { posts = posts.concat(await searchPosts(cdp, q, Math.ceil(maxPosts / queries.length))); } catch { /* keep going */ }
          }
        });
      } catch { /* fall through to Skyvern */ }
    }

    if (!posts.length && skyvernAvailable()) {
      discovery = "skyvern";
      for (const q of queries.slice(0, 2)) {
        const r: any = await runTask({
          url: "https://mbasic.facebook.com/search/posts/?q=" + encodeURIComponent(q),
          goal: "Read the public post results on this page. Do not log in, do not comment, do not click anything that requires an account.",
          extract: "For each visible post return the author name, the full post text, and the permalink URL.",
          schema: { type: "object", properties: { posts: { type: "array", items: { type: "object", properties: { author: { type: "string" }, text: { type: "string" }, permalink: { type: "string" } } } } } },
          maxSteps: 6,
        }, 90_000);
        for (const p of (r?.extracted?.posts ?? [])) {
          if (!p?.text || !p?.permalink) continue;
          posts.push({ text: String(p.text).slice(0, 600), permalink: String(p.permalink), author: String(p.author ?? ""), profile: "" });
        }
      }
    }

    if (!posts.length && discovery === "cdp" && !sess?.context_id) {
      return json({ ok: false, error: "no_discovery_channel", detail: "browser identity not connected and Skyvern unavailable", queries });
    }


    // Drop anything we already admitted, and anything with no intent signal.
    const { data: known } = await s.from("ao_leads").select("external_url").not("external_url", "is", null).limit(500);
    const seen = new Set((known ?? []).map((k: any) => k.external_url));
    const candidates = posts
      .filter((p) => !seen.has(p.permalink))
      .filter((p) => INTENT_SIGNALS.some((sig) => p.text.toLowerCase().includes(sig.split(" ")[0])))
      .slice(0, maxPosts);

    if (!candidates.length) {
      return json({ ok: true, found: posts.length, candidates: 0, admitted: 0, queries, duration_ms: Date.now() - started });
    }

    // 2. Score with the scout lobe (Featherless).
    const scored = jparse((await routeChat({
      messages: [
        { role: "system", content: SCORER_SYS },
        { role: "user", content: candidates.map((c, i) => `#${i} by ${c.author}: ${c.text}`).join("\n\n").slice(0, 8000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000,
    }, "auto")).content);

    const picks = (Array.isArray(scored.leads) ? scored.leads : []).filter((l: any) => l?.qualified !== false);
    const admitted: any[] = [];

    for (const p of picks) {
      const post = candidates[Number(p.index)];
      if (!post) continue;

      const { data: mission } = await s.from("ao_missions").insert({
        title: p.headline ?? post.text.slice(0, 80),
        stage: "lead",
        priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
        source: "facebook_prospecting",
        customer_name: post.author || null,
        expected_value: Number(p.estimated_value) || 0,
        owner_agent: "scout",
        payload: { itinerary: p.itinerary ?? {}, summary: p.summary ?? "", permalink: post.permalink, class: p.class ?? "WARM" },
      }).select().single();

      const { data: lead } = await s.from("ao_leads").insert({
        source: "facebook_prospecting", channel: "facebook",
        raw_text: post.text.slice(0, 4000),
        headline: p.headline ?? post.text.slice(0, 80),
        summary: p.summary ?? null,
        priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
        contact: { name: post.author, facebook_profile: post.profile },
        itinerary: p.itinerary ?? {},
        estimated_value: Number(p.estimated_value) || null,
        external_url: post.permalink,
        mission_id: mission?.id ?? null,
        status: "new", stage: "new",
        next_action_at: nextActionAt(0),
      }).select().single();

      // 3. Optional supervised public comment — the first touch in the open.
      let comment: any = { skipped: mode !== "full" ? "safe_mode" : "no_draft" };
      if (mode === "full" && p.opening_comment) {
        const review = await reviewOutbound(String(p.opening_comment), {
          lead: { headline: p.headline, itinerary: p.itinerary },
          stage: "prospecting", intent: "open",
        });
        await recordReview(review, {
          mission_id: mission?.id, lead_id: lead?.id, agent_key: "scout",
          kind: "public_comment", draft: String(p.opening_comment),
          delivered: review.verdict !== "block",
        });
        if (review.verdict === "block") {
          comment = { blocked: review.issues };
        } else {
          try {
            const r = await fbDo(sess.context_id, (cdp) => commentOnPost(cdp, post.permalink, review.final));
            comment = { ok: r.ok, text: review.final };
          } catch (e) { comment = { ok: false, error: (e as Error).message }; }
        }
      }

      if (mission?.id) {
        await recordSideEffect(mission.id, "scout", "lead_prospected", `Found on Facebook: ${lead?.headline}`, { permalink: post.permalink });
      }
      admitted.push({ lead_id: lead?.id, headline: lead?.headline, class: p.class, comment });
    }

    return json({
      ok: true, queries, found: posts.length, candidates: candidates.length,
      admitted: admitted.length, leads: admitted, duration_ms: Date.now() - started,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
