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
const DELAY_BETWEEN_AGENTS_MS = 800;

const trim = (t: string) => (t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + "…" : t);

export default function MobileAgentRoundtable() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const stopRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef(1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildHistory = useCallback((msgs: Message[], userText?: string) => {
    const history = msgs.slice(-MAX_HISTORY).map(m => {
      if (m.role === "user") return { role: "user", content: trim(m.content || "") };
      if (m.response) return { role: "assistant", content: trim(`[${m.response.emoji} ${m.response.name}]: ${m.response.content}`) };
      return null;
    }).filter(Boolean);
    if (userText) history.push({ role: "user", content: trim(userText) });
    return history;
  }, []);

  const runAgentLoop = useCallback(async (startMessages: Message[], startAgentId: string) => {
    stopRef.current = false;
    setIsRunning(true);
    let currentMsgs = startMessages;
    let agentId = startAgentId;

    while (!stopRef.current) {
      setCurrentAgent(agentId);
      const history = buildHistory(currentMsgs);

      try {
        const { data, error } = await supabase.functions.invoke("agent-roundtable", {
          body: { messages: history, currentAgentId: agentId, roundNumber: roundRef.current },
        });

        if (stopRef.current) break;
        if (error) throw new Error(error.message);

        const response: AgentResponse = data.response;
        const nextAgentId: string = data.nextAgentId;

        const newMsg: Message = { role: "agent", response };
        currentMsgs = [...currentMsgs, newMsg].slice(-MAX_STORED);
        setMessages([...currentMsgs]);

        // If we completed a full cycle, increment round
        if (nextAgentId === AGENT_CHAIN[0].id) roundRef.current++;

        agentId = nextAgentId;

        // Small delay between agents for readability
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_AGENTS_MS));
      } catch (err: any) {
        console.error("Agent loop error:", err);
        toast.error(err?.message || "Agent failed");
        break;
      }
    }

    setIsRunning(false);
    setCurrentAgent(null);
  }, [buildHistory]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    // If loop is running, inject user message and continue
    if (isRunning) {
      const userMsg: Message = { role: "user", content: text };
      setMessages(prev => {
        const updated = [...prev, userMsg].slice(-MAX_STORED);
        return updated;
      });
      setInput("");
      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const updated = [...messages, userMsg].slice(-MAX_STORED);
    setMessages(updated);
    setInput("");
    roundRef.current = 1;

    // Start the continuous loop from Dev Agent
    runAgentLoop(updated, "dev");
  };

  const stopLoop = () => {
    stopRef.current = true;
  };

  const clearChat = () => {
    stopRef.current = true;
    setMessages([]);
    roundRef.current = 1;
  };

  const activeAgent = AGENT_CHAIN.find(a => a.id === currentAgent);

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
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 animate-pulse">
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
          {/* Agent chain visualization */}
          <div className="flex gap-1 mt-1.5 items-center">
            {AGENT_CHAIN.map((agent, i) => (
              <div key={agent.id} className="flex items-center gap-0.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                    currentAgent === agent.id ? "ring-2 ring-offset-1 ring-offset-background scale-110" : "opacity-50"
                  }`}
                  style={{
                    backgroundColor: agent.color + "25",
                    ...(currentAgent === agent.id ? { ringColor: agent.color } : {}),
                  }}
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">🏛️</div>
              <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                Send a message to start the continuous loop. Agents will keep discussing until you hit Stop.
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
                <div className="flex justify-end my-2">
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

          {isRunning && activeAgent && (
            <div className="flex items-center gap-2 py-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ backgroundColor: activeAgent.color + "30" }}
              >
                {activeAgent.emoji}
              </div>
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{activeAgent.name} is thinking...</span>
              </div>
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
