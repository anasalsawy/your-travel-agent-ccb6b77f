import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Plane, Car, CreditCard, HelpCircle, Brain, Search, PenTool, MessageSquare, Zap, Shield, User, ArrowRight, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { VoiceButton } from "@/components/chat/VoiceButton";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import logo from "@/assets/logo-black-gold-shield.png";
import carRentalSuv from "@/assets/car-rental-suv.jpg";
import carRentalSedan from "@/assets/car-rental-sedan.jpg";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ThinkingPhase = "thinking" | "researching" | "composing" | null;

// Persist session ID so returning visitors keep the same conversation context.
const getOrCreateSessionId = (): string => {
  const STORAGE_KEY = "maya_session_id";
  const existingId = localStorage.getItem(STORAGE_KEY);
  if (existingId) return existingId;
  const newId = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, newId);
  return newId;
};

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<ThinkingPhase>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isStaffOrAdmin, setIsStaffOrAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceEnabled] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);


  const voice = useVoiceChat({
    onError: (error) => console.error("Voice error:", error),
  });

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkStaffOrAdminRole(session.user.id);
      } else {
        setIsStaffOrAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkStaffOrAdminRole(session.user.id);
      }
    });
  }, []);

  const checkStaffOrAdminRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "staff"]);
    setIsStaffOrAdmin((data?.length || 0) > 0);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingPhase]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) {
        clearTimeout(phaseTimerRef.current);
      }
    };
  }, []);

  const startThinkingPhases = useCallback(() => {
    setThinkingPhase("thinking");
    phaseTimerRef.current = setTimeout(() => {
      setThinkingPhase("researching");
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

  const startConversation = async (initialMessage?: string) => {
    setHasStarted(true);

    if (!historyLoaded) {
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

        if (res.ok) {
          const data = await res.json();
          if (data?.conversationId) setConversationId(data.conversationId);

          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            setMessages(
              data.messages.map((m: { role: string; content: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              }))
            );
          } else {
            setMessages([
              {
                role: "assistant",
                content:
                  "Hey! 👋 I'm Maya, your personal travel agent. I can find you discounted flights, book tickets, search for deals, and handle everything travel-related. What can I help you with today?",
              },
            ]);
          }
        } else {
          setMessages([
            {
              role: "assistant",
              content:
                "Hey! 👋 I'm Maya, your personal travel agent. I can find you discounted flights, book tickets, search for deals, and handle everything travel-related. What can I help you with today?",
            },
          ]);
        }
      } catch (e) {
        console.error("[Index] Failed to init chat session:", e);
        setMessages([
          {
            role: "assistant",
            content:
              "Hey! 👋 I'm Maya, your personal travel agent. I can find you discounted flights, book tickets, search for deals, and handle everything travel-related. What can I help you with today?",
          },
        ]);
      } finally {
        setHistoryLoaded(true);
        setIsInitializing(false);
      }
    }

    if (initialMessage) {
      setTimeout(() => {
        setInput(initialMessage);
        inputRef.current?.focus();
      }, 100);
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const sendMessage = async (textOverride?: string, speakResponse = false) => {
    if (isInitializing || !historyLoaded) return;

    const messageText = textOverride || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    if (!textOverride) setInput("");
    setIsLoading(true);
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

      if (speakResponse && voiceEnabled && assistantContent) {
        await voice.speakText(assistantContent);
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
      voice.setIdle();
    }
  };

  const handleVoicePress = () => {
    if (voice.isSpeaking) {
      voice.stopSpeaking();
      return;
    }
    voice.startRecording();
  };

  const handleVoiceRelease = async () => {
    if (!voice.isRecording) return;
    
    const audioBlob = await voice.stopRecording();
    if (!audioBlob || audioBlob.size < 1000) {
      voice.setIdle();
      return;
    }

    const transcription = await voice.transcribeAudio(audioBlob);
    if (transcription) {
      voice.setProcessing();
      await sendMessage(transcription, true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: "Find me a cheap flight", icon: Plane },
    { label: "I need a ticket quote", icon: CreditCard },
    { label: "How does this work?", icon: HelpCircle },
  ];

  // Welcome screen before chat starts
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2">
                <img src={logo} alt="Your Travel Agent" className="w-10 h-10 object-contain" />
                <span className="font-display font-bold text-lg hidden sm:block">Your Travel Agent</span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/request-ticket">Flights</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/car-rental">Car Rental</Link>
                </Button>
                {user ? (
                  <>
                    {isStaffOrAdmin && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/admin">Admin</Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/dashboard">
                        <User className="w-4 h-4 mr-2" />
                        Dashboard
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/auth">Sign In</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="pt-16">
          {/* Hero Section - Promotional */}
          <section className="py-12 md:py-16 bg-gradient-to-b from-background to-muted/30">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto text-center">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground mb-4">
                  Fly for Less with <span className="text-success">Your Personal Travel Agent</span>
                </h1>
                <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Custom flight quotes and rental cars at unbeatable prices. Find a better deal anywhere and we'll beat it.
                </p>

                {/* Trust Badges */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20">
                    <Shield className="w-4 h-4 text-success" />
                    <span className="font-bold text-success">Trusted Concierge</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="font-bold text-primary">Lowest Price Guaranteed</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-amber-600">We Beat Any Price</span>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
                  <Button
                    size="lg"
                    asChild
                    className="rounded-full px-8 shadow-xl shadow-primary/20"
                  >
                    <Link to="/request-ticket">
                      <Plane className="w-5 h-5 mr-2" />
                      Request a Flight
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="rounded-full px-8"
                  >
                    <Link to="/car-rental">
                      <Car className="w-5 h-5 mr-2" />
                      Rent a Car
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>


          {/* Car Rental Section */}
          <section className="py-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
            <div className="container mx-auto px-4 relative z-10">
              <div className="max-w-5xl mx-auto">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  {/* Left: Images */}
                  <div className="relative">
                    <img 
                      src={carRentalSuv} 
                      alt="Premium SUV rental" 
                      className="rounded-2xl shadow-2xl w-full object-cover h-[280px]" 
                    />
                    <img 
                      src={carRentalSedan} 
                      alt="Luxury sedan rental" 
                      className="absolute -bottom-6 -right-4 w-40 h-40 rounded-xl shadow-xl object-cover border-4 border-background hidden md:block" 
                    />
                  </div>

                  {/* Right: Content */}
                  <div>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-4">
                      <Car className="w-4 h-4 text-accent" />
                      <span className="text-sm font-bold text-accent">CAR RENTAL SERVICE</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
                      Need a Car? We've Got You Covered.
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      From compact city cars to luxury SUVs — tell us what you need and we'll find the best rental deal for you. No hidden fees, best price guaranteed.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="flex items-center gap-2 text-sm">
                        <Shield className="w-4 h-4 text-success flex-shrink-0" />
                        <span className="text-muted-foreground">Best Price Guarantee</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="w-4 h-4 text-accent flex-shrink-0" />
                        <span className="text-muted-foreground">Quote in 24 Hours</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">Free Cancellation</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Car className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">All Car Types</span>
                      </div>
                    </div>

                    <Button size="lg" asChild className="rounded-full px-8">
                      <Link to="/car-rental">
                        <Car className="w-5 h-5 mr-2" />
                        Request a Car Rental
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Request a Ticket Section */}
          <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="max-w-3xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
                  <Plane className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-primary">CUSTOM FLIGHT QUOTES</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
                  Need a Specific Flight?
                </h2>
                <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                  Tell us where you want to go and we'll find you the best deal. We guarantee the lowest price — if you find cheaper, we'll beat it.
                </p>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">1</span>
                    </div>
                    <h3 className="font-semibold mb-1">Submit Your Request</h3>
                    <p className="text-sm text-muted-foreground">Tell us your destination and dates</p>
                  </div>
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">2</span>
                    </div>
                    <h3 className="font-semibold mb-1">Get Your Quote</h3>
                    <p className="text-sm text-muted-foreground">We find the best discounted price</p>
                  </div>
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">3</span>
                    </div>
                    <h3 className="font-semibold mb-1">Book & Save</h3>
                    <p className="text-sm text-muted-foreground">Pay less than market price</p>
                  </div>
                </div>

                <Button size="lg" asChild className="rounded-full px-8">
                  <Link to="/request-ticket">
                    <Plane className="w-5 h-5 mr-2" />
                    Request a Quote Now
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Chat with Maya Section - Bottom */}
          <section className="py-16 bg-gradient-to-b from-muted/30 to-background">
            <div className="container mx-auto px-4">
              <div className="max-w-2xl mx-auto text-center">
                {/* Maya Avatar */}
                <div className="relative inline-flex mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center text-primary-foreground text-2xl font-bold shadow-xl shadow-primary/30">
                    M
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-3 border-background flex items-center justify-center">
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                </div>

                <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">
                  Chat with Maya
                </h2>
                <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                  Have questions? Our AI travel agent can help you find deals, get quotes, and answer any questions.
                </p>

                <Button 
                  size="lg" 
                  onClick={() => startConversation()}
                  disabled={isInitializing}
                  className="rounded-full px-8"
                >
                  {isInitializing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-5 h-5 mr-2" />
                      Start Chatting
                    </>
                  )}
                </Button>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-6 border-t border-border/50">
          <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/car-rental" className="hover:text-foreground transition-colors">Car Rental</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </footer>
      </div>
    );
  }

  // Full Chat Interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Chat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setHasStarted(false)} 
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <img src={logo} alt="Your Travel Agent" className="w-8 h-8 object-contain" />
              </button>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold">
                    M
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
                </div>
                <div>
                  <h1 className="font-semibold text-foreground">Maya</h1>
                  <p className="text-xs text-muted-foreground">
                    {voice.isRecording ? "🎤 Listening..." : 
                     voice.isTranscribing ? "Processing..." :
                     voice.isSpeaking ? "🔊 Speaking..." :
                     "Online • Your travel agent"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard">
                    <User className="w-4 h-4" />
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
              )}
              {isStaffOrAdmin && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin">Admin</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 pt-16 pb-24">
        <ScrollArea className="h-[calc(100vh-10rem)]" ref={scrollRef}>
          <div className="container max-w-3xl mx-auto px-4 py-6">
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
                      "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {/* Thinking indicator */}
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
                        Looking into this...
                      </>
                    )}
                    {thinkingPhase === "composing" && (
                      <>
                        <PenTool className="w-3 h-3 animate-pulse" />
                        Composing response...
                      </>
                    )}
                  </span>
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </main>

      {/* Quick Actions (first message only) */}
      {messages.length <= 3 && (
        <div className="fixed bottom-24 left-0 right-0 z-40">
          <div className="container max-w-3xl mx-auto px-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput(action.label);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full text-xs bg-background/80 backdrop-blur-sm"
                >
                  <action.icon className="w-3 h-3 mr-1.5" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border">
        <div className="container max-w-3xl mx-auto px-4 py-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Maya..."
              disabled={isLoading || isInitializing || !historyLoaded}
              className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1 h-12 px-5"
            />
            <VoiceButton
              state={voice.state}
              onPress={handleVoicePress}
              onRelease={handleVoiceRelease}
              disabled={isLoading || isInitializing || !historyLoaded}
              className="h-12 w-12 rounded-full"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading || isInitializing || !historyLoaded}
              size="icon"
              className="rounded-full h-12 w-12"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
