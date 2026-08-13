// DEV-COUNCIL — the engineering department of the autonomous agency.
//
// The council can change this website by itself:
//   audit  → dev-lead reads the live site + repo and raises change proposals
//   vote   → every seated agent votes; the tally is mediated by code, not by a
//            personality, so no single model can push a change through
//   ship   → an approved proposal is written to a branch, opened as a PR and
//            (if the risk gate allows) merged — no human in the loop
//   tick   → audit when the board is empty, otherwise vote and ship what is due
//
// Write access is a capability (github-site.ts). Swap that file and the council
// keeps shipping through whatever host replaces it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { routeChat } from "../_shared/model-router.ts";
import {
  siteWriteConfigured, readFile, listDir, openBranch, writeFile,
  openPullRequest, mergePullRequest,
} from "../_shared/github-site.ts";
import { notifyOwner, esc } from "../_shared/telegram-council.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = () => createClient(SB_URL, SR);

const jparse = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

async function think(system: string, user: string, max = 1400) {
  const r = await routeChat({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
    temperature: 0.35,
    max_tokens: max,
  }, "auto");
  return { json: jparse(r.content), model: r.model };
}

// Files the department is allowed to touch. Everything else is off limits —
// this is the blast radius, enforced in code rather than in a prompt.
const ALLOWED = [
  /^src\/pages\//, /^src\/components\//, /^src\/lib\//, /^index\.html$/, /^public\/robots\.txt$/,
];
const FORBIDDEN = [
  /^src\/integrations\/supabase\//, /^supabase\/functions\/dev-agent\//, /^supabase\/config\.toml$/,
  /^\.env/, /^\.github\//, /^supabase\/migrations\//,
];
const mayTouch = (p: string) => ALLOWED.some((r) => r.test(p)) && !FORBIDDEN.some((r) => r.test(p));

// ── AUDIT ──────────────────────────────────────────────────────────────────
const AUDIT_SYS = [
  "You are the HEAD OF ENGINEERING of an autonomous travel agency that owns and operates its own website.",
  "You are given the repository page inventory and the current business board (leads, revenue signals, escalations).",
  "Raise concrete, shippable improvements to the WEBSITE that increase booked revenue or remove a real defect.",
  "Never propose vague work ('improve UX'). Every proposal names the files and the exact change.",
  "",
  'Return ONE JSON object: {"proposals":[{"title":"...","area":"conversion|content|performance|bug|integration",',
  ' "problem":"the observed defect or leak","proposal":"the exact change","expected_impact":"...",',
  ' "risk":"low|medium|high","files":["src/pages/Index.tsx"]}]}',
  "Max 3 proposals per audit. Prefer the one that moves money.",
].join("\n");

async function audit(limit = 2) {
  const s = sb();
  const [pages, comps] = await Promise.all([
    listDir("src/pages").catch(() => []),
    listDir("src/components/home").catch(() => []),
  ]);
  const [{ data: leads }, { data: missions }, { data: open }] = await Promise.all([
    s.from("ao_leads").select("headline,stage,status,source").order("created_at", { ascending: false }).limit(20),
    s.from("ao_missions").select("title,stage,status,expected_value,realized_value").order("updated_at", { ascending: false }).limit(20),
    s.from("ao_dev_proposals").select("title,status").in("status", ["proposed", "approved", "shipping"]).limit(20),
  ]);

  const { json: out, model } = await think(AUDIT_SYS, JSON.stringify({
    inventory: [...pages, ...comps].map((f: any) => f.path).slice(0, 120),
    leads: leads ?? [], missions: missions ?? [],
    already_on_the_board: (open ?? []).map((o: any) => o.title),
  }).slice(0, 8000));

  const rows = (Array.isArray(out.proposals) ? out.proposals : []).slice(0, limit).map((p: any) => ({
    title: String(p.title ?? "untitled").slice(0, 200),
    area: String(p.area ?? "site").slice(0, 40),
    problem: String(p.problem ?? "").slice(0, 2000),
    proposal: String(p.proposal ?? "").slice(0, 4000),
    expected_impact: String(p.expected_impact ?? "").slice(0, 1000),
    risk: ["low", "medium", "high"].includes(p.risk) ? p.risk : "medium",
    files: (Array.isArray(p.files) ? p.files : []).filter((f: string) => mayTouch(String(f))).slice(0, 5),
    raised_by: "dev-lead",
    status: "proposed",
  })).filter((r: any) => r.files.length);

  const { data } = rows.length ? await sb().from("ao_dev_proposals").insert(rows).select() : { data: [] as any[] };
  return { model, raised: data ?? [] };
}

// ── VOTE ───────────────────────────────────────────────────────────────────
const VOTE_SYS = (agent: any) => [
  `You are ${agent.display_name} (${agent.agent_key}) in the ${agent.department} department of an autonomous travel agency.`,
  `Your charter: ${agent.charter}`,
  "The council is voting on a change to the company website. Vote from YOUR seat's interest, not as a generic assistant.",
  "Block anything that risks customer trust, breaks checkout, or cannot be verified.",
  'Return ONE JSON object: {"vote":"approve|reject|abstain","reasoning":"one line"}',
].join("\n");

const QUORUM = 3;

async function voteOn(proposalId: string) {
  const s = sb();
  const { data: p } = await s.from("ao_dev_proposals").select("*").eq("id", proposalId).single();
  if (!p) return { error: "proposal_not_found" };
  const { data: agents } = await s.from("ao_agents")
    .select("agent_key,display_name,department,charter").eq("status", "active").limit(12);

  // The provider plan is unit-capped, so the chamber is small and votes run in
  // two lanes. A quorum of clear voices beats a slow crowd that times out.
  const bench = agents ?? [];
  const eng = bench.filter((a: any) => a.department === "engineering").slice(0, 3);
  const rest = bench.filter((a: any) => a.department !== "engineering").slice(0, 2);
  const seated = [...eng, ...rest];
  const brief = JSON.stringify({
    title: p.title, area: p.area, problem: p.problem, proposal: p.proposal,
    expected_impact: p.expected_impact, risk: p.risk, files: p.files,
  }).slice(0, 2500);

  const castVote = async (a: any) => {
    try {
      const { json: v } = await think(VOTE_SYS(a), brief, 200);
      const vote = ["approve", "reject", "abstain"].includes(v.vote) ? v.vote : "abstain";
      // QA and engineering carry more weight on engineering risk.
      const weight = a.department === "engineering" ? 1.5 : 1;
      return { proposal_id: proposalId, agent_key: a.agent_key, vote, weight, reasoning: String(v.reasoning ?? "").slice(0, 400) };
    } catch (e) {
      return { proposal_id: proposalId, agent_key: a.agent_key, vote: "abstain", weight: 1, reasoning: "vote_failed: " + (e as Error).message };
    }
  };

  const votes: any[] = [];
  let cursor = 0;
  await Promise.all([0, 1].map(async () => {
    while (cursor < seated.length) {
      const a = seated[cursor++];
      votes.push(await castVote(a));
    }
  }));


  await s.from("ao_votes").upsert(votes, { onConflict: "proposal_id,agent_key" });

  const approve = votes.filter((v) => v.vote === "approve").reduce((n, v) => n + v.weight, 0);
  const reject = votes.filter((v) => v.vote === "reject").reduce((n, v) => n + v.weight, 0);
  const cast = votes.filter((v) => v.vote !== "abstain").length;
  const verdict = cast < QUORUM ? "no_quorum" : approve > reject ? "approved" : "rejected";

  await s.from("ao_dev_proposals").update({
    status: verdict === "approved" ? "approved" : verdict === "rejected" ? "rejected" : "proposed",
    verdict, tally: { approve, reject, cast, votes: votes.map((v) => ({ a: v.agent_key, v: v.vote })) },
  }).eq("id", proposalId);

  return { proposal_id: proposalId, verdict, approve, reject, cast, votes };
}

// ── SHIP ───────────────────────────────────────────────────────────────────
const CODER_SYS = [
  "You are a senior React + TypeScript + Tailwind engineer shipping to a live production website.",
  "You are given ONE file's full current contents and an approved change. Return the COMPLETE new file.",
  "Rules: keep every existing import that is still used; never invent modules or design tokens that do not exist;",
  "never hardcode colors — use the existing semantic classes; keep the file compiling; change only what the order requires.",
  'Return ONE JSON object: {"content":"<the entire new file>","note":"one line on what changed"}',
].join("\n");

async function ship(proposalId: string, autoMerge: boolean) {
  const s = sb();
  const { data: p } = await s.from("ao_dev_proposals").select("*").eq("id", proposalId).single();
  if (!p) return { error: "proposal_not_found" };
  if (p.status !== "approved") return { error: "not_approved", status: p.status };
  if (!siteWriteConfigured()) {
    await s.from("ao_dev_proposals").update({ status: "blocked", error: "site_write_not_configured" }).eq("id", proposalId);
    return { error: "site_write_not_configured", hint: "set GITHUB_REPO (owner/name) and GITHUB_TOKEN" };
  }

  await s.from("ao_dev_proposals").update({ status: "shipping" }).eq("id", proposalId);
  const branch = `council/${p.id.slice(0, 8)}-${String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

  const applied: any[] = [];
  try {
    await openBranch(branch);
    for (const path of (p.files ?? []).filter((f: string) => mayTouch(f)).slice(0, 4)) {
      const current = await readFile(path, branch).catch(() => ({ content: "", sha: "" }));
      const { json: out } = await think(
        CODER_SYS,
        `APPROVED CHANGE: ${p.title}\nPROBLEM: ${p.problem}\nCHANGE: ${p.proposal}\n\nFILE: ${path}\n\n--- CURRENT ---\n${String(current.content).slice(0, 24000)}`,
        8000,
      );
      const content = String(out.content ?? "");
      if (content.length < 40) { applied.push({ path, skipped: "empty_generation" }); continue; }
      const w = await writeFile({ path, content, message: `council: ${p.title}`.slice(0, 100), branch });
      applied.push({ path, commit: w.commit, note: out.note ?? "" });
    }

    const pr = await openPullRequest({
      branch,
      title: `[council] ${p.title}`,
      body: [
        `**Problem**\n${p.problem}`,
        `**Change**\n${p.proposal}`,
        `**Expected impact**\n${p.expected_impact ?? "n/a"}`,
        `**Risk**: ${p.risk}`,
        `**Vote**: ${JSON.stringify(p.tally)}`,
      ].join("\n\n"),
    });

    let merged: any = { merged: false, reason: autoMerge ? "risk_gate" : "auto_merge_disabled" };
    if (autoMerge && p.risk === "low") {
      merged = await mergePullRequest(pr.number).catch((e) => ({ merged: false, error: (e as Error).message }));
    }

    await s.from("ao_dev_proposals").update({
      status: merged?.ok || merged?.merged ? "shipped" : "in_review",
      branch, pr_number: pr.number, pr_url: pr.url,
      result: { applied, merged }, error: null,
    }).eq("id", proposalId);

    await notifyOwner(
      `🛠 <b>Dev council shipped</b>\n${esc(p.title)}\nrisk ${esc(p.risk)} · ${applied.length} file(s)\n${esc(pr.url)}` +
      (merged?.merged ? "\n<i>merged to main</i>" : "\n<i>waiting in review</i>"),
    ).catch(() => {});

    return { proposal_id: proposalId, branch, pr: pr.url, applied, merged };
  } catch (e) {
    await s.from("ao_dev_proposals").update({ status: "failed", error: (e as Error).message, result: { applied } }).eq("id", proposalId);
    return { proposal_id: proposalId, error: (e as Error).message, applied };
  }
}

// ── HTTP ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "tick";
    const s = sb();

    const { data: policy } = await s.from("ao_policies").select("value").eq("policy_key", "dev_auto_merge").maybeSingle();
    const autoMerge = body.auto_merge ?? (policy?.value as any)?.enabled ?? true;

    if (action === "status") {
      const [props, votes] = await Promise.all([
        s.from("ao_dev_proposals").select("*").order("created_at", { ascending: false }).limit(30),
        s.from("ao_votes").select("*").order("created_at", { ascending: false }).limit(120),
      ]);
      return json({ ok: true, site_write: siteWriteConfigured(), proposals: props.data ?? [], votes: votes.data ?? [] });
    }

    if (action === "propose") {
      const { data } = await s.from("ao_dev_proposals").insert({
        title: String(body.title ?? "owner request").slice(0, 200),
        area: String(body.area ?? "site").slice(0, 40),
        problem: String(body.problem ?? "").slice(0, 2000),
        proposal: String(body.proposal ?? body.text ?? "").slice(0, 4000),
        risk: body.risk ?? "medium",
        files: (Array.isArray(body.files) ? body.files : []).filter((f: string) => mayTouch(f)),
        raised_by: String(body.raised_by ?? "owner"),
      }).select().single();
      return json({ ok: true, proposal: data });
    }

    if (action === "audit") return json({ ok: true, ...(await audit(Number(body.limit ?? 2))), duration_ms: Date.now() - started });
    if (action === "vote") return json({ ok: true, ...(await voteOn(String(body.proposal_id))), duration_ms: Date.now() - started });
    if (action === "ship") return json({ ok: true, ...(await ship(String(body.proposal_id), Boolean(autoMerge))), duration_ms: Date.now() - started });

    // tick: keep the pipeline moving with one unit of work per stage.
    const out: Record<string, unknown> = {};
    const { data: pending } = await s.from("ao_dev_proposals").select("id").eq("status", "proposed").limit(1);
    if (pending?.length) out.vote = await voteOn(pending[0].id);
    else out.audit = await audit(1);

    const { data: approved } = await s.from("ao_dev_proposals").select("id").eq("status", "approved").limit(1);
    if (approved?.length) out.ship = await ship(approved[0].id, Boolean(autoMerge));

    return json({ ok: true, ...out, duration_ms: Date.now() - started });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
