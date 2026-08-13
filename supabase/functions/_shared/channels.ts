// Channel ladder: Primary → Fallback → Emergency, per the tool-architecture EDR.
// The agent asks for "reach this person"; it never names a vendor.
import { gsb } from "./governor.ts";
import { fbDo, sendMessage as fbSend, browserAvailable } from "./facebook.ts";
import { graphConfigured, sendDm } from "./graph-fb.ts";

export type Lead = {
  id: string;
  headline: string;
  channel: string;
  external_thread_id: string | null;
  contact: Record<string, any>;
};

export type Delivery = { ok: boolean; channel: string; evidence?: string; error?: string };

const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Maya at Your Travel Agent <maya@your-travel-agent.co>";
const TW_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TW_FROM = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

async function facebook(lead: Lead, body: string): Promise<Delivery> {
  let graphError: string | null = null;
  // PRIMARY: page identity over the Graph API — no browser, no human session.
  const psid = lead.contact?.psid ?? (lead.channel === "facebook" ? lead.external_thread_id : null);
  if (graphConfigured() && psid) {
    try {
      const r = await sendDm(String(psid), body);
      return { ok: true, channel: "facebook", evidence: "graph message_id=" + (r.message_id ?? "?") };
    } catch (e) {
      graphError = (e as Error).message; // fall through to the browser identity
    }
  }
  // FALLBACK: persistent browser profile driving mbasic.
  if (!browserAvailable()) return { ok: false, channel: "facebook", error: graphError ?? "browser_not_configured" };
  if (!lead.external_thread_id) return { ok: false, channel: "facebook", error: graphError ?? "no_thread_id" };
  const { data: sess } = await gsb().from("ao_channel_sessions")
    .select("context_id,status").eq("channel", "facebook").eq("label", "primary").maybeSingle();
  if (!sess?.context_id || sess.status !== "connected") {
    return { ok: false, channel: "facebook", error: graphError ?? "facebook_session_not_connected" };
  }
  try {
    const r = await fbDo(sess.context_id, (cdp) => fbSend(cdp, lead.external_thread_id!, body));
    return { ok: r.ok, channel: "facebook", evidence: r.evidence?.slice(0, 800), error: r.ok ? undefined : "composer_not_found" };
  } catch (e) {
    return { ok: false, channel: "facebook", error: (e as Error).message };
  }
}


async function email(lead: Lead, body: string): Promise<Delivery> {
  const to = lead.contact?.email;
  if (!RESEND || !to) return { ok: false, channel: "email", error: "no_email_or_key" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [to], reply_to: "admin@your-travel-agent.net",
      subject: "Re: " + lead.headline.slice(0, 80),
      text: body,
    }),
  });
  const t = (await r.text()).slice(0, 500);
  return { ok: r.ok, channel: "email", evidence: t, error: r.ok ? undefined : t };
}

async function sms(lead: Lead, body: string): Promise<Delivery> {
  const to = lead.contact?.phone;
  if (!TW_SID || !TW_TOKEN || !TW_FROM || !to) return { ok: false, channel: "sms", error: "no_phone_or_twilio" };
  const form = new URLSearchParams({ To: to, From: TW_FROM, Body: body.slice(0, 900) });
  const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TW_SID + "/Messages.json", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(TW_SID + ":" + TW_TOKEN),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const t = (await r.text()).slice(0, 500);
  return { ok: r.ok, channel: "sms", evidence: t, error: r.ok ? undefined : t };
}

/** Try the ladder in order; return the first success plus the full attempt log. */
export async function deliver(lead: Lead, body: string): Promise<{ delivery: Delivery; attempts: Delivery[] }> {
  const order = lead.channel === "email" ? [email, facebook, sms] : [facebook, email, sms];
  const attempts: Delivery[] = [];
  for (const fn of order) {
    const d = await fn(lead, body);
    attempts.push(d);
    if (d.ok) return { delivery: d, attempts };
  }
  return { delivery: attempts[attempts.length - 1] ?? { ok: false, channel: "none", error: "no_channel" }, attempts };
}

/**
 * REACHABILITY GATE — productivity guard.
 * A lead with no addressable channel can never be worked, so no model tokens
 * should ever be spent on it. Callers must check this BEFORE thinking.
 */
export function reachability(lead: Lead): { reachable: boolean; via: string[]; why: string } {
  const via: string[] = [];
  const psid = lead.contact?.psid ?? (lead.channel === "facebook" ? lead.external_thread_id : null);
  if (graphConfigured() && psid) via.push("facebook:graph");
  if (browserAvailable() && lead.external_thread_id) via.push("facebook:browser");
  if (RESEND && lead.contact?.email) via.push("email");
  if (TW_SID && TW_TOKEN && TW_FROM && lead.contact?.phone) via.push("sms");
  return {
    reachable: via.length > 0,
    via,
    why: via.length ? "ok" : "no psid/thread, no email, no phone — nothing to send to",
  };
}
