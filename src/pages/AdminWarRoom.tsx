import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Play, Pause, RotateCcw, Radio, Zap } from "lucide-react";
import { toast } from "sonner";

type Msg = { id: string; agent_name: string; role: string; content: string; addressed_to: string[] | null; created_at: string; meta: any };
type Task = { id: string; title: string; description: string | null; assignee: string; status: string; priority: number; created_by: string; result: string | null; created_at: string };
type Heartbeat = { agent_name: string; status_line: string | null; current_task_id: string | null; mood: string | null; last_beat_at: string };

const CHIEF = "chief-of-staff";
const ROSTER = [
  { name: CHIEF,              display: "Chief of Staff",    color: "hsl(0 84% 60%)",   emoji: "🎯", leader: true },
  { name: "internal-app-test-buildrunner", display: "Infra Authority", color: "hsl(224 76% 58%)", emoji: "🛡️" },
  { name: "assistant",        display: "Concierge",         color: "hsl(199 89% 48%)", emoji: "💬" },
  { name: "YTA-ASSISTANT",    display: "Booking Delegate",  color: "hsl(262 83% 58%)", emoji: "✈️" },
  { name: "BUILDEROFAGENTS",  display: "Master Builder",    color: "hsl(217 91% 60%)", emoji: "🏗️" },
  { name: "shopper-lead",     display: "Shopper Chief",     color: "hsl(38 92% 50%)",  emoji: "🛒" },
  { name: "shopper-helper-1", display: "Research",          color: "hsl(38 92% 65%)",  emoji: "🔍" },
  { name: "shopper-helper-2", display: "Tactical",          color: "hsl(38 92% 65%)",  emoji: "🧩" },
  { name: "shopper-helper-3", display: "Field Buyer",       color: "hsl(38 92% 65%)",  emoji: "💳" },
];
const AGENT_MAP = Object.fromEntries(ROSTER.map((a) => [a.name, a]));
const TICK_MS = 15000;

function agentMeta(name: string) {
  return AGENT_MAP[name] ?? { name, display: name, color: "hsl(215 20% 65%)", emoji: "🤖" };
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}

function statusDot(hb: Heartbeat | undefined): { color: string; label: string } {
  if (!hb) return { color: "bg-muted", label: "offline" };
  const age = (Date.now() - new Date(hb.last_beat_at).getTime()) / 1000;
  if (age < 30) return { color: "bg-emerald-500", label: "live" };
  if (age < 120) return { color: "bg-amber-500", label: "idle " + Math.floor(age) + "s" };
  return { color: "bg-red-500", label: "stale " + Math.floor(age / 60) + "m" };
}

export default function AdminWarRoom() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [beats, setBeats] = useState<Heartbeat[]>([]);
  const [input, setInput] = useState("");
  const [autoTick, setAutoTick] = useState(true);
  const [ticking, setTicking] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  const refreshRoom = useCallback(async (silent = true) => {
    const [m, t, h] = await Promise.all([
      supabase.from("war_room_messages").select("*").order("created_at", { ascending: true }).limit(200),
      supabase.from("war_room_tasks").select("*").order("priority").order("created_at", { ascending: false }),
      supabase.from("war_room_heartbeats").select("*"),
    ]);
    if (m.error || t.error || h.error) {
      if (!silent) toast.error("Failed to refresh war room");
      return;
    }
    setMessages((m.data ?? []) as Msg[]);
    setTasks((t.data ?? []) as Task[]);
    setBeats((h.data ?? []) as Heartbeat[]);
  }, []);

  // Load + realtime
  useEffect(() => {
    refreshRoom(false);

    const ch = supabase
      .channel("war-room-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "war_room_messages" }, (p: any) => {
        if (p.eventType === "INSERT") {
          setMessages((prev) => [...prev, p.new as Msg]);
          return;
        }
        refreshRoom(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "war_room_tasks" }, () => {
        refreshRoom(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "war_room_heartbeats" }, () => {
        refreshRoom(true);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          refreshRoom(true);
        }
      });
    const poll = setInterval(() => { refreshRoom(true); }, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [refreshRoom]);

  // Refresh relative timestamps
  useEffect(() => {
    const i = setInterval(() => forceRender((n) => n + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // Autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Autotick — Chief runs a cycle every N seconds
  useEffect(() => {
    if (!autoTick) return;
    let inFlight = false;
    const run = async () => {
      if (inFlight) return;
      inFlight = true;
      setTicking(true);
      try {
        const { error } = await supabase.functions.invoke("war-room", { body: { action: "tick" } });
        if (error) toast.error(error.message ?? "Tick failed");
      } catch (e: any) {
        toast.error(e?.message ?? "Tick failed");
      } finally {
        setTicking(false);
        inFlight = false;
        refreshRoom(true);
      }
    };
    void run();
    const i = setInterval(run, TICK_MS);
    return () => clearInterval(i);
  }, [autoTick, refreshRoom]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("war-room", {
        body: { action: "post", agent_name: "You", content: text, role: "user" },
      });
      if (error) throw error;
      setInput("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const kickTick = async () => {
    setTicking(true);
    try {
      const { error } = await supabase.functions.invoke("war-room", { body: { action: "tick" } });
      if (error) throw error;
    } catch (e: any) { toast.error(e.message); }
    finally {
      setTicking(false);
      refreshRoom(true);
    }
  };

  const resetRoom = async () => {
    if (!confirm("Wipe all room messages, tasks, and heartbeats?")) return;
    const { error } = await supabase.functions.invoke("war-room", { body: { action: "reset" } });
    if (error) {
      toast.error(error.message ?? "Failed to reset room");
      return;
    }
    await refreshRoom(true);
    toast.success("Room reset");
  };

  const beatMap = useMemo(() => Object.fromEntries(beats.map((b) => [b.agent_name, b])), [beats]);
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done").slice(0, 8);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-red-500 animate-pulse" />
          <div>
            <h1 className="text-xl font-bold">War Room</h1>
            <p className="text-xs text-muted-foreground">One channel · all main agents · Chief of Staff coordinates · heartbeats every ~{TICK_MS / 1000}s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={autoTick ? "default" : "outline"} onClick={() => setAutoTick((x) => !x)}>
            {autoTick ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {autoTick ? "Auto ON" : "Auto OFF"}
          </Button>
          <Button size="sm" variant="outline" onClick={kickTick} disabled={ticking}>
            {ticking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
            Tick now
          </Button>
          <Button size="sm" variant="ghost" onClick={resetRoom}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[260px_1fr_320px] overflow-hidden">
        {/* Roster */}
        <div className="border-r p-3 overflow-y-auto space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Roster</div>
          {ROSTER.map((a) => {
            const hb = beatMap[a.name];
            const dot = statusDot(hb);
            const myTasks = openTasks.filter((t) => t.assignee === a.name).length;
            return (
              <Card key={a.name} className={"p-2.5 " + (a.leader ? "border-red-500/60 bg-red-500/5" : "")}>
                <div className="flex items-start gap-2">
                  <div className="text-lg leading-none mt-0.5">{a.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={"h-2 w-2 rounded-full " + dot.color} />
                      <span className="text-sm font-medium truncate">{a.display}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{a.name}</div>
                    <div className="text-[11px] mt-1 text-muted-foreground line-clamp-2 min-h-[28px]">
                      {hb?.status_line ?? <span className="italic">no status yet</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{dot.label}</Badge>
                      {myTasks > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{myTasks} task{myTasks > 1 ? "s" : ""}</Badge>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Transcript + composer */}
        <div className="flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm mt-20">
                Room is quiet. Post an order or press <span className="font-medium">Tick now</span> to wake the Chief.
              </div>
            )}
            {messages.map((m) => {
              const meta = agentMeta(m.agent_name);
              const isUser = m.agent_name === "You";
              const isChief = m.agent_name === CHIEF;
              const isError = m.role === "error";
              return (
                <div key={m.id} className={"flex gap-2 " + (isUser ? "justify-end" : "")}>
                  {!isUser && (
                    <div className="text-lg leading-none mt-1 flex-shrink-0">{meta.emoji}</div>
                  )}
                  <div className={"max-w-[75%] rounded-lg px-3 py-2 border " + (
                    isUser ? "bg-primary text-primary-foreground border-primary" :
                    isChief ? "bg-red-500/10 border-red-500/40" :
                    isError ? "bg-destructive/10 border-destructive/40" :
                    "bg-card border-border"
                  )}>
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={!isUser && !isChief ? { color: meta.color } : undefined}>
                        {meta.display}
                      </span>
                      {m.addressed_to && m.addressed_to.length > 0 && (
                        <span className="text-[10px] opacity-70">→ {m.addressed_to.map((n) => agentMeta(n).display).join(", ")}</span>
                      )}
                      <span className="text-[10px] opacity-60 ml-auto">{relTime(m.created_at)}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Speak to the room (Chief will route it)…"
                className="min-h-[60px] resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
              />
              <Button onClick={send} disabled={sending || !input.trim()} className="self-stretch">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">⌘/Ctrl + Enter to send</div>
          </div>
        </div>

        {/* Task board */}
        <div className="border-l p-3 overflow-y-auto space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open tasks · {openTasks.length}</div>
            </div>
            {openTasks.length === 0 && <div className="text-xs text-muted-foreground italic">no open tasks</div>}
            <div className="space-y-1.5">
              {openTasks.map((t) => {
                const a = agentMeta(t.assignee);
                return (
                  <Card key={t.id} className="p-2">
                    <div className="flex items-start gap-1.5">
                      <Badge variant={t.status === "doing" ? "default" : "outline"} className="text-[9px] px-1 py-0 h-4 mt-0.5">
                        {t.status}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium leading-tight">{t.title}</div>
                        <div className="text-[10px] mt-0.5 flex items-center gap-1">
                          <span>{a.emoji}</span>
                          <span className="text-muted-foreground">{a.display}</span>
                          <span className="text-muted-foreground ml-auto">p{t.priority}</span>
                        </div>
                      </div>
                    </div>
                    {t.description && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
                    <div className="flex gap-1 mt-1.5">
                      {t.status !== "doing" && (
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5"
                          onClick={() => supabase.functions.invoke("war-room", { body: { action: "task_update", id: t.id, status: "doing" } })}>
                          start
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5"
                        onClick={() => supabase.functions.invoke("war-room", { body: { action: "task_update", id: t.id, status: "done" } })}>
                        done
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
          {doneTasks.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent · done</div>
              <div className="space-y-1">
                {doneTasks.map((t) => (
                  <div key={t.id} className="text-[11px] text-muted-foreground line-through truncate">
                    ✓ {t.title} <span className="opacity-60">— {agentMeta(t.assignee).display}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
