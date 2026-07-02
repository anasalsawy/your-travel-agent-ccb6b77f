import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Send, Plus } from "lucide-react";
import { toast } from "sonner";

type Room = "builders" | "shoppers";
type RoomRow = { id: string; room: Room; title: string | null; updated_at: string };
type Msg = {
  id: string;
  room_id: string;
  agent_name: string;
  role: string;
  content: string;
  created_at: string;
};

const AGENT_COLORS: Record<string, string> = {
  "You": "bg-primary/10 border-primary/40",
  "shopper-lead": "bg-amber-500/10 border-amber-500/40",
  "shopper-helper-1": "bg-amber-500/5 border-amber-500/20",
  "shopper-helper-2": "bg-amber-500/5 border-amber-500/20",
  "shopper-helper-3": "bg-amber-500/5 border-amber-500/20",
  "BUILDEROFAGENTS": "bg-sky-500/10 border-sky-500/40",
  "builder-helper-1": "bg-sky-500/5 border-sky-500/20",
  "builder-helper-2": "bg-sky-500/5 border-sky-500/20",
  "builder-helper-3": "bg-sky-500/5 border-sky-500/20",
  "system": "bg-destructive/10 border-destructive/40",
  "tool": "bg-muted border-border",
};

function agentClass(name: string) {
  return AGENT_COLORS[name] ?? "bg-muted border-border";
}

function RoomView({ room }: { room: Room }) {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load rooms
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agent_rooms")
        .select("*")
        .eq("room", room)
        .order("updated_at", { ascending: false })
        .limit(20);
      setRooms((data ?? []) as RoomRow[]);
      if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
    })();
  }, [room]);

  // Load messages when active room changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("agent_room_messages")
        .select("*")
        .eq("room_id", activeId)
        .order("created_at");
      setMessages((data ?? []) as Msg[]);
    })();

    const ch = supabase
      .channel("room-" + activeId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_room_messages", filter: "room_id=eq." + activeId },
        (payload) => setMessages((prev) => [...prev, payload.new as Msg]),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const { data, error } = await supabase.functions.invoke("agent-room-run", {
        body: { room, message: text, roomId: activeId },
      });
      if (error) throw error;
      if (data?.roomId && data.roomId !== activeId) {
        setActiveId(data.roomId);
        // refresh rooms list
        const { data: r } = await supabase
          .from("agent_rooms").select("*").eq("room", room).order("updated_at", { ascending: false }).limit(20);
        setRooms((r ?? []) as RoomRow[]);
      }
      if (data?.ok === false) toast.error(data?.error ?? "Run failed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function newRoom() {
    setActiveId(null);
    setMessages([]);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 h-[calc(100vh-180px)]">
      <div className="space-y-2 overflow-y-auto pr-1">
        <Button onClick={newRoom} variant="outline" className="w-full justify-start">
          <Plus className="w-4 h-4 mr-2" /> New session
        </Button>
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveId(r.id)}
            className={`w-full text-left p-2 rounded border text-xs hover:bg-accent ${activeId === r.id ? "border-primary" : "border-border"}`}
          >
            <div className="font-medium truncate">{r.title ?? "(new)"}</div>
            <div className="text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</div>
          </button>
        ))}
      </div>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {room === "builders"
                ? "Ask BUILDEROFAGENTS + 3 helpers to build/fix/ship anything."
                : "Give shopper-lead + 3 helpers a shopping list. They'll research, plan, and buy."}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`border rounded-lg p-3 ${agentClass(m.agent_name)}`}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px]">{m.agent_name}</Badge>
                <span className="text-[10px] text-muted-foreground">{m.role}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(m.created_at).toLocaleTimeString()}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-sm font-sans">{m.content}</pre>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t p-3 space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={room === "builders" ? "e.g. Refactor dev-agent tool loop and add tests" : "e.g. Buy 2 Sony WH-1000XM6 headphones and a Dyson V15"}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</span>
            <Button onClick={send} disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              {sending ? "Running…" : "Dispatch"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function AdminAgentRooms() {
  const [tab, setTab] = useState<Room>("builders");
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Agent Rooms</h1>
        <p className="text-sm text-muted-foreground">
          Watch orchestrators delegate to helpers, tool by tool, live.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Room)}>
        <TabsList>
          <TabsTrigger value="builders">🛠 Builders Room</TabsTrigger>
          <TabsTrigger value="shoppers">🛒 Shoppers Room</TabsTrigger>
        </TabsList>
        <TabsContent value="builders" className="mt-4">
          <RoomView room="builders" />
        </TabsContent>
        <TabsContent value="shoppers" className="mt-4">
          <RoomView room="shoppers" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
