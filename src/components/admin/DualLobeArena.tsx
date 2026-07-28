import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, PlayCircle, Trophy, Brain, Zap, Bot } from "lucide-react";

// Minimal 3-way benchmark: Single-LLM vs Dual-Lobe (base) vs Dual-Lobe + selected add-ons.
// Reuses the same T1-T5 scaling prompts + verifier extraction logic used by
// the main Scaling tab (see AdminDualLobe.tsx). We inline a tiny copy of the
// verifier here to keep this component self-contained.

type Test = {
  id: string;
  label: string;
  prompt: string;
  verify: (ins: Array<{ table: string; content?: string; title?: string }>) => { ok: boolean; note: string };
};

const T: Test[] = [
  {
    id: "T1",
    label: "T1 · Trivial — 1 read, 1 write",
    prompt: "SCALING TEST T1 (trivial).\n1) Read total row count of war_room_messages.\n2) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T1:' followed by the count.\nSignal done after insert. No other writes.",
    verify: (ins) => {
      const msgs = ins.filter(i => i.table === "war_room_messages");
      const hit = msgs.find(m => (m.content ?? "").trim().startsWith("SCALE-T1:"));
      if (!hit) return { ok: false, note: "missing SCALE-T1: prefix" };
      if (ins.some(i => i.table && i.table !== "war_room_messages")) return { ok: false, note: "extra writes" };
      return { ok: true, note: "ok" };
    },
  },
  {
    id: "T2",
    label: "T2 · Base — 2 reads + 1 write",
    prompt: "SCALING TEST T2.\n1) Read 10 recent war_room_messages.\n2) Read 20 recent war_room_tasks.\n3) Insert ONE row into war_room_messages role='assistant' content STARTS with 'SCALE-T2:' followed by dominant topic + open task count (single line ≤400 chars).\nNo writes to war_room_tasks.",
    verify: (ins) => {
      const msgs = ins.filter(i => i.table === "war_room_messages");
      const hit = msgs.find(m => (m.content ?? "").trim().startsWith("SCALE-T2:"));
      if (!hit) return { ok: false, note: "missing SCALE-T2: prefix" };
      if (ins.some(i => i.table === "war_room_tasks")) return { ok: false, note: "touched tasks" };
      return { ok: true, note: "ok" };
    },
  },
];

type ArmKey = "single" | "dual" | "dual_plus";
type ArmResult = { ok: boolean; ms: number; llmCalls: number; toolCalls: number; note: string; runId: string } | null;

function extractInserts(r: any): Array<{ table: string; content?: string; title?: string }> {
  if (!r?.ledger) return [];
  const out: any[] = [];
  for (const e of r.ledger) {
    if (e.kind !== "tool_executed") continue;
    const args = e.args ?? {};
    const values = args.values ?? {};
    const table = args.table;
    if (!table) continue;
    if (table === "war_room_messages") out.push({ table, content: args.values?.content ?? values.content });
    else if (table === "war_room_tasks") out.push({ table, title: args.values?.title ?? values.title });
    else out.push({ table });
  }
  return out;
}

export default function DualLobeArena() {
  const [addons, setAddons] = useState({
    persistentSession: true,
    fixedMemory: true,
    activeSensory: true,
    cerebellum: true,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Record<string, Record<ArmKey, ArmResult>>>({});

  const flipAddon = (k: keyof typeof addons) => setAddons(p => ({ ...p, [k]: !p[k] }));

  const runArm = async (arm: ArmKey, test: Test): Promise<ArmResult> => {
    const started = Date.now();
    try {
      let fn = "dual-lobe-agent";
      let body: any = { task: test.prompt, mode: "full", max_cycles: 6 };
      if (arm === "single") {
        fn = "single-lobe-agent";
        body = { task: test.prompt, mode: "full", max_turns: 12, model: "google/gemini-2.5-flash" };
      } else if (arm === "dual_plus") {
        body.addons = addons;
        body.agent_id = "arena-" + test.id;
        body.thread_key = "arena";
      }
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) return { ok: false, ms: Date.now() - started, llmCalls: 0, toolCalls: 0, note: error.message, runId: "err" };
      const inserts = extractInserts(data);
      const v = test.verify(inserts);
      const done = (data?.ledger ?? []).some((e: any) => e.kind === "task_complete");
      return {
        ok: v.ok && done,
        ms: data?.stats?.elapsed_ms ?? (Date.now() - started),
        llmCalls: data?.stats?.llm_calls ?? 0,
        toolCalls: data?.stats?.tool_calls ?? 0,
        note: !done ? "not done" : v.note,
        runId: data?.run_id ?? "?",
      };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - started, llmCalls: 0, toolCalls: 0, note: e?.message ?? String(e), runId: "err" };
    }
  };

  const runAll = async () => {
    setRunning(true);
    setResults({});
    const arms: ArmKey[] = ["single", "dual", "dual_plus"];
    setProgress({ done: 0, total: T.length * arms.length });
    const persistRows: any[] = [];
    try {
      for (const test of T) {
        const settled = await Promise.all(arms.map(a => runArm(a, test)));
        const bucket = {} as Record<ArmKey, ArmResult>;
        arms.forEach((a, i) => { bucket[a] = settled[i]; });
        setResults(prev => ({ ...prev, [test.id]: bucket }));
        setProgress(p => ({ ...p, done: p.done + arms.length }));
        arms.forEach((arm, i) => {
          const r = settled[i];
          if (!r) return;
          persistRows.push({
            task_id: test.id,
            arm,
            addons: arm === "dual_plus" ? Object.entries(addons).filter(([, v]) => v).map(([k]) => k) : [],
            correct: r.ok,
            duration_ms: r.ms,
            llm_calls: r.llmCalls,
            tool_calls: r.toolCalls,
            note: r.note,
          });
        });
      }
      if (persistRows.length) await supabase.from("lobe_benchmark_runs" as any).insert(persistRows);
    } finally {
      setRunning(false);
    }
  };

  const armLabel = (a: ArmKey) => a === "single" ? "Single LLM" : a === "dual" ? "Dual-Lobe (base)" : "Dual + Add-ons";
  const armIcon = (a: ArmKey) => a === "single" ? Bot : a === "dual" ? Brain : Zap;

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-purple-600" />
            3-Way Arena — Single vs Dual-Lobe vs Dual+Add-ons
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Every test runs against three arms. Toggle add-ons to isolate which layer helps.
            The base dual-lobe agent is unchanged; add-ons stack on top.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.keys(addons) as Array<keyof typeof addons>).map(k => (
              <div key={k} className="flex items-center gap-2 border rounded p-2 bg-background/60">
                <Switch id={k} checked={addons[k]} onCheckedChange={() => flipAddon(k)} />
                <Label htmlFor={k} className="text-xs cursor-pointer">{k}</Label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={runAll} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              {running ? `Running ${progress.done}/${progress.total}…` : `Run ${T.length} tests × 3 arms`}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Results persist to lobe_benchmark_runs for cross-session analysis.
            </span>
          </div>
        </CardContent>
      </Card>

      {T.filter(t => results[t.id]).map(test => (
        <Card key={test.id}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{test.label}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-2">
              {(["single", "dual", "dual_plus"] as ArmKey[]).map(arm => {
                const r = results[test.id]?.[arm];
                const Icon = armIcon(arm);
                return (
                  <div key={arm} className={`border rounded p-3 text-xs ${r?.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon className="w-3 h-3" />
                      {armLabel(arm)}
                      {r && <Badge variant="outline" className={r.ok ? "text-emerald-600 border-emerald-500/50" : "text-rose-600 border-rose-500/50"}>{r.ok ? "pass" : "fail"}</Badge>}
                    </div>
                    {r && (
                      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                        <div>{r.ms}ms · {r.llmCalls} LLM · {r.toolCalls} tools</div>
                        <div className="truncate">{r.note}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
