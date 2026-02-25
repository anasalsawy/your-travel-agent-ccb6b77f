import { useState, useRef, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Trash2, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AgentResponse {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  content: string;
}

interface Message {
  role: "user" | "roundtable";
  content?: string;
  responses?: AgentResponse[];
}

const AGENT_LIST = [
  { id: "security", name: "Security", emoji: "🛡️", color: "#ef4444" },
  { id: "ux", name: "UX/Product", emoji: "🎨", color: "#8b5cf6" },
  { id: "architect", name: "Architecture", emoji: "🏗️", color: "#0ea5e9" },
  { id: "business", name: "Business", emoji: "📈", color: "#f59e0b" },
  { id: "ops", name: "Operations", emoji: "⚙️", color: "#10b981" },
];

export default function MobileAgentRoundtable() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [debateRounds, setDebateRounds] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const clearChat = () => {
    setMessages([]);
    setSelectedAgents([]);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Build conversation history for context
      const history: { role: string; content: string }[] = messages.flatMap(m => {
        if (m.role === "user") return [{ role: "user", content: m.content! }];
        if (m.responses) return m.responses.map(r => ({
          role: "assistant",
          content: `[${r.emoji} ${r.name}]: ${r.content}`
        }));
        return [] as { role: string; content: string }[];
      });
      history.push({ role: "user", content: text });

      const { data, error } = await supabase.functions.invoke("agent-roundtable", {
        body: {
          messages: history,
          targetAgents: selectedAgents.length > 0 ? selectedAgents : undefined,
          debateRounds,
        },
      });

      if (error) throw error;

      const responses: AgentResponse[] = data?.responses || [];
      setMessages(prev => [...prev, { role: "roundtable", responses }]);
    } catch (err: any) {
      console.error("Roundtable error:", err);
      toast.error("Failed to reach the roundtable");
      setMessages(prev => [...prev, {
        role: "roundtable",
        responses: [{ agentId: "error", name: "System", emoji: "⚠️", color: "#666", content: err.message || "Connection failed." }]
      }]);
    }

    setIsLoading(false);
  };

  return (
    <MobileAdminLayout title="AI Roundtable">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="px-4 py-2 border-b border-border/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">
                5 advisors • free debate
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => setDebateRounds(prev => prev === 1 ? 2 : prev === 2 ? 3 : 1)}
                className="text-xs gap-1 h-7"
              >
                <Zap className="w-3 h-3" />
                {debateRounds}x rounds
              </Button>
              <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs gap-1 h-7">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {/* Agent filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {AGENT_LIST.map(agent => (
              <Badge
                key={agent.id}
                variant={selectedAgents.includes(agent.id) ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-2 py-0.5 transition-all"
                style={selectedAgents.includes(agent.id) ? { backgroundColor: agent.color, borderColor: agent.color, color: "#fff" } : {}}
                onClick={() => toggleAgent(agent.id)}
              >
                {agent.emoji} {agent.name}
              </Badge>
            ))}
            {selectedAgents.length > 0 && (
              <Badge variant="outline" className="cursor-pointer text-[10px] px-2 py-0.5"
                onClick={() => setSelectedAgents([])}>
                All ✕
              </Badge>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">🏛️</div>
              <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                Start a discussion. Your 5 advisors will debate and guide the Dev Agent. Filter by agent or @mention to moderate.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {["What should we improve next?", "Review our security posture", "How can we grow revenue?"].map(q => (
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
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary text-primary-foreground whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
              {msg.role === "roundtable" && msg.responses && (
                <div className="space-y-2">
                  {msg.responses.map((r, j) => (
                    <div key={j} className="flex gap-2 items-start">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-sm"
                        style={{ backgroundColor: r.color + "20" }}>
                        {r.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-semibold" style={{ color: r.color }}>
                          {r.name}
                        </span>
                        <div className="bg-card border border-border/50 rounded-2xl rounded-tl-md px-3.5 py-2 text-sm whitespace-pre-wrap mt-0.5">
                          {r.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 py-3">
              <div className="flex -space-x-2">
                {(selectedAgents.length > 0 ? AGENT_LIST.filter(a => selectedAgents.includes(a.id)) : AGENT_LIST).map(a => (
                  <div key={a.id} className="w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 border-background"
                    style={{ backgroundColor: a.color + "30" }}>
                    {a.emoji}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Advisors are debating...</span>
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
              placeholder="Ask the roundtable anything... or @security @ux to target agents"
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-secondary/50 border-border/30 text-sm"
              rows={1}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
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
