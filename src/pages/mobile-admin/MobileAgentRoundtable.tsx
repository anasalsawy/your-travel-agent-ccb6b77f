import { useState, useRef, useEffect, useCallback } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { Send, Loader2, Trash2, Users, Square, Target, CheckCircle2, Circle, ArrowRight, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface AgentResponse {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  content: string;
}

interface Message {
  role: "user" | "agent" | "system";
  content?: string;
  response?: AgentResponse;
}

interface PlanTask {
  id: number;
  task: string;
  assignee: string;
  detail: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  result?: string;
}

type Phase = "idle" | "discussing" | "planning" | "executing" | "complete";

const AGENTS = [
  { id: "dev", name: "Dev Agent", emoji: "🔧", color: "#6366f1" },
  { id: "security", name: "Security", emoji: "🛡️", color: "#ef4444" },
  { id: "ux", name: "UX/Product", emoji: "🎨", color: "#8b5cf6" },
  { id: "architect", name: "Architecture", emoji: "🏗️", color: "#0ea5e9" },
  { id: "business", name: "Business", emoji: "📈", color: "#f59e0b" },
  { id: "ops", name: "Operations", emoji: "⚙️", color: "#10b981" },
];

const ORCHESTRATOR = { id: "orchestrator", name: "Orchestrator", emoji: "🎯", color: "#f97316" };

const MAX_STORED = 60;
const MS_PER_CHAR = 18;
const MIN_PAUSE = 4000;
const MAX_PAUSE = 14000;

const readingDelay = (text: string) => Math.min(MAX_PAUSE, Math.max(MIN_PAUSE, text.length * MS_PER_CHAR));

const sleepInterruptible = (ms: number, stopRef: React.MutableRefObject<boolean>) =>
  new Promise<void>((resolve) => {
    let elapsed = 0;
    const check = () => {
      if (stopRef.current || elapsed >= ms) { resolve(); return; }
      elapsed += 200;
      setTimeout(check, 200);
    };
    check();
  });

const trim = (t: string) => (t.length > 600 ? t.slice(0, 600) + "…" : t);

async function callRoundtable(body: any, signal?: AbortSignal) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-roundtable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function MobileAgentRoundtable() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<PlanTask[]>([]);
  const [topic, setTopic] = useState("");
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const stopRef = useRef(false);
  const loopIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, plan]);

  const buildHistory = useCallback((msgs: Message[]) => {
    return msgs.slice(-24).map(m => {
      if (m.role === "user") return { role: "user", content: trim(m.content || "") };
      if (m.role === "system") return { role: "user", content: trim(`[🎯 Orchestrator]: ${m.content}`) };
      if (m.response) return { role: "assistant", content: trim(`[${m.response.emoji} ${m.response.name}]: ${m.response.content}`) };
      return null;
    }).filter(Boolean);
  }, []);

  // ─── PHASE 1: DISCUSSION LOOP ───
  const runDiscussion = useCallback(async (startMessages: Message[], discussionTopic: string) => {
    const thisLoopId = ++loopIdRef.current;
    stopRef.current = false;
    setPhase("discussing");

    let currentMsgs = startMessages;
    let turnCount = 0;
    let prevSpeaker = "";

    // Orchestrator opening
    const openingMsg: Message = { role: "system", content: `Starting focused discussion on: "${discussionTopic}". I'll guide each agent to contribute their expertise.` };
    currentMsgs = [...currentMsgs, openingMsg].slice(-MAX_STORED);
    setMessages([...currentMsgs]);
    await sleepInterruptible(2000, stopRef);

    while (!stopRef.current && loopIdRef.current === thisLoopId) {
      // Step 1: Orchestrator decides who speaks next
      setCurrentAgent("orchestrator");
      setStatusText("Orchestrator is deciding...");

      try {
        const ac = new AbortController();
        abortRef.current = ac;
        const decision = await callRoundtable({
          mode: "orchestrate",
          messages: buildHistory(currentMsgs),
          topic: discussionTopic,
          turnCount,
        }, ac.signal);

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;

        // Decision: move to planning
        if (decision.action === "plan") {
          const summaryMsg: Message = { role: "system", content: `Discussion complete. ${decision.summary || "Moving to action planning."} Synthesizing into an action plan...` };
          currentMsgs = [...currentMsgs, summaryMsg].slice(-MAX_STORED);
          setMessages([...currentMsgs]);
          setCurrentAgent(null);
          await sleepInterruptible(2000, stopRef);
          if (stopRef.current) break;

          // Generate plan
          setPhase("planning");
          setCurrentAgent("orchestrator");
          setStatusText("Building action plan...");

          const ac2 = new AbortController();
          abortRef.current = ac2;
          const planData = await callRoundtable({
            mode: "plan",
            messages: buildHistory(currentMsgs),
            topic: discussionTopic,
          }, ac2.signal);

          if (stopRef.current || loopIdRef.current !== thisLoopId) break;

          const tasks: PlanTask[] = (planData.plan || []).map((t: any) => ({ ...t, status: "pending" as const }));
          setPlan(tasks);

          const planMsg: Message = { role: "system", content: `Action plan ready — ${tasks.length} tasks. Starting execution.` };
          currentMsgs = [...currentMsgs, planMsg].slice(-MAX_STORED);
          setMessages([...currentMsgs]);
          setCurrentAgent(null);
          await sleepInterruptible(3000, stopRef);
          if (stopRef.current) break;

          // Execute plan
          await executePlan(tasks, currentMsgs, discussionTopic, thisLoopId);
          return;
        }

        // Decision: continue discussion
        const directive = decision.directive || "Share your perspective.";
        const nextAgentId = decision.nextAgentId || "dev";
        const nextAgent = AGENTS.find(a => a.id === nextAgentId);

        // Show orchestrator's directive
        const directiveMsg: Message = { role: "system", content: `${nextAgent?.emoji || "🔧"} ${nextAgent?.name || nextAgentId}, ${directive}` };
        currentMsgs = [...currentMsgs, directiveMsg].slice(-MAX_STORED);
        setMessages([...currentMsgs]);
        await sleepInterruptible(1500, stopRef);
        if (stopRef.current || loopIdRef.current !== thisLoopId) break;

        // Step 2: Agent speaks
        setCurrentAgent(nextAgentId);
        setStatusText(`${nextAgent?.name || nextAgentId} is thinking...`);

        const ac3 = new AbortController();
        abortRef.current = ac3;
        const agentData = await callRoundtable({
          mode: "speak",
          messages: buildHistory(currentMsgs),
          topic: discussionTopic,
          currentAgentId: nextAgentId,
          directive,
          previousAgentName: prevSpeaker,
        }, ac3.signal);

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;

        const response: AgentResponse = agentData.response;
        const agentMsg: Message = { role: "agent", response };
        currentMsgs = [...currentMsgs, agentMsg].slice(-MAX_STORED);
        setMessages([...currentMsgs]);

        prevSpeaker = response.name;
        turnCount++;

        // Reading pause
        setCurrentAgent(null);
        setStatusText("Reading...");
        await sleepInterruptible(readingDelay(response.content), stopRef);

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;
      } catch (err: any) {
        if (stopRef.current) break;
        console.error("Discussion error:", err);
        toast.error(err?.message || "Discussion error");
        break;
      }
    }

    setPhase(prev => prev === "discussing" ? "idle" : prev);
    setCurrentAgent(null);
    setStatusText("");
  }, [buildHistory]);

  // ─── PHASE 3: EXECUTION LOOP ───
  const executePlan = useCallback(async (tasks: PlanTask[], msgs: Message[], discussionTopic: string, thisLoopId: number) => {
    setPhase("executing");
    let currentMsgs = msgs;
    const tasksCopy = [...tasks];

    for (let i = 0; i < tasksCopy.length; i++) {
      if (stopRef.current || loopIdRef.current !== thisLoopId) break;

      const task = tasksCopy[i];
      task.status = "in_progress";
      setPlan([...tasksCopy]);

      const agent = AGENTS.find(a => a.id === task.assignee);
      setCurrentAgent(task.assignee);
      setStatusText(`${agent?.emoji || "🔧"} Working on: ${task.task}`);

      try {
        const ac = new AbortController();
        abortRef.current = ac;
        const result = await callRoundtable({
          mode: "execute",
          messages: buildHistory(currentMsgs),
          topic: discussionTopic,
          task,
          allTasks: tasksCopy,
        }, ac.signal);

        if (stopRef.current || loopIdRef.current !== thisLoopId) break;

        const response: AgentResponse = result.response;
        const isBlocked = response.content.toUpperCase().includes("BLOCKED:");
        task.status = isBlocked ? "blocked" : "done";
        task.result = response.content;
        setPlan([...tasksCopy]);

        const execMsg: Message = { role: "agent", response };
        currentMsgs = [...currentMsgs, execMsg].slice(-MAX_STORED);
        setMessages([...currentMsgs]);

        // Reading pause
        setCurrentAgent(null);
        setStatusText(isBlocked ? `⚠️ Task blocked` : `✅ Task ${i + 1}/${tasksCopy.length} complete`);
        await sleepInterruptible(readingDelay(response.content), stopRef);

      } catch (err: any) {
        if (stopRef.current) break;
        task.status = "blocked";
        task.result = err?.message || "Execution failed";
        setPlan([...tasksCopy]);
        toast.error(`Task ${i + 1} failed`);
      }
    }

    if (!stopRef.current && loopIdRef.current === thisLoopId) {
      const doneCount = tasksCopy.filter(t => t.status === "done").length;
      const blockedCount = tasksCopy.filter(t => t.status === "blocked").length;
      const completeMsg: Message = { role: "system", content: `Execution complete. ${doneCount}/${tasksCopy.length} tasks done${blockedCount > 0 ? `, ${blockedCount} blocked` : ""}.` };
      setMessages(prev => [...prev, completeMsg].slice(-MAX_STORED));
      setPhase("complete");
    }

    setCurrentAgent(null);
    setStatusText("");
  }, [buildHistory]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    // If already running, inject as user interjection
    if (phase === "discussing" || phase === "executing") {
      const userMsg: Message = { role: "user", content: text };
      setMessages(prev => [...prev, userMsg].slice(-MAX_STORED));
      setInput("");
      return;
    }

    // Start new discussion
    const userMsg: Message = { role: "user", content: text };
    const updated = [...messages, userMsg].slice(-MAX_STORED);
    setMessages(updated);
    setInput("");
    setTopic(text);
    setPlan([]);
    runDiscussion(updated, text);
  };

  const stopLoop = () => {
    stopRef.current = true;
    loopIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setCurrentAgent(null);
    setStatusText("");
  };

  const clearAll = () => {
    stopLoop();
    setMessages([]);
    setPlan([]);
    setTopic("");
  };

  const isRunning = phase === "discussing" || phase === "planning" || phase === "executing";
  const completedTasks = plan.filter(t => t.status === "done").length;
  const progressPercent = plan.length > 0 ? (completedTasks / plan.length) * 100 : 0;

  const phaseLabel = {
    idle: "Ready",
    discussing: "🗣️ Discussion",
    planning: "📋 Planning",
    executing: "⚡ Executing",
    complete: "✅ Complete",
  }[phase];

  const phaseColor = {
    idle: "text-muted-foreground",
    discussing: "text-amber-500",
    planning: "text-blue-500",
    executing: "text-emerald-500",
    complete: "text-green-500",
  }[phase];

  return (
    <MobileAdminLayout title="AI Roundtable">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="px-4 py-2 border-b border-border/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className={`text-xs font-semibold ${phaseColor}`}>{phaseLabel}</span>
              {isRunning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive animate-pulse">LIVE</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isRunning && (
                <Button variant="destructive" size="sm" onClick={stopLoop} className="text-xs gap-1 h-7">
                  <Square className="w-3 h-3" /> Stop
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs gap-1 h-7">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Agent indicators */}
          <div className="flex gap-1 items-center">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${currentAgent === "orchestrator" ? "ring-2 ring-orange-400 ring-offset-1 ring-offset-background scale-125" : "opacity-40"}`}
              style={{ backgroundColor: ORCHESTRATOR.color + "25" }}
              title="Orchestrator"
            >
              {ORCHESTRATOR.emoji}
            </div>
            <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
            {AGENTS.map((agent) => (
              <div
                key={agent.id}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                  currentAgent === agent.id ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-125" : "opacity-40"
                }`}
                style={{ backgroundColor: agent.color + "25" }}
                title={agent.name}
              >
                {agent.emoji}
              </div>
            ))}
          </div>

          {/* Progress bar during execution */}
          {(phase === "executing" || phase === "complete") && plan.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{completedTasks}/{plan.length} tasks</span>
                <span className="text-[10px] text-muted-foreground">{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
            </div>
          )}

          {/* Status text */}
          {statusText && (
            <div className="flex items-center gap-1.5">
              {isRunning && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              <span className="text-[10px] text-muted-foreground truncate">{statusText}</span>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">🎯</div>
              <p className="text-sm font-medium">Goal-Directed Roundtable</p>
              <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
                Set a topic → Agents discuss under orchestrator guidance → Action plan is formed → Tasks are executed with progress tracking.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {["How can we improve conversion rate?", "Review our security posture", "Plan the next major feature"].map(q => (
                  <Button key={q} variant="outline" size="sm" className="text-xs rounded-full" onClick={() => setInput(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" && (
                <div className="flex justify-end my-3">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary text-primary-foreground whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
              {msg.role === "system" && (
                <div className="flex gap-2 items-start my-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-sm" style={{ backgroundColor: ORCHESTRATOR.color + "20" }}>
                    {ORCHESTRATOR.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold" style={{ color: ORCHESTRATOR.color }}>Orchestrator</span>
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl rounded-tl-md px-3.5 py-2 text-sm whitespace-pre-wrap mt-0.5 italic">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )}
              {msg.role === "agent" && msg.response && (
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-sm" style={{ backgroundColor: msg.response.color + "20" }}>
                    {msg.response.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold" style={{ color: msg.response.color }}>{msg.response.name}</span>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-md px-3.5 py-2 text-sm whitespace-pre-wrap mt-0.5">
                      {msg.response.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Plan display */}
          {plan.length > 0 && (
            <div className="bg-card border border-border/50 rounded-xl p-3 space-y-2 my-3">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Action Plan</span>
              </div>
              {plan.map((task) => {
                const agent = AGENTS.find(a => a.id === task.assignee);
                return (
                  <div key={task.id} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${task.status === "in_progress" ? "bg-primary/5 ring-1 ring-primary/20" : task.status === "done" ? "opacity-60" : task.status === "blocked" ? "bg-destructive/5" : ""}`}>
                    {task.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" /> :
                     task.status === "in_progress" ? <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0 mt-0.5" /> :
                     task.status === "blocked" ? <Square className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" /> :
                     <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={task.status === "done" ? "line-through text-muted-foreground" : "font-medium"}>{task.task}</span>
                        <span className="text-[10px]" style={{ color: agent?.color }}>{agent?.emoji}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">{task.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border/50 bg-card/80 backdrop-blur-xl">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={isRunning ? "Interject — agents will see this..." : "Set a topic for the roundtable..."}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-secondary/50 border-border/30 text-sm"
              rows={1}
            />
            <Button onClick={sendMessage} disabled={!input.trim()} size="icon" className="rounded-xl h-11 w-11 flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </MobileAdminLayout>
  );
}
