import { useState, useRef, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Send, Code, User, Loader2, Sparkles, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ActionLogEntry {
  tool: string;
  args_summary: string;
  success: boolean;
  round: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  action_log?: ActionLogEntry[];
}

export default function MobileDevAgent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey boss! 👋 Agent here, fully loaded and ready to roll.\n\nI've got access to everything — database, emails, flights, payments, GitHub, AI models, the works. Just tell me what you need and I'll handle it.\n\nI'll always check with you before doing anything that changes stuff. Ask me anything!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const clearChat = () => {
    setMessages([{ role: "assistant", content: "💬 Chat cleared. What's next?" }]);
    setExpandedLogs({});
  };

  const toggleLog = (index: number) => {
    setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
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

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent, action_log: actionLog },
      ]);

      if (actionLog.length > 0) {
        setExpandedLogs(prev => ({ ...prev, [updatedMessages.length]: true }));
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

  return (
    <MobileAdminLayout title="Dev Agent">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">20 tools • verified action log</span>
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
                <span className="text-xs text-muted-foreground">Working...</span>
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
              placeholder="Search flights, create voucher, send email, call customer..."
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
