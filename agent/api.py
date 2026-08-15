"""
HTTP surface for the non-stop agent.

  GET  /health          liveness for the container platform
  GET  /status          loop state, beat, phase, tool list
  GET  /activity        recent beats and errors (newest first)
  POST /chat            talk to the agent — same tools, same brain as the loop
  POST /pause /resume   duty-cycle control
  POST /run             force one specific directive immediately

The loop starts with the process, so the agent is working the moment the
container is up — nobody has to click anything.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

from loop_agent import AGENT, DUTY_CYCLE  # noqa: E402  (env must load first)

API_TOKEN = os.environ.get("API_TOKEN", "")


def guard(token: str | None) -> None:
    if API_TOKEN and token != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_supervise())
    yield
    await AGENT.stop()
    task.cancel()


async def _supervise() -> None:
    """Restart the loop forever. A crash is a pause, never a death."""
    while True:
        try:
            await AGENT.run_forever()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            AGENT.log_event("error", f"supervisor restart: {exc}")
            logging.exception("loop died — restarting in 10s")
            await asyncio.sleep(10)


app = FastAPI(title="Your Travel Agent — Non-stop Operations Agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


class ChatIn(BaseModel):
    message: str


class RunIn(BaseModel):
    directive: str


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/status")
async def status():
    return AGENT.status() | {"duty_cycle": [p for p, _ in DUTY_CYCLE]}


@app.get("/activity")
async def activity(limit: int = 60):
    return {"events": list(AGENT.activity)[:limit]}


@app.post("/chat")
async def chat(body: ChatIn, authorization: str | None = Header(default=None)):
    guard(authorization)
    reply = await AGENT.run_turn(
        body.message,
        extra_system="You are talking to the business owner. Answer fully and act with your tools when useful.",
    )
    AGENT.log_event("chat", f"owner: {body.message}\nagent: {reply}")
    return {"reply": reply}


@app.post("/run")
async def run_once(body: RunIn, authorization: str | None = Header(default=None)):
    guard(authorization)
    reply = await AGENT.run_turn(body.directive)
    AGENT.log_event("manual", reply)
    return {"reply": reply}


@app.post("/pause")
async def pause(authorization: str | None = Header(default=None)):
    guard(authorization)
    AGENT.paused = True
    return AGENT.status()


@app.post("/resume")
async def resume(authorization: str | None = Header(default=None)):
    guard(authorization)
    AGENT.paused = False
    return AGENT.status()
