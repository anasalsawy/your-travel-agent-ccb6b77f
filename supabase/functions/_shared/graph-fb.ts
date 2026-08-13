// FACEBOOK — application-identity driver (Graph API, system-user/page token).
//
// This is the PRIMARY Facebook capability per EDR-001: it runs under an
// application token, needs no browser, no human login, no rented minutes, and
// therefore works unattended for years. The CDP/mbasic driver in facebook.ts
// stays as the FALLBACK for surfaces Graph does not expose (public post search),
// and Skyvern is the EMERGENCY fallback under that.
//
// Every function returns a plain result object — callers never see Graph.
const GRAPH = "https://graph.facebook.com/v21.0";
const getToken = () => Deno.env.get("META_ACCESS_TOKEN") ?? "";
const getPageId = () => Deno.env.get("META_PAGE_ID") ?? "";

export function graphConfigured() {
  return Boolean(getToken() && getPageId());
}

async function g(path: string, init?: RequestInit & { params?: Record<string, string> }) {
  const url = new URL(GRAPH + path);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(init?.params ?? {})) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body,
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  if (!r.ok) {
    const msg = body?.error?.message ?? String(text).slice(0, 300);
    throw new Error(`graph_${r.status}: ${msg}`);
  }
  return body;
}

/** Identity check — proves the token is alive and which page it owns. */
export async function whoami() {
  if (!graphConfigured()) return { ok: false, error: "meta_not_configured" };
  try {
    const me = await g(`/${PAGE_ID}`, { params: { fields: "id,name,category,fan_count" } });
    return { ok: true, page: me };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Messenger inbox ────────────────────────────────────────────────────────
export type GraphThread = {
  id: string;
  psid: string | null;
  name: string;
  updated_time: string;
  last_message: string;
  last_from: string;
  unread: number;
};

export async function listConversations(limit = 25): Promise<GraphThread[]> {
  const res = await g(`/${PAGE_ID}/conversations`, {
    params: {
      platform: "messenger",
      limit: String(limit),
      fields: "id,updated_time,unread_count,participants,messages.limit(1){message,from,created_time}",
    },
  });
  return (res.data ?? []).map((c: any) => {
    const other = (c.participants?.data ?? []).find((p: any) => p.id !== PAGE_ID);
    const m = c.messages?.data?.[0];
    return {
      id: c.id,
      psid: other?.id ?? null,
      name: other?.name ?? "unknown",
      updated_time: c.updated_time,
      last_message: m?.message ?? "",
      last_from: m?.from?.id === PAGE_ID ? "us" : "them",
      unread: Number(c.unread_count ?? 0),
    } as GraphThread;
  });
}

export async function readConversation(conversationId: string, limit = 20) {
  const res = await g(`/${conversationId}/messages`, {
    params: { limit: String(limit), fields: "message,from,created_time" },
  });
  return (res.data ?? []).reverse().map((m: any) => ({
    who: m.from?.id === PAGE_ID ? "us" : (m.from?.name ?? "them"),
    body: m.message ?? "",
    at: m.created_time,
  }));
}

/** Send a Messenger message to a PSID under the page identity. */
export async function sendDm(psid: string, text: string, tag?: string) {
  const body: Record<string, unknown> = {
    recipient: { id: psid },
    message: { text: text.slice(0, 1900) },
    messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
  };
  if (tag) body.tag = tag;
  const res = await g(`/${PAGE_ID}/messages`, { method: "POST", body: JSON.stringify(body) });
  return { ok: true, message_id: res.message_id ?? null, recipient_id: res.recipient_id ?? psid };
}

// ── Organic page surface ───────────────────────────────────────────────────
export async function publishPost(message: string, link?: string) {
  const body: Record<string, unknown> = { message: message.slice(0, 5000) };
  if (link) body.link = link;
  const res = await g(`/${PAGE_ID}/feed`, { method: "POST", body: JSON.stringify(body) });
  return { ok: true, post_id: res.id };
}

export type GraphComment = {
  id: string;
  post_id: string;
  message: string;
  from_id: string | null;
  from_name: string;
  created_time: string;
  permalink: string;
};

/** Comments left on our own posts — the highest-intent inbound surface there is. */
export async function recentComments(limit = 25): Promise<GraphComment[]> {
  const res = await g(`/${PAGE_ID}/posts`, {
    params: {
      limit: "10",
      fields: `id,permalink_url,comments.limit(${limit}).order(reverse_chronological){id,message,from,created_time}`,
    },
  });
  const out: GraphComment[] = [];
  for (const post of res.data ?? []) {
    for (const c of post.comments?.data ?? []) {
      if (c.from?.id === PAGE_ID) continue;
      out.push({
        id: c.id,
        post_id: post.id,
        message: c.message ?? "",
        from_id: c.from?.id ?? null,
        from_name: c.from?.name ?? "unknown",
        created_time: c.created_time,
        permalink: post.permalink_url ?? "",
      });
    }
  }
  return out;
}

export async function replyToComment(commentId: string, message: string) {
  const res = await g(`/${commentId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message: message.slice(0, 1800) }),
  });
  return { ok: true, comment_id: res.id };
}

/** Private reply to a public comment — moves the lead into the DM channel. */
export async function privateReplyToComment(commentId: string, message: string) {
  const res = await g(`/${PAGE_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: message.slice(0, 1900) } }),
  });
  return { ok: true, message_id: res.message_id ?? null, recipient_id: res.recipient_id ?? null };
}

// ── Lead Ads (real buyers, submitted through Meta forms) ───────────────────
export async function leadgenForms() {
  const res = await g(`/${PAGE_ID}/leadgen_forms`, { params: { limit: "25", fields: "id,name,status" } });
  return res.data ?? [];
}

export async function leadgenLeads(formId: string, limit = 25) {
  const res = await g(`/${formId}/leads`, { params: { limit: String(limit), fields: "id,created_time,field_data" } });
  return (res.data ?? []).map((l: any) => {
    const fields: Record<string, string> = {};
    for (const f of l.field_data ?? []) fields[f.name] = (f.values ?? [])[0] ?? "";
    return { id: l.id, created_time: l.created_time, fields };
  });
}
