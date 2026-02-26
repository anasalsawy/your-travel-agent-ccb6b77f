import { useState, useRef, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Send, Code, User, Loader2, Sparkles, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Circle, Clock, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ActionLogEntry {
  tool: string;
  args_summary: string;
  success: boolean;
  round: number;
  step?: number;
}

interface PlanStep {
  step: number;
  description: string;
  status: "todo" | "in_progress" | "done" | "failed";
}

interface Message {
  role: "user" | "assistant";
  content: string;
  action_log?: ActionLogEntry[];
  plan_steps?: PlanStep[];
  complexity?: "simple" | "complex";
  tool_rounds?: number;
  max_rounds?: number;
}

export default function MobileDevAgent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey boss! 👋 Manus-style agent online.\n\nFull Manus toolset loaded — 39 tools including file ops (read/write/replace/search), browser automation (navigate/click/input/scroll), shell execution, deploy triggers, web search, and all 21 original business tools.\n\nPlanning loop active • 10-round autonomy • No restrictions. Let's get it done.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [expandedPlans, setExpandedPlans] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const clearChat = () => {
    setMessages([{ role: "assistant", content: "💬 Chat cleared. Manus loop ready." }]);
    setExpandedLogs({});
    setExpandedPlans({});
  };

  const toggleLog = (index: number) => {
    setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const togglePlan = (index: number) => {
    setExpandedPlans(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("dev-agent", {
        body: {
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 16384,
          temperature: 0.7,
        },
      });

      if (error) throw error;

      const assistantContent =
        data?.content || data?.response || (typeof data === "string" ? data : "Done. Check the changes.");
      const actionLog: ActionLogEntry[] = data?.action_log || [];
      const planSteps: PlanStep[] = data?.plan_steps || [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantContent,
          action_log: actionLog,
          plan_steps: planSteps,
          complexity: data?.complexity,
          tool_rounds: data?.tool_rounds,
          max_rounds: data?.max_rounds,
        },
      ]);

      // Auto-expand plan and logs
      const msgIndex = updatedMessages.length;
      if (planSteps.length > 0) {
        setExpandedPlans(prev => ({ ...prev, [msgIndex]: true }));
      }
      if (actionLog.length > 0) {
        setExpandedLogs(prev => ({ ...prev, [msgIndex]: true }));
      }
    } catch (err: any) {
      console.error("Dev agent error:", err);
      toast.error("Failed to reach Dev Agent");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${err.message || "Connection failed. Try again."}` },
      ]);
    }

    setIsLoading(false);
  };

  const toolEmoji: Record<string, string> = {
    database_crud: "🗂", database_query: "🗂", database_schema: "🗂",
    send_email: "📧", send_sms: "📱", send_whatsapp: "💬", send_telegram: "💬",
    make_phone_call: "📞", web_search: "🌍", browse_website: "🖥",
    github_action: "🐙", create_checkout: "💰", search_flights: "✈️",
    memory_system: "🧠", rag_search: "🔍", ask_claude: "🤖",
    multi_model_consult: "🤖", invoke_function: "⚡", plan_and_execute: "🧭",
    generate_report: "📊", text_to_speech: "🔊",
  };

  const stepStatusIcon = (status: PlanStep["status"]) => {
    switch (status) {
      case "done": return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />;
      case "in_progress": return <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse flex-shrink-0" />;
      default: return <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />;
    }
  };

  return (
    <MobileAdminLayout title="Dev Agent">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">
              <Brain className="w-3 h-3 inline mr-1" />
              Manus loop • 21 tools • 10-round autonomy
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs gap-1 h-7">
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i}>
              <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Code className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border/50 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* EXECUTION METADATA */}
              {msg.role === "assistant" && msg.tool_rounds !== undefined && msg.tool_rounds > 0 && (
                <div className="ml-9 mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3" />
                  <span>
                    {msg.tool_rounds} round{msg.tool_rounds > 1 ? "s" : ""}
                    {msg.max_rounds ? ` / ${msg.max_rounds} max` : ""}
                    {msg.complexity === "complex" && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[10px] font-medium">
                        COMPLEX
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* PLAN STEPS */}
              {msg.plan_steps && msg.plan_steps.length > 0 && (
                <div className="ml-9 mt-1.5">
                  <button
                    onClick={() => togglePlan(i)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedPlans[i] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <Brain className="w-3 h-3" />
                    <span className="font-medium">
                      Plan: {msg.plan_steps.filter(s => s.status === "done").length}/{msg.plan_steps.length} steps complete
                    </span>
                  </button>
                  
                  {expandedPlans[i] && (
                    <div className="mt-1.5 space-y-1 border-l-2 border-primary/20 pl-3">
                      {msg.plan_steps.map((step, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-xs">
                          {stepStatusIcon(step.status)}
                          <span className={`${step.status === "done" ? "text-muted-foreground line-through" : step.status === "failed" ? "text-destructive" : "text-foreground"}`}>
                            {step.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VERIFIED ACTION LOG */}
              {msg.action_log && msg.action_log.length > 0 && (
                <div className="ml-9 mt-1.5">
                  <button
                    onClick={() => toggleLog(i)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedLogs[i] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span className="font-medium">
                      {msg.action_log.length} verified action{msg.action_log.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-green-500">
                      ({msg.action_log.filter(a => a.success).length} ✓)
                    </span>
                    {msg.action_log.some(a => !a.success) && (
                      <span className="text-destructive">
                        ({msg.action_log.filter(a => !a.success).length} ✗)
                      </span>
                    )}
                  </button>
                  
                  {expandedLogs[i] && (
                    <div className="mt-1.5 space-y-1 border-l-2 border-border/50 pl-3">
                      {msg.action_log.map((action, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-xs">
                          {action.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                          )}
                          <span className="text-muted-foreground">
                            {toolEmoji[action.tool] || "🔧"}{" "}
                            <span className="font-medium text-foreground">{action.tool}</span>
                            {action.args_summary && (
                              <span className="text-muted-foreground/70"> — {action.args_summary}</span>
                            )}
                            <span className="text-muted-foreground/40 ml-1">R{action.round}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* No actions indicator */}
              {msg.role === "assistant" && i > 0 && (!msg.action_log || msg.action_log.length === 0) && !msg.content.startsWith("⚠️") && (
                <div className="ml-9 mt-1 text-xs text-muted-foreground/50 italic">
                  No tools executed — text-only response
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </div>
              <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Planning & executing...</span>
              </div>
            </div>
          )}
        </div>

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
              placeholder="Give me a complex task — I'll plan, execute, and verify..."
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