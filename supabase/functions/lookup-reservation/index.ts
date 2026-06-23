// ═══════════════════════════════════════════════════════════════
// LOOKUP-RESERVATION — Alaska Airlines PNR lookup via Skyvern
// Two modes:
//   POST { pnr, last_name }            → start a lookup, poll briefly,
//                                        return result OR { task_id } to poll
//   POST { task_id }                   → just check the status of a prior task
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SKYVERN_API = "https://api.skyvern.com/v1";
// Stay well under the 150s edge-runtime idle timeout.
const MAX_INLINE_WAIT_SECONDS = 110;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pollSkyvern(apiKey: string, taskId: string, maxWaitSeconds: number) {
  const hdrs = { "x-api-key": apiKey };
  const intervals = Math.max(1, Math.floor(maxWaitSeconds / 5));
  let status = "queued";
  let result: any = null;

  for (let i = 0; i < intervals; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollResp = await fetch(SKYVERN_API + "/runs/" + taskId, { headers: hdrs });
    if (!pollResp.ok) continue;
    result = await pollResp.json();
    status = result.status || "unknown";
    if (["completed", "failed", "terminated", "canceled"].includes(status)) break;
  }
  return { status, result };
}

function shapeResult(pnr: string, taskId: string, status: string, result: any) {
  if (status === "completed") {
    return jsonResp({
      success: true,
      pnr,
      task_id: taskId,
      status,
      reservation: result?.output ?? result?.extracted_information ?? result?.extracted_data ?? null,
      recording_url: result?.recording_url ?? null,
    });
  }
  if (["failed", "terminated", "canceled"].includes(status)) {
    return jsonResp({
      success: false,
      pnr,
      task_id: taskId,
      status,
      error: result?.failure_reason || "Skyvern task did not complete",
      partial: result?.output ?? result?.extracted_information ?? null,
    }, 502);
  }
  return jsonResp({
    success: true,
    pnr,
    task_id: taskId,
    status,
    pending: true,
    note: "Lookup still running. Call this endpoint again with { task_id } to check status.",
  }, 202);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SKYVERN_API_KEY");
    if (!apiKey) return jsonResp({ success: false, error: "SKYVERN_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));

    // ── Poll mode: just check an existing task ──
    if (body.task_id && !body.pnr) {
      const taskId: string = body.task_id;
      const pollResp = await fetch(SKYVERN_API + "/runs/" + taskId, {
        headers: { "x-api-key": apiKey },
      });
      if (!pollResp.ok) {
        const t = await pollResp.text();
        return jsonResp({ success: false, error: "Skyvern poll " + pollResp.status + ": " + t.substring(0, 300) }, 502);
      }
      const result = await pollResp.json();
      return shapeResult(body.pnr || "", taskId, result.status || "unknown", result);
    }

    // ── Start mode ──
    const pnr = (body.pnr || "").trim().toUpperCase();
    const lastName = (body.last_name || "").trim();
    const airline = (body.airline || "alaska").toLowerCase();
    const inlineWait = Math.min(
      MAX_INLINE_WAIT_SECONDS,
      Math.max(0, body.max_wait_seconds ?? 90)
    );

    if (!pnr || !lastName) {
      return jsonResp({ success: false, error: "pnr and last_name are required" }, 400);
    }
    if (airline !== "alaska") {
      return jsonResp({ success: false, error: "Only 'alaska' is supported right now" }, 400);
    }

    const url = "https://www.alaskaair.com/reservation/lookup";
    const prompt = [
      "Look up an Alaska Airlines reservation.",
      "1. On the page, enter confirmation code: " + pnr,
      "2. Enter passenger last name: " + lastName,
      "3. Click 'Continue' or 'Find reservation'.",
      "4. Wait for the itinerary page to load.",
      "5. Return ONLY a JSON object with these keys:",
      "   passengers: string[] (full names)",
      "   flights: { flight_number, origin, destination, depart_datetime, arrive_datetime, cabin, seat }[]",
      "   status: string (Confirmed / Cancelled / Ticketed / etc.)",
      "   ticket_numbers: string[] (if visible)",
      "   record_locator: \"" + pnr + "\"",
      "If the reservation cannot be found, return { not_found: true, reason: \"<page message>\" }.",
    ].join("\n");

    console.log("[lookup-reservation] start PNR=" + pnr + " last_name=" + lastName);

    const createResp = await fetch(SKYVERN_API + "/run/tasks", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, url, engine: "skyvern-2.0", max_steps: 15 }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      return jsonResp({
        success: false,
        error: "Skyvern API " + createResp.status + ": " + errText.substring(0, 500),
      }, 502);
    }

    const taskData = await createResp.json();
    const taskId = taskData.run_id || taskData.task_id || taskData.id || taskData.workflow_run_id;
    if (!taskId) {
      return jsonResp({
        success: false,
        error: "Skyvern did not return a task_id",
        debug_keys: Object.keys(taskData),
      }, 502);
    }

    console.log("[lookup-reservation] task=" + taskId + " inlineWait=" + inlineWait);

    if (inlineWait <= 0) {
      return jsonResp({
        success: true,
        pnr,
        task_id: taskId,
        status: taskData.status || "queued",
        pending: true,
        note: "Task created. Call again with { task_id } to check status.",
      }, 202);
    }

    const { status, result } = await pollSkyvern(apiKey, taskId, inlineWait);
    return shapeResult(pnr, taskId, status, result);
  } catch (e: any) {
    console.error("[lookup-reservation] error:", e);
    return jsonResp({ success: false, error: e.message || String(e) }, 500);
  }
});
