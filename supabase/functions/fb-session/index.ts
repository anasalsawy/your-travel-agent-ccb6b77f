// fb-session — owns the persistent Facebook identity.
// The human logs in ONCE through a live browser view; the profile (cookies +
// localStorage) is persisted in the browser context and reused forever by the
// autonomous workers. No password is ever stored in this project.
//
// POST { action: "connect" | "status" | "verify" | "threads" | "read" | "send" | "disconnect" }
import { gsb, recordSideEffect } from "../_shared/governor.ts";
import {
  browserAvailable, createContext, createSession, liveViewUrl,
  fbDo, isLoggedIn, listThreads, readThread, sendMessage,
} from "../_shared/facebook.ts";
import { Cdp } from "../_shared/cdp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const LABEL = "primary";

async function row() {
  const { data } = await gsb().from("ao_channel_sessions")
    .select("*").eq("channel", "facebook").eq("label", LABEL).maybeSingle();
  return data;
}

async function upsert(patch: Record<string, unknown>) {
  const s = gsb();
  const existing = await row();
  if (existing) {
    const { data } = await s.from("ao_channel_sessions").update(patch).eq("id", existing.id).select().single();
    return data;
  }
  const { data } = await s.from("ao_channel_sessions")
    .insert({ channel: "facebook", label: LABEL, ...patch }).select().single();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!browserAvailable()) return json({ ok: false, error: "browser_not_configured" }, 400);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "status";

    if (action === "status") return json({ ok: true, session: await row() });

    if (action === "disconnect") {
      await upsert({ status: "disconnected", session_id: null, live_view_url: null });
      return json({ ok: true });
    }

    // Opens a keep-alive session on the persistent profile and hands back a
    // live view URL. The human solves login/2FA once inside that window.
    if (action === "connect") {
      const existing = await row();
      const contextId = existing?.context_id ?? (await createContext());
      const sess = await createSession(contextId, true);
      const cdp = await Cdp.connect(sess.connectUrl);
      await cdp.goto("https://mbasic.facebook.com/login", 2500);
      cdp.close();
      const view = await liveViewUrl(sess.id);
      const saved = await upsert({
        context_id: contextId, session_id: sess.id, live_view_url: view,
        status: "awaiting_login", last_error: null,
      });
      await recordSideEffect(null, "scout", "channel_login_opened", "Facebook login window opened for the human.");
      return json({ ok: true, session: saved, live_view_url: view });
    }

    const current = await row();
    if (!current?.context_id) return json({ ok: false, error: "not_connected" }, 400);

    if (action === "verify") {
      try {
        const ok = await fbDo(current.context_id, (cdp) => isLoggedIn(cdp));
        const saved = await upsert({
          status: ok ? "connected" : "awaiting_login",
          last_verified_at: new Date().toISOString(),
          last_error: ok ? null : "not_logged_in",
        });
        return json({ ok: true, logged_in: ok, session: saved });
      } catch (e) {
        await upsert({ status: "error", last_error: (e as Error).message });
        return json({ ok: false, error: (e as Error).message }, 500);
      }
    }

    if (action === "threads") {
      const threads = await fbDo(current.context_id, (cdp) => listThreads(cdp, body.limit ?? 25));
      return json({ ok: true, threads });
    }

    if (action === "read") {
      if (!body.thread_id) return json({ ok: false, error: "thread_id_required" }, 400);
      const messages = await fbDo(current.context_id, (cdp) => readThread(cdp, body.thread_id, body.limit ?? 20));
      return json({ ok: true, messages });
    }

    if (action === "send") {
      if (!body.thread_id || !body.body) return json({ ok: false, error: "thread_id_and_body_required" }, 400);
      const r = await fbDo(current.context_id, (cdp) => sendMessage(cdp, body.thread_id, body.body));
      await recordSideEffect(body.mission_id ?? null, "concierge", "facebook_message_sent", `Sent to ${body.thread_id}`, { ok: r.ok });
      return json({ ok: r.ok, evidence: r.evidence });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
