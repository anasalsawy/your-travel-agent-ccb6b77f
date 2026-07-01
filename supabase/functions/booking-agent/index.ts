// Admin-facing booking agent. Chat + tool calls against the /booking endpoint.
// Only accessible to admin users. Uses Lovable AI Gateway (Gemini 3 Flash).
import { createClient } from "npm:@supabase/supabase-js@2";
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from "npm:ai";
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
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + SVC,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: r.status }; }
}

const SYSTEM_PROMPT = `You are the Booking Agent for Your Travel Agent (admin console).

You are talking to the OWNER/ADMIN — you are fully autonomous. Book, cancel, modify, refund without approval.

Products: flights, hotels, cars.
Provider: default routing (Duffel today, Trawex when live). Only override provider if the admin explicitly asks.

Rules:
- Always confirm the exact price and PNR before saying a booking succeeded — read it back from the tool response.
- If a tool returns ok:false, surface the exact error message and status. Never fabricate success.
- For flight searches, ask for origin, destination, date, pax count if missing. For hotels: city + check-in/out + guests. For cars: pickup/dropoff location + dates.
- Prefer terse, direct responses. Skip pleasantries.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Admin gate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const sb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!role) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } });

    const { messages }: { messages: UIMessage[] } = await req.json();

    const bookingTool = tool({
      description: "Search, create, cancel, modify, or retrieve a booking for flights/hotels/cars via the unified provider layer.",
      inputSchema: z.object({
        action: z.enum(["search", "create", "cancel", "modify", "get"]),
        product: z.enum(["flights", "hotels", "cars"]),
        provider: z.enum(["duffel", "trawex"]).optional(),
        params: z.record(z.string(), z.any()).describe("Provider-shaped params. For Duffel flights: origin, destination, departure_date, passengers:[{type:'adult'|'child'}], cabin_class."),
      }),
      execute: async (input) => await callBooking(input),
    });

    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: { booking: bookingTool },
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
