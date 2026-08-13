// COUNCIL — the orchestration entrypoint.
// POST { action: "tick" | "orders" | "work" | "status" | "directive", mode }
//
//   orders    Chief of Staff reads the whole board and issues delegations.
//   work      Specialists execute due delegations; the supervisor grades each.
//   tick      orders → work, one autonomous round (what the 24/7 runner calls).
//   directive Owner drops a plain-English instruction; the chief turns it into
//             delegations exactly like its own orders.
import { chiefRound, dueDelegations, workDelegation, csb, type Delegation } from "../_shared/council.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

async function pool<T, R>(items: T[], lanes: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "tick";
    const mode: "safe" | "full" = body.mode === "full" ? "full" : "safe";
    const s = csb();

    if (action === "status") {
      const [dels, sup, missions, leads] = await Promise.all([
        s.from("ao_delegations").select("*").order("created_at", { ascending: false }).limit(40),
        s.from("ao_supervision").select("*").order("created_at", { ascending: false }).limit(40),
        s.from("ao_missions").select("id,title,stage,status,needs_human,expected_value").order("updated_at", { ascending: false }).limit(20),
        s.from("ao_leads").select("id,headline,stage,status,priority,next_action_at").order("priority").limit(20),
      ]);
      return json({
        ok: true,
        delegations: dels.data ?? [],
        supervision: sup.data ?? [],
        missions: missions.data ?? [],
        leads: leads.data ?? [],
      });
    }

    if (action === "directive") {
      const text = String(body.text ?? "").trim();
      if (!text) return json({ ok: false, error: "text_required" }, 400);
      await s.from("ao_dialogue").insert({ from_agent: "owner", kind: "directive", content: text.slice(0, 2000) });
      const round = await chiefRound(Number(body.limit ?? 5));
      return json({ ok: true, ...round, duration_ms: Date.now() - started });
    }

    if (action === "orders") {
      const round = await chiefRound(Number(body.limit ?? 5));
      return json({ ok: true, ...round, duration_ms: Date.now() - started });
    }

    if (action === "work") {
      const due = await dueDelegations(Number(body.limit ?? 4));
      const results = await pool(due, Number(body.concurrency ?? 3), (d: Delegation) => workDelegation(d, mode));
      return json({ ok: true, worked: results.length, results, duration_ms: Date.now() - started });
    }

    // tick = one full autonomous round.
    const round = await chiefRound(Number(body.limit ?? 4));
    const due = await dueDelegations(Number(body.limit ?? 4));
    const results = await pool(due, Number(body.concurrency ?? 3), (d: Delegation) => workDelegation(d, mode));
    return json({
      ok: true,
      board_note: round.board_note,
      issued: round.delegations.length,
      worked: results.length,
      results,
      model: round.model,
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
