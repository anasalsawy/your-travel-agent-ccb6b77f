import { useState, useRef, useEffect, useCallback } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Trash2, Users, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AgentResponse {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  content: string;
}

interface Message {
  role: "user" | "agent";
  content?: string;
  response?: AgentResponse;
}

const AGENT_CHAIN = [
  { id: "dev", name: "Dev Agent", emoji: "🔧", color: "#6366f1" },
  { id: "security", name: "Security", emoji: "🛡️", color: "#ef4444" },
  { id: "ux", name: "UX/Product", emoji: "🎨", color: "#8b5cf6" },
  { id: "architect", name: "Architecture", emoji: "🏗️", color: "#0ea5e9" },
  { id: "business", name: "Business", emoji: "📈", color: "#f59e0b" },
  { id: "ops", name: "Operations", emoji: "⚙️", color: "#10b981" },
];

const MAX_HISTORY = 24;
const MAX_CHARS = 600;
const MAX_STORED = 60;
// ~200 words per minute reading speed → ~15ms per character
const MS_PER_CHAR = 18;
const MIN_PAUSE_MS = 4000;
const MAX_PAUSE_MS = 12000;

const trim = (t: string) => (t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + "…" : t);

/** Calculate human reading time for a message */
const readingDelay = (text: string) =>
  Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, text.length * MS_PER_CHAR));

/** Interruptible sleep that checks stopRef */
const sleepInterruptible = (ms: number, stopRef: React.MutableRefObject<boolean>) =>
  new Promise<void>((resolve) => {
    const interval = 200;
    let elapsed = 0;
    const check = () => {
      if (stopRef.current || elapsed >= ms) { resolve(); return; }
      elapsed += interval;
      setTimeout(check, interval);
    };
    check();
  });

export default function MobileAgentRoundtable() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [readingAgent, setReadingAgent] = useState<string | null>(null);
  const stopRef = useRef(false);
  const loopIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef(1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildHistory = useCallback((msgs: Message[]) => {
    return msgs.slice(-MAX_HISTORY).map(m => {
      if (m.role === "user") return { role: "user", content: trim(m.content || "") };
      if (m.response) return { role: "assistant", content: trim(`[${m.response.emoji} ${m.response.name}]: ${m.response.content}`) };
      return null;
    }).filter(Boolean);
  }, []);

  const runAgentLoop = useCallback(async (startMessages: Message[], startAgentId: string) => {
    const thisLoopId = ++loopIdRef.current;
    stopRef.current = false;
    setIsRunning(true);
    let currentMsgs = startMessages;
    let agentId = startAgentId;
    let previousAgentName = "";

    while (!stopRef.current && loopIdRef.current === thisLoopId) {
      setCurrentAgent(agentId);
      setReadingAgent(null);
      const history = buildHistory(currentMsgs);

      try {
        const ac = new AbortController();
        abortRef.current = ac;

        const fetchPromise = fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-roundtable`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: history,
              currentAgentId: agentId,
              roundNumber: roundRef.current,
              previousAgentName,
            }),
            signal: ac.signal,
          }
        );

        const res = await fetchPromise;
        if (stopRef.current || loopIdRef.current !== thisLoopId) break;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;
        if (data.error) throw new Error(data.error);

        const response: AgentResponse = data.response;
        const nextAgentId: string = data.nextAgentId;

        const newMsg: Message = { role: "agent", response };
        currentMsgs = [...currentMsgs, newMsg].slice(-MAX_STORED);
        setMessages([...currentMsgs]);

        // Show who just spoke and give reading time
        setCurrentAgent(null);
        setReadingAgent(agentId);
        const pause = readingDelay(response.content);
        await sleepInterruptible(pause, stopRef);

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;

        // Track who spoke for the next agent's context
        previousAgentName = response.name;

        if (nextAgentId === AGENT_CHAIN[0].id) roundRef.current++;
        agentId = nextAgentId;
      } catch (err: any) {
        if (stopRef.current) break;
        console.error("Agent loop error:", err);
        toast.error(err?.message || "Agent failed");
        break;
      }
    }

    setIsRunning(false);
    setCurrentAgent(null);
    setReadingAgent(null);
  }, [buildHistory]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    if (isRunning) {
      const userMsg: Message = { role: "user", content: text };
      setMessages(prev => [...prev, userMsg].slice(-MAX_STORED));
      setInput("");
      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const updated = [...messages, userMsg].slice(-MAX_STORED);
    setMessages(updated);
    setInput("");
    roundRef.current = 1;
    runAgentLoop(updated, "dev");
  };

  const stopLoop = () => {
    stopRef.current = true;
    loopIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setCurrentAgent(null);
    setReadingAgent(null);
  };

  const clearChat = () => {
    stopLoop();
    setMessages([]);
    roundRef.current = 1;
  };

  const activeAgent = AGENT_CHAIN.find(a => a.id === currentAgent);
  const pauseAgent = AGENT_CHAIN.find(a => a.id === readingAgent);

  return (
    <MobileAdminLayout title="AI Roundtable">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="px-4 py-2 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">
                Continuous Loop • 6 agents
              </span>
              {isRunning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isRunning ? (
                <Button variant="destructive" size="sm" onClick={stopLoop} className="text-xs gap-1 h-7">
                  <Square className="w-3 h-3" /> Stop
                </Button>
              ) : messages.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => runAgentLoop(messages, "dev")} className="text-xs gap-1 h-7">
                  <Play className="w-3 h-3" /> Resume
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs gap-1 h-7">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {/* Agent chain */}
          <div className="flex gap-1 mt-1.5 items-center">
            {AGENT_CHAIN.map((agent, i) => (
              <div key={agent.id} className="flex items-center gap-0.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                    currentAgent === agent.id ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-125" :
                    readingAgent === agent.id ? "scale-110 opacity-80" : "opacity-40"
                  }`}
                  style={{ backgroundColor: agent.color + "25" }}
                  title={agent.name}
                >
                  {agent.emoji}
                </div>
                {i < AGENT_CHAIN.length - 1 && (
                  <span className="text-[8px] text-muted-foreground">→</span>
                )}
              </div>
            ))}
            <span className="text-[8px] text-muted-foreground">↻</span>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">🏛️</div>
              <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                Send a message to start the continuous loop. Agents take turns, each responding to the previous one.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {["What should we improve next?", "Review our security", "How to grow revenue?"].map(q => (
                  <Button key={q} variant="outline" size="sm" className="text-xs rounded-full"
                    onClick={() => setInput(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" && (
                <div className="flex justify-end my-3">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary text-primary-foreground whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
              {msg.role === "agent" && msg.response && (
                <div className="flex gap-2 items-start">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-sm"
                    style={{ backgroundColor: msg.response.color + "20" }}
                  >
                    {msg.response.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold" style={{ color: msg.response.color }}>
                      {msg.response.name}
                    </span>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-md px-3.5 py-2 text-sm whitespace-pre-wrap mt-0.5">
                      {msg.response.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {isRunning && activeAgent && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ backgroundColor: activeAgent.color + "30" }}>
                {activeAgent.emoji}
              </div>
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{activeAgent.name} is thinking...</span>
              </div>
            </div>
          )}

          {/* Reading pause indicator */}
          {isRunning && !activeAgent && pauseAgent && (
            <div className="flex items-center gap-2 py-1">
              <span className="text-[10px] text-muted-foreground italic">
                ⏸ Reading time...
              </span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border/50 bg-card/80 backdrop-blur-xl">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isRunning ? "Interject — agents will see your message..." : "Start a discussion..."}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-secondary/50 border-border/30 text-sm"
              rows={1}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim()}
              size="icon"
              className="rounded-xl h-11 w-11 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </MobileAdminLayout>
  );
}
