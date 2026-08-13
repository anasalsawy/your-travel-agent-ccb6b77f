import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Gavel, Radar, ShieldCheck, Play } from "lucide-react";

type Row = Record<string, any>;

export default function AdminCouncil() {
  const [status, setStatus] = useState<{ delegations: Row[]; supervision: Row[]; missions: Row[]; leads: Row[] }>({
    delegations: [], supervision: [], missions: [], leads: [],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [directive, setDirective] = useState("");
  const [live, setLive] = useState<any>(null);

  const load = async () => {
    const { data, error } = await supabase.functions.invoke("council", { body: { action: "status" } });
    if (error) return toast.error(error.message);
    setStatus({
      delegations: data?.delegations ?? [], supervision: data?.supervision ?? [],
      missions: data?.missions ?? [], leads: data?.leads ?? [],
    });
  };

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const run = async (label: string, fn: string, body: Record<string, unknown>) => {
    setBusy(label);
    const { data, error } = await supabase.functions.invoke(fn, { body });
    setBusy(null);
    if (error) return toast.error(error.message);
    setLive(data);
    toast.success(`${label} complete`);
    load();
  };

  const sendDirective = async () => {
    if (!directive.trim()) return;
    await run("Directive", "council", { action: "directive", text: directive });
    setDirective("");
  };

  const verdictTone = (v: string) =>
    v === "block" ? "destructive" : v === "revise" ? "secondary" : "default";
  const statusTone = (s: string) =>
    s === "escalated" ? "destructive" : s === "done" ? "default" : "secondary";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Council</h1>
        <p className="text-muted-foreground">
          Chief of Staff delegates, specialists execute, the supervisor grades. Featherless models, no human in the loop.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("Round", "council", { action: "tick", mode: "full", limit: 4 })} disabled={!!busy}>
          {busy === "Round" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Run council round
        </Button>
        <Button variant="secondary" onClick={() => run("Orders", "council", { action: "orders" })} disabled={!!busy}>
          <Gavel className="mr-2 h-4 w-4" /> Issue orders only
        </Button>
        <Button variant="secondary" onClick={() => run("Prospect", "prospect-tick", { mode: "full", max_posts: 10 })} disabled={!!busy}>
          {busy === "Prospect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
          Hunt leads on Facebook
        </Button>
        <Button variant="secondary" onClick={() => run("Outreach", "outreach-tick", { limit: 4, mode: "full" })} disabled={!!busy}>
          <ShieldCheck className="mr-2 h-4 w-4" /> Work the follow-ups
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Owner directive</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            placeholder="e.g. Push every lead with a December departure to a quote today, and open 5 new Punta Cana prospects."
            rows={3}
          />
          <Button onClick={sendDirective} disabled={!!busy || !directive.trim()}>Send to Chief of Staff</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="delegations">
        <TabsList>
          <TabsTrigger value="delegations">Delegations ({status.delegations.length})</TabsTrigger>
          <TabsTrigger value="supervision">Supervision ({status.supervision.length})</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline ({status.missions.length})</TabsTrigger>
          <TabsTrigger value="raw">Last run</TabsTrigger>
        </TabsList>

        <TabsContent value="delegations" className="space-y-3">
          {status.delegations.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusTone(d.status) as any}>{d.status}</Badge>
                  <span className="font-medium">chief → {d.to_agent}</span>
                  <span className="text-xs text-muted-foreground">attempt {d.attempts}</span>
                </div>
                <p className="text-sm">{d.directive}</p>
                {d.rationale && <p className="text-xs text-muted-foreground">{d.rationale}</p>}
                {d.result?.grade?.finding && (
                  <p className="text-xs text-muted-foreground">Supervisor: {d.result.grade.finding}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {!status.delegations.length && <p className="text-sm text-muted-foreground">No orders issued yet.</p>}
        </TabsContent>

        <TabsContent value="supervision" className="space-y-3">
          {status.supervision.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={verdictTone(r.verdict) as any}>{r.verdict}</Badge>
                  <span className="text-xs text-muted-foreground">{r.kind} · {r.agent_key} · score {Number(r.score ?? 0).toFixed(2)}</span>
                </div>
                {r.final_text !== r.draft && (
                  <p className="text-xs text-muted-foreground line-through">{r.draft}</p>
                )}
                <p className="text-sm">{r.final_text}</p>
                {Array.isArray(r.issues) && r.issues.length > 0 && (
                  <p className="text-xs text-destructive">{r.issues.map((i: any) => i.id).join(", ")}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {!status.supervision.length && <p className="text-sm text-muted-foreground">No messages reviewed yet.</p>}
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-3">
          {status.missions.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">stage {m.stage} · {m.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.needs_human && <Badge variant="destructive">needs human</Badge>}
                  <Badge variant="secondary">${Number(m.expected_value ?? 0).toLocaleString()}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="raw">
          <pre className="max-h-[480px] overflow-auto rounded-md bg-muted p-4 text-xs">
            {live ? JSON.stringify(live, null, 2) : "Run something to see the trace."}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
