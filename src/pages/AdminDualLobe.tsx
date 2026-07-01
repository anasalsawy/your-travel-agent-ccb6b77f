import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Zap, Shield, PlayCircle } from "lucide-react";

type Entry = { seq: number; at: string; kind: string; [k: string]: any };

const EXAMPLES = [
  "Book a one-way flight SHJ→CAI for July 17 for one adult economy, then email the itinerary.",
  "Refund order #A12345 to the customer's original payment method and notify them.",
  "Deploy a new edge function called `weather` that returns the temperature for a given city.",
];

export default function AdminDualLobe() {
  const [task, setTask] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [runId, setRunId] = useState<string>("");

  const run = async () => {
    setLoading(true);
    setLedger([]);
    setRunId("");
    try {
      const { data, error } = await supabase.functions.invoke("dual-lobe-demo", {
        body: { task, max_cycles: 6 },
      });
      if (error) throw error;
      setLedger(data.ledger ?? []);
      setRunId(data.run_id ?? "");
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const kindMeta = (k: string) => {
    if (k.startsWith("executor")) return { color: "bg-orange-500/10 text-orange-700 border-orange-500/30", icon: <Zap className="w-3 h-3" />, lane: "executor" };
    if (k.startsWith("strategist")) return { color: "bg-blue-500/10 text-blue-700 border-blue-500/30", icon: <Brain className="w-3 h-3" />, lane: "strategist" };
    if (k === "tool_executed") return { color: "bg-green-500/10 text-green-700 border-green-500/30", icon: <PlayCircle className="w-3 h-3" />, lane: "tool" };
    if (k === "router_reject" || k === "action_blocked_or_revised") return { color: "bg-red-500/10 text-red-700 border-red-500/30", icon: <Shield className="w-3 h-3" />, lane: "router" };
    return { color: "bg-muted text-muted-foreground border-border", icon: null, lane: "system" };
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Dual-Lobe Agent — Demo Runtime
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Two real LLM lobes (Strategist + Executor) with a hard tool router. Tools are <b>mocked</b> — they announce intent and return synthetic results. No real side effects.
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
          <Button onClick={run} disabled={loading || !task.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {loading ? "Running lobes…" : "Run dual-lobe cycle"}
          </Button>
        </CardContent>
      </Card>

      {runId && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Run <code>{runId.slice(0, 8)}</code></span>
          <span>{ledger.length} ledger entries</span>
          <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/30"><Zap className="w-3 h-3 mr-1" />Executor</Badge>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30"><Brain className="w-3 h-3 mr-1" />Strategist</Badge>
          <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30"><PlayCircle className="w-3 h-3 mr-1" />Mock tool</Badge>
          <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30"><Shield className="w-3 h-3 mr-1" />Router / Block</Badge>
        </div>
      )}

      <div className="space-y-2">
        {ledger.map((e) => {
          const m = kindMeta(e.kind);
          return (
            <Card key={e.seq} className={`border ${m.color.replace(/text-\S+/, "").replace(/bg-\S+/, "")}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">#{e.seq}</span>
                  <Badge variant="outline" className={m.color}>
                    {m.icon}<span className="ml-1">{e.kind}</span>
                  </Badge>
                  <span className="text-muted-foreground ml-auto">{new Date(e.at).toLocaleTimeString()}</span>
                </div>
                <pre className="text-[11px] bg-muted/40 p-2 rounded overflow-x-auto max-h-64">
{JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["seq","at","kind"].includes(k))), null, 2)}
                </pre>
              </CardContent>
            </Card>
          );
        })}
        {!ledger.length && !loading && (
          <p className="text-sm text-muted-foreground text-center py-12">Pick an example and run — you'll see the full envelope stream: intent → permit → mock execute → verify.</p>
        )}
      </div>
    </div>
  );
}
