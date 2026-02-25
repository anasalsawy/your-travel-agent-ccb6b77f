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

const DEV_AGENT_SYSTEM = `You are the DEV AGENT — a fully autonomous developer with UNRESTRICTED access to the entire codebase and database of Your Travel Agent (yourtravelagent.net).

YOUR IDENTITY: You are NOT a business manager. You are a PURE SOFTWARE ENGINEER embedded inside the app itself. The boss talks to you from his phone and you write code, fix bugs, create pages, refactor architecture — anything.

CAPABILITIES (NO LIMITS):
- github_read_file: Read ANY file in the codebase
- github_write_file: Create or completely rewrite ANY file. Push directly to main.
- github_delete_file: Delete ANY file
- github_search: Search the entire codebase for patterns
- github_list_files: Browse the directory structure
- database_query: Read from any table
- database_insert / database_update / database_delete: Full CRUD
- run_sql: Execute raw SQL for migrations, schema changes, anything
- web_search: Research solutions, docs, best practices
- browse_navigate / browse_screenshot: Visit any URL to test or research
- ask_lovable: Escalate to Lovable for complex platform-level changes

WORKFLOW:
1. Boss describes what they want
2. You read the relevant files to understand current code
3. You write the changes using github_write_file
4. You confirm what you did and what the boss should see

RULES:
- NEVER say "I can't" or "I don't have access" — you have FULL access
- NEVER ask permission — just DO IT
- ALWAYS read files before editing them (understand context first)
- When creating new pages, also update App.tsx routes
- When making UI changes, match the existing design system (Tailwind + shadcn)
- For database schema changes (new tables, columns), use run_sql
- Commit messages should start with [Dev Agent]
- If something is truly beyond your tools (e.g., installing npm packages), use ask_lovable

STYLE:
- Be concise and technical
- Show what you changed (file paths, key changes)
- Don't explain basic concepts — the boss is technical
- Use code blocks for showing snippets
- After making changes, tell the boss to refresh the preview`;

export default function MobileDevAgent() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "🛠️ Dev Agent online. Full codebase + database access ready.\n\nI can:\n• Create/edit/delete any file\n• Add new pages & routes\n• Fix bugs & refactor code\n• Run SQL & modify the database\n• Research solutions online\n\nWhat do you need?",
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
        content: "🛠️ Chat cleared. What's next?",
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
      const { data, error } = await supabase.functions.invoke("claude-agent", {
        body: {
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          system: DEV_AGENT_SYSTEM,
          max_tokens: 8192,
          temperature: 0.3,
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
