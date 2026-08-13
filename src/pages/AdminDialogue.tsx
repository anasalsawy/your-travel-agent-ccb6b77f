import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, MessagesSquare, Plus, Send, Users, Wrench, Sparkles } from "lucide-react";

type Agent = { agent_key: string; display_name: string; department: string; charter: string };
type Room = {
  id: string; title: string; goal: string; participants: string[];
  facilitator: string | null; mode: string; status: string; resolution: string | null; updated_at: string;
};
type Msg = {
  id: string; speaker: string; role: string; content: string; mentions: string[];
  tool_calls: any[]; model: string | null; kind: string; created_at: string;
};

export default function AdminDialogue() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; goal: string; mode: string; picks: string[] }>({
    title: "", goal: "", mode: "safe", picks: [],
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("dialogue-room", { body });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error ?? "request failed");
    return data;
  };

  const loadRooms = async () => {
    try {
      const d = await call({ action: "rooms" });
      setRooms(d.rooms ?? []);
    } catch (e) { toast.error((e as Error).message); }
  };

  const openRoom = async (id: string) => {
    try {
      const d = await call({ action: "history", room_id: id });
      setRoom(d.room);
      setMessages(d.messages ?? []);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => {
    (async () => {
      try {
        const a = await call({ action: "agents" });
        setAgents(a.agents ?? []);
      } catch (e) { toast.error((e as Error).message); }
      loadRooms();
    })();
  }, []);

  useEffect(() => {
    if (!room) return;
    const t = setInterval(() => openRoom(room.id), 15000);
    return () => clearInterval(t);
  }, [room?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const byKey = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.agent_key] = a;
    return m;
  }, [agents]);

  const createRoom = async () => {
    if (!draft.title.trim() || draft.picks.length === 0) {
      return toast.error("Give the room a title and pick at least one agent");
    }
    setBusy("create");
    try {
      const d = await call({
        action: "create", title: draft.title, goal: draft.goal,
        mode: draft.mode, participants: draft.picks,
      });
      setCreating(false);
      setDraft({ title: "", goal: "", mode: "safe", picks: [] });
      await loadRooms();
      await openRoom(d.room.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const send = async () => {
    if (!room || !text.trim()) return;
    const mine = text;
    setText("");
    setBusy("say");
    try {
      const d = await call({ action: "say", room_id: room.id, text: mine });
      setMessages(d.messages ?? []);
    } catch (e) {
      toast.error((e as Error).message);
      setText(mine);
    } finally {
      setBusy(null);
      inputRef.current?.focus();
    }
  };

  const converse = async (rounds: number) => {
    if (!room) return;
    setBusy("converse");
    try {
      const d = await call({ action: "converse", room_id: room.id, rounds });
      setMessages(d.messages ?? []);
      if (d.resolved) toast.success("The room reached a resolution");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const label = (m: Msg) =>
    m.role === "human" ? "You" : m.speaker === "system" ? "System" : (byKey[m.speaker]?.display_name ?? m.speaker);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Dialogue</h1>
        <span className="text-sm text-muted-foreground">Talk to any agent. Let them talk to each other.</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* Rooms + create */}
        <div className="space-y-3">
          <Button className="w-full" onClick={() => setCreating((c) => !c)}>
            <Plus className="mr-2 h-4 w-4" /> New room
          </Button>

          {creating && (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <Input
                  placeholder="Room title (e.g. Fix NYOP conversion)"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
                <Textarea
                  placeholder="Goal (optional) — what should come out of this conversation?"
                  value={draft.goal}
                  onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                  rows={3}
                />
                <div className="flex gap-2">
                  {["safe", "full"].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={draft.mode === m ? "default" : "outline"}
                      onClick={() => setDraft({ ...draft, mode: m })}
                    >
                      {m === "safe" ? "Read-only tools" : "Tools can write"}
                    </Button>
                  ))}
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {agents.map((a) => {
                    const on = draft.picks.includes(a.agent_key);
                    return (
                      <button
                        key={a.agent_key}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            picks: on
                              ? draft.picks.filter((p) => p !== a.agent_key)
                              : [...draft.picks, a.agent_key],
                          })
                        }
                        className={`w-full rounded px-2 py-1 text-left text-sm ${on ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        {a.display_name}
                        <span className="ml-1 text-xs text-muted-foreground">{a.department}</span>
                      </button>
                    );
                  })}
                </div>
                <Button className="w-full" disabled={busy === "create"} onClick={createRoom}>
                  {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Open room
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rooms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {rooms.length === 0 && <p className="text-sm text-muted-foreground">No rooms yet.</p>}
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRoom(r.id)}
                  className={`w-full rounded px-2 py-2 text-left ${room?.id === r.id ? "bg-primary/10" : "hover:bg-muted"}`}
                >
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {r.participants.length}
                    {r.status !== "open" && <Badge variant="secondary" className="ml-1">{r.status}</Badge>}
                    {r.mode === "full" && <Wrench className="ml-1 h-3 w-3" />}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Conversation */}
        <Card className="flex min-h-[70vh] flex-col">
          {!room ? (
            <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Pick a room, or open a new one to start talking.
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{room.title}</CardTitle>
                  <Badge variant={room.mode === "full" ? "default" : "secondary"}>
                    {room.mode === "full" ? "write tools" : "read-only"}
                  </Badge>
                  {room.status !== "open" && <Badge variant="outline">{room.status}</Badge>}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => converse(1)}>
                      {busy === "converse" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Let them talk
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => converse(3)}>
                      3 rounds
                    </Button>
                  </div>
                </div>
                {room.goal && <p className="text-xs text-muted-foreground">Goal: {room.goal}</p>}
                <p className="text-xs text-muted-foreground">
                  In the room: {room.participants.map((p) => byKey[p]?.display_name ?? p).join(", ")} — mention @agent_key to address one directly.
                </p>
              </CardHeader>

              <ScrollArea className="flex-1">
                <div className="space-y-3 p-4">
                  {messages.map((m) => (
                    <div key={m.id} className={m.role === "human" ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.role === "human"
                            ? "bg-primary text-primary-foreground"
                            : m.kind === "system"
                              ? "bg-muted/60 text-muted-foreground"
                              : m.kind === "summary" || m.kind === "resolution"
                                ? "border border-primary/40 bg-primary/5"
                                : "bg-muted"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                          <span className="font-semibold">{label(m)}</span>
                          {m.kind !== "message" && <Badge variant="outline" className="h-4 px-1 text-[10px]">{m.kind}</Badge>}
                          {m.model && <span className="truncate">{m.model}</span>}
                        </div>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {m.tool_calls.map((t: any, i: number) => (
                              <div key={i} className="rounded bg-background/60 p-1 text-[11px] font-mono">
                                <Wrench className="mr-1 inline h-3 w-3" />
                                {t.name} {t.ok ? "ok" : "failed: " + (t.error ?? "")}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> the room is thinking…
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              </ScrollArea>

              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={inputRef}
                    rows={2}
                    autoFocus
                    placeholder="Say anything — or @dev-lead to address one agent directly"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                  />
                  <Button disabled={busy === "say" || !text.trim()} onClick={send}>
                    {busy === "say" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
