// supabase/functions/openhands-agent/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function extractLatestAssistantText(eventsData: any): string {
  const events = Array.isArray(eventsData)
    ? eventsData
    : (eventsData?.events ?? eventsData?.data ?? []);

  for (const ev of events) {
    const role = ev?.role ?? ev?.author ?? ev?.speaker;
    if (role !== "assistant") continue;

    const content = ev?.content;

    if (typeof content === "string" && content.trim()) return content;

    if (Array.isArray(content)) {
      const t = content.find((c: any) => c?.type === "text" && c?.text);
      if (t?.text) return t.text;
    }

    if (content?.text && typeof content.text === "string") return content.text;
  }

  return "";
}

async function ohCreateConversation(apiKey: string, initialMsg: string) {
  const resp = await fetch("https://app.all-hands.dev/api/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-API-Key": apiKey,
    },
    body: JSON.stringify({
      initial_user_msg: initialMsg,
    }),
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(
      `OpenHands create failed (${resp.status}): ${text?.slice(0, 300)}`
    );
  }

  const conversationId = data?.conversation_id ?? data?.id;
  if (!conversationId) {
    throw new Error(
      `OpenHands create returned no conversation id: ${text?.slice(0, 300)}`
    );
  }
  return conversationId as string;
}

async function ohSendMessage(
  apiKey: string,
  conversationId: string,
  msg: string
) {
  const resp = await fetch(
    `https://app.all-hands.dev/api/conversations/${encodeURIComponent(
      conversationId
    )}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": apiKey,
      },
      body: JSON.stringify({
        role: "user",
        content: [{ type: "text", text: msg }],
        run: true,
      }),
    }
  );

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `OpenHands send failed (${resp.status}): ${text?.slice(0, 300)}`
    );
  }
}

async function ohFetchEvents(apiKey: string, conversationId: string) {
  const resp = await fetch(
    `https://app.all-hands.dev/api/conversations/${encodeURIComponent(
      conversationId
    )}/events?limit=30&reverse=true`,
    {
      headers: {
        "X-Session-API-Key": apiKey,
      },
    }
  );

  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(
      `OpenHands events failed (${resp.status}): ${text?.slice(0, 300)}`
    );
  }

  return data;
}

async function pollForAssistantReply(
  apiKey: string,
  conversationId: string,
  timeoutMs = 25000,
  intervalMs = 1500
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const eventsData = await ohFetchEvents(apiKey, conversationId);
    const reply = extractLatestAssistantText(eventsData);
    if (reply) return reply;
    await sleep(intervalMs);
  }

  return ""; // timed out
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const OPENHANDS_API_KEY = Deno.env.get("OPENHANDS_API_KEY");
  if (!OPENHANDS_API_KEY) {
    return jsonResponse({ error: "Missing OPENHANDS_API_KEY secret" }, 500);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Accept flexible input names so your frontend doesn't have to be perfect.
  const message: string =
    body?.message ?? body?.text ?? body?.prompt ?? body?.input ?? "";
  let conversationId: string =
    body?.conversation_id ?? body?.conversationId ?? "";

  if (!message || typeof message !== "string") {
    return jsonResponse({ error: "Missing 'message' (string)" }, 400);
  }

  try {
    // If new conversation: create it with the first message
    if (!conversationId) {
      conversationId = await ohCreateConversation(OPENHANDS_API_KEY, message);
    } else {
      // Existing conversation: send message into it
      await ohSendMessage(OPENHANDS_API_KEY, conversationId, message);
    }

    // Poll for assistant reply
    const reply = await pollForAssistantReply(
      OPENHANDS_API_KEY,
      conversationId,
      25000,
      1500
    );

    // If OpenHands is slow/paused/maintenance, we return pending cleanly.
    if (!reply) {
      return jsonResponse({
        status: "pending",
        conversation_id: conversationId,
        reply:
          "Still processing. If this keeps happening, OpenHands may be temporarily unavailable. Tap retry in a few seconds.",
      });
    }

    return jsonResponse({
      status: "ok",
      conversation_id: conversationId,
      reply,
    });
  } catch (err) {
    return jsonResponse(
      {
        status: "error",
        error: String(err),
      },
      500
    );
  }
});
