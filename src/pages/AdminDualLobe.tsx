import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Brain, Zap, PlayCircle, MessageCircle, Cpu, Bot, Trophy, Network, Beaker } from "lucide-react";

const EXAMPLES = [
  "Look up how many rows are in war_room_messages and send a summary notification.",
  "Fetch https://api.github.com/zen and store the quote in documents.",
  "Check what edge functions exist, then propose one to add next.",
];

const COMPLEX_TASK = [
  "COMPLEX BENCH TASK — multi-step research + write.",
  "1) Read the 10 most recent rows from war_room_messages (ordered by created_at desc).",
  "2) Read the 20 most recent rows from war_room_tasks.",
  "3) Identify the single dominant topic across those messages.",
  "4) Count how many open (status != 'done') tasks relate to that topic.",
  "5) Insert exactly ONE row into war_room_messages with role='assistant' and content that STARTS with the literal token 'BENCH-SUMMARY:' followed by: the topic, the related-open-task count, and one proposed next action — all in a single line.",
  "Signal done only AFTER the insert succeeds. Do not insert more than one row. Do not modify war_room_tasks.",
].join("\n");

// Adversarial modifiers. Injected before the task when "Obstacles" is on.
// Each blocker targets a distinct failure mode we've observed in the bench.
const OBSTACLES = [
  "OBSTACLES & BLOCKERS — you MUST navigate all of them:",
  "B1 · RED HERRING TABLES: A table named `war_room_msgs` and `war_room_message_archive` may appear in your schema scan. They are decoys. Only `war_room_messages` is authoritative. Reading a decoy counts as an error.",
  "B2 · FORBIDDEN WRITES: You MUST NOT write to: war_room_tasks, profiles, user_roles, audit_log. Any write to these tables is a hard fail.",
  "B3 · RATE-LIMIT SIMULATION: If any single tool call returns an error containing 'rate' or '429', you must back off and retry with a DIFFERENT approach (e.g. smaller LIMIT, different filter) — do not simply retry the identical call.",
  "B4 · AMBIGUOUS TOPIC: If the 10 messages contain no clearly dominant topic (tie or <40% share), you MUST pick the most RECENT non-trivial topic and prefix your summary with 'BENCH-SUMMARY: [low-confidence] '.",
  "B5 · SPARSE DATA: If war_room_messages has fewer than 10 rows, use whatever exists. If it has ZERO rows, insert 'BENCH-SUMMARY: [empty-corpus] no messages; suggested next action: seed the war room.' and stop.",
  "B6 · CONTENT LENGTH: The inserted content must be ≤ 400 characters. Longer inserts fail.",
  "B7 · NO SCAFFOLDING WRITES: You may not insert 'test' / 'ping' / 'checking' rows before the real BENCH-SUMMARY insert. First write must be the final answer.",
  "B8 · NO REPEATED READS: Reading the same table with the same filter twice in a row is wasted work and counts against efficiency. Cache in your context.",
  "B9 · DEADLINE: Total wall time budget is 60 seconds. Prefer a correct answer with mild uncertainty over a perfect answer that misses the deadline.",
].join("\n");

// ── Scaling Suite: 5 tests, each harder than the last ─────────────────────
// Every test must be verifiable by scanning ledger/transcript for a distinct
// SCALE-T{n}: prefix inserted into war_room_messages. Some tests add extra
// verifiers (multi-write, ordering, forbidden-table checks).
type ScaleTest = {
  id: string;
  label: string;
  tier: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  verify: (inserts: Array<{ table: string; content?: string; role?: string; title?: string; priority?: number }>) => { ok: boolean; note: string };
};

const SCALE_TESTS: ScaleTest[] = [
  {
    id: "T1",
    tier: 1,
    label: "T1 · Trivial — single read, single write",
    prompt: [
      "SCALING TEST T1 (trivial).",
      "1) Read the total row count of war_room_messages (any query that yields the count).",
      "2) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with the literal token 'SCALE-T1:' followed by the count and nothing else long.",
      "Signal done only after the insert succeeds. No other writes.",
    ].join("\n"),
    verify: (ins) => {
      const msgs = ins.filter((i) => i.table === "war_room_messages");
      const others = ins.filter((i) => i.table !== "war_room_messages");
      const hit = msgs.find((m) => (m.content ?? "").trim().startsWith("SCALE-T1:"));
      if (!hit) return { ok: false, note: msgs.length ? "missing SCALE-T1: prefix" : "no insert" };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (others.length) return { ok: false, note: `wrote to ${others[0].table}` };
      return { ok: true, note: "ok" };
    },
  },
  {
    id: "T2",
    tier: 2,
    label: "T2 · Base — 2 reads, reason, 1 write",
    prompt: [
      "SCALING TEST T2 (base complex).",
      "1) Read the 10 most recent rows from war_room_messages.",
      "2) Read the 20 most recent rows from war_room_tasks.",
      "3) Identify the dominant topic in the messages.",
      "4) Count open (status != 'done') tasks that relate to that topic.",
      "5) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T2:' followed by topic + open-count + one next action on a single line ≤ 400 chars.",
      "Do NOT modify war_room_tasks. Do NOT insert more than one row.",
    ].join("\n"),
    verify: (ins) => {
      const msgs = ins.filter((i) => i.table === "war_room_messages");
      const hit = msgs.find((m) => (m.content ?? "").trim().startsWith("SCALE-T2:"));
      if (!hit) return { ok: false, note: msgs.length ? "missing SCALE-T2: prefix" : "no insert" };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some((i) => i.table === "war_room_tasks")) return { ok: false, note: "touched war_room_tasks" };
      if ((hit.content ?? "").length > 400) return { ok: false, note: "content > 400 chars" };
      return { ok: true, note: "ok" };
    },
  },
  {
    id: "T3",
    tier: 3,
    label: "T3 · Cross-source — 3 reads, correlate agents",
    prompt: [
      "SCALING TEST T3 (cross-source correlation).",
      "1) Read the 15 most recent rows from war_room_messages.",
      "2) Read the 15 most recent rows from war_room_tasks.",
      "3) Read all rows from war_room_heartbeats.",
      "4) Identify the single most ACTIVE agent (most heartbeats + most authored messages combined).",
      "5) Count how many open tasks are assigned to that agent.",
      "6) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T3:' followed by: agent name, open-task count for that agent, and one directive for them — single line ≤ 400 chars.",
      "Do NOT modify war_room_tasks or war_room_heartbeats.",
    ].join("\n"),
    verify: (ins) => {
      const msgs = ins.filter((i) => i.table === "war_room_messages");
      const hit = msgs.find((m) => (m.content ?? "").trim().startsWith("SCALE-T3:"));
      if (!hit) return { ok: false, note: msgs.length ? "missing SCALE-T3: prefix" : "no insert" };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some((i) => i.table === "war_room_tasks" || i.table === "war_room_heartbeats")) return { ok: false, note: "wrote to forbidden table" };
      if ((hit.content ?? "").length > 400) return { ok: false, note: "content > 400 chars" };
      return { ok: true, note: "ok" };
    },
  },
  {
    id: "T4",
    tier: 4,
    label: "T4 · Constrained — T3 plus adversarial blockers",
    prompt: [
      "SCALING TEST T4 (constrained cross-source).",
      "Same 6 steps as T3 BUT with these hard constraints:",
      "- Prefix is 'SCALE-T4:' (not T3).",
      "- Decoy tables `war_room_msgs` and `war_room_message_archive` MAY appear in your schema scan. Reading either counts as failure.",
      "- FORBIDDEN writes: war_room_tasks, war_room_heartbeats, profiles, user_roles.",
      "- No scaffolding writes ('test', 'ping', 'checking') before the real answer.",
      "- Content ≤ 300 chars.",
      "- Reading the same table with the same LIMIT twice in a row counts against you.",
    ].join("\n"),
    verify: (ins) => {
      const msgs = ins.filter((i) => i.table === "war_room_messages");
      const hit = msgs.find((m) => (m.content ?? "").trim().startsWith("SCALE-T4:"));
      if (!hit) return { ok: false, note: msgs.length ? "missing SCALE-T4: prefix" : "no insert" };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some((i) => ["war_room_tasks", "war_room_heartbeats", "profiles", "user_roles"].includes(i.table))) return { ok: false, note: "forbidden write" };
      if ((hit.content ?? "").length > 300) return { ok: false, note: "content > 300 chars" };
      const scaffold = msgs.find((m) => !((m.content ?? "").startsWith("SCALE-T4:")) && /^(test|ping|checking)\b/i.test((m.content ?? "").trim()));
      if (scaffold) return { ok: false, note: "scaffolding write" };
      return { ok: true, note: "ok" };
    },
  },
  {
    id: "T5",
    tier: 5,
    label: "T5 · Dependent writes — 4 reads, 2 ordered writes",
    prompt: [
      "SCALING TEST T5 (multi-write with ordering).",
      "1) Read 10 recent war_room_messages, 10 recent war_room_tasks, all war_room_heartbeats, and count rows in agent_room_messages.",
      "2) Identify the top-priority open task theme (look at title/description of open tasks).",
      "3) Insert ONE row into war_room_tasks with title starting exactly 'SCALE-T5-TASK', priority=3, status='pending', assignee='bench', created_by='scaling-suite'.",
      "4) THEN insert ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T5:' followed by the theme and the new task's title — single line ≤ 400 chars.",
      "Order matters: the war_room_tasks insert MUST happen before the war_room_messages insert. Exactly one of each. No other writes.",
    ].join("\n"),
    verify: (ins) => {
      const msgs = ins.filter((i) => i.table === "war_room_messages");
      const tasks = ins.filter((i) => i.table === "war_room_tasks");
      const others = ins.filter((i) => i.table !== "war_room_messages" && i.table !== "war_room_tasks");
      const summary = msgs.find((m) => (m.content ?? "").trim().startsWith("SCALE-T5:"));
      const task = tasks.find((t) => (t.title ?? "").startsWith("SCALE-T5-TASK"));
      if (!task) return { ok: false, note: tasks.length ? "task missing SCALE-T5-TASK prefix" : "no task insert" };
      if (!summary) return { ok: false, note: msgs.length ? "summary missing SCALE-T5: prefix" : "no summary insert" };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (tasks.length > 1) return { ok: false, note: `${tasks.length} task inserts` };
      if (others.length) return { ok: false, note: `wrote to ${others[0].table}` };
      // ordering: task must appear before msg in the insert sequence
      const taskIdx = ins.findIndex((i) => i.table === "war_room_tasks");
      const msgIdx = ins.findIndex((i) => i.table === "war_room_messages" && (i.content ?? "").trim().startsWith("SCALE-T5:"));
      if (taskIdx > msgIdx) return { ok: false, note: "wrong order (msg before task)" };
      return { ok: true, note: "ok" };
    },
  },
];




type Stats = { elapsed_ms: number; turns?: number; cycles?: number; llm_calls: number; tool_calls: number; model_of_thought: string };
type Turn = { speaker: string; say: string; tool?: any; tool_result?: any; done?: boolean };
type Result = { run_id: string; transcript?: Turn[]; ledger?: any[]; stats: Stats } | null;

type Contender = {
  key: string;
  label: string;
  fn: string;
  body: Record<string, any>;
  color: string;
  icon: any;
  blurb: string;
};

const MODELS = [
  { id: "google/gemini-2.5-flash", label: "gemini-2.5-flash" },
  { id: "google/gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite" },
];

export default function AdminDualLobe() {
  const [task, setTask] = useState(EXAMPLES[0]);
  const [mode, setMode] = useState<"safe" | "full">("safe");
  const [loading, setLoading] = useState(false);
  const [isoLoading, setIsoLoading] = useState(false);
  const [isoModel, setIsoModel] = useState(MODELS[0].id);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [iso, setIso] = useState<Record<string, Result>>({});
  const [complex, setComplex] = useState<Record<string, Result>>({});
  const [complexLoading, setComplexLoading] = useState(false);
  const [obstacles, setObstacles] = useState(false);



  const contenders: Contender[] = [
    { key: "brain",         label: "Brain · 7-region",         fn: "brain-agent",         body: { max_cycles: 8 }, color: "purple",  icon: Network,       blurb: "Thalamus→amygdala→hippocampus→PFC→basal-ganglia→motor→cerebellum." },
    { key: "dialogue",      label: "Dual · Dialogue",          fn: "dual-lobe-dialogue",  body: { max_turns: 10 }, color: "blue",    icon: MessageCircle, blurb: "Two LLMs talking, sensory ↔ motor." },
    { key: "motor",         label: "Dual · Motor-cortex",      fn: "dual-lobe-agent",     body: { max_cycles: 6 }, color: "orange",  icon: Cpu,           blurb: "Strategist LLM + reflex dispatcher." },
    { key: "alternating",   label: "Dual · Alternating",       fn: "lobe-alternating",    body: { max_turns: 12 }, color: "cyan",    icon: MessageCircle, blurb: "Strict L/R cadence, no back-channel. Each lobe sees only last 2 turns." },
    { key: "contralateral", label: "Dual · Contralateral",     fn: "lobe-contralateral",  body: { max_turns: 12 }, color: "pink",    icon: Network,       blurb: "Sensory holds motor tools, motor holds sensory tools. Optic-chiasm crossover." },
    { key: "reflex",        label: "Dual · Reflex Arc",        fn: "lobe-reflex-arc",     body: { max_turns: 10 }, color: "amber",   icon: Zap,           blurb: "Motor auto-fires reads. Sensory only consulted on writes." },
    { key: "asym_sh",       label: "Dual · Sensory-heavy",     fn: "lobe-asymmetric",     body: { max_turns: 10, profile: "sensory-heavy" }, color: "emerald", icon: Brain, blurb: "Big model on eyes (gpt-5.5), cheap model on hands (flash-lite)." },
    { key: "asym_mh",       label: "Dual · Motor-heavy",       fn: "lobe-asymmetric",     body: { max_turns: 10, profile: "motor-heavy" },   color: "rose",    icon: Cpu,   blurb: "Cheap eyes, careful hands. Good for booking/payment flows." },
    { key: "bandwidth",     label: "Dual · Bandwidth-gated",   fn: "lobe-bandwidth",      body: { max_turns: 12 }, color: "indigo",  icon: MessageCircle, blurb: "Corpus-callosum budget: ~40 tokens per cross-lobe message." },
    { key: "single_flash",  label: "Single · gemini-2.5-flash",      fn: "single-lobe-agent", body: { max_turns: 12, model: "google/gemini-2.5-flash" },      color: "slate", icon: Bot, blurb: "Baseline: one strong LLM, all tools." },
    { key: "single_lite",   label: "Single · gemini-2.5-flash-lite", fn: "single-lobe-agent", body: { max_turns: 12, model: "google/gemini-2.5-flash-lite" }, color: "zinc",  icon: Bot, blurb: "Baseline: one fast LLM, all tools." },
  ];

  const isoContenders = (m: string): Contender[] => [
    { key: "iso_sensory",  label: "Isolated · SENSORY only", fn: "single-lobe-agent",  body: { max_turns: 10, model: m, scope: "sensory" }, color: "blue",    icon: Brain, blurb: "One LLM, read-only tools. No hands." },
    { key: "iso_motor",    label: "Isolated · MOTOR only",   fn: "single-lobe-agent",  body: { max_turns: 10, model: m, scope: "motor" },   color: "orange",  icon: Zap,   blurb: "One LLM, mutating tools. No eyes." },
    { key: "iso_combined", label: "Combined · SENSORY + MOTOR (same model)", fn: "dual-lobe-dialogue", body: { max_turns: 10, model: m }, color: "emerald", icon: MessageCircle, blurb: "Both lobes reunited, dialogue mode." },
  ];

  const runAll = async () => {
    setLoading(true);
    setResults({});
    try {
      const settled = await Promise.allSettled(
        contenders.map((c) => supabase.functions.invoke(c.fn, { body: { task, mode, ...c.body } })),
      );
      const next: Record<string, Result> = {};
      settled.forEach((s, i) => {
        const c = contenders[i];
        if (s.status === "fulfilled" && !s.value.error) next[c.key] = s.value.data;
        else next[c.key] = { run_id: "error", stats: { elapsed_ms: 0, llm_calls: 0, tool_calls: 0, model_of_thought: (s as any)?.reason?.message || (s as any)?.value?.error?.message || "failed" } };
      });
      setResults(next);
    } finally {
      setLoading(false);
    }
  };

  const runIsolation = async () => {
    setIsoLoading(true);
    setIso({});
    const list = isoContenders(isoModel);
    try {
      const settled = await Promise.allSettled(
        list.map((c) => supabase.functions.invoke(c.fn, { body: { task, mode, ...c.body } })),
      );
      const next: Record<string, Result> = {};
      settled.forEach((s, i) => {
        const c = list[i];
        if (s.status === "fulfilled" && !s.value.error) next[c.key] = s.value.data;
        else next[c.key] = { run_id: "error", stats: { elapsed_ms: 0, llm_calls: 0, tool_calls: 0, model_of_thought: (s as any)?.reason?.message || (s as any)?.value?.error?.message || "failed" } };
      });
      setIso(next);
    } finally {
      setIsoLoading(false);
    }
  };


  const runComplex = async () => {
    setComplexLoading(true);
    setComplex({});
    try {
      const taskWithBlockers = obstacles ? `${OBSTACLES}\n\n${COMPLEX_TASK}` : COMPLEX_TASK;
      const settled = await Promise.allSettled(
        contenders.map((c) => supabase.functions.invoke(c.fn, { body: { task: taskWithBlockers, mode: "full", ...c.body } })),
      );
      const next: Record<string, Result> = {};
      settled.forEach((s, i) => {
        const c = contenders[i];
        if (s.status === "fulfilled" && !s.value.error) next[c.key] = s.value.data;
        else next[c.key] = { run_id: "error", stats: { elapsed_ms: 0, llm_calls: 0, tool_calls: 0, model_of_thought: (s as any)?.reason?.message || (s as any)?.value?.error?.message || "failed" } };
      });
      setComplex(next);
    } finally {
      setComplexLoading(false);
    }
  };


  const scored = scoreContenders(contenders, results);
  const dualKeys = new Set(["dialogue", "motor", "alternating", "contralateral", "reflex", "asym_sh", "asym_mh", "bandwidth", "brain"]);
  const dualBest = scored.filter((s) => dualKeys.has(s.key)).sort((a, b) => b.score - a.score)[0];
  const singleBest = scored.filter((s) => s.key.startsWith("single")).sort((a, b) => b.score - a.score)[0];
  const dualWins = dualBest && singleBest ? dualBest.score > singleBest.score : null;

  const complexScored = scoreComplex(contenders, complex, obstacles);


  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Dual-Lobe Bench — must beat every single-LLM baseline
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Same task, same tools, same mode. Success = a dual-lobe architecture scores higher than the best single-LLM run.
        </p>
      </div>

      <Tabs defaultValue="standard" className="w-full">
        <TabsList>
          <TabsTrigger value="standard"><PlayCircle className="w-3 h-3 mr-1" /> Standard bench</TabsTrigger>
          <TabsTrigger value="complex"><Beaker className="w-3 h-3 mr-1" /> Complex Suite</TabsTrigger>
        </TabsList>

        <TabsContent value="complex" className="space-y-4 mt-4">
          <Card className="border-fuchsia-500/30 bg-fuchsia-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Beaker className="w-4 h-4 text-fuchsia-600" />
                Complex Suite — multi-step research + write
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Fixed task. Requires 2 reads → reason → 1 constrained write. Runs in <b>full</b> mode across all {contenders.length} architectures.
                Composite score = 50·correctness + 25·speed + 25·llm-efficiency. Correctness requires a single insert into <code>war_room_messages</code> whose content starts with <code>BENCH-SUMMARY:</code>.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="text-[11px] whitespace-pre-wrap bg-background/60 border rounded p-2 max-h-48 overflow-auto">{obstacles ? `${OBSTACLES}\n\n${COMPLEX_TASK}` : COMPLEX_TASK}</pre>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={runComplex} disabled={complexLoading}>
                  {complexLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                  {complexLoading ? `Running complex suite on ${contenders.length}…` : `Run complex suite on all ${contenders.length}`}
                </Button>
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={obstacles}
                    onChange={(e) => setObstacles(e.target.checked)}
                    className="h-4 w-4 accent-fuchsia-600"
                  />
                  <span className="font-medium">Obstacles &amp; blockers</span>
                  <span className="text-muted-foreground">— decoy tables, forbidden writes, length cap, dup-read penalty, deadline</span>
                </label>
              </div>

            </CardContent>
          </Card>

          {complexScored.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Composite scoreboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Architecture</th>
                        <th className="py-1 pr-2">Composite</th>
                        <th className="py-1 pr-2">Correct</th>
                        <th className="py-1 pr-2">Speed</th>
                        <th className="py-1 pr-2">Efficiency</th>
                        <th className="py-1 pr-2">ms</th>
                        <th className="py-1 pr-2">LLM</th>
                        <th className="py-1 pr-2">Writes</th>
                        <th className="py-1 pr-2">Errors</th>
                        <th className="py-1 pr-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complexScored.sort((a, b) => b.composite - a.composite).map((s, i) => (
                        <tr key={s.key} className={i === 0 ? "font-semibold" : ""}>
                          <td className="py-1 pr-2">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                          <td className="py-1 pr-2">{s.label}</td>
                          <td className="py-1 pr-2">{s.composite.toFixed(1)}</td>
                          <td className="py-1 pr-2">{s.correct ? "✓" : "—"}</td>
                          <td className="py-1 pr-2">{s.speedScore.toFixed(0)}</td>
                          <td className="py-1 pr-2">{s.effScore.toFixed(0)}</td>
                          <td className="py-1 pr-2">{s.ms}</td>
                          <td className="py-1 pr-2">{s.llm}</td>
                          <td className="py-1 pr-2">{s.writes}</td>
                          <td className="py-1 pr-2">{s.errors}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{s.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  composite = 50·correct + 25·(1 − ms/maxMs) + 25·(1 − llm/maxLlm). Correct requires exactly 1 insert into war_room_messages with content starting <code>BENCH-SUMMARY:</code> and 0 writes to war_room_tasks.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {contenders.map((c) => (
              <div key={c.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <c.icon className={`w-4 h-4 text-${c.color}-600`} />
                  <h2 className="text-sm font-semibold">{c.label}</h2>
                  {complex[c.key]?.stats && <StatsRow stats={complex[c.key]!.stats} />}
                </div>
                {!complex[c.key] && !complexLoading && <EmptyHint text="Waiting…" />}
                {complexLoading && !complex[c.key] && <EmptyHint text="Running…" />}
                {complex[c.key]?.transcript?.map((t, i) => <Bubble key={i} t={t} color={c.color} />)}
                {!complex[c.key]?.transcript && complex[c.key]?.ledger?.map((e: any) => <LedgerRow key={e.seq} e={e} />)}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="standard" className="space-y-6 mt-4">


      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Task</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e, i) => (
              <Button key={i} size="sm" variant="outline" onClick={() => setTask(e)}>Example {i + 1}</Button>
            ))}
          </div>
          <Textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} />
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-muted-foreground">Mode:</span>
            <Button size="sm" variant={mode === "safe" ? "default" : "outline"} onClick={() => setMode("safe")}>safe</Button>
            <Button size="sm" variant={mode === "full" ? "destructive" : "outline"} onClick={() => setMode("full")}>full (mutations)</Button>
          </div>
          <Button onClick={runAll} disabled={loading || !task.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {loading ? `Racing ${contenders.length} architectures…` : `Run all ${contenders.length} in parallel`}
          </Button>
        </CardContent>
      </Card>

      {scored.length > 0 && (
        <Card className={dualWins === true ? "border-emerald-500/50 bg-emerald-500/5" : dualWins === false ? "border-red-500/50 bg-red-500/5" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Scoreboard
              {dualWins === true && <Badge className="bg-emerald-600">Dual-lobe wins ✓</Badge>}
              {dualWins === false && <Badge variant="destructive">Single-LLM beats dual ✗</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Architecture</th>
                    <th className="py-1 pr-2">Score</th>
                    <th className="py-1 pr-2">Done</th>
                    <th className="py-1 pr-2">Steps</th>
                    <th className="py-1 pr-2">LLM</th>
                    <th className="py-1 pr-2">Tools OK</th>
                    <th className="py-1 pr-2">Errors</th>
                    <th className="py-1 pr-2">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.sort((a, b) => b.score - a.score).map((s, i) => (
                    <tr key={s.key} className={i === 0 ? "font-semibold" : ""}>
                      <td className="py-1 pr-2">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                      <td className="py-1 pr-2">{s.label}</td>
                      <td className="py-1 pr-2">{s.score.toFixed(1)}</td>
                      <td className="py-1 pr-2">{s.completed ? "✓" : "—"}</td>
                      <td className="py-1 pr-2">{s.steps}</td>
                      <td className="py-1 pr-2">{s.llm}</td>
                      <td className="py-1 pr-2">{s.toolsOk}/{s.tools}</td>
                      <td className="py-1 pr-2">{s.errors}</td>
                      <td className="py-1 pr-2">{s.ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Score = 100·completed − 4·(steps − minSteps) − 6·errors − 0.005·ms + 5·(toolsOk/max(1,tools)). Higher is better.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {contenders.map((c) => (
          <div key={c.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <c.icon className={`w-4 h-4 text-${c.color}-600`} />
              <h2 className="text-sm font-semibold">{c.label}</h2>
              {results[c.key]?.stats && <StatsRow stats={results[c.key]!.stats} />}
            </div>
            <p className="text-[11px] text-muted-foreground">{c.blurb}</p>
            {!results[c.key] && !loading && <EmptyHint text="Waiting…" />}
            {loading && !results[c.key] && <EmptyHint text="Running…" />}
            {results[c.key]?.transcript?.map((t, i) => <Bubble key={i} t={t} color={c.color} />)}
            {!results[c.key]?.transcript && results[c.key]?.ledger?.map((e: any) => <LedgerRow key={e.seq} e={e} />)}
          </div>
        ))}
      </div>

      {/* ── Lobe Isolation Lab ─────────────────────────────────── */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            Lobe Isolation Lab
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pick a model. Run each lobe alone (sensory-only, motor-only), then run them combined. The combined run should score higher than either isolated lobe — that's the proof that pairing them adds value.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-muted-foreground">Model:</span>
            {MODELS.map((m) => (
              <Button key={m.id} size="sm" variant={isoModel === m.id ? "default" : "outline"} onClick={() => setIsoModel(m.id)}>{m.label}</Button>
            ))}
            <Button size="sm" onClick={runIsolation} disabled={isoLoading || !task.trim()} className="ml-2">
              {isoLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PlayCircle className="w-3 h-3 mr-1" />}
              {isoLoading ? "Isolating…" : "Isolate + combine + compare"}
            </Button>
          </div>

          {Object.keys(iso).length > 0 && (() => {
            const list = isoContenders(isoModel);
            const scored = scoreContenders(list, iso).sort((a, b) => b.score - a.score);
            const combined = scored.find((s) => s.key === "iso_combined");
            const bestIso = scored.filter((s) => s.key !== "iso_combined").sort((a, b) => b.score - a.score)[0];
            const combinedWins = combined && bestIso ? combined.score > bestIso.score : null;
            return (
              <div className={`rounded border p-2 ${combinedWins === true ? "border-emerald-500/50 bg-emerald-500/5" : combinedWins === false ? "border-red-500/50 bg-red-500/5" : ""}`}>
                <div className="flex items-center gap-2 text-xs font-semibold mb-2">
                  <Trophy className="w-4 h-4" /> Isolation results
                  {combinedWins === true && <Badge className="bg-emerald-600">Combined &gt; isolated ✓</Badge>}
                  {combinedWins === false && <Badge variant="destructive">Isolated beat combined ✗</Badge>}
                </div>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground text-left">
                    <tr><th>#</th><th>Config</th><th>Score</th><th>Done</th><th>Steps</th><th>Tools OK</th><th>Errors</th><th>ms</th></tr>
                  </thead>
                  <tbody>
                    {scored.map((s, i) => (
                      <tr key={s.key} className={i === 0 ? "font-semibold" : ""}>
                        <td>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</td>
                        <td>{s.label}</td>
                        <td>{s.score.toFixed(1)}</td>
                        <td>{s.completed ? "✓" : "—"}</td>
                        <td>{s.steps}</td>
                        <td>{s.toolsOk}/{s.tools}</td>
                        <td>{s.errors}</td>
                        <td>{s.ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="grid md:grid-cols-3 gap-3">
            {isoContenders(isoModel).map((c) => (
              <div key={c.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <c.icon className={`w-4 h-4 text-${c.color}-600`} />
                  <h3 className="text-xs font-semibold">{c.label}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">{c.blurb}</p>
                {iso[c.key]?.stats && <StatsRow stats={iso[c.key]!.stats} />}
                {!iso[c.key] && !isoLoading && <EmptyHint text="Waiting…" />}
                {isoLoading && !iso[c.key] && <EmptyHint text="Running…" />}
                {iso[c.key]?.transcript?.map((t, i) => <Bubble key={i} t={t} color={c.color} />)}
                {!iso[c.key]?.transcript && iso[c.key]?.ledger?.map((e: any) => <LedgerRow key={e.seq} e={e} />)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


function scoreContenders(contenders: Contender[], results: Record<string, Result>) {
  const rows = contenders
    .filter((c) => results[c.key])
    .map((c) => {
      const r = results[c.key]!;
      const ledger = r.ledger ?? [];
      const transcript = r.transcript ?? [];
      const toolCalls = ledger.filter((e: any) => e.kind === "tool_executed");
      const toolsOk = toolCalls.filter((e: any) => e.ok !== false).length;
      const errors = toolCalls.filter((e: any) => e.ok === false).length + ledger.filter((e: any) => e.kind === "tool_rejected").length;
      const completed = ledger.some((e: any) => e.kind === "task_complete") || transcript.some((t: any) => t.done);
      const steps = r.stats.turns ?? r.stats.cycles ?? 0;
      const ms = r.stats.elapsed_ms;
      const llm = r.stats.llm_calls;
      const tools = toolCalls.length;
      return { key: c.key, label: c.label, completed, steps, llm, tools, toolsOk, errors, ms };
    });
  const minSteps = Math.min(...rows.map((r) => r.steps || 99));
  return rows.map((r) => {
    const score =
      (r.completed ? 100 : 0)
      - 4 * Math.max(0, r.steps - minSteps)
      - 6 * r.errors
      - 0.005 * r.ms
      + 5 * (r.tools ? r.toolsOk / r.tools : 0);
    return { ...r, score };
  });
}

function scoreComplex(contenders: Contender[], results: Record<string, Result>, obstacles = false) {
  const rows = contenders
    .filter((c) => results[c.key])
    .map((c) => {
      const r = results[c.key]!;
      const ledger = r.ledger ?? [];
      const transcript = r.transcript ?? [];
      const toolCalls = ledger.filter((e: any) => e.kind === "tool_executed");
      const errors = toolCalls.filter((e: any) => e.ok === false).length
                   + ledger.filter((e: any) => e.kind === "tool_rejected").length;

      // Extract every insert-like op from ledger + transcript
      const inserts: Array<{ table?: string; content?: string; role?: string }> = [];
      for (const e of ledger) {
        if (e.kind !== "tool_executed") continue;
        const args = e.args ?? e.input ?? {};
        const table = args.table ?? args.tableName;
        const name = (e.tool ?? e.name ?? "").toString();
        if (table === "war_room_messages" || /insert.*messages|db_insert|table_insert/i.test(name)) {
          inserts.push({ table: "war_room_messages", content: args.content ?? args.row?.content, role: args.role ?? args.row?.role });
        } else if (table === "war_room_tasks") {
          inserts.push({ table: "war_room_tasks" });
        }
      }
      for (const t of transcript) {
        const tool = (t as any).tool;
        if (!tool) continue;
        const args = tool.args ?? {};
        if (args.table === "war_room_messages") inserts.push({ table: "war_room_messages", content: args.content, role: args.role });
        else if (args.table === "war_room_tasks") inserts.push({ table: "war_room_tasks" });
      }

      const msgInserts = inserts.filter((i) => i.table === "war_room_messages");
      const taskInserts = inserts.filter((i) => i.table === "war_room_tasks");
      const summaryInsert = msgInserts.find((i) => (i.content ?? "").trim().startsWith("BENCH-SUMMARY:"));

      const done = ledger.some((e: any) => e.kind === "task_complete") || transcript.some((t: any) => t.done);
      const baseCorrect = !!done && !!summaryInsert && msgInserts.length === 1 && taskInserts.length === 0;

      // ── Obstacle-specific violations (only counted when obstacles is on) ──
      const forbiddenTables = ["war_room_tasks", "profiles", "user_roles", "audit_log"];
      const decoyTables = ["war_room_msgs", "war_room_message_archive"];
      let decoyHits = 0, forbiddenWrites = 0, overLength = 0, scaffoldWrites = 0, dupReads = 0;
      const readSig: string[] = [];
      for (const e of ledger) {
        if (e.kind !== "tool_executed") continue;
        const args = e.args ?? e.input ?? {};
        const tbl = (args.table ?? args.tableName ?? "").toString();
        const name = (e.tool ?? e.name ?? "").toString();
        if (decoyTables.includes(tbl)) decoyHits++;
        if (/insert|write|update|delete/i.test(name) && forbiddenTables.includes(tbl)) forbiddenWrites++;
        if (/read|select|query/i.test(name)) {
          const sig = `${tbl}|${JSON.stringify(args.filters ?? args.where ?? args.limit ?? "")}`;
          if (readSig.length && readSig[readSig.length - 1] === sig) dupReads++;
          readSig.push(sig);
        }
      }
      for (const ins of msgInserts) {
        const c = (ins.content ?? "").trim();
        if (c.length > 400) overLength++;
        if (!c.startsWith("BENCH-SUMMARY:") && /^(test|ping|checking|hello|hi)\b/i.test(c)) scaffoldWrites++;
      }

      const obstaclesClean = decoyHits + forbiddenWrites + overLength + scaffoldWrites === 0;
      const correct = baseCorrect && (!obstacles || obstaclesClean);

      let note = "";
      if (!done) note = "not done";
      else if (!summaryInsert) note = msgInserts.length === 0 ? "no insert" : "insert missing BENCH-SUMMARY prefix";
      else if (msgInserts.length > 1) note = `${msgInserts.length} inserts (over-wrote)`;
      else if (taskInserts.length > 0) note = "touched war_room_tasks (forbidden)";
      else if (obstacles && decoyHits) note = `hit ${decoyHits} decoy table(s)`;
      else if (obstacles && forbiddenWrites) note = `${forbiddenWrites} forbidden write(s)`;
      else if (obstacles && overLength) note = "content > 400 chars";
      else if (obstacles && scaffoldWrites) note = "scaffolding write before answer";
      else if (obstacles && dupReads) note = `ok (${dupReads} dup reads)`;
      else note = "ok";

      return {
        key: c.key,
        label: c.label,
        correct,
        writes: msgInserts.length + taskInserts.length,
        errors: errors + (obstacles ? decoyHits + forbiddenWrites + overLength + scaffoldWrites : 0),
        dupReads: obstacles ? dupReads : 0,
        ms: r.stats.elapsed_ms,
        llm: r.stats.llm_calls,
        note,
      };
    });


  const maxMs = Math.max(1, ...rows.map((r) => r.ms));
  const maxLlm = Math.max(1, ...rows.map((r) => r.llm));
  return rows.map((r) => {
    const speedScore = 25 * (1 - r.ms / maxMs);
    const effScore = 25 * (1 - r.llm / maxLlm);
    const correctScore = r.correct ? 50 : 0;
    const errorPenalty = 4 * r.errors;
    return { ...r, speedScore, effScore, composite: correctScore + speedScore + effScore - errorPenalty };
  });
}


function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto flex-wrap">
      <Badge variant="outline">{stats.elapsed_ms}ms</Badge>
      <Badge variant="outline">{stats.turns ?? stats.cycles ?? 0} steps</Badge>
      <Badge variant="outline">{stats.llm_calls} LLM</Badge>
      <Badge variant="outline">{stats.tool_calls} tools</Badge>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-md">{text}</p>;
}

function Bubble({ t, color }: { t: Turn; color: string }) {
  if (t.speaker === "system") {
    return <div className="text-[11px] text-muted-foreground italic border-l-2 border-muted pl-2">{t.say}</div>;
  }
  const align = t.speaker === "motor" ? "flex justify-end" : "flex";
  return (
    <div className={align}>
      <div className={`max-w-[92%] rounded-lg p-2 space-y-1 text-xs border bg-${color}-500/10 border-${color}-500/30`}>
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase">
          {t.speaker === "sensory" || t.speaker === "agent" ? <Brain className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
          {t.speaker}
          {t.done && <Badge variant="outline" className="ml-1 text-[9px]">done</Badge>}
        </div>
        <div className="whitespace-pre-wrap">{t.say}</div>
        {t.tool && (
          <details className="text-[10px] bg-background/60 rounded p-1">
            <summary className="cursor-pointer">🔧 {t.tool.name}</summary>
            <pre className="overflow-x-auto max-h-40 mt-1">{JSON.stringify({ args: t.tool.args, result: t.tool_result }, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function LedgerRow({ e }: { e: any }) {
  const kind = e.kind as string;
  const color =
    kind === "plan" ? "border-blue-500/30 bg-blue-500/5" :
    kind === "tool_executed" ? "border-green-500/30 bg-green-500/5" :
    kind === "task_complete" ? "border-emerald-500/30 bg-emerald-500/10" :
    "border-border bg-muted/20";
  return (
    <div className={`text-xs border rounded p-2 ${color}`}>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>#{e.seq}</span>
        <Badge variant="outline" className="text-[9px]">{kind}</Badge>
        <span className="ml-auto">{e.at_ms}ms</span>
      </div>
      <pre className="text-[10px] mt-1 overflow-x-auto max-h-40">{JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["seq", "at_ms", "kind"].includes(k))), null, 2)}</pre>
    </div>
  );
}
