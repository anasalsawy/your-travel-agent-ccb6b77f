import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Radio } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string; speaker: string; role: string; content: string; created_at: string;
};

const CHIEF_ROOM = "Direct line — Chief of Staff";

const SPEAKERS: Record<string, { display: string; color: string; emoji: string }> = {
  chief: { display: "Chief of Staff", color: "hsl(0 84% 60%)", emoji: "🎯" },
  system: { display: "System", color: "hsl(215 20% 65%)", emoji: "⚙️" },
};
const meta = (key: string) =>
  SPEAKERS[key] ?? { display: key, color: "hsl(199 89% 48%)", emoji: "🤖" };

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}

export default function AdminCouncil() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("dialogue-room", { body });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error ?? "request failed");
    return data;
  };

  const openRoom = async (id: string) => {
    const d = await call({ action: "history", room_id: id });
    setRoomId(id);
    setMessages(d.messages ?? []);
  };

  useEffect(() => {
    (async () => {
      try {
        const d = await call({ action: "rooms" });
        const found = (d.rooms ?? []).find((r: any) => r.title === CHIEF_ROOM);
        if (found) {
          await openRoom(found.id);
        } else {
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
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(() => { openRoom(roomId).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [roomId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

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
          <Radio className="h-5 w-5 animate-pulse text-red-500" />
          <div>
            <h1 className="text-xl font-bold">Chief of Staff</h1>
            <p className="text-xs text-muted-foreground">
              Direct line · say what you want done · the Chief runs the council for you
            </p>
          </div>
        </div>
        <Link to="/admin/dialogue" className="text-xs text-muted-foreground underline">
          Advanced
        </Link>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {booting && (
          <div className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the line…
          </div>
        )}
        {!booting && messages.length === 0 && (
          <div className="mt-20 text-center text-sm text-muted-foreground">
            Channel is quiet. Try “what’s the pipeline looking like?” or “open 5 new Punta Cana prospects today”.
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === "human";
          const a = meta(m.speaker);
          return (
            <div
              key={m.id}
              className={
                "flex gap-2 rounded-md p-2 " +
                (isUser ? "bg-primary/5" : m.speaker === "chief" ? "bg-red-500/5" : "")
              }
            >
              <div className="mt-1 flex-shrink-0 text-lg leading-none">{isUser ? "🧑‍✈️" : a.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={!isUser ? { color: a.color } : undefined}
                  >
                    {isUser ? "You" : a.display}
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
            <Loader2 className="h-4 w-4 animate-spin" /> Chief is working…
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
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
              else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Give the Chief an order…"
            className="min-h-[60px] resize-none"
          />
          <Button onClick={send} disabled={sending || !text.trim()} className="self-stretch">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line</div>
      </div>
    </div>
  );
}
