// COUNCIL-TELEGRAM — the owner's remote control over the whole agency.
//
// Register once (telegram setWebhook → this URL). From then on the owner runs
// the business from a phone with no website:
//
//   /status              board: leads, missions, delegations, escalations
//   /leads               the live pipeline
//   /inbox               pull new Facebook DMs/comments/lead-ads right now
//   /hunt                run a prospecting pass
//   /work                run one full council round (orders → work → grade)
//   /dev                 dev-department board
//   /audit               dev-lead raises new website proposals
//   /ship <id>           ship an approved proposal
//   /build <text>        raise an owner proposal for the council to vote on
//   anything else        treated as a directive to the Chief of Staff
//
// Only the owner chat id may command. Everyone else is ignored silently.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { tg, esc, isOwner, telegramConfigured } from "../_shared/telegram-council.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = () => createClient(SB_URL, SR);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

async function call(fn: string, payload: Record<string, unknown>, timeoutMs = 60_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SB_URL}/functions/v1/${fn}`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", Authorization: "Bearer " + SR },
      body: JSON.stringify(payload),
    });
    return await r.json().catch(() => ({ ok: false, error: "unparseable_response" }));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally { clearTimeout(t); }
}

async function board() {
  const s = sb();
  const [leads, missions, dels, props] = await Promise.all([
    s.from("ao_leads").select("status", { count: "exact", head: true }).not("status", "in", '("won","lost","archived")'),
    s.from("ao_missions").select("expected_value,realized_value,needs_human,status").limit(200),
    s.from("ao_delegations").select("status").in("status", ["assigned", "retry", "escalated"]).limit(200),
    s.from("ao_dev_proposals").select("status").limit(100),
  ]);
  const m = missions.data ?? [];
  const pipeline = m.reduce((n: number, x: any) => n + Number(x.expected_value ?? 0), 0);
  const booked = m.reduce((n: number, x: any) => n + Number(x.realized_value ?? 0), 0);
  const escalations = m.filter((x: any) => x.needs_human).length;
  const open = (dels.data ?? []).length;
  const shipped = (props.data ?? []).filter((p: any) => p.status === "shipped").length;
  return [
    "<b>Council status</b>",
    `Open leads: ${leads.count ?? 0}`,
    `Missions: ${m.length} · pipeline $${Math.round(pipeline).toLocaleString()} · booked $${Math.round(booked).toLocaleString()}`,
    `Open orders: ${open} · needs human: ${escalations}`,
    `Website changes shipped: ${shipped}`,
  ].join("\n");
}

async function handle(text: string, chatId: string): Promise<string> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@.*$/, "");
  const args = rest.join(" ");

  switch (cmd) {
    case "/start":
    case "/help":
      return [
        "<b>Council remote</b>",
        "/status — the board",
        "/leads — live pipeline",
        "/inbox — pull new Facebook messages, comments, lead ads",
        "/hunt — go find new buyers",
        "/work — run one full council round",
        "/dev — engineering board",
        "/audit — raise new website proposals",
        "/ship &lt;id&gt; — ship an approved proposal",
        "/build &lt;what to change&gt; — put a change to the vote",
        "Anything else is sent to the Chief of Staff as a directive.",
      ].join("\n");

    case "/status": return await board();

    case "/leads": {
      const { data } = await sb().from("ao_leads")
        .select("headline,stage,status,priority,source")
        .not("status", "in", '("won","lost","archived")')
        .order("priority").limit(10);
      if (!data?.length) return "No open leads.";
      return "<b>Pipeline</b>\n" + data.map((l: any) =>
        `• [${esc(l.stage)}] ${esc(l.headline).slice(0, 70)} <i>(${esc(l.source)})</i>`).join("\n");
    }

    case "/inbox": {
      const r: any = await call("inbox-tick", { mode: "full" });
      return r.ok ? `Inbox pulled: ${r.candidates ?? 0} new, ${r.admitted ?? 0} admitted as leads.` : `Inbox failed: ${esc(r.error ?? "?")}`;
    }

    case "/hunt": {
      const r: any = await call("prospect-tick", { mode: "full", max_posts: 10 });
      return r.ok ? `Hunt: ${r.found ?? 0} posts, ${r.admitted ?? 0} qualified.` : `Hunt failed: ${esc(r.error ?? "?")}`;
    }

    case "/work": {
      const r: any = await call("council", { action: "tick", mode: "full", limit: 3 });
      return r.ok ? `Round done. Issued ${r.issued ?? 0}, worked ${r.worked ?? 0}.\n${esc(r.board_note ?? "")}` : `Round failed: ${esc(r.error ?? "?")}`;
    }

    case "/dev": {
      const { data } = await sb().from("ao_dev_proposals")
        .select("id,title,status,risk,pr_url").order("created_at", { ascending: false }).limit(8);
      if (!data?.length) return "No proposals yet. Send /audit.";
      return "<b>Engineering</b>\n" + data.map((p: any) =>
        `• <code>${p.id.slice(0, 8)}</code> [${esc(p.status)}/${esc(p.risk)}] ${esc(p.title).slice(0, 60)}` +
        (p.pr_url ? `\n  ${esc(p.pr_url)}` : "")).join("\n");
    }

    case "/audit": {
      const r: any = await call("dev-council", { action: "audit", limit: 2 });
      const raised = r.raised ?? [];
      return raised.length
        ? "Raised:\n" + raised.map((p: any) => `• <code>${p.id.slice(0, 8)}</code> ${esc(p.title)}`).join("\n")
        : `Nothing raised. ${esc(r.error ?? "")}`;
    }

    case "/ship": {
      if (!args) return "Usage: /ship &lt;proposal id prefix&gt;";
      const { data } = await sb().from("ao_dev_proposals").select("id,status").ilike("id", args.trim() + "%").limit(1);
      if (!data?.length) return "No such proposal.";
      const r: any = await call("dev-council", { action: "ship", proposal_id: data[0].id }, 120_000);
      return r.error ? `Ship failed: ${esc(String(r.error))}` : `Shipped. ${esc(r.pr ?? "")}`;
    }

    case "/build": {
      if (!args) return "Usage: /build make the hero headline lead with same-day ticketing";
      const p: any = await call("dev-council", {
        action: "propose", title: args.slice(0, 80), proposal: args, raised_by: "owner", risk: "low",
        files: ["src/pages/Index.tsx"],
      });
      if (!p.proposal?.id) return "Could not raise that.";
      const v: any = await call("dev-council", { action: "vote", proposal_id: p.proposal.id }, 90_000);
      return `Raised <code>${p.proposal.id.slice(0, 8)}</code> → vote: <b>${esc(v.verdict ?? "?")}</b> (${v.approve ?? 0} for / ${v.reject ?? 0} against).` +
        (v.verdict === "approved" ? "\nShipping on the next beat, or send /ship " + p.proposal.id.slice(0, 8) : "");
    }

    default: {
      const r: any = await call("council", { action: "directive", text, limit: 4 }, 90_000);
      if (!r.ok) return `Directive failed: ${esc(r.error ?? "?")}`;
      const orders = (r.delegations ?? []).map((d: any) => `• ${esc(d.to_agent)}: ${esc(d.directive).slice(0, 90)}`).join("\n");
      return `Chief issued ${r.delegations?.length ?? 0} order(s).\n${orders}`;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!telegramConfigured()) return json({ ok: false, error: "telegram_not_configured" });

  const update = await req.json().catch(() => ({} as any));

  // One-time self-registration: POST {"action":"setup"} and the bot points
  // Telegram at this function. No token ever leaves the backend.
  if (update.action === "setup") {
    const url = `${SB_URL}/functions/v1/council-telegram`;
    const set = await tg("setWebhook", { url, allowed_updates: ["message", "edited_message"], drop_pending_updates: true });
    const info = await tg("getWebhookInfo", {});
    return json({ ok: set.ok, webhook: url, set: set.body, info: info.body });
  }

  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  const text = String(msg?.text ?? "").trim();
  if (!chatId || !text) return json({ ok: true, ignored: true });

  if (!isOwner(chatId)) {
    await tg("sendMessage", { chat_id: chatId, text: "This console is private." });
    return json({ ok: true, ignored: "not_owner" });
  }

  const { data: log } = await sb().from("ao_telegram_commands").insert({
    chat_id: String(chatId), from_user: msg.from?.username ?? String(msg.from?.id ?? ""),
    command: text.split(/\s+/)[0].slice(0, 60), args: text.slice(0, 2000),
  }).select().single();

  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  let reply: string;
  try { reply = await handle(text, String(chatId)); }
  catch (e) { reply = "Failed: " + esc((e as Error).message); }

  await tg("sendMessage", { chat_id: chatId, text: reply.slice(0, 3900), parse_mode: "HTML", disable_web_page_preview: true });
  if (log?.id) await sb().from("ao_telegram_commands").update({ handled: true, response: reply.slice(0, 2000) }).eq("id", log.id);

  return json({ ok: true });
});
