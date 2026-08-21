import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Phone, PhoneOff, Radio, Send, Delete, Headphones, Megaphone, EarOff, Hash, UserPlus, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  AGENCY_DIRECTORY, CALL_STATES, buildCallScript, ivrPlanFor, type BookingBrief,
} from "@/lib/booking-call-script";

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

type Event = {
  id: string; call_id: string; role: string; content: string; at: string;
  meta?: { monitor_url?: string; mode?: string; event?: string; partial?: boolean } | null;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  dialing: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  ended: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

const roleTone: Record<string, string> = {
  user: "border-primary/30 bg-primary/5",
  assistant: "border-emerald-500/30 bg-emerald-500/5",
  steer: "border-sky-500/40 bg-sky-500/10",
  tool: "border-amber-500/30 bg-amber-500/5",
  system: "border-border bg-muted/30",
  error: "border-destructive/40 bg-destructive/10",
};

function since(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function AdminCallCenter() {
  const [number, setNumber] = useState("+1");
  const [goal, setGoal] = useState(
    "Introduce Your Travel Agent, qualify the trip they want, and book a follow-up."
  );
  const [brief, setBrief] = useState<BookingBrief>({
    airline: "Alaska Airlines",
    trip: "",
    traveler: "",
    payment: "",
  });

  const [calls, setCalls] = useState<Call[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [steer, setSteer] = useState("");
  const [state, setState] = useState<string>("PRECALL_VALIDATED");
  const [busy, setBusy] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const active = useMemo(() => calls.find((c) => c.id === activeId) ?? null, [calls, activeId]);
  const live = useMemo(() => calls.filter((c) => c.status === "active" || c.status === "dialing"), [calls]);
  const isLive = !!active && (active.status === "active" || active.status === "dialing");
  const script = useMemo(() => buildCallScript(brief), [brief]);
  const monitorUrl = useMemo(
    () => [...events].reverse().find((e) => typeof e?.meta?.monitor_url === "string")?.meta?.monitor_url ?? null,
    [events]
  );

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

  // Live transcript — realtime stream with a polling safety net.
  useEffect(() => {
    if (!activeId) { setEvents([]); return; }
    let stop = false;
    const pull = async () => {
      const { data } = await supabase
        .from("vapi_call_events").select("*").eq("call_id", activeId).order("at");
      if (!stop) setEvents((data ?? []) as Event[]);
    };
    pull();
    const ch = supabase
      .channel("cc-events-" + activeId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "vapi_call_events", filter: "call_id=eq." + activeId },
        (payload) => setEvents((prev) =>
          prev.some((e) => e.id === (payload.new as Event).id) ? prev : [...prev, payload.new as Event]))
      .subscribe();
    const t = setInterval(pull, 4000);
    return () => { stop = true; clearInterval(t); supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  async function call(fn: string, body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error || (data as any)?.ok === false) {
        throw new Error((data as any)?.error ?? error?.message ?? "Request failed");
      }
      if (ok) toast.success(ok);
      return data as any;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function dial(target?: string, mission?: string, agent = "call-center") {
    const n = target ?? number;
    if (!/^\+\d{7,15}$/.test(n)) return toast.error("Use E.164 format, e.g. +17134698336");
    const data = await call("vapi-call-start", { agent, number: n, goal: mission ?? goal }, "Dialing " + n);
    if (data?.call_id) { setActiveId(data.call_id); setState("DIALING"); }
    loadCalls();
  }

  function dialBooking() {
    const n = AGENCY_DIRECTORY[brief.airline];
    if (!n) return toast.error("Unknown airline");
    if (!brief.traveler.trim() || !brief.trip.trim()) {
      return toast.error("Trip details and traveler details are required before dialing.");
    }
    dial(n, script, "booking-caller");
  }


  async function hangup(id: string) {
    await call("vapi-call-hangup", { call_id: id }, "Hangup sent");
    setState("COMPLETE");
    loadCalls();
  }

  async function inject(mode: "whisper" | "say") {
    const msg = steer.trim();
    if (!msg || !activeId) return;
    setSteer("");
    await call("vapi-call-inject", { call_id: activeId, message: msg, mode },
      mode === "say" ? "Agent will say it verbatim" : "Whispered to the agent");
  }

  async function sendDtmf(digits: string) {
    if (!activeId) return toast.error("No live call selected");
    await call("vapi-call-dtmf", { call_id: activeId, digits }, "DTMF " + digits);
    setState("IVR");
  }

  async function handoff() {
    if (!activeId) return toast.error("No live call selected");
    const dest = extractPhone(brief.traveler);
    if (!dest) return toast.error("Add the traveler's phone number in Traveler details first");
    await call("vapi-call-transfer", { call_id: activeId, destination: dest },
      "Transferring to traveler for secure payment");
    setState("SECURE_PAYMENT");
  }


  async function listenLive() {
    if (!activeId) return;
    if (monitoring) { audioRef.current?.pause(); setMonitoring(false); return; }
    let url = monitorUrl;
    if (!url) {
      const data = await call("vapi-call-monitor", { call_id: activeId });
      url = typeof data?.monitor_url === "string" ? data.monitor_url : null;
    }
    if (!url) return toast.info("No live audio monitor available for this call.");
    if (!/\.(mp3|wav|ogg|m4a|aac|webm|m3u8)(\?.*)?$/i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setMonitoring(true);
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <Radio className="h-5 w-5 animate-pulse text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Booking Call Center</h1>
          <p className="text-xs text-muted-foreground">
            Dial airlines and agencies, follow the live transcript, whisper, steer, navigate IVR and hand off for payment.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">{live.length} live</Badge>
      </header>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr_300px]">
        {/* Left: dialer + booking brief */}
        <Card className="p-0">
          <Tabs defaultValue="booking" className="flex flex-col">
            <TabsList className="m-2 grid grid-cols-2">
              <TabsTrigger value="booking">Booking call</TabsTrigger>
              <TabsTrigger value="dialer">Dialer</TabsTrigger>
            </TabsList>

            <TabsContent value="booking" className="space-y-3 px-4 pb-4">
              <div className="space-y-1">
                <Label className="text-xs">Airline</Label>
                <Select value={brief.airline} onValueChange={(v) => setBrief({ ...brief, airline: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72 bg-popover">
                    {Object.keys(AGENCY_DIRECTORY).map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">{AGENCY_DIRECTORY[brief.airline]}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trip details</Label>
                <Textarea rows={3} className="text-xs" value={brief.trip}
                  onChange={(e) => setBrief({ ...brief, trip: e.target.value })}
                  placeholder={"IAH → CAI, depart Sep 12 2026, return Sep 30 2026\n1 adult, economy, 2 checked bags, aisle seat"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Traveler details</Label>
                <Textarea rows={3} className="text-xs" value={brief.traveler}
                  onChange={(e) => setBrief({ ...brief, traveler: e.target.value })}
                  placeholder={"ANAS ALSAWY, DOB 1985-04-02, male\nPassport A1234567 (USA), +1 713 469 8336, anas@email.com"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment details</Label>
                <Textarea rows={3} className="text-xs" value={brief.payment}
                  onChange={(e) => setBrief({ ...brief, payment: e.target.value })}
                  placeholder={"Visa 4124 8821 9003 1174, exp 09/28, CVV 123\nName on card ANAS ALSAWY, billing ZIP 77002"} />
              </div>

              <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium">
                  <FileText className="h-3 w-3" /> IVR plan
                </p>
                <ol className="list-inside list-decimal space-y-0.5 text-[11px] text-muted-foreground">
                  {ivrPlanFor(brief.airline).map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>


              <Button className="w-full" disabled={busy} onClick={dialBooking}>
                <Phone className="mr-2 h-4 w-4" /> Start booking call
              </Button>
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Preview generated script</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[10px]">{script}</pre>
              </details>
            </TabsContent>

            <TabsContent value="dialer" className="space-y-3 px-4 pb-4">
              <Input value={number} onChange={(e) => setNumber(e.target.value)}
                placeholder="+1713..." className="text-lg tracking-wider" />
              <div className="grid grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <Button key={k} variant="outline" onClick={() => setNumber((n) => n + k)}>{k}</Button>
                ))}
                <Button variant="ghost" className="col-span-3" onClick={() => setNumber((n) => n.slice(0, -1) || "+")}>
                  <Delete className="mr-2 h-4 w-4" /> Backspace
                </Button>
              </div>
              <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
                placeholder="Call goal" className="text-xs" />
              <Button className="w-full" disabled={busy} onClick={() => dial()}>
                <Phone className="mr-2 h-4 w-4" /> {busy ? "Working…" : "Call"}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Center: live transcript + controls */}
        <Card className="flex h-[78vh] flex-col p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">
              {active ? `${active.phone_number} · ${active.agent_name}` : "No call selected"}
            </h2>
            {active && (
              <Badge variant="outline" className={statusTone[active.status] ?? ""}>{active.status}</Badge>
            )}
            {isLive && (
              <>
                <Button size="sm" variant="outline" onClick={listenLive} disabled={busy}>
                  {monitoring ? <EarOff className="mr-1 h-3 w-3" /> : <Headphones className="mr-1 h-3 w-3" />}
                  {monitoring ? "Stop audio" : "Hear live"}
                </Button>
                <Button size="sm" variant="outline" onClick={handoff} disabled={busy}>
                  <UserPlus className="mr-1 h-3 w-3" /> Handoff
                </Button>
                <Button size="sm" variant="destructive" className="ml-auto" onClick={() => hangup(active!.id)} disabled={busy}>
                  <PhoneOff className="mr-1 h-3 w-3" /> Hang up
                </Button>
              </>
            )}
          </div>

          {/* State machine ledger */}
          <div className="mb-3 flex flex-wrap gap-1">
            {CALL_STATES.map((s) => (
              <button key={s} onClick={() => setState(s)}
                className={`rounded border px-1.5 py-0.5 text-[9px] tracking-wide transition-colors ${
                  s === state ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                }`}>
                {s}
              </button>
            ))}
          </div>

          <audio ref={audioRef} hidden onEnded={() => setMonitoring(false)} />

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {active ? "Waiting for the first words…" : "Pick a call on the right, or start one."}
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className={`rounded-md border p-2 text-sm ${roleTone[e.role] ?? roleTone.system}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{e.role}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                </div>
                <div className={`whitespace-pre-wrap ${e.meta?.partial ? "italic opacity-70" : ""}`}>{e.content}</div>
              </div>
            ))}
          </div>

          {isLive && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && inject("whisper")}
                  placeholder="Whisper an instruction (agent rephrases) or say it verbatim…"
                />
                <Button variant="outline" onClick={() => inject("whisper")} disabled={busy || !steer.trim()}>
                  <Send className="mr-1 h-4 w-4" /> Whisper
                </Button>
                <Button onClick={() => inject("say")} disabled={busy || !steer.trim()}>
                  <Megaphone className="mr-1 h-4 w-4" /> Say
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Hash className="h-3 w-3" /> DTMF
                </span>
                {KEYS.map((k) => (
                  <Button key={k} size="sm" variant="outline" className="h-7 w-8 p-0 text-xs"
                    onClick={() => sendDtmf(k)} disabled={busy}>
                    {k}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Right: calls */}
        <Card className="h-[78vh] overflow-hidden p-0">
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
