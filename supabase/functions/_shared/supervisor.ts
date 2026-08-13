// SUPERVISOR — quality control on every customer-facing artifact.
// Two layers, in this order:
//   1. Deterministic red lines (code). Cannot be argued with by a model.
//   2. A reviewer LLM that scores the draft against the playbook and, when it
//      finds a fixable defect, returns a corrected message instead of a veto.
// Every review is persisted, so "why did the agency say that?" is answerable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { routeChat } from "./model-router.ts";
import { playbookBlock, redLineIssues } from "./playbook.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ssb = () => createClient(SB_URL, SR);

export type Review = {
  verdict: "approve" | "revise" | "block";
  score: number;              // 0..1 fit to the playbook
  issues: Array<{ id: string; why: string }>;
  final: string;              // the text that should actually be sent
  reviewer_model?: string;
};

const SYS = [
  "You are the SUPERVISOR of an elite travel sales agency. You review the exact message an agent is about to send to a real customer.",
  playbookBlock(),
  "",
  "Judge only: playbook fit, factual safety (never invent fares, PNRs, or policies), tone, length (2-5 short sentences),",
  "exactly one clear question or next step, and whether it moves the deal forward from the current stage.",
  "Prefer REPAIR over rejection: if it is fixable, rewrite it yourself and return the corrected message.",
  "",
  'Return ONE JSON object: {"verdict":"approve|revise|block","score":0..1,"issues":[{"id":"short","why":"..."}],"final":"the message to send"}',
  "block only when sending anything at all would harm the business (abuse, invented facts, policy breach).",
].join("\n");

export async function reviewOutbound(
  draft: string,
  ctx: { lead?: Record<string, unknown>; stage?: string; intent?: string; transcript?: string },
): Promise<Review> {
  const hard = redLineIssues(draft);

  let out: any = {};
  let model = "";
  try {
    const r = await routeChat({
      messages: [
        { role: "system", content: SYS },
        {
          role: "user",
          content: [
            "LEAD: " + JSON.stringify(ctx.lead ?? {}).slice(0, 1200),
            "STAGE: " + (ctx.stage ?? "unknown") + " | INTENT: " + (ctx.intent ?? "unknown"),
            "RECENT CONVERSATION:\n" + (ctx.transcript ?? "(none)").slice(0, 2500),
            hard.length ? "DETERMINISTIC RED LINES ALREADY TRIPPED (you must fix these): " + JSON.stringify(hard) : "",
            "DRAFT TO REVIEW:\n" + draft,
          ].filter(Boolean).join("\n\n"),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 600,
    }, "auto");
    model = r.model;
    try { out = JSON.parse(r.content); } catch { out = {}; }
  } catch (e) {
    // Reviewer unavailable: fall back to deterministic judgement only.
    out = { verdict: hard.length ? "block" : "approve", score: hard.length ? 0 : 0.6, issues: hard, final: draft };
    model = "unavailable:" + (e as Error).message.slice(0, 60);
  }

  let final = String(out.final ?? draft).trim() || draft;
  let issues = [...hard, ...(Array.isArray(out.issues) ? out.issues : [])].slice(0, 8);
  let verdict: Review["verdict"] = out.verdict === "block" ? "block" : out.verdict === "revise" ? "revise" : "approve";

  // The rewrite is itself subject to the red lines — no laundering.
  const afterFix = redLineIssues(final);
  if (afterFix.length) {
    verdict = "block";
    issues = [...issues, ...afterFix.map((i) => ({ ...i, id: "unfixed_" + i.id }))];
  }
  if (verdict !== "block" && final !== draft) verdict = "revise";

  return {
    verdict,
    score: Math.max(0, Math.min(1, Number(out.score) || (verdict === "approve" ? 0.8 : 0.5))),
    issues,
    final,
    reviewer_model: model,
  };
}

export async function recordReview(
  review: Review,
  meta: { mission_id?: string | null; lead_id?: string | null; agent_key?: string; kind?: string; draft: string; delivered?: boolean },
) {
  try {
    await ssb().from("ao_supervision").insert({
      mission_id: meta.mission_id ?? null,
      lead_id: meta.lead_id ?? null,
      agent_key: meta.agent_key ?? "concierge",
      kind: meta.kind ?? "outbound_message",
      draft: meta.draft.slice(0, 4000),
      final_text: review.final.slice(0, 4000),
      verdict: review.verdict,
      score: review.score,
      issues: review.issues,
      reviewer_model: review.reviewer_model ?? null,
      delivered: Boolean(meta.delivered),
    });
  } catch { /* supervision logging must never block the sale */ }
}
