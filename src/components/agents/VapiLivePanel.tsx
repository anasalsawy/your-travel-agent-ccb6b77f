import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, Send } from "lucide-react";
import { toast } from "sonner";

export type VapiCall = {
  id: string;
  agent_name: string;
  phone_number: string;
  goal: string | null;
  status: "dialing" | "active" | "ended" | "failed" | string;
  summary: string | null;
  room_id: string | null;
  created_at: string;
};

type Event = {
  id: string;
  call_id: string;
  role: string; // user | assistant | system | tool | steer
  content: string;
  created_at: string;
};

const roleColor: Record<string, string> = {
  user: "bg-primary/10 border-primary/30",
  assistant: "bg-emerald-500/10 border-emerald-500/30",
  system: "bg-muted border-border",
  tool: "bg-amber-500/10 border-amber-500/30",
  steer: "bg-sky-500/10 border-sky-500/40",
  error: "bg-destructive/10 border-destructive/40",
};

/**
 * Inline live cockpit for a Vapi voice call. Renders only when a call is active
 * for the given room. Shows a running transcript and lets the operator steer
 * (inject a system message) or hang up.
 */
export function VapiLivePanel({ roomId }: { roomId: string | null }) {
  const [call, setCall] = useState<VapiCall | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to new calls scoped to this room. Auto-attach to the newest active call.
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("vapi_calls").select("*").eq("room_id", roomId)
        .in("status", ["dialing", "active"]).order("created_at", { ascending: false }).limit(1);
      if (active && data && data.length > 0) setCall(data[0] as VapiCall);
    })();
    const ch = supabase
      .channel("vapi-calls-room-" + roomId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vapi_calls", filter: "room_id=eq." + roomId },
        (payload) => {
          const row = (payload.new ?? payload.old) as VapiCall;
          if (!row) return;
          if (payload.eventType === "INSERT" || row.status === "active" || row.status === "dialing") setCall(row);
          else if (call && row.id === call.id) setCall(row);
        })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [roomId]);

  // Stream events for the active call
  useEffect(() => {
    if (!call) { setEvents([]); return; }
    (async () => {
      const { data } = await supabase
        .from("vapi_call_events").select("*").eq("call_id", call.id).order("created_at");
      setEvents((data ?? []) as Event[]);
    })();
    const ch = supabase
      .channel("vapi-events-" + call.id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "vapi_call_events", filter: "call_id=eq." + call.id },
        (payload) => setEvents((prev) => [...prev, payload.new as Event]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [call?.id]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events.length]);

  // Hide when nothing is happening
  const visible = call && call.status !== "ended" && call.status !== "failed";
  if (!visible) return null;

  async function inject() {
    const msg = steer.trim();
    if (!msg || !call) return;
    setBusy(true); setSteer("");
    try {
      const { data, error } = await supabase.functions.invoke("vapi-call-inject", {
        body: { call_id: call.id, message: msg, source: "operator" },
      });
      if (error || data?.ok === false) throw new Error(data?.error ?? error?.message ?? "inject failed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function hangup() {
    if (!call) return;
    setBusy(true);
    try {
      await supabase.functions.invoke("vapi-call-hangup", { body: { call_id: call.id } });
    } finally { setBusy(false); }
  }

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5 mb-3">
      <div className="p-3 border-b flex items-center gap-2 flex-wrap">
        <Phone className="w-4 h-4 text-emerald-500 animate-pulse" />
        <span className="font-medium text-sm">Live call</span>
        <Badge variant="outline" className="text-[10px]">{call!.status}</Badge>
        <Badge variant="outline" className="text-[10px]">{call!.agent_name}</Badge>
        <span className="text-xs text-muted-foreground truncate">{call!.phone_number}</span>
        {call!.goal && <span className="text-xs text-muted-foreground truncate">· {call!.goal}</span>}
        <Button size="sm" variant="destructive" className="ml-auto" onClick={hangup} disabled={busy}>
          <PhoneOff className="w-3 h-3 mr-1" /> Hang up
        </Button>
      </div>

      <div className="max-h-[220px] overflow-y-auto p-3 space-y-2">
        {events.length === 0 && (
          <div className="text-xs text-muted-foreground">Waiting for transcript…</div>
        )}
        {events.map((e) => (
          <div key={e.id} className={`border rounded p-2 text-xs ${roleColor[e.role] ?? "bg-muted border-border"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[9px]">{e.role}</Badge>
              <span className="text-[9px] text-muted-foreground ml-auto">
                {new Date(e.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div className="whitespace-pre-wrap">{e.content}</div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="p-2 border-t flex gap-2">
        <Input
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          placeholder="Steer the agent mid-call (e.g. 'Ask for the change fee waiver')"
          className="text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); inject(); } }}
        />
        <Button size="sm" onClick={inject} disabled={busy || !steer.trim()}>
          <Send className="w-3 h-3 mr-1" /> Steer
        </Button>
      </div>
    </Card>
  );
}
