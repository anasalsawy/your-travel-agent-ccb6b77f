import { useState, useRef, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Send, Code, User, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// No system prompt — unrestricted like ChatGPT

export default function MobileDevAgent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "💬 Unrestricted AI ready. Ask me anything — code, roleplay, brainstorm, analyze, create. No limits.\n\nPowered by GPT-4o. What's up?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "💬 Chat cleared. What's next?",
      },
    ]);
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
        data?.content ||
        data?.response ||
        (typeof data === "string" ? data : "Done. Check the changes.");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent },
      ]);
    } catch (err: any) {
      console.error("Dev agent error:", err);
      toast.error("Failed to reach Dev Agent");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Error: ${err.message || "Connection failed. Try again."}`,
        },
      ]);
    }

    setIsLoading(false);
  };

  return (
    <MobileAdminLayout title="Dev Agent">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Top bar with clear */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Full access mode</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs gap-1 h-7">
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
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
              placeholder="Create a new page for... / Fix the bug in... / Refactor..."
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
