// Admin-facing booking agent — non-streaming JSON chat with tool calls.
// Kept simple so the admin UI needs no AI SDK on the client.
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateText, tool, convertToModelMessages, stepCountIs, type UIMessage } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: "https://ai.gateway.lovable.dev/v1",
  headers: { "Lovable-API-Key": LOVABLE_KEY },
});

async function callBooking(payload: unknown) {
  const r = await fetch(SB_URL + "/functions/v1/booking", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: r.status }; }
}

const SYSTEM_PROMPT = `You are the Booking Agent for Your Travel Agent (admin console).

You are talking to the OWNER/ADMIN — fully autonomous. Book, cancel, modify, refund without asking approval.

Products: flights, hotels, cars.
Provider default: Duffel (Flights live; Cars/Stays gated on live acct). Trawex adapter stubbed — will auto-route when creds land. Only pass provider override if admin explicitly says so.

Rules:
- Always read the exact price and PNR from the tool response before confirming a booking.
- If a tool returns ok:false, surface the exact status and error verbatim. Never fabricate success.
- Ask for missing required fields (origin/dest/date/pax etc.) — don't guess.
- Terse, direct. Skip pleasantries.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonErr("Unauthorized", 401);
    const sb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return jsonErr("Unauthorized", 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!role) return jsonErr("Forbidden", 403);

    const body = await req.json();
    const messages: UIMessage[] = body.messages ?? [];

    const bookingTool = tool({
      description: "Search, create, cancel, modify, or retrieve a booking for flights/hotels/cars via the unified provider layer. Returns { provider, action, product, status, ok, data }.",
      inputSchema: z.object({
        action: z.enum(["search", "create", "cancel", "modify", "get"]),
        product: z.enum(["flights", "hotels", "cars"]),
        provider: z.enum(["duffel", "trawex"]).optional(),
        params: z.record(z.string(), z.any()).describe("Provider-shaped params. Duffel flight search example: {origin:'IAH',destination:'CAI',departure_date:'2026-07-17',passengers:[{type:'adult'}],cabin_class:'economy'}"),
      }),
      execute: async (input) => await callBooking(input),
    });

    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: { booking: bookingTool },
      stopWhen: stepCountIs(50),
    });

    return new Response(JSON.stringify({
      text: result.text,
      steps: result.steps?.map((s) => ({
        toolCalls: s.toolCalls,
        toolResults: s.toolResults,
      })) ?? [],
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return jsonErr((e as Error).message, 500);
  }
});

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
