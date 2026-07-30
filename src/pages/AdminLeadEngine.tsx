import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Radio, Play, LogIn, RefreshCw, Inbox } from "lucide-react";

type Lead = {
  id: string; headline: string; summary: string | null; priority: number;
  status: string; stage: string; channel: string; attempts: number; cadence_step: number;
  estimated_value: number | null; contact: any; itinerary: any;
  external_thread_id: string | null; next_action_at: string; last_contact_at: string | null;
  last_reply_at: string | null; mission_id: string | null; notes: string | null;
};
type Msg = { id: string; direction: string; channel: string; body: string; status: string; intent: string | null; created_at: string };
type Beat = { id: string; beat_at: string; ok: boolean; leads_touched: number; missions_touched: number; memory_ops: number; duration_ms: number | null };
type Session = { id: string; status: string; live_view_url: string | null; last_verified_at: string | null; last_error: string | null };

const statusTone: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  working: "bg-primary/15 text-primary",
  nurture: "bg-accent text-accent-foreground",
  escalated: "bg-destructive/15 text-destructive",
  blocked: "bg-destructive/15 text-destructive",
  won: "bg-primary text-primary-foreground",
  stopped: "bg-muted text-muted-foreground",
};

export default function AdminLeadEngine() {
  const { toast } = useToast();
  const [raw, setRaw] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [l, b, s] = await Promise.all([
      supabase.from("ao_leads").select("*").order("priority").order("next_action_at").limit(100),
      supabase.from("ao_runner_beats").select("*").order("beat_at", { ascending: false }).limit(20),
      supabase.from("ao_channel_sessions").select("*").eq("channel", "facebook").eq("label", "primary").maybeSingle(),
    ]);
    setLeads((l.data as Lead[]) ?? []);
    setBeats((b.data as Beat[]) ?? []);
    setSession((s.data as Session) ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("lead-engine")
      .on("postgres_changes", { event: "*", schema: "public", table: "ao_leads" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ao_runner_beats" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    supabase.from("ao_outreach").select("*").eq("lead_id", selected.id)
      .order("created_at", { ascending: true }).limit(100)
      .then(({ data }) => setThread((data as Msg[]) ?? []));
  }, [selected, leads]);

  const invoke = async (fn: string, body: any, label: string) => {
    setBusy(label);
    const { data, error } = await supabase.functions.invoke(fn, { body });
    setBusy(null);
    if (error) { toast({ title: label + " failed", description: error.message, variant: "destructive" }); return null; }
    await load();
    return data;
  };

  const intake = async () => {
    if (!raw.trim()) return;
    const d = await invoke("lead-intake", { raw_text: raw }, "Intake");
    if (d?.ok) { setRaw(""); toast({ title: `${d.created} lead(s) admitted`, description: "Outreach cadence started." }); }
    else if (d) toast({ title: "Nothing parsed", description: d.error, variant: "destructive" });
  };

  const connectFb = async () => {
    const d = await invoke("fb-session", { action: "connect" }, "Connect");
    if (d?.live_view_url) window.open(d.live_view_url, "_blank", "noopener");
  };

  const runnerOn = beats[0] && Date.now() - new Date(beats[0].beat_at).getTime() < 5 * 60 * 1000;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lead Engine</h1>
          <p className="text-muted-foreground text-sm">Autonomous intake, outreach and follow-up — governed, evidenced, never asleep.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={runnerOn ? "default" : "secondary"} className="gap-1">
            <Radio className={`h-3 w-3 ${runnerOn ? "animate-pulse" : ""}`} />
            {runnerOn ? "Runner live" : "Runner idle"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => invoke("runner-24x7", { mode: "safe" }, "Beat")} disabled={busy === "Beat"}>
            {busy === "Beat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Beat now
          </Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Paste leads</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={7} value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder={"Paste anything — a Facebook group thread, a DM, a numbered list of opportunities…"} />
            <div className="flex justify-end">
              <Button onClick={intake} disabled={busy === "Intake" || !raw.trim()}>
                {busy === "Intake" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Admit leads
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Facebook identity</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={session?.status === "connected" ? "default" : "secondary"}>{session?.status ?? "not set up"}</Badge>
            </div>
            {session?.last_verified_at && (
              <p className="text-xs text-muted-foreground">Verified {new Date(session.last_verified_at).toLocaleString()}</p>
            )}
            {session?.last_error && <p className="text-xs text-destructive">{session.last_error}</p>}
            <p className="text-xs text-muted-foreground">
              Log in once inside the live browser window. The profile persists, so the agents keep the session forever without storing your password.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={connectFb} disabled={busy === "Connect"}>
                {busy === "Connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />} Open login
              </Button>
              <Button size="sm" variant="outline" onClick={() => invoke("fb-session", { action: "verify" }, "Verify")} disabled={busy === "Verify"}>
                {busy === "Verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
              {session?.live_view_url && (
                <Button size="sm" variant="ghost" onClick={() => window.open(session.live_view_url!, "_blank", "noopener")}>Live view</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline ({leads.length})</TabsTrigger>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="heartbeat">Heartbeat</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px]">
                {leads.length === 0 && <p className="p-6 text-sm text-muted-foreground">No leads yet — paste some above.</p>}
                {leads.map((l) => (
                  <button key={l.id} onClick={() => setSelected(l)}
                    className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selected?.id === l.id ? "bg-muted/60" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.headline}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.summary}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded px-2 py-0.5 text-xs ${statusTone[l.status] ?? "bg-muted text-muted-foreground"}`}>{l.status}</span>
                        <span className="text-xs text-muted-foreground">P{l.priority} · {l.estimated_value ? `$${l.estimated_value}` : "—"}</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      step {l.cadence_step} · next {new Date(l.next_action_at).toLocaleString()} · {l.channel}
                      {l.notes ? ` · ${l.notes}` : ""}
                    </p>
                  </button>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversation" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{selected ? selected.headline : "Select a lead"}</CardTitle>
              {selected && (
                <Button size="sm" variant="outline" onClick={() => invoke("outreach-tick", { limit: 1 }, "Outreach")} disabled={busy === "Outreach"}>
                  {busy === "Outreach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="mr-2 h-4 w-4" />} Work due leads
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[460px] pr-4">
                {thread.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                <div className="space-y-3">
                  {thread.map((m) => (
                    <div key={m.id} className={`rounded-lg border p-3 text-sm ${m.direction === "out" ? "bg-muted/40" : "bg-background"}`}>
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{m.direction === "out" ? "Maya" : "Customer"}</span>
                        <span>· {m.channel}</span>
                        {m.intent && <span>· {m.intent}</span>}
                        <span>· {new Date(m.created_at).toLocaleString()}</span>
                        {m.status === "failed" && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heartbeat" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[420px]">
                {beats.map((b) => (
                  <div key={b.id} className="flex items-center justify-between border-b px-4 py-2 text-sm">
                    <span className="text-muted-foreground">{new Date(b.beat_at).toLocaleString()}</span>
                    <span className="flex items-center gap-3 text-xs">
                      <span>{b.leads_touched} leads</span>
                      <span>{b.missions_touched} missions</span>
                      <span>{b.memory_ops} memory</span>
                      <span>{b.duration_ms ?? 0}ms</span>
                      <Badge variant={b.ok ? "secondary" : "destructive"}>{b.ok ? "ok" : "issue"}</Badge>
                    </span>
                  </div>
                ))}
                {beats.length === 0 && <p className="p-6 text-sm text-muted-foreground">No heartbeats recorded yet.</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
