// TELEGRAM — the council's remote control and its voice to the owner.
//
// Capability-shaped: "notify the owner" and "read owner commands". The bot
// token is an application credential, so this works with no human session.
// If Telegram ever disappears, swap this file — nothing upstream changes.
const TOKEN = Deno.env.get("COUNCIL_TELEGRAM_BOT_TOKEN") || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const OWNER_CHAT = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "";
const CHANNEL_ID = Deno.env.get("TELEGRAM_CHANNEL_ID") || "";

export function telegramConfigured() {
  return Boolean(TOKEN);
}

export async function tg(method: string, payload: Record<string, unknown>) {
  if (!TOKEN) return { ok: false, error: "telegram_not_configured" };
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok && body?.ok !== false, body };
}

export function esc(s: string) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export async function notifyOwner(text: string, chatId?: string) {
  const chat = chatId || OWNER_CHAT;
  if (!chat) return { ok: false, error: "no_owner_chat_id" };
  return await tg("sendMessage", {
    chat_id: chat,
    text: text.slice(0, 3900),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export function isOwner(chatId: string | number) {
  if (!OWNER_CHAT) return false;
  return String(chatId) === String(OWNER_CHAT);
}

export async function postChannelUpdate(text: string) {
  if (!CHANNEL_ID) return { ok: false, error: "no_channel_id" };
  return await tg("sendMessage", {
    chat_id: CHANNEL_ID,
    text: text.slice(0, 3900),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function broadcastUpdate(text: string) {
  const results: Record<string, unknown> = {};
  if (OWNER_CHAT) results.owner = await notifyOwner(text);
  if (CHANNEL_ID) results.channel = await postChannelUpdate(text);
  return results;
}
