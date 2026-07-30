import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity, Bot, Brain, Download, Loader2, Play, ShieldCheck, Sparkles,
  TriangleAlert, Users, Zap,
} from "lucide-react";

type Agent = {
  id: string; agent_key: string; display_name: string; department: string; charter: string;
  tools: string[]; addons: Record<string, boolean>; autonomy_level: number; status: string; sort_order: number;
};
type Mission = {
  id: string; title: string; stage: string; priority: number; source: string | null;
  customer_name: string | null; customer_email: string | null; payload: any;
  expected_value: number | null; realized_value: number | null; owner_agent: string | null;
  status: string; outcome: string | null; needs_human: boolean; escalation_reason: string | null;
  updated_at: string;
};
type Dialogue = {
  id: string; mission_id: string | null; from_agent: string; to_agent: string | null;
  lobe: string | null; kind: string; content: string; created_at: string;
};
type Policy = { id: string; policy_key: string; label: string; description: string | null; value: any; is_active: boolean };

const STAGES = ["lead", "qualify", "source", "quote", "collect", "fulfill", "serve", "relate", "audit", "closed"];

const DEPT_TONE: Record<string, string> = {
  Growth: "border-emerald-500/40 bg-emerald-500/5",
  Sales: "border-sky-500/40 bg-sky-500/5",
  Operations: "border-violet-500/40 bg-violet-500/5",
  Finance: "border-amber-500/40 bg-amber-500/5",
  Care: "border-rose-500/40 bg-rose-500/5",
  Relations: "border-teal-500/40 bg-teal-500/5",
  Governance: "border-primary/50 bg-primary/5",
};

const LOBE_TONE: Record<string, string> = {
  strategist: "text-sky-400",
  executor: "text-emerald-400",
  prefrontal: "text-sky-400",
  basal_ganglia: "text-amber-400",
  motor: "text-emerald-400",
  cerebellum: "text-rose-400",
  hippocampus: "text-violet-400",
};

export default function AdminAgencyOS() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [dialogue, setDialogue] = useState<Dialogue[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPayload, setNewPayload] = useState("");

  const load = useCallback(async () => {
    const [a, m, d, p] = await Promise.all([
      supabase.from("ao_agents").select("*").order("sort_order"),
      supabase.from("ao_missions").select("*").order("updated_at", { ascending: false }).limit(60),
      supabase.from("ao_dialogue").select("*").order("created_at", { ascending: false }).limit(120),
      supabase.from("ao_policies").select("*").order("policy_key"),
    ]);
    setAgents((a.data ?? []) as Agent[]);
    setMissions((m.data ?? []) as Mission[]);
    setDialogue(((d.data ?? []) as Dialogue[]).reverse());
    setPolicies((p.data ?? []) as Policy[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("agency-os")
      .on("postgres_changes", { event: "*", schema: "public", table: "ao_dialogue" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ao_missions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function call(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke("agency-os", {
        body: { action, mode: liveMode ? "full" : "safe", ...extra },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error ?? "unknown error");
      await load();
      return data;
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function downloadManifest() {
    const data = await call("manifest", {}, "manifest");
    if (!data?.manifest) return;
    const blob = new Blob([JSON.stringify(data.manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "agency-os.manifest.json"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Deployment manifest exported");
  }

  const stats = useMemo(() => {
    const open = missions.filter((m) => m.status === "open").length;
    const escalated = missions.filter((m) => m.needs_human).length;
    const closed = missions.filter((m) => m.stage === "closed" || m.status === "completed").length;
    const pipelineValue = missions.filter((m) => m.status === "open").reduce((s, m) => s + Number(m.expected_value ?? 0), 0);
    const autonomy = missions.length ? Math.round(((missions.length - escalated) / missions.length) * 100) : 100;
    return { open, escalated, closed, pipelineValue, autonomy };
  }, [missions]);

  const byStage = useMemo(() => {
    const map: Record<string, Mission[]> = {};
    for (const s of STAGES) map[s] = [];
    for (const m of missions) (map[m.stage] ??= []).push(m);
    return map;
  }, [missions]);

  const selectedMission = missions.find((m) => m.id === selected) ?? null;
  const missionDialogue = dialogue.filter((d) => !selected || d.mission_id === selected);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Brain className="h-6 w-6 text-primary" />
              Agency OS
            </h1>
            <p className="text-sm text-muted-foreground">
              Ten dual-lobe agents running the business end to end under Dialogue OS governance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Switch checked={liveMode} onCheckedChange={setLiveMode} id="live" />
              <label htmlFor="live" className="text-xs font-medium">
                {liveMode ? "LIVE — writes enabled" : "SAFE — read-only tools"}
              </label>
            </div>
            <Button variant="outline" size="sm" onClick={() => call("seed_demo", {}, "seed")} disabled={!!busy}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Seed scenarios
            </Button>
            <Button size="sm" onClick={() => call("tick", { limit: 3, cycles: 2 }, "tick")} disabled={!!busy}>
              {busy === "tick" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
              Run heartbeat
            </Button>
            <Button variant="outline" size="sm" onClick={downloadManifest} disabled={!!busy}>
              <Download className="mr-1.5 h-4 w-4" /> Manifest
            </Button>
          </div>
        </header>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat icon={<Activity className="h-4 w-4" />} label="Open missions" value={String(stats.open)} />
          <Stat icon={<Bot className="h-4 w-4" />} label="Agents online" value={String(agents.filter(a => a.status === "active").length)} />
          <Stat icon={<Users className="h-4 w-4" />} label="Pipeline value" value={`$${stats.pipelineValue.toLocaleString()}`} />
          <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Autonomy rate" value={`${stats.autonomy}%`} />
          <Stat icon={<TriangleAlert className="h-4 w-4" />} label="Human needed" value={String(stats.escalated)} tone={stats.escalated ? "text-destructive" : undefined} />
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="org">Org chart</TabsTrigger>
            <TabsTrigger value="bus">Dialogue bus</TabsTrigger>
            <TabsTrigger value="policy">Policy envelope</TabsTrigger>
            <TabsTrigger value="deploy">Deploy anywhere</TabsTrigger>
          </TabsList>

          {/* ---------------- PIPELINE ---------------- */}
          <TabsContent value="pipeline" className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1">
                  <label className="text-xs text-muted-foreground">New opportunity</label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. JFK→LHR business class, 2 pax, October" />
                </div>
                <div className="min-w-[240px] flex-1">
                  <label className="text-xs text-muted-foreground">Context (free text or JSON)</label>
                  <Input value={newPayload} onChange={(e) => setNewPayload(e.target.value)} placeholder='{"origin":"JFK","destination":"LHR"}' />
                </div>
                <Button
                  disabled={!newTitle.trim() || !!busy}
                  onClick={async () => {
                    let payload: any = {};
                    try { payload = newPayload ? JSON.parse(newPayload) : {}; } catch { payload = { note: newPayload }; }
                    await call("create_mission", { title: newTitle, payload, source: "console" }, "create");
                    setNewTitle(""); setNewPayload("");
                    toast.success("Mission opened — Scout owns it");
                  }}
                >
                  Open mission
                </Button>
              </div>
            </Card>

            <div className="grid gap-3 overflow-x-auto md:grid-cols-5 xl:grid-cols-10">
              {STAGES.map((stage) => (
                <div key={stage} className="min-w-[180px] space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide">{stage}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{byStage[stage]?.length ?? 0}</Badge>
                  </div>
                  <div className="space-y-2">
                    {(byStage[stage] ?? []).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelected(m.id === selected ? null : m.id)}
                        className={`w-full rounded-md border p-2 text-left text-xs transition hover:border-primary ${
                          selected === m.id ? "border-primary bg-primary/5" : "border-border bg-card"
                        } ${m.needs_human ? "ring-1 ring-destructive/50" : ""}`}
                      >
                        <div className="line-clamp-2 font-medium">{m.title}</div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{m.owner_agent ?? "—"}</span>
                          <span>${Number(m.expected_value ?? 0).toLocaleString()}</span>
                        </div>
                        {m.needs_human && (
                          <div className="mt-1 text-[10px] text-destructive">needs human</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedMission && (
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{selectedMission.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      stage <b>{selectedMission.stage}</b> · owner <b>{selectedMission.owner_agent}</b> · source {selectedMission.source ?? "—"}
                    </p>
                    {selectedMission.escalation_reason && (
                      <p className="mt-1 text-xs text-destructive">Escalation: {selectedMission.escalation_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => call("run_mission", { mission_id: selectedMission.id, cycles: 3 }, "run")}
                    >
                      {busy === "run" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                      Advance
                    </Button>
                    {selectedMission.needs_human && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await supabase.from("ao_missions")
                            .update({ needs_human: false, status: "open", escalation_reason: null })
                            .eq("id", selectedMission.id);
                          await load();
                        }}
                      >
                        Clear escalation
                      </Button>
                    )}
                  </div>
                </div>
                <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                  {JSON.stringify(selectedMission.payload ?? {}, null, 2)}
                </pre>
              </Card>
            )}
          </TabsContent>

          {/* ---------------- ORG ---------------- */}
          <TabsContent value="org">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((a) => (
                <Card key={a.id} className={`space-y-2 border p-4 ${DEPT_TONE[a.department] ?? ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{a.display_name}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{a.department}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">L{a.autonomy_level} autonomy</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.charter}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/15">strategist</Badge>
                    <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">executor</Badge>
                    {Object.entries(a.addons ?? {}).filter(([, v]) => v).map(([k]) => (
                      <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">tools: {(a.tools ?? []).join(", ") || "—"}</div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ---------------- BUS ---------------- */}
          <TabsContent value="bus">
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
                <span>{selected ? "Filtered to selected mission" : "All traffic"}</span>
                {selected && <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Show all</Button>}
              </div>
              <div className="max-h-[560px] space-y-1 overflow-auto p-3 font-mono text-[11px]">
                {missionDialogue.length === 0 && (
                  <p className="p-4 text-center text-muted-foreground">No dialogue yet — seed scenarios and run a heartbeat.</p>
                )}
                {missionDialogue.map((d) => (
                  <div key={d.id} className="rounded border border-border/50 px-2 py-1.5">
                    <span className="text-muted-foreground">{new Date(d.created_at).toLocaleTimeString()} </span>
                    <span className="font-semibold">{d.from_agent}</span>
                    {d.lobe && <span className={LOBE_TONE[d.lobe] ?? ""}>/{d.lobe}</span>}
                    {d.to_agent && <span className="text-muted-foreground"> → {d.to_agent}</span>}
                    <span className="text-muted-foreground"> [{d.kind}]</span>
                    <div className="whitespace-pre-wrap">{d.content}</div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ---------------- POLICY ---------------- */}
          <TabsContent value="policy">
            <div className="grid gap-3 md:grid-cols-2">
              {policies.map((p) => (
                <Card key={p.id} className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.label}</div>
                    <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "enforced" : "off"}</Badge>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                  <Textarea
                    className="font-mono text-xs"
                    rows={3}
                    defaultValue={JSON.stringify(p.value, null, 2)}
                    onBlur={async (e) => {
                      try {
                        const value = JSON.parse(e.target.value);
                        await supabase.from("ao_policies").update({ value }).eq("id", p.id);
                        toast.success(`${p.label} updated`);
                        load();
                      } catch { toast.error("Invalid JSON"); }
                    }}
                  />
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ---------------- DEPLOY ---------------- */}
          <TabsContent value="deploy">
            <Card className="space-y-4 p-6">
              <h3 className="text-lg font-semibold">Deploy this org into any business</h3>
              <p className="text-sm text-muted-foreground">
                The agency is described as data, not code. Export the manifest and any runtime that can
                (a) call an OpenAI-compatible chat endpoint, (b) persist rows, and (c) fire a cron heartbeat
                can stand up the same ten-agent organization. The pipeline stages, charters, toolsets and
                policy envelope all travel with it.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <Mini title="Agent contract" body="Every agent is a strategist lobe (judge) + executor lobe (act), sharing one charter and one policy envelope." />
                <Mini title="Governance" body="Dialogue OS routes missions, detects stalls, and escalates only when policy demands a human." />
                <Mini title="Portability" body="Swap the tool executor to rebind capabilities to another stack. Charters stay identical." />
              </div>
              <div className="rounded-md border p-3 font-mono text-xs">
                POST /functions/v1/agency-os<br />
                {"{ \"action\": \"create_mission\", \"title\": \"...\", \"payload\": { ... } }"}<br />
                {"{ \"action\": \"tick\" }   // cron this every 5 minutes for full autonomy"}
              </div>
              <Button onClick={downloadManifest} disabled={!!busy}>
                <Download className="mr-1.5 h-4 w-4" /> Export deployment manifest
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}

function Mini({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
