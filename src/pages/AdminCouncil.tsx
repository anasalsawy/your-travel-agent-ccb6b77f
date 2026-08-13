import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Send, MessagesSquare } from "lucide-react";

type Msg = {
  id: string; speaker: string; role: string; content: string; created_at: string;
};

const CHIEF_ROOM = "Direct line — Chief of Staff";

export default function AdminCouncil() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, sending]);

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
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Chief of Staff</h1>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Just tell it what you want — it runs the team for you.
        </span>
        <Link to="/admin/dialogue" className="ml-auto text-xs text-muted-foreground underline">
          Advanced
        </Link>
      </header>

      <ScrollArea className="flex-1 rounded-lg border p-4">
        {booting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the line…
          </div>
        )}
        {!booting && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Say something like "find me new leads from Facebook today" or "what's the pipeline looking like?"
          </p>
        )}
        <div className="space-y-3">
          {messages.map((m) => {
            const mine = m.role === "human";
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                    (mine ? "bg-primary text-primary-foreground" : "bg-muted")
                  }
                >
                  {!mine && (
                    <p className="mb-1 text-xs font-medium opacity-70">
                      {m.speaker === "system" ? "System" : m.speaker}
                    </p>
                  )}
                  {m.content}
                </div>
              </div>
            );
          })}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Message the Chief of Staff…"
          className="resize-none"
        />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="h-10 w-10 shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
