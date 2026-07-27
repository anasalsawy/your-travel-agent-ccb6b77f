import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Zap, PlayCircle, MessageCircle, Cpu } from "lucide-react";

const EXAMPLES = [
  "Look up how many rows are in war_room_messages and send a summary notification.",
  "Fetch https://api.github.com/zen and store the quote in documents.",
  "Check what edge functions exist, then propose one to add next.",
];

type Stats = { elapsed_ms: number; turns?: number; cycles?: number; llm_calls: number; tool_calls: number; model_of_thought: string };
type DialogueTurn = { speaker: "sensory" | "motor" | "system"; say: string; tool?: any; tool_result?: any; done?: boolean };
type DialogueResult = { run_id: string; transcript: DialogueTurn[]; stats: Stats } | null;
type MotorResult = { run_id: string; ledger: any[]; stats: Stats } | null;

export default function AdminDualLobe() {
  const [task, setTask] = useState(EXAMPLES[0]);
  const [mode, setMode] = useState<"safe" | "full">("safe");
  const [loading, setLoading] = useState(false);
  const [dialogue, setDialogue] = useState<DialogueResult>(null);
  const [motor, setMotor] = useState<MotorResult>(null);

  const runBoth = async () => {
    setLoading(true);
    setDialogue(null);
    setMotor(null);
    try {
      const [d, m] = await Promise.all([
        supabase.functions.invoke("dual-lobe-dialogue", { body: { task, max_turns: 10, mode } }),
        supabase.functions.invoke("dual-lobe-agent", { body: { task, max_cycles: 6, mode } }),
      ]);
      if (d.error) throw d.error;
      if (m.error) throw m.error;
      setDialogue(d.data);
      setMotor(m.data);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Dual-Lobe Agent — A/B Bench
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Same task, same tools, same mode — run through two different architectures side by side.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageCircle className="w-4 h-4 text-blue-600" />A · Dialogue (two LLMs talking)</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p><b>SENSORY</b> (awareness, read-only tools) and <b>MOTOR</b> (action, mutating tools) are both LLMs. They see each other's messages and take turns — one hemisphere speaks, the other replies. Sensory declares when the task is done.</p>
            <p className="text-[11px]">Cost: 1 LLM call per turn · latency: sequential · strength: recovery, negotiation, judgment.</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4 text-orange-600" />B · Motor cortex (one LLM + reflex arc)</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Only the <b>STRATEGIST</b> LLM thinks. The <b>MOTOR</b> is a pure dispatcher — no LLM, no thinking. Strategist streams pre-approved batches; motor drains them in parallel. Thinking N+1 overlaps with acting N.</p>
            <p className="text-[11px]">Cost: 1 LLM call per cycle · latency: pipelined · strength: throughput, speed.</p>
          </CardContent>
        </Card>
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
          <Button onClick={runBoth} disabled={loading || !task.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {loading ? "Running both architectures…" : "Run A + B in parallel"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ── A · Dialogue ─────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold">A · Dialogue transcript</h2>
            {dialogue?.stats && <StatsRow stats={dialogue.stats} />}
          </div>
          {!dialogue && !loading && <EmptyHint text="Two LLMs will talk here." />}
          {dialogue?.transcript.map((t, i) => <DialogueBubble key={i} t={t} />)}
        </div>

        {/* ── B · Motor cortex ─────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-orange-600" />
            <h2 className="text-sm font-semibold">B · Motor-cortex ledger</h2>
            {motor?.stats && <StatsRow stats={motor.stats} />}
          </div>
          {!motor && !loading && <EmptyHint text="One LLM will plan, motor will dispatch." />}
          {motor?.ledger.map((e) => <LedgerRow key={e.seq} e={e} />)}
        </div>
      </div>
    </div>
  );
}

function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-auto">
      <Badge variant="outline">{stats.elapsed_ms}ms</Badge>
      <Badge variant="outline">{stats.turns ?? stats.cycles} steps</Badge>
      <Badge variant="outline">{stats.llm_calls} LLM</Badge>
      <Badge variant="outline">{stats.tool_calls} tools</Badge>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-12 border border-dashed rounded-md">{text}</p>;
}

function DialogueBubble({ t }: { t: DialogueTurn }) {
  if (t.speaker === "system") {
    return <div className="text-[11px] text-muted-foreground italic border-l-2 border-muted pl-2">{t.say}</div>;
  }
  const isSensory = t.speaker === "sensory";
  return (
    <div className={isSensory ? "flex" : "flex justify-end"}>
      <div className={`max-w-[90%] rounded-lg p-2 space-y-1 text-xs border ${isSensory ? "bg-blue-500/10 border-blue-500/30" : "bg-orange-500/10 border-orange-500/30"}`}>
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase">
          {isSensory ? <Brain className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
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
