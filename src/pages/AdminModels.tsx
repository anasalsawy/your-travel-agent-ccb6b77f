import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity, Brain, Cpu, Gauge, Loader2, RefreshCw, Search, ShieldAlert, Sparkles, Zap } from "lucide-react";

type Model = {
  provider: string; model_id: string; display_name: string | null;
  model_class: string | null; context_length: number | null; is_gated: boolean; available: boolean;
};
type Health = {
  provider: string; model_id: string; ok_count: number; err_count: number; consecutive_errors: number;
  avg_latency_ms: number; last_error: string | null; last_status: number | null;
  cooldown_until: string | null; last_used_at: string | null;
};
type Settings = {
  auto_select: boolean; primary_provider: string; default_model: string | null;
  fallback_models: string[]; emergency_model: string; cooldown_seconds: number; max_attempts: number;
};

const call = async (action: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.functions.invoke("model-catalog", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data?.ok === false && data?.error) throw new Error(data.error);
  return data;
};

export default function AdminModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [ranked, setRanked] = useState<Array<{ model_id: string; score: number }>>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chain, setChain] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Say hello and name yourself.");
  const [testResult, setTestResult] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [roster, setRoster] = useState<any[] | null>(null);

  const load = useCallback(async (search?: string) => {
    try {
      const [list, rank, h, s] = await Promise.all([
        call("list", { search: search || undefined, limit: 400 }), call("rank", { limit: 15 }), call("health"), call("settings"),
      ]);
      setModels(list?.models ?? []);
      setConfigured(Boolean(list?.configured));
      setSettings(list?.settings ?? s?.settings ?? null);
      setRanked(rank?.ranked ?? []);
      setHealth(h?.health ?? []);
      setChain(s?.chain ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live view of the AI traffic organizer: what is driving, what is waiting.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await call("traffic");
        if (alive) setTraffic(r?.traffic ?? null);
      } catch { /* the readout never breaks the page */ }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { void load(query.trim() || undefined); }, 350);
    return () => clearTimeout(t);
  }, [query, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? models.filter((m) => m.model_id.toLowerCase().includes(q)) : models;
    return base.slice(0, 150);
  }, [models, query]);

  const healthOf = (id: string) => health.find((h) => h.model_id === id);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const save = (patch: Partial<Settings>) =>
    run("save", async () => {
      const r = await call("save", patch);
      setSettings(r.settings);
      toast.success("Router updated");
      await load();
    });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Cpu className="h-6 w-6 text-primary" /> Model Router
            </h1>
            <p className="text-sm text-muted-foreground">
              Featherless-first. Auto-selects the best healthy model and switches model automatically on error.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy === "refresh"} onClick={() => run("refresh", async () => {
              const r = await call("refresh");
              toast.success(`Catalog refreshed — ${r.count ?? 0} models`);
              await load();
            })}>
              {busy === "refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh catalog
            </Button>
            <Button variant="outline" size="sm" disabled={busy === "rollcall"} onClick={() => run("rollcall", async () => {
              const { data, error } = await supabase.functions.invoke("agent-health-tick", { body: { action: "roll_call" } });
              if (error) throw error;
              setRoster(data?.agents ?? []);
              toast.success(`Roll call — ${data?.ready ?? 0}/${data?.total ?? 0} agents answered`);
            })}>
              {busy === "rollcall" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Roll call
            </Button>
            <Button variant="outline" size="sm" disabled={busy === "heal"} onClick={() => run("heal", async () => {
              const { data, error } = await supabase.functions.invoke("agent-health-tick", { body: {} });
              if (error) throw error;
              toast.success(`Self-heal — ${data?.proven?.length ?? 0} proven models, ${data?.delegations_revived ?? 0} tasks revived`);
              await load();
            })}>
              {busy === "heal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              Self-heal
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              <Activity className="mr-2 h-4 w-4" /> Reload
            </Button>
          </div>
        </header>

        {!configured && (
          <Card className="border-destructive/50 bg-destructive/5 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" /> FEATHERLESS_API_KEY is not configured</div>
            <p className="mt-1 text-muted-foreground">The router is running on the emergency provider until the key is saved.</p>
          </Card>
        )}

        {roster && (
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <Brain className="h-4 w-4 text-primary" /> Roster liveness
              <Badge variant="secondary">{roster.filter((a) => a.ready).length}/{roster.length} answering</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {roster.map((a) => (
                <div key={a.agent} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.agent}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.served_by}</div>
                  </div>
                  <Badge variant={a.ready ? "secondary" : "destructive"}>{a.ready ? `${Math.round(a.latency_ms / 100) / 10}s` : "degraded"}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {traffic && (
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium"><Activity className="h-4 w-4 text-primary" /> Traffic organizer</div>
                <p className="text-sm text-muted-foreground">
                  Every model call crosses one global intersection, so the provider budget is never exceeded.
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div><div className="text-muted-foreground">In flight</div><div className="text-lg font-semibold">{traffic.in_flight ?? 0} / {traffic.budget ?? "-"} units</div></div>
                <div><div className="text-muted-foreground">Waiting</div><div className="text-lg font-semibold">{traffic.waiting ?? 0}</div></div>
              </div>
            </div>
            {Array.isArray(traffic.leases) && traffic.leases.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {traffic.leases.map((l: any, i: number) => (
                  <li key={i} className="truncate">▶ {l.holder} — {l.model} ({l.units}u)</li>
                ))}
              </ul>
            )}
            {Array.isArray(traffic.queue) && traffic.queue.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {traffic.queue.map((q: any, i: number) => (
                  <li key={i} className="truncate">⏳ {q.holder} waiting ({q.units}u)</li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Smart auto-select</div>
                <p className="text-xs text-muted-foreground">Rank by health, latency and capability</p>
              </div>
              <Switch checked={Boolean(settings?.auto_select)} onCheckedChange={(v) => save({ auto_select: v })} />
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Pinned default</div>
              <div className="truncate text-sm font-medium">{settings?.default_model ?? "auto (no pin)"}</div>
              {settings?.default_model && (
                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => save({ default_model: null })}>Unpin</Button>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Emergency model</div>
              <div className="truncate text-sm font-medium">{settings?.emergency_model}</div>
              <div className="text-xs text-muted-foreground">Attempts per call: {settings?.max_attempts}</div>
            </div>
          </div>
          {chain.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">Current failover chain:</span>
              {chain.map((c, i) => (
                <Badge key={c} variant={i === 0 ? "default" : "outline"} className="font-mono">{i + 1}. {c}</Badge>
              ))}
            </div>
          )}
        </Card>

        <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="models">All models ({models.length})</TabsTrigger>
            <TabsTrigger value="ranked">Auto ranking</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search all active Featherless models…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {filtered.map((m) => {
                const h = healthOf(m.model_id);
                const cooling = h?.cooldown_until && new Date(h.cooldown_until) > new Date();
                const pinned = settings?.default_model === m.model_id;
                return (
                  <div key={m.provider + m.model_id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${pinned ? "border-primary/60 bg-primary/5" : ""}`}>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm">{m.model_id}</div>
                      <div className="flex flex-wrap gap-1 pt-1 text-xs text-muted-foreground">
                        {m.model_class && <Badge variant="outline">{m.model_class}</Badge>}
                        {m.context_length ? <Badge variant="outline">{Math.round(m.context_length / 1024)}k ctx</Badge> : null}
                        {m.is_gated && <Badge variant="outline">gated</Badge>}
                        {cooling && <Badge variant="destructive">cooling down</Badge>}
                        {h && <span>{h.ok_count}✓ / {h.err_count}✗ · {h.avg_latency_ms}ms</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => run("t" + m.model_id, async () => {
                        const r = await call("test", { model: m.model_id, prompt: "ping" });
                        toast.success(`${r.served_by} · ${r.latency_ms}ms`);
                        await load();
                      })}>
                        {busy === "t" + m.model_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant={pinned ? "secondary" : "outline"} onClick={() => save({ default_model: pinned ? null : m.model_id })}>
                        {pinned ? "Pinned" : "Use"}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!filtered.length && <p className="p-6 text-center text-sm text-muted-foreground">No models cached yet — hit “Refresh catalog”.</p>}
            </div>
          </TabsContent>

          <TabsContent value="ranked">
            <Card className="divide-y">
              {ranked.map((r, i) => (
                <div key={r.model_id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-sm text-muted-foreground">#{i + 1}</span>
                    <span className="font-mono text-sm">{r.model_id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline"><Gauge className="mr-1 h-3 w-3" />{r.score.toFixed(1)}</Badge>
                    <Button size="sm" variant="outline" onClick={() => save({ default_model: r.model_id })}>Pin</Button>
                  </div>
                </div>
              ))}
              {!ranked.length && <p className="p-6 text-center text-sm text-muted-foreground">Nothing ranked yet.</p>}
            </Card>
          </TabsContent>

          <TabsContent value="health">
            <Card className="divide-y">
              {health.map((h) => (
                <div key={h.provider + h.model_id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-sm">{h.model_id}</span>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <Badge variant="outline">{h.provider}</Badge>
                      <Badge variant={h.consecutive_errors ? "destructive" : "secondary"}>{h.ok_count}✓ / {h.err_count}✗</Badge>
                      <span className="text-muted-foreground">{h.avg_latency_ms}ms</span>
                    </div>
                  </div>
                  {h.last_error && <p className="pt-1 text-xs text-destructive">{h.last_error.slice(0, 200)}</p>}
                </div>
              ))}
              {!health.length && <p className="p-6 text-center text-sm text-muted-foreground">No calls recorded yet.</p>}
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-3">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
            <Button disabled={busy === "test"} onClick={() => run("test", async () => {
              const r = await call("test", { prompt });
              setTestResult(r);
              toast.success(`Served by ${r.served_by}`);
              await load();
            })}>
              {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Run through router
            </Button>
            {testResult && (
              <Card className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge>{testResult.served_by}</Badge>
                  <Badge variant="outline">{testResult.provider}</Badge>
                  <Badge variant="outline">{testResult.latency_ms}ms</Badge>
                </div>
                <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(testResult.attempts, null, 2)}</pre>
                <pre className="overflow-auto rounded bg-muted p-3 text-xs">{testResult.content}</pre>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
