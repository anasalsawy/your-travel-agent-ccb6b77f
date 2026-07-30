// META (Facebook/Instagram) — capability-shaped adapter.
//
// Per EDR-001 the council calls CAPABILITIES, never vendor SDKs. This module is
// the only place that knows Meta exists. It runs under an application identity
// (system-user token), never a delegated human login, so it is autonomous.
//
//   Primary   : Meta Marketing API (paid ads) + Pages API (organic posts)
//   Fallback  : dry-run planner — every payload is produced and stored, so the
//               campaign is one credential away from going live
//   Emergency : owned channels (site banner + email/SMS blast) — handled by the
//               caller, which sees `configured:false` and routes around us.
const GRAPH = "https://graph.facebook.com/v21.0";

const TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
const AD_ACCOUNT = (Deno.env.get("META_AD_ACCOUNT_ID") ?? "").replace(/^act_/, "");
const PAGE_ID = Deno.env.get("META_PAGE_ID") ?? "";

export const metaStatus = () => ({
  configured: Boolean(TOKEN && AD_ACCOUNT && PAGE_ID),
  has_token: Boolean(TOKEN),
  has_ad_account: Boolean(AD_ACCOUNT),
  has_page: Boolean(PAGE_ID),
  ad_account: AD_ACCOUNT ? "act_" + AD_ACCOUNT : null,
  page_id: PAGE_ID || null,
});

export type MetaCall = { ok: boolean; dry_run?: boolean; data?: any; error?: string; payload?: any };

async function graph(path: string, method: "GET" | "POST", params: Record<string, any>): Promise<MetaCall> {
  if (!TOKEN) return { ok: false, dry_run: true, payload: { path, method, params }, error: "META_ACCESS_TOKEN missing — dry run" };
  const url = new URL(GRAPH + path);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (method === "GET") url.searchParams.set(k, val);
    else form.set(k, val);
  }
  url.searchParams.set("access_token", TOKEN);
  const r = await fetch(url.toString(), method === "GET" ? {} : { method: "POST", body: form });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 800) }; }
  if (!r.ok) return { ok: false, error: `meta ${r.status}: ${(data?.error?.message ?? text).toString().slice(0, 400)}`, data };
  return { ok: true, data };
}

/** Organic post on the Facebook Page — free reach, no ad account needed. */
export function pagePost(message: string, link?: string): Promise<MetaCall> {
  if (!PAGE_ID) return Promise.resolve({ ok: false, dry_run: true, payload: { message, link }, error: "META_PAGE_ID missing — dry run" });
  return graph(`/${PAGE_ID}/feed`, "POST", link ? { message, link } : { message });
}

/** Paid campaign shell. Created PAUSED — nothing spends until the caller flips it. */
export function createCampaign(name: string, objective = "OUTCOME_LEADS"): Promise<MetaCall> {
  return graph(`/act_${AD_ACCOUNT}/campaigns`, "POST", {
    name, objective, status: "PAUSED", special_ad_categories: [],
  });
}

export function createAdSet(opts: {
  name: string; campaignId: string; dailyBudgetUsd: number; countries: string[]; ageMin?: number; ageMax?: number; interests?: string[];
}): Promise<MetaCall> {
  return graph(`/act_${AD_ACCOUNT}/adsets`, "POST", {
    name: opts.name,
    campaign_id: opts.campaignId,
    daily_budget: Math.round(opts.dailyBudgetUsd * 100), // Meta wants minor units
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    targeting: {
      geo_locations: { countries: opts.countries },
      age_min: opts.ageMin ?? 25,
      age_max: opts.ageMax ?? 65,
      ...(opts.interests?.length ? { flexible_spec: [{ interests: opts.interests.map((id) => ({ id })) }] } : {}),
    },
    status: "PAUSED",
  });
}

export function createCreative(opts: {
  name: string; message: string; headline: string; description?: string; link: string; imageUrl?: string; cta?: string;
}): Promise<MetaCall> {
  return graph(`/act_${AD_ACCOUNT}/adcreatives`, "POST", {
    name: opts.name,
    object_story_spec: {
      page_id: PAGE_ID,
      link_data: {
        message: opts.message,
        link: opts.link,
        name: opts.headline,
        description: opts.description ?? "",
        ...(opts.imageUrl ? { picture: opts.imageUrl } : {}),
        call_to_action: { type: opts.cta ?? "LEARN_MORE", value: { link: opts.link } },
      },
    },
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
  });
}

export function createAd(name: string, adsetId: string, creativeId: string, active: boolean): Promise<MetaCall> {
  return graph(`/act_${AD_ACCOUNT}/ads`, "POST", {
    name, adset_id: adsetId, creative: { creative_id: creativeId }, status: active ? "ACTIVE" : "PAUSED",
  });
}

export function setStatus(nodeId: string, status: "ACTIVE" | "PAUSED"): Promise<MetaCall> {
  return graph(`/${nodeId}`, "POST", { status });
}

export function setDailyBudget(adsetId: string, usd: number): Promise<MetaCall> {
  return graph(`/${adsetId}`, "POST", { daily_budget: Math.round(usd * 100) });
}

export function insights(nodeId: string, datePreset = "yesterday"): Promise<MetaCall> {
  return graph(`/${nodeId}/insights`, "GET", {
    date_preset: datePreset,
    fields: "impressions,clicks,spend,actions,cpc,ctr",
    level: "ad",
  });
}
