// Watchdog: checks the newest Shoppers room, nudges shopper-lead if idle,
// and confirms the shopper_profile (payment / ship / bill) is complete.
// Called on a client-side heartbeat from /admin/agent-rooms.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IDLE_MS = 4 * 60 * 1000; // 4 min of silence => nudge

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: profile } = await svc.from("shopper_profile").select("*").eq("id", 1).maybeSingle();
    const shipOk = !!(profile?.ship_to as any)?.line1 && !!(profile?.ship_to as any)?.postal_code;
    const billOk = !!(profile?.bill_to as any)?.line1 || shipOk;
    const payOk = !!profile?.payment_ref;
    const readiness = { payOk, shipOk, billOk, profile };

    const { data: rooms } = await svc
      .from("agent_rooms").select("*").eq("room", "shoppers")
      .order("updated_at", { ascending: false }).limit(1);
    const room = rooms?.[0];
    if (!room) return json({ ok: true, readiness, note: "no shoppers room yet" });

    const { data: last } = await svc
      .from("agent_room_messages").select("*").eq("room_id", room.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const idleFor = last ? Date.now() - new Date(last.created_at as string).getTime() : Infinity;
    const shouldNudge = idleFor > IDLE_MS && last?.agent_name !== "system";

    if (shouldNudge) {
      const missing: string[] = [];
      if (!payOk) missing.push("payment_ref");
      if (!shipOk) missing.push("ship_to.line1/postal_code");
      const nudge = missing.length
        ? "WATCHDOG: no activity for " + Math.round(idleFor / 1000) + "s. Standing orders incomplete (" + missing.join(", ") + "). Post current scoreboard + attempt pivot with available fields, do NOT stop."
        : "WATCHDOG: no activity for " + Math.round(idleFor / 1000) + "s. Post scoreboard, resume mission, invoke a concrete tool this turn (browser_automation_preview or vapi_call). No idle replies.";
      await svc.from("agent_room_messages").insert({
        room_id: room.id, agent_name: "system", role: "system", content: nudge,
      });
      // Kick the orchestrator so it actually acts on the nudge.
      await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/agent-room-run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({ room: "shoppers", roomId: room.id, message: nudge, systemNudge: true }),
      }).catch(() => {});
      return json({ ok: true, nudged: true, idleFor, readiness });
    }
    return json({ ok: true, nudged: false, idleFor, readiness });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(x: unknown, status = 200) {
  return new Response(JSON.stringify(x), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
