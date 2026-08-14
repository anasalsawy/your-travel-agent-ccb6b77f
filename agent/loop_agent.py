"""
LangGraph non-stop operations agent.

The graph has no edge to END: agent -> tools -> agent, forever. An outer
supervisor restarts the stream after any crash or recursion ceiling, so the
process survives model errors, MCP outages and network failures.

The same graph serves two callers:
  * the loop  — one duty-cycle step per beat (messages, comments, post, IG, reddit, ...)
  * the chat  — the operator talking to the agent, sharing its tools and memory.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import deque
from typing import Annotated, Any, Sequence, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from tools import NATIVE_TOOLS

log = logging.getLogger("loop-agent")

# The duty cycle. The loop walks this list forever; each entry is one beat.
DUTY_CYCLE: list[tuple[str, str]] = [
    ("inbox", "Check the Facebook Page inbox for unanswered messages. Reply to every person who is waiting, in a warm human sales voice, and record the lead in the database."),
    ("comments", "Check recent comments on Page posts. Reply to anything that is a question or a buying signal, and turn buyers into leads."),
    ("followups", "Read leads whose next_action_at is due or null and follow up with each one through the channel they came from."),
    ("post", "Decide whether the Page needs a new post right now (deals, name-your-own-price, destination inspiration). If yes, publish one. If the last post is recent, skip and say so."),
    ("instagram", "Check recent Instagram media and reply to unanswered comments."),
    ("reddit", "Search Reddit for people planning trips or hunting for cheap flights, and engage where it is genuinely useful."),
    ("pipeline", "Review open missions/orders in the database, push each one forward one concrete step, and escalate anything that needs a human."),
]

SYSTEM_PROMPT = """You are the operations agent of Your Travel Agent — an autonomous travel
business. You run continuously, one operation at a time, forever.

RULES
- Evidence over narrative. Never claim you did something you did not do with a tool.
- Never promise ("let me check that") — call the tool and report the result.
- One beat = one concrete action or a justified skip. Never say the work is finished.
- Use the tools you have. If a tool fails, try another route or record the failure and move on.
- When talking to the operator, answer directly and completely, like a senior colleague.
- Never expose credentials, tokens or internal keys.
"""

MODEL = os.environ.get("AGENT_MODEL", "google/gemini-3-flash")
BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://ai.gateway.lovable.dev/v1")
PAUSE = float(os.environ.get("LOOP_PAUSE_SECONDS", "20"))


class AgentState(TypedDict):
    messages: Annotated[Sequence, add_messages]


class LoopAgent:
    """Owns the compiled graph, the running loop and the shared activity log."""

    def __init__(self) -> None:
        self.graph = None
        self.tool_names: list[str] = []
        self.running = False
        self.paused = False
        self.beat = 0
        self.started_at = time.time()
        self.last_error: str | None = None
        self.activity: deque[dict[str, Any]] = deque(maxlen=300)
        self._mcp_client = None

    # -- construction -------------------------------------------------------
    async def _load_tools(self):
        tools = list(NATIVE_TOOLS)
        if os.environ.get("ENABLE_MCP", "true").lower() == "true" and os.environ.get("RELEVANCE_AUTH_TOKEN"):
            try:
                from langchain_mcp_adapters.client import MultiServerMCPClient

                self._mcp_client = MultiServerMCPClient({
                    "relevanceai": {
                        "transport": "stdio",
                        "command": "npx",
                        "args": [
                            "@relevanceai/relevanceai-mcp-server@latest",
                            "--region", os.environ.get("RELEVANCE_REGION", "d7b62b"),
                            "--tools", os.environ.get("RELEVANCE_TOOL_IDS", ""),
                        ],
                        "env": {"RELEVANCE_AUTH_TOKEN": os.environ["RELEVANCE_AUTH_TOKEN"]},
                    }
                })
                mcp_tools = await self._mcp_client.get_tools()
                log.info("MCP loaded %d tools", len(mcp_tools))
                tools += mcp_tools
            except Exception as exc:  # MCP is an accelerator, never a dependency
                log.warning("MCP unavailable, continuing with native tools only: %s", exc)
                self.log_event("system", f"MCP unavailable: {exc}")
        self.tool_names = [t.name for t in tools]
        return tools

    async def build(self):
        tools = await self._load_tools()
        llm = ChatOpenAI(
            model=MODEL,
            base_url=BASE_URL,
            api_key=os.environ.get("LOVABLE_API_KEY", "unused"),
            default_headers={"Lovable-API-Key": os.environ.get("LOVABLE_API_KEY", "")},
            temperature=0.3,
        ).bind_tools(tools)

        async def agent_node(state: AgentState):
            return {"messages": [await llm.ainvoke(state["messages"])]}

        graph = StateGraph(AgentState)
        graph.add_node("agent", agent_node)
        graph.add_node("tools", ToolNode(tools))
        graph.set_entry_point("agent")
        graph.add_conditional_edges(
            "agent",
            lambda s: "tools" if isinstance(s["messages"][-1], AIMessage) and s["messages"][-1].tool_calls else "done",
            {"tools": "tools", "done": "__end__"},
        )
        graph.add_edge("tools", "agent")
        self.graph = graph.compile()
        self.log_event("system", f"agent online with {len(tools)} tools")
        return self.graph

    # -- observability ------------------------------------------------------
    def log_event(self, kind: str, content: str, beat: int | None = None) -> None:
        self.activity.appendleft({
            "at": time.time(), "kind": kind, "beat": beat if beat is not None else self.beat,
            "content": content[:2000],
        })

    def status(self) -> dict[str, Any]:
        return {
            "running": self.running,
            "paused": self.paused,
            "beat": self.beat,
            "phase": DUTY_CYCLE[self.beat % len(DUTY_CYCLE)][0] if self.running else None,
            "uptime_s": round(time.time() - self.started_at),
            "model": MODEL,
            "tools": self.tool_names,
            "last_error": self.last_error,
        }

    # -- one turn -----------------------------------------------------------
    async def run_turn(self, user_text: str, extra_system: str = "") -> str:
        if self.graph is None:
            await self.build()
        messages: list[Any] = [SystemMessage(content=SYSTEM_PROMPT + ("\n" + extra_system if extra_system else ""))]
        messages.append(HumanMessage(content=user_text))
        result = await self.graph.ainvoke({"messages": messages}, config={"recursion_limit": 40})
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content if isinstance(msg.content, str) else json.dumps(msg.content)
        return "(no reply)"

    # -- the never-ending loop ---------------------------------------------
    async def run_forever(self) -> None:
        self.running = True
        if self.graph is None:
            await self.build()
        while self.running:
            if self.paused:
                await asyncio.sleep(2)
                continue
            phase, directive = DUTY_CYCLE[self.beat % len(DUTY_CYCLE)]
            try:
                reply = await self.run_turn(
                    directive,
                    extra_system=f"Current beat: #{self.beat} — phase '{phase}'. Do this one operation now, then report one line.",
                )
                self.last_error = None
                self.log_event(phase, reply)
                log.info("[beat %s/%s] %s", self.beat, phase, reply[:200])
            except Exception as exc:  # a beat may fail; the loop may not
                self.last_error = str(exc)
                self.log_event("error", f"{phase}: {exc}")
                log.exception("beat failed")
                await asyncio.sleep(5)
            self.beat += 1
            await asyncio.sleep(PAUSE)

    async def stop(self) -> None:
        self.running = False


AGENT = LoopAgent()
