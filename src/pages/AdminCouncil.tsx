import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Radio, Users, GitBranch, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

type Msg = { id: string; speaker: string; role: string; content: string; created_at: string };
type Agent = { agent_key: string; display_name: string; department: string; status?: string; model?: string };
type Beat = { agent_name: string; status_line: string; mood: string; last_beat_at: string };
type Deleg = {
  id: string; from_agent: string; to_agent: string; directive: string;
  status: string; attempts: number; result: string | null; created_at: string;
};
type Chat = { id: string; speaker: string; content: string; kind: string; created_at: string; room_id: string };

const CHIEF_ROOM = "Direct line — Chief of Staff";

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

const statusTone = (s: string) =>
  s === "done" || s === "completed" ? "text-emerald-500"
  : s === "failed" || s === "cancelled" ? "text-destructive"
  : s === "running" || s === "in_progress" ? "text-primary"
  : "text-muted-foreground";

export default function AdminCouncil() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState(CHIEF_ROOM);
  const [participants, setParticipants] = useState<string[]>(["chief"]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<"agents" | "delegations" | "chatter">("agents");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [delegations, setDelegations] = useState<Deleg[]>([]);
  const [chatter, setChatter] = useState<Chat[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("dialogue-room", { body });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error ?? "request failed");
    return data;
  }, []);

  const openRoom = useCallback(async (id: string) => {
    const d = await call({ action: "history", room_id: id });
    setRoomId(id);
    setRoomTitle(d.room?.title ?? "Room");
    setParticipants(d.room?.participants ?? []);
    setMessages(d.messages ?? []);
  }, [call]);

  const refreshFeed = useCallback(async () => {
    try {
      const d = await call({ action: "warroom" });
      setAgents(d.agents ?? []);
      setBeats(d.heartbeats ?? []);
      setDelegations(d.delegations ?? []);
      setChatter(d.chatter ?? []);
    } catch { /* feed is best-effort */ }
  }, [call]);

  useEffect(() => {
    (async () => {
      try {
        const d = await call({ action: "rooms" });
        const found = (d.rooms ?? []).find((r: { title: string }) => r.title === CHIEF_ROOM);
        if (found) await openRoom(found.id);
        else {
          const c = await call({
            action: "create",
            title: CHIEF_ROOM,
            goal: "Standing direct line between the operator and the Chief of Staff. Answer, delegate to any agent, and report back.",
            mode: "full",
            participants: ["chief"],
          });
          await openRoom(c.room.id);
        }
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBooting(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    })();
    refreshFeed();
  }, [call, openRoom, refreshFeed]);

  useEffect(() => {
    const t = setInterval(() => {
      refreshFeed();
      if (roomId) openRoom(roomId).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [roomId, openRoom, refreshFeed]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const beatFor = useMemo(() => {
    const m: Record<string, Beat> = {};
    for (const b of beats) if (!m[b.agent_name]) m[b.agent_name] = b;
    return m;
  }, [beats]);

  const agentName = useCallback(
    (key: string) => agents.find((a) => a.agent_key === key)?.display_name ?? key,
    [agents],
  );

  const bringIn = async (key: string) => {
    if (!roomId || participants.includes(key)) return;
    try {
      await call({ action: "invite", room_id: roomId, participants: [key] });
      await openRoom(roomId);
      setText("@" + key + " ");
      inputRef.current?.focus();
      toast.success(agentName(key) + " joined the room");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const send = async () => {
    if (!roomId || !text.trim() || sending) return;
    const mine = text.trim();
    setText("");
    setSending(true);
    setMessages((m) => [
      ...m,
      { id: "tmp-" + Date.now(), speaker: "you", role: "human", content: mine, created_at: new Date().toISOString() },
    ]);
    try {
      const d = await call({ action: "say", room_id: roomId, text: mine });
      setMessages(d.messages ?? []);
      refreshFeed();
    } catch (e) {
      toast.error((e as Error).message);
      setText(mine);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 animate-pulse text-destructive" />
          <div>
            <h1 className="text-xl font-bold">War Room</h1>
            <p className="text-xs text-muted-foreground">
              {roomTitle} · in the room: {participants.map(agentName).join(", ")}
            </p>
          </div>
        </div>
        <Link to="/admin/dialogue" className="text-xs text-muted-foreground underline">Advanced</Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Transcript */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
            {booting && (
              <div className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Opening the line…
              </div>
            )}
            {!booting && messages.length === 0 && (
              <div className="mt-20 text-center text-sm text-muted-foreground">
                Channel is quiet. Try “what’s the pipeline looking like?” or tap an agent on the right to pull them in.
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "human";
              return (
                <div
                  key={m.id}
                  className={
                    "flex gap-2 rounded-md p-2 " +
                    (isUser ? "bg-primary/5" : m.speaker === "chief" ? "bg-destructive/5" : m.role === "system" ? "opacity-70" : "bg-muted/40")
                  }
                >
                  <div className="mt-1 flex-shrink-0 text-lg leading-none">
                    {isUser ? "🧑‍✈️" : m.speaker === "chief" ? "🎯" : m.role === "system" ? "⚙️" : "🤖"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-xs font-semibold">
                        {isUser ? "You" : agentName(m.speaker)}
                      </span>
                      <span className="ml-auto text-[10px] opacity-60">{relTime(m.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Room is working…
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Give an order… use @agent_key to address a specific agent"
                className="min-h-[60px] resize-none"
              />
              <Button onClick={send} disabled={sending || !text.trim()} className="self-stretch">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line</div>
          </div>
        </div>

        {/* Live ops rail */}
        <aside className="hidden w-80 flex-col border-l lg:flex">
          <div className="flex border-b text-xs">
            {([
              ["agents", "Agents", Users],
              ["delegations", "Handoffs", GitBranch],
              ["chatter", "Chatter", MessagesSquare],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={
                  "flex flex-1 items-center justify-center gap-1 py-2 " +
                  (tab === k ? "border-b-2 border-destructive font-semibold" : "text-muted-foreground")
                }
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 text-xs">
            {tab === "agents" && agents.map((a) => {
              const b = beatFor[a.agent_key];
              const inRoom = participants.includes(a.agent_key);
              return (
                <button
                  key={a.agent_key}
                  onClick={() => bringIn(a.agent_key)}
                  className="mb-1 w-full rounded-md border p-2 text-left hover:bg-muted/60"
                >
                  <div className="flex items-center gap-2">
                    <span className={"h-2 w-2 rounded-full " + (b && Date.now() - new Date(b.last_beat_at).getTime() < 3600000 ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                    <span className="font-semibold">{a.display_name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {inRoom ? "in room" : "tap to add"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {a.department} · {a.model ?? "auto"}
                  </div>
                  {b && (
                    <div className="mt-1 line-clamp-2 text-[10px] opacity-70">
                      {b.mood}: {b.status_line}
                    </div>
                  )}
                </button>
              );
            })}

            {tab === "delegations" && (delegations.length === 0
              ? <div className="p-4 text-center text-muted-foreground">No handoffs yet.</div>
              : delegations.map((d) => (
                <div key={d.id} className="mb-1 rounded-md border p-2">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{agentName(d.from_agent)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{agentName(d.to_agent)}</span>
                    <span className={"ml-auto text-[10px] " + statusTone(d.status)}>{d.status}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-3 text-[11px] opacity-80">{d.directive}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {relTime(d.created_at)} ago · try {d.attempts ?? 0}
                  </div>
                </div>
              )))}

            {tab === "chatter" && (chatter.length === 0
              ? <div className="p-4 text-center text-muted-foreground">No agent chatter yet.</div>
              : chatter.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openRoom(c.room_id).catch(() => {})}
                  className="mb-1 w-full rounded-md border p-2 text-left hover:bg-muted/60"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{agentName(c.speaker)}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{relTime(c.created_at)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-3 text-[11px] opacity-80">{c.content}</div>
                </button>
              )))}
          </div>
        </aside>
      </div>
    </div>
  );
}
