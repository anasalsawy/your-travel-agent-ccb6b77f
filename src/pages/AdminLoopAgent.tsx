import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Pause, Play, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";

type Status = {
  running: boolean; paused: boolean; beat: number; phase: string | null;
  uptime_s: number; model: string; tools: string[]; last_error: string | null;
  duty_cycle?: string[];
};
type Ev = { at: number; kind: string; beat: number; content: string };
type Msg = { role: "you" | "agent"; text: string };

const LS_URL = "loop_agent_url";
const LS_TOKEN = "loop_agent_token";

export default function AdminLoopAgent() {
  const [url, setUrl] = useState(localStorage.getItem(LS_URL) ?? "http://localhost:8080");
  const [token, setToken] = useState(localStorage.getItem(LS_TOKEN) ?? "");
  const [showConfig, setShowConfig] = useState(!localStorage.getItem(LS_URL));
  const [status, setStatus] = useState<Status | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(url.replace(/\/$/, "") + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  }, [url, token]);

  const poll = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api("/status"), api("/activity?limit=60")]);
      setStatus(s); setEvents(a.events ?? []);
    } catch { setStatus(null); }
  }, [api]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput(""); setMsgs((m) => [...m, { role: "you", text }]); setBusy(true);
    try {
      const r = await api("/chat", { method: "POST", body: JSON.stringify({ message: text }) });
      setMsgs((m) => [...m, { role: "agent", text: r.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "agent", text: `⚠️ ${(e as Error).message}` }]);
    } finally { setBusy(false); poll(); }
  }

  async function toggle() {
    try {
      await api(status?.paused ? "/resume" : "/pause", { method: "POST" });
      poll();
    } catch (e) { toast.error((e as Error).message); }
  }

  function saveConfig() {
    localStorage.setItem(LS_URL, url);
    localStorage.setItem(LS_TOKEN, token);
    setShowConfig(false); poll();
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Activity className={`h-5 w-5 ${status?.running && !status.paused ? "animate-pulse text-emerald-500" : "text-muted-foreground"}`} />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Operations Agent</h1>
          <p className="text-xs text-muted-foreground">
            LangGraph loop — inbox → comments → follow-ups → post → instagram → reddit → pipeline, forever.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {status ? (
            <>
              <Badge variant="outline">beat #{status.beat}</Badge>
              <Badge variant="outline">{status.phase ?? "idle"}</Badge>
              <Badge variant="outline">{status.tools.length} tools</Badge>
              <Button size="sm" variant="outline" onClick={toggle}>
                {status.paused ? <><Play className="mr-1 h-4 w-4" />Resume</> : <><Pause className="mr-1 h-4 w-4" />Pause</>}
              </Button>
            </>
          ) : (
            <Badge variant="outline" className="border-destructive/40 text-destructive">offline</Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowConfig((s) => !s)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {showConfig && (
        <Card className="mb-4 space-y-2 p-4">
          <p className="text-xs text-muted-foreground">
            Point this at your deployed agent container (see <code>agent/README.md</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[260px] flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://agent.example.com" />
            <Input className="min-w-[200px]" value={token} onChange={(e) => setToken(e.target.value)} placeholder="API token (optional)" type="password" />
            <Button onClick={saveConfig}>Save</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="flex h-[70vh] flex-col p-4">
          <h2 className="mb-3 text-sm font-semibold">Talk to the agent</h2>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {msgs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ask it anything — it answers with the same tools it uses in the loop.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`rounded-md border p-2 text-sm ${m.role === "you" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{m.role}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Agent is working…</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <Textarea
              rows={2} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Enter to send · Shift+Enter for a new line"
            />
            <Button onClick={send} disabled={busy}><Send className="h-4 w-4" /></Button>
          </div>
        </Card>

        <Card className="h-[70vh] overflow-y-auto p-4">
          <h2 className="mb-3 text-sm font-semibold">Live activity</h2>
          {status?.last_error && (
            <p className="mb-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {status.last_error}
            </p>
          )}
          {events.length === 0 && <p className="text-xs text-muted-foreground">No beats yet.</p>}
          {events.map((e, i) => (
            <div key={i} className="mb-2 rounded-md border border-border/60 p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                <span className="text-muted-foreground">#{e.beat}</span>
              </div>
              <div className="whitespace-pre-wrap text-muted-foreground">{e.content}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
