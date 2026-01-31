import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  agentName?: string;
  isNotification?: boolean;
};

type ThinkingPhase = "thinking" | "researching" | "composing" | null;

// Helper to get time-based greeting
const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

// Get or create persistent session ID for cross-visit memory
const getOrCreateSessionId = (): string => {
  const STORAGE_KEY = "maya_session_id";
  const existingId = localStorage.getItem(STORAGE_KEY);
  if (existingId) return existingId;
  
  const newId = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, newId);
  return newId;
};

// Check if returning visitor (has existing session)
const isReturningVisitor = () => {
  return !!localStorage.getItem("maya_session_id");
};

// Simulated typing delay - adds characters gradually
const useTypingEffect = (text: string, speed: number = 15) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText("");
      setIsComplete(false);
      return;
    }

    setDisplayedText("");
    setIsComplete(false);
    let index = 0;

    const timer = setInterval(() => {
      if (index < text.length) {
        // Add 1-3 characters at a time for more natural feel
        const chunkSize = Math.floor(Math.random() * 3) + 1;
        setDisplayedText(text.slice(0, index + chunkSize));
        index += chunkSize;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayedText, isComplete };
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<ThinkingPhase>(null);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // CRITICAL: Persist sessionId to localStorage for cross-session memory
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [streamingContent, setStreamingContent] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // CRITICAL: Load conversation history when chat opens
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    
    const loadHistory = async () => {
      setIsInitializing(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-init`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ sessionId }),
          }
        );

        if (!res.ok) {
          console.error("[ChatWidget] Failed to load history:", res.status);
          // Set default greeting if init fails
          const greeting = getTimeGreeting();
          setMessages([{
            role: "assistant",
            content: `${greeting}! 👋 I'm Maya from Your Travel Agent. How can I help you today?`,
            agentName: "Maya",
          }]);
          setHistoryLoaded(true);
          return;
        }

        const data = await res.json();
        console.log("[ChatWidget] Init response:", data);

        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        if (Array.isArray(data.messages) && data.messages.length > 0) {
          // We have history - load it
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              agentName: m.role === "assistant" ? "Maya" : undefined,
            }))
          );
          
          // Add a contextual "welcome back" message if there's history
          if (data.isReturning && data.lastMessageAge) {
            const greeting = getTimeGreeting();
            const welcomeBack: Message = {
              role: "assistant",
              content: `${greeting}! 👋 Welcome back${data.customerName ? `, ${data.customerName}` : ""}! We last chatted ${data.lastMessageAge}. How can I help you today?`,
              agentName: "Maya",
            };
            setMessages(prev => [...prev, welcomeBack]);
          }
        } else {
          // New user - show intro greeting
          const greeting = getTimeGreeting();
          setMessages([{
            role: "assistant",
            content: `${greeting}! 👋 I'm Maya from Your Travel Agent. Looking for some travel deals today? I'd love to help you out!`,
            agentName: "Maya",
          }]);
        }
        
        setHistoryLoaded(true);
      } catch (e) {
        console.error("[ChatWidget] Init error:", e);
        // Fallback greeting
        const greeting = getTimeGreeting();
        setMessages([{
          role: "assistant",
          content: `${greeting}! 👋 I'm Maya from Your Travel Agent. How can I help you today?`,
          agentName: "Maya",
        }]);
        setHistoryLoaded(true);
      } finally {
        setIsInitializing(false);
      }
    };

    loadHistory();
  }, [isOpen, sessionId, historyLoaded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingPhase, streamingContent]);

  useEffect(() => {
    if (isOpen && inputRef.current && !isInitializing) {
      inputRef.current.focus();
    }
  }, [isOpen, isInitializing]);

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
    setTypingAgent("Maya");

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
    setTypingAgent(null);
  }, []);

  const sendMessage = async () => {
    // Prevent sending before session history is loaded; otherwise first message after refresh
    // can go out without context and Maya will appear to "forget".
    if (isInitializing || !historyLoaded) return;
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

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
            // Only send user and assistant messages - filter out system/notification
            messages: [...messages, userMessage]
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: m.role,
                content: m.content,
              })),
            sessionId,
            conversationId,
          }),
        }
      );

      // Get conversation ID from header
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
                setMessages((prev) => [...prev, { role: "assistant", content: "", agentName: "Maya" }]);
              }
              
              assistantContent += content;
              
              // Update the streaming content with small delay for natural feel
              setStreamingContent(assistantContent);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  agentName: "Maya",
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
          agentName: "Maya",
        },
      ]);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center justify-center",
          "w-14 h-14 rounded-full shadow-lg transition-all duration-300",
          "bg-gradient-to-r from-primary to-primary/80 hover:scale-110",
          isOpen && "scale-0 opacity-0"
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6 text-primary-foreground" />
      </button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col",
          "w-[380px] h-[520px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)]",
          "bg-background border rounded-2xl shadow-2xl",
          "transition-all duration-300 origin-bottom-right",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-semibold">
                M
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Maya</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {thinkingPhase ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Typing</span>
                  </>
                ) : (
                  "Travel Consultant • Online"
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="flex flex-col gap-3">
            {/* Loading state while initializing */}
            {isInitializing && (
              <div className="flex justify-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading conversation...</span>
                </div>
              </div>
            )}
            
            {!isInitializing && messages.map((message, index) => (
              <div key={index} className="flex flex-col gap-1">
                {/* Notification messages (like "Maya has joined") */}
                {message.isNotification ? (
                  <div className="flex justify-center my-2">
                    <span className="text-xs text-muted-foreground bg-muted/30 px-3 py-1 rounded-full">
                      {message.content}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Show agent name for assistant messages */}
                    {message.role === "assistant" && message.agentName && (
                      <span className="text-xs text-muted-foreground ml-1 font-medium">
                        {message.agentName}
                      </span>
                    )}
                    {message.role === "system" && !message.isNotification && (
                      <span className="text-xs text-muted-foreground ml-1 italic">
                        System
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : message.role === "system"
                            ? "bg-muted/50 text-muted-foreground italic rounded-bl-md border border-border"
                            : "bg-muted text-foreground rounded-bl-md"
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            
            {/* Thinking indicator - just animated dots */}
            {thinkingPhase && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
               disabled={isLoading || isInitializing || !historyLoaded}
              className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || isInitializing || !historyLoaded}
              size="icon"
              className="rounded-full shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
