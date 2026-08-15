# Non-stop Operations Agent (LangGraph + MCP)

A real backend agent that never stops. It walks a duty cycle forever —

`inbox → comments → follow-ups → post → instagram → reddit → pipeline → inbox → …`

— and you can talk to it at any time; the chat shares the same brain, tools and
activity log as the loop.

## Why LangGraph (not CrewAI)

"Never stops" is a property of the graph: `agent → tools → agent` with a
supervisor that restarts the stream after any crash, recursion ceiling, model
error or MCP outage. CrewAI can loop, but LangGraph makes the loop auditable
and gives a per-step event feed for free.

## Tools

- **Native (always available):** database read/write/update, invoke any backend
  edge function, Facebook inbox/comments/posting, Instagram, Reddit, outbound
  phone calls.
- **MCP (accelerator, never a dependency):** the Relevance AI MCP server is
  loaded at boot over stdio. If it fails, the agent logs it and keeps running
  on native tools.

## Run locally

```bash
cd agent
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in the values
python -m uvicorn api:app --port 8080
```

## Run in Docker (recommended — `restart: always` gives you process-level immortality)

```bash
docker build -t yta-loop-agent ./agent
docker run -d --restart always --env-file agent/.env -p 8080:8080 yta-loop-agent
```

Deploy the same image to Azure Container Apps / any VM. The loop starts with
the process; nothing has to be clicked.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | loop state, current phase, tool list |
| GET | `/activity` | recent beats, newest first |
| POST | `/chat` | talk to the agent (`{"message": "..."}`) |
| POST | `/run` | force one directive now |
| POST | `/pause` / `/resume` | duty-cycle control |

Set `API_TOKEN` and send `Authorization: Bearer <token>` for the write routes.
The admin UI at `/admin/agent` points at this API.

## Security

Rotate the Relevance AI token that was pasted in plaintext, and keep the real
one in `.env` or the container platform's secret store only.
