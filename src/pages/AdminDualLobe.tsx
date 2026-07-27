import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Zap, PlayCircle, MessageCircle, Cpu, Bot, Trophy } from "lucide-react";

const EXAMPLES = [
  "Look up how many rows are in war_room_messages and send a summary notification.",
  "Fetch https://api.github.com/zen and store the quote in documents.",
  "Check what edge functions exist, then propose one to add next.",
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

  const contenders: Contender[] = [
    { key: "dialogue", label: "Dual · Dialogue",   fn: "dual-lobe-dialogue", body: { max_turns: 10 },  color: "blue",   icon: MessageCircle, blurb: "Two LLMs talking, sensory ↔ motor." },
    { key: "motor",    label: "Dual · Motor-cortex", fn: "dual-lobe-agent",   body: { max_cycles: 6 }, color: "orange", icon: Cpu,           blurb: "Strategist LLM + reflex dispatcher." },
    { key: "single_flash", label: "Single · gemini-2.5-flash",      fn: "single-lobe-agent", body: { max_turns: 12, model: "google/gemini-2.5-flash" },      color: "slate", icon: Bot, blurb: "Baseline: one strong LLM, all tools." },
    { key: "single_lite",  label: "Single · gemini-2.5-flash-lite", fn: "single-lobe-agent", body: { max_turns: 12, model: "google/gemini-2.5-flash-lite" }, color: "zinc",  icon: Bot, blurb: "Baseline: one fast LLM, all tools." },
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


  const scored = scoreContenders(contenders, results);
  const dualBest = scored.filter((s) => s.key === "dialogue" || s.key === "motor").sort((a, b) => b.score - a.score)[0];
  const singleBest = scored.filter((s) => s.key.startsWith("single")).sort((a, b) => b.score - a.score)[0];
  const dualWins = dualBest && singleBest ? dualBest.score > singleBest.score : null;

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
            {loading ? "Racing 4 architectures…" : "Run all 4 in parallel"}
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
