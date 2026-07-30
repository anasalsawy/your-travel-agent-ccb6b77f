// MARKETING OS — the council's Growth & Website-Operations department.
//
// It runs the public website and the Facebook page as one operator:
//   plan       → write a campaign brief + 3 competing ad angles (LLM)
//   launch     → push campaign/adset/creatives/ads to Meta under the app identity
//   page_post  → free organic post on the Facebook Page
//   sync       → pull yesterday's spend/clicks/leads into ao_ad_metrics
//   optimize   → kill losers, feed winners, respect the lifetime spend cap
//   site_audit → propose concrete website changes into ao_site_tasks
//   tick       → the autonomous heartbeat: sync → optimize → (auto-launch)
//
// Money is fenced: nothing goes ACTIVE unless the campaign's autonomy is "auto"
// AND spend is under its lifetime cap. Everything else is proposed, not spent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, llm, safeParse } from "../_shared/lobe-runtime.ts";
import {
  metaStatus, pagePost, createCampaign, createAdSet, createCreative, createAd,
  setStatus, setDailyBudget, insights,
} from "../_shared/meta-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);
const SITE = "https://your-travel-agent.net";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "content-type": "application/json" } });

const BRAND = [
  'Brand: "Your Travel Agent" (your-travel-agent.net). Real human-backed agency with wholesale airline inventory.',
  'Say "exclusive deals" or "wholesale fares". NEVER say percentages off, "vouchers", or "credits".',
  "Tone: confident, plain, specific. No emoji spam, no hype words, no fake scarcity.",
  "Comply with Meta ad policy: no unrealistic guarantees, no personal-attribute targeting language.",
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "tick";
    switch (action) {
      case "status": return json(await status());
      case "plan": return json(await plan(body));
      case "launch": return json(await launch(body.campaign_id, body.force === true));
      case "page_post": return json(await organicPost(body.campaign_id, body.message));
      case "sync": return json(await sync());
      case "optimize": return json(await optimize());
      case "site_audit": return json(await siteAudit());
      case "tick": return json(await tick());
      default: return json({ ok: false, error: "unknown action " + action }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

async function status() {
  const s = sb();
  const [{ data: campaigns }, { data: tasks }] = await Promise.all([
    s.from("ao_campaigns").select("*, ao_creatives(*)").order("created_at", { ascending: false }).limit(20),
    s.from("ao_site_tasks").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  return { ok: true, meta: metaStatus(), campaigns: campaigns ?? [], site_tasks: tasks ?? [] };
}

// ── PLAN ───────────────────────────────────────────────────────────────────
async function plan(body: any) {
  const brief: string = body.brief ?? "Name Your Own Price flights — traveller names their price, we hunt the fare and book it.";
  const landing: string = body.landing_path ?? "/name-your-price";
  const budget = Number(body.daily_budget_usd ?? 20);
  const cap = Number(body.lifetime_cap_usd ?? 300);

  const sys = [
    "You are the Growth Lead of an autonomous travel agency. You write Facebook/Instagram direct-response ads that produce booking leads.",
    BRAND,
    "Produce THREE creatives on genuinely different angles: one on control/price, one on the human agent doing the work, one on the specific hard trip online booking cannot handle.",
    "Primary text <= 400 chars. Headline <= 40 chars. Description <= 30 chars.",
    'Return JSON only: {"campaign_name":"...","objective":"leads","audience":{"countries":["US"],"age_min":25,"age_max":65,"notes":"..."},"kpi":{"target_cpl_usd":number,"target_ctr_pct":number},"creatives":[{"angle":"...","headline":"...","primary_text":"...","description":"...","cta":"LEARN_MORE","image_prompt":"..."}]}',
  ].join("\n");

  const raw = await llm(sys, [{ role: "user", content: `BRIEF: ${brief}\nLANDING: ${SITE}${landing}\nDAILY BUDGET: $${budget}` }], "auto", { max_tokens: 1200 });
  const p = safeParse(raw);
  const creatives = Array.isArray(p.creatives) ? p.creatives.slice(0, 3) : [];
  if (!creatives.length) throw new Error("planner returned no creatives");

  const s = sb();
  const { data: campaign, error } = await s.from("ao_campaigns").insert({
    name: p.campaign_name ?? "Name Your Own Price — flights",
    objective: p.objective ?? "leads",
    channel: "meta",
    status: "draft",
    daily_budget_usd: budget,
    lifetime_cap_usd: cap,
    landing_path: landing,
    audience: p.audience ?? { countries: ["US"], age_min: 25, age_max: 65 },
    kpi: p.kpi ?? { target_cpl_usd: 12, target_ctr_pct: 1.2 },
    autonomy: body.autonomy === "auto" ? "auto" : "propose",
    notes: brief,
  }).select().single();
  if (error) throw error;

  const rows = creatives.map((c: any) => ({
    campaign_id: campaign.id,
    angle: String(c.angle ?? "value").slice(0, 60),
    headline: String(c.headline ?? "").slice(0, 60),
    primary_text: String(c.primary_text ?? "").slice(0, 600),
    description: String(c.description ?? "").slice(0, 60),
    cta: String(c.cta ?? "LEARN_MORE").toUpperCase().replace(/[^A-Z_]/g, "") || "LEARN_MORE",
    image_prompt: c.image_prompt ?? null,
  }));
  const { data: saved } = await s.from("ao_creatives").insert(rows).select();
  return { ok: true, campaign, creatives: saved ?? [], meta: metaStatus() };
}

// ── LAUNCH ─────────────────────────────────────────────────────────────────
async function launch(campaignId: string, force: boolean) {
  if (!campaignId) throw new Error("campaign_id required");
  const s = sb();
  const { data: c } = await s.from("ao_campaigns").select("*, ao_creatives(*)").eq("id", campaignId).single();
  if (!c) throw new Error("campaign_not_found");
  const m = metaStatus();
  const goLive = force || c.autonomy === "auto";
  const link = SITE + c.landing_path;

  if (!m.configured) {
    await s.from("ao_campaigns").update({ status: "pending_credentials" }).eq("id", c.id);
    return {
      ok: false, dry_run: true, meta: m,
      needs: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_PAGE_ID"].filter((k) =>
        k === "META_ACCESS_TOKEN" ? !m.has_token : k === "META_AD_ACCOUNT_ID" ? !m.has_ad_account : !m.has_page),
      message: "Campaign and creatives are ready. Add the Meta system-user credentials and this same call goes live.",
    };
  }
  if (Number(c.spend_usd) >= Number(c.lifetime_cap_usd)) throw new Error("lifetime spend cap reached");

  const cam = await createCampaign(c.name, "OUTCOME_LEADS");
  if (!cam.ok) throw new Error("campaign: " + cam.error);
  const aud = c.audience ?? {};
  const set = await createAdSet({
    name: c.name + " — set 1",
    campaignId: cam.data.id,
    dailyBudgetUsd: Number(c.daily_budget_usd),
    countries: aud.countries ?? ["US"],
    ageMin: aud.age_min, ageMax: aud.age_max,
  });
  if (!set.ok) throw new Error("adset: " + set.error);

  const ads: any[] = [];
  for (const cr of c.ao_creatives ?? []) {
    const creative = await createCreative({
      name: c.name + " — " + cr.angle,
      message: cr.primary_text, headline: cr.headline, description: cr.description ?? "",
      link, imageUrl: cr.image_url ?? undefined, cta: cr.cta,
    });
    if (!creative.ok) { ads.push({ angle: cr.angle, ok: false, error: creative.error }); continue; }
    const ad = await createAd(c.name + " — " + cr.angle, set.data.id, creative.data.id, goLive);
    await s.from("ao_creatives").update({ external_id: ad.ok ? ad.data.id : null, status: ad.ok ? (goLive ? "active" : "paused") : "failed" }).eq("id", cr.id);
    ads.push({ angle: cr.angle, ok: ad.ok, ad_id: ad.data?.id, error: ad.error });
  }
  if (goLive) { await setStatus(cam.data.id, "ACTIVE"); await setStatus(set.data.id, "ACTIVE"); }

  await s.from("ao_campaigns").update({
    status: goLive ? "live" : "paused",
    external_ids: { campaign_id: cam.data.id, adset_id: set.data.id },
  }).eq("id", c.id);

  return { ok: true, live: goLive, campaign_id: cam.data.id, adset_id: set.data.id, ads };
}

// ── ORGANIC ────────────────────────────────────────────────────────────────
async function organicPost(campaignId?: string, override?: string) {
  const s = sb();
  let message = override ?? "";
  let link = SITE + "/name-your-price";
  if (!message) {
    if (campaignId) {
      const { data: c } = await s.from("ao_campaigns").select("landing_path, ao_creatives(primary_text)").eq("id", campaignId).single();
      if (c) { link = SITE + c.landing_path; message = c.ao_creatives?.[0]?.primary_text ?? ""; }
    }
    if (!message) {
      const raw = await llm(
        [BRAND, "Write ONE Facebook page post (<= 500 chars) for the Name Your Own Price flight service. Plain, human, no emoji spam.", 'Return JSON {"post":"..."}'].join("\n"),
        [{ role: "user", content: "Landing page: " + link }], "auto", { max_tokens: 400 },
      );
      message = safeParse(raw).post ?? "Name your price for your next flight — we hunt the fare and book it. " + link;
    }
  }
  const r = await pagePost(message, link);
  return { ok: r.ok, dry_run: r.dry_run ?? false, message, link, error: r.error, post_id: r.data?.id };
}

// ── SYNC ───────────────────────────────────────────────────────────────────
function actionCount(actions: any[], type: string) {
  return Number(actions?.find((a) => a.action_type === type)?.value ?? 0);
}

async function sync() {
  const s = sb();
  const { data: live } = await s.from("ao_campaigns").select("*").in("status", ["live", "paused"]);
  if (!metaStatus().configured) return { ok: true, skipped: "meta_not_configured", campaigns: live?.length ?? 0 };
  const out: any[] = [];
  for (const c of live ?? []) {
    const nodeId = (c.external_ids ?? {}).campaign_id;
    if (!nodeId) continue;
    const r = await insights(nodeId, "yesterday");
    if (!r.ok) { out.push({ campaign: c.name, error: r.error }); continue; }
    let spend = 0;
    for (const row of r.data?.data ?? []) {
      const leads = actionCount(row.actions, "lead") + actionCount(row.actions, "offsite_conversion.fb_pixel_lead");
      spend += Number(row.spend ?? 0);
      await s.from("ao_ad_metrics").upsert({
        campaign_id: c.id, creative_id: null, day: row.date_stop ?? new Date().toISOString().slice(0, 10),
        impressions: Number(row.impressions ?? 0), clicks: Number(row.clicks ?? 0),
        spend_usd: Number(row.spend ?? 0), leads,
      }, { onConflict: "campaign_id,creative_id,day" });
    }
    await s.from("ao_campaigns").update({ spend_usd: Number(c.spend_usd) + spend }).eq("id", c.id);
    out.push({ campaign: c.name, spend_added: spend });
  }
  return { ok: true, synced: out };
}

// ── OPTIMIZE ───────────────────────────────────────────────────────────────
async function optimize() {
  const s = sb();
  const { data: live } = await s.from("ao_campaigns").select("*").eq("status", "live");
  const decisions: any[] = [];
  for (const c of live ?? []) {
    const { data: metrics } = await s.from("ao_ad_metrics").select("*").eq("campaign_id", c.id)
      .order("day", { ascending: false }).limit(7);
    const agg = (metrics ?? []).reduce((a, m) => ({
      impressions: a.impressions + m.impressions, clicks: a.clicks + m.clicks,
      spend: a.spend + Number(m.spend_usd), leads: a.leads + m.leads,
    }), { impressions: 0, clicks: 0, spend: 0, leads: 0 });
    const ctr = agg.impressions ? (agg.clicks / agg.impressions) * 100 : 0;
    const cpl = agg.leads ? agg.spend / agg.leads : Infinity;
    const kpi = c.kpi ?? {};
    const adsetId = (c.external_ids ?? {}).adset_id;

    // Hard stop: the cap is the one rule no model gets to argue with.
    if (Number(c.spend_usd) >= Number(c.lifetime_cap_usd)) {
      if (adsetId) await setStatus(adsetId, "PAUSED");
      await s.from("ao_campaigns").update({ status: "paused", notes: "auto-paused: lifetime cap reached" }).eq("id", c.id);
      decisions.push({ campaign: c.name, action: "paused_cap", spend: c.spend_usd });
      continue;
    }
    if (agg.spend < 15) { decisions.push({ campaign: c.name, action: "learning", spend: agg.spend }); continue; }

    if (cpl <= Number(kpi.target_cpl_usd ?? 12)) {
      const next = Math.min(Number(c.daily_budget_usd) * 1.25, Number(c.daily_budget_usd) + 25);
      if (adsetId) await setDailyBudget(adsetId, next);
      await s.from("ao_campaigns").update({ daily_budget_usd: next }).eq("id", c.id);
      decisions.push({ campaign: c.name, action: "scale_up", cpl, new_budget: next });
    } else if (ctr < Number(kpi.target_ctr_pct ?? 1.2) * 0.5) {
      if (adsetId) await setStatus(adsetId, "PAUSED");
      await s.from("ao_campaigns").update({ status: "paused", notes: `auto-paused: CTR ${ctr.toFixed(2)}% below floor` }).eq("id", c.id);
      decisions.push({ campaign: c.name, action: "paused_weak_ctr", ctr });
    } else {
      decisions.push({ campaign: c.name, action: "hold", ctr, cpl });
    }
  }
  return { ok: true, decisions };
}

// ── SITE OPS ───────────────────────────────────────────────────────────────
async function siteAudit() {
  const s = sb();
  const [{ count: bids }, { count: openTasks }] = await Promise.all([
    s.from("nyop_bids").select("id", { count: "exact", head: true }),
    s.from("ao_site_tasks").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);
  if ((openTasks ?? 0) >= 12) return { ok: true, skipped: "task_queue_full", open: openTasks };

  const sys = [
    "You are the Website Operator for an autonomous travel agency. You propose concrete, shippable website changes that raise booked revenue.",
    BRAND,
    "Known pages: / (home), /name-your-price (name your own price flights), /flights, /hotels, /cars, /request-ticket.",
    "Each task must be specific enough for an engineer to ship without asking a question. No vague advice like 'improve SEO'.",
    'Return JSON {"tasks":[{"kind":"copy|seo|page|conversion|bugfix","title":"...","detail":"...","target_path":"/...","priority":1-9}]} with at most 4 tasks.',
  ].join("\n");
  const raw = await llm(sys, [{ role: "user", content: `Live signals: ${bids ?? 0} name-your-price bids submitted to date. Focus on converting paid Facebook traffic landing on /name-your-price.` }], "auto", { max_tokens: 900 });
  const tasks = (safeParse(raw).tasks ?? []).slice(0, 4).map((t: any) => ({
    kind: String(t.kind ?? "copy"), title: String(t.title ?? "").slice(0, 200),
    detail: String(t.detail ?? "").slice(0, 2000), target_path: t.target_path ?? null,
    priority: Number(t.priority ?? 5), status: "proposed",
  })).filter((t: any) => t.title);
  if (!tasks.length) return { ok: true, created: 0 };
  const { data } = await s.from("ao_site_tasks").insert(tasks).select();
  return { ok: true, created: data?.length ?? 0, tasks: data };
}

// ── HEARTBEAT ──────────────────────────────────────────────────────────────
async function tick() {
  const started = Date.now();
  const results: Record<string, any> = {};
  results.sync = await sync().catch((e) => ({ error: e.message }));
  results.optimize = await optimize().catch((e) => ({ error: e.message }));

  // Auto-launch anything the operator already marked "auto".
  const { data: ready } = await sb().from("ao_campaigns").select("id,name").eq("status", "draft").eq("autonomy", "auto").limit(2);
  results.launched = [];
  for (const c of ready ?? []) {
    results.launched.push({ name: c.name, ...(await launch(c.id, false).catch((e) => ({ ok: false, error: e.message }))) });
  }
  return { ok: true, elapsed_ms: Date.now() - started, meta: metaStatus(), ...results };
}
