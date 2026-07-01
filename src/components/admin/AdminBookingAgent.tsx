import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Plane, Building2, Car, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type UIMessagePart = { type: "text"; text: string };
type UIMessage = { id: string; role: "user" | "assistant"; parts: UIMessagePart[] };
type ToolStep = { toolCalls?: any[]; toolResults?: any[] };

export function AdminBookingAgent() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [steps, setSteps] = useState<ToolStep[][]>([]); // per-assistant-message
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: UIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("booking-agent", {
        body: { messages: next },
      });
      if (error) throw error;
      const asstMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: data.text ?? "(no response)" }],
      };
      setMessages((m) => [...m, asstMsg]);
      setSteps((s) => [...s, data.steps ?? []]);
    } catch (e: any) {
      toast({ title: "Agent error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const quick = (q: string) => setInput(q);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Booking Agent
          <Badge variant="secondary" className="ml-2 text-xs">Duffel · Trawex-ready</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => quick("Search flights IAH to CAI on 2026-07-17, 1 adult, economy")}><Plane className="w-3 h-3 mr-1" />Flight search</Button>
          <Button size="sm" variant="outline" onClick={() => quick("Search hotels in Dubai check-in 2026-08-01 check-out 2026-08-05, 2 guests")}><Building2 className="w-3 h-3 mr-1" />Hotel search</Button>
          <Button size="sm" variant="outline" onClick={() => quick("Search cars at DXB airport pickup 2026-08-01 dropoff 2026-08-05")}><Car className="w-3 h-3 mr-1" />Car search</Button>
        </div>

        <div ref={scrollRef} className="h-[500px] overflow-y-auto space-y-3 border border-border/50 rounded-md p-3 bg-muted/10">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Ask me to search, book, cancel, or modify anything.<br />
              Fully autonomous — no approval prompts.
            </p>
          )}
          {messages.map((m, i) => {
            const assistantIdx = messages.slice(0, i + 1).filter(x => x.role === "assistant").length - 1;
            const msgSteps = m.role === "assistant" ? steps[assistantIdx] : undefined;
            return (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={m.role === "user"
                  ? "max-w-[80%] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm"
                  : "max-w-[90%] text-sm space-y-2"}>
                  {msgSteps && msgSteps.length > 0 && (
                    <details className="text-xs bg-muted/40 rounded p-2">
                      <summary className="cursor-pointer text-muted-foreground">🔧 {msgSteps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0)} tool call(s)</summary>
                      <pre className="mt-2 overflow-auto max-h-64 text-[10px]">{JSON.stringify(msgSteps, null, 2)}</pre>
                    </details>
                  )}
                  <div className="whitespace-pre-wrap">{m.parts.map(p => p.text).join("")}</div>
                </div>
              </div>
            );
          })}
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />thinking…</div>}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="e.g. Book EgyptAir MS967 SHJ→CAI on July 17 for Ahmed Ali, passport AB1234567 exp 2030-01-01"
            rows={2}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="self-end">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
