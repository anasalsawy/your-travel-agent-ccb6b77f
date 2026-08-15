import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneOff, Radio, Send, Delete } from "lucide-react";
import { toast } from "sonner";

type Call = {
  id: string;
  agent_name: string;
  phone_number: string;
  goal: string | null;
  status: string;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
};

type Event = { id: string; call_id: string; role: string; content: string; at: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  dialing: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  ended: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

function since(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function AdminCallCenter() {
  const [number, setNumber] = useState("+1");
  const [goal, setGoal] = useState("Introduce Your Travel Agent, qualify the trip they want, and book a follow-up.");
  const [calls, setCalls] = useState<Call[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => calls.find((c) => c.id === activeId) ?? null, [calls, activeId]);
  const live = useMemo(() => calls.filter((c) => c.status === "active" || c.status === "dialing"), [calls]);

  const loadCalls = useCallback(async () => {
    const { data } = await supabase
      .from("vapi_calls").select("*").order("started_at", { ascending: false }).limit(60);
    setCalls((data ?? []) as Call[]);
  }, []);

  useEffect(() => {
    loadCalls();
    const t = setInterval(loadCalls, 4000);
    return () => clearInterval(t);
  }, [loadCalls]);

  useEffect(() => {
    if (!activeId) { setEvents([]); return; }
    let stop = false;
    const pull = async () => {
      const { data } = await supabase
        .from("vapi_call_events").select("*").eq("call_id", activeId).order("at");
      if (!stop) setEvents((data ?? []) as Event[]);
    };
    pull();
    const t = setInterval(pull, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  async function dial() {
    if (!/^\+\d{7,15}$/.test(number)) return toast.error("Use E.164 format, e.g. +17134698336");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("vapi-call-start", {
      body: { agent: "call-center", number, goal },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Dialing " + number);
    if ((data as any)?.call_id) setActiveId((data as any).call_id);
    loadCalls();
  }

  async function hangup(id: string) {
    await supabase.functions.invoke("vapi-call-hangup", { body: { call_id: id } });
    toast("Hangup sent");
    loadCalls();
  }

  async function inject() {
    if (!steer.trim() || !activeId) return;
    await supabase.functions.invoke("vapi-call-inject", { body: { call_id: activeId, content: steer } });
    setSteer("");
    toast("Steered");
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <Radio className="h-5 w-5 animate-pulse text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Call Center</h1>
          <p className="text-xs text-muted-foreground">
            Phone agent — dial, listen, steer mid-call, and review every conversation.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">{live.length} live</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr_300px]">
        {/* Dialer */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Dialer</h2>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+1713..." className="text-lg tracking-wider" />
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <Button key={k} variant="outline" onClick={() => setNumber((n) => n + k)}>{k}</Button>
            ))}
            <Button variant="ghost" className="col-span-3" onClick={() => setNumber((n) => n.slice(0, -1) || "+")}>
              <Delete className="mr-2 h-4 w-4" /> Backspace
            </Button>
          </div>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="Call goal" className="text-xs" />
          <Button className="w-full" disabled={busy} onClick={dial}>
            <Phone className="mr-2 h-4 w-4" /> {busy ? "Dialing…" : "Call"}
          </Button>
        </Card>

        {/* Live transcript */}
        <Card className="flex h-[70vh] flex-col p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {active ? `${active.phone_number} · ${active.agent_name}` : "No call selected"}
            </h2>
            {active && (
              <Badge variant="outline" className={statusTone[active.status] ?? ""}>{active.status}</Badge>
            )}
            {active && (active.status === "active" || active.status === "dialing") && (
              <Button size="sm" variant="destructive" className="ml-auto" onClick={() => hangup(active.id)}>
                <PhoneOff className="mr-2 h-4 w-4" /> Hang up
              </Button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {active ? "Waiting for the first words…" : "Pick a call on the right, or dial one."}
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className="rounded-md border border-border/60 bg-muted/30 p-2 text-sm">
                <span className="mr-2 text-[10px] uppercase tracking-wide text-muted-foreground">{e.role}</span>
                {e.content}
              </div>
            ))}
          </div>

          {active && active.status !== "ended" && (
            <div className="mt-3 flex gap-2">
              <Input
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && inject()}
                placeholder="Whisper an instruction to the agent mid-call…"
              />
              <Button onClick={inject}><Send className="h-4 w-4" /></Button>
            </div>
          )}
        </Card>

        {/* Calls */}
        <Card className="h-[70vh] overflow-hidden p-0">
          <Tabs defaultValue="live" className="flex h-full flex-col">
            <TabsList className="m-2 grid grid-cols-2">
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="live" className="flex-1 overflow-y-auto px-2 pb-2">
              {live.length === 0 && <p className="p-2 text-xs text-muted-foreground">No calls in progress.</p>}
              {live.map((c) => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className="mb-2 w-full rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-left text-sm">
                  <div className="font-medium">{c.phone_number}</div>
                  <div className="text-xs text-muted-foreground">{c.status} · {since(c.started_at)}</div>
                </button>
              ))}
            </TabsContent>
            <TabsContent value="history" className="flex-1 overflow-y-auto px-2 pb-2">
              {calls.map((c) => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className="mb-2 w-full rounded-md border border-border p-2 text-left text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.phone_number}</span>
                    <Badge variant="outline" className={`ml-auto text-[10px] ${statusTone[c.status] ?? ""}`}>{c.status}</Badge>
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{c.summary || c.goal || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{since(c.started_at)} ago</div>
                </button>
              ))}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
