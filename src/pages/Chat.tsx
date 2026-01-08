import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Plane, Shield, CreditCard, Brain, Search, PenTool } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ThinkingPhase = "thinking" | "researching" | "composing" | null;

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey! 👋 Welcome to SpareFare! I'm Maya, and I'm here to help you find the best travel deals. Whether you're looking for flight vouchers, want to request a custom ticket, or just have questions about how we work – I've got you covered. So, what brings you here today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<ThinkingPhase>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingPhase]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup phase timer on unmount
  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) {
        clearTimeout(phaseTimerRef.current);
      }
    };
  }, []);

  // Cycle through thinking phases for human-like feel
  const startThinkingPhases = useCallback(() => {
    setThinkingPhase("thinking");

    // After 800-1200ms, switch to researching
    phaseTimerRef.current = setTimeout(() => {
      setThinkingPhase("researching");
      
      // After another 600-1000ms, switch to composing
      phaseTimerRef.current = setTimeout(() => {
        setThinkingPhase("composing");
      }, 600 + Math.random() * 400);
    }, 800 + Math.random() * 400);
  }, []);

  const stopThinkingPhases = useCallback(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
    }
    setThinkingPhase(null);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Start human-like thinking phases
    startThinkingPhases();

    let assistantContent = "";

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            sessionId,
            conversationId,
          }),
        }
      );

      const newConvId = response.headers.get("X-Conversation-Id");
      if (newConvId) {
        setConversationId(newConvId);
      }

      if (!response.ok || !response.body) {
        throw new Error("Failed to get response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let firstChunkReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              // On first chunk, stop thinking phases and add message
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                stopThinkingPhases();
                setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
              }

              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      stopThinkingPhases();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Oops, something went wrong on my end! Mind trying that again?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: "Find flight deals", icon: Plane },
    { label: "How does escrow work?", icon: Shield },
    { label: "Request a ticket quote", icon: CreditCard },
  ];

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col h-[calc(100vh-12rem)] bg-background border rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-4 p-6 border-b bg-gradient-to-r from-primary/10 to-transparent">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-xl font-bold">
                M
              </div>
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chat with Maya</h1>
              <p className="text-sm text-muted-foreground">Your personal travel consultant • Online now</p>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="flex flex-col gap-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-5 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {/* Thinking phases indicator */}
              {thinkingPhase && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground ml-1 font-medium flex items-center gap-1.5">
                    {thinkingPhase === "thinking" && (
                      <>
                        <Brain className="w-3 h-3 animate-pulse" />
                        Maya is thinking...
                      </>
                    )}
                    {thinkingPhase === "researching" && (
                      <>
                        <Search className="w-3 h-3 animate-pulse" />
                        Maya is looking into this...
                      </>
                    )}
                    {thinkingPhase === "composing" && (
                      <>
                        <PenTool className="w-3 h-3 animate-pulse" />
                        Maya is composing a response...
                      </>
                    )}
                  </span>
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-5 py-3">
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2.5 h-2.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2.5 h-2.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Actions (show only at start) */}
          {messages.length === 1 && (
            <div className="px-6 pb-2">
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInput(action.label);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full text-xs"
                  >
                    <action.icon className="w-3 h-3 mr-1.5" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t bg-muted/30">
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 rounded-full bg-background border focus-visible:ring-1 h-12 px-5"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="lg"
                className="rounded-full h-12 px-6"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Chat;
