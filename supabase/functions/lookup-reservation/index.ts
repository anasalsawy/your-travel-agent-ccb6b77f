// ═══════════════════════════════════════════════════════════════
// LOOKUP-RESERVATION — Alaska Airlines PNR lookup via Skyvern
// Public endpoint for Vapi/Maya agents to verify reservations.
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LookupRequest {
  pnr: string;            // 6-char confirmation code, e.g. "JPDYET"
  last_name: string;      // passenger surname
  airline?: string;       // default: "alaska"
  max_wait_seconds?: number; // poll cap, default 120
}

const SKYVERN_API = "https://api.skyvern.com/v1";

async function runSkyvernTask(apiKey: string, prompt: string, url: string, maxWait: number) {
  const hdrs = { "x-api-key": apiKey, "Content-Type": "application/json" };

  const createResp = await fetch(SKYVERN_API + "/run/tasks", {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify({
      prompt,
      url,
      engine: "skyvern-2.0",
      max_steps: 15,
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error("Skyvern API " + createResp.status + ": " + errText.substring(0, 500));
  }

  const taskData = await createResp.json();
  const taskId = taskData.task_id || taskData.id;
  if (!taskId) throw new Error("Skyvern did not return a task_id");

  const intervals = Math.max(6, Math.floor(maxWait / 5));
  let status = "running";
  let result: any = null;

  for (let i = 0; i < intervals; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(SKYVERN_API + "/tasks/" + taskId, { headers: hdrs });
    if (!pollResp.ok) continue;
    result = await pollResp.json();
    status = result.status || "unknown";
    if (["completed", "failed", "terminated", "canceled"].includes(status)) break;
  }

  return { taskId, status, result };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SKYVERN_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SKYVERN_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: LookupRequest = await req.json();
    const pnr = (body.pnr || "").trim().toUpperCase();
    const lastName = (body.last_name || "").trim();
    const airline = (body.airline || "alaska").toLowerCase();
    const maxWait = body.max_wait_seconds || 120;

    if (!pnr || !lastName) {
      return new Response(
        JSON.stringify({ success: false, error: "pnr and last_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (airline !== "alaska") {
      return new Response(
        JSON.stringify({ success: false, error: "Only 'alaska' is supported right now" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = "https://www.alaskaair.com/reservation/lookup";
    const prompt = [
      "Look up an Alaska Airlines reservation.",
      "1. On the page, enter confirmation code: " + pnr,
      "2. Enter passenger last name: " + lastName,
      "3. Click 'Continue' / 'Find reservation'.",
      "4. Wait for the itinerary page to load.",
      "5. Extract and return as JSON:",
      "   - passengers (array of full names)",
      "   - flights (array of { flight_number, origin, destination, depart_datetime, arrive_datetime, cabin, seat })",
      "   - status (Confirmed / Cancelled / Ticketed / etc.)",
      "   - ticket_numbers (array, if visible)",
      "   - record_locator: " + pnr,
      "If the reservation cannot be found, return { not_found: true, reason: '<page message>' }.",
    ].join("\n");

    console.log("[lookup-reservation] PNR=" + pnr + " last_name=" + lastName);

    const { taskId, status, result } = await runSkyvernTask(apiKey, prompt, url, maxWait);

    if (status === "completed") {
      return new Response(
        JSON.stringify({
          success: true,
          pnr,
          airline,
          task_id: taskId,
          status,
          reservation: result.extracted_information || result.extracted_data || null,
          output: result.output || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (status === "failed" || status === "terminated" || status === "canceled") {
      return new Response(
        JSON.stringify({
          success: false,
          pnr,
          task_id: taskId,
          status,
          error: result?.failure_reason || "Skyvern task did not complete",
          partial: result?.extracted_information || null,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Still running — return task_id so caller can poll
    return new Response(
      JSON.stringify({
        success: true,
        pnr,
        task_id: taskId,
        status,
        note: "Lookup still running. Poll Skyvern with task_id, or call again with larger max_wait_seconds.",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[lookup-reservation] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
