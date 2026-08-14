"""
Native tools for the non-stop operations agent.

Everything here is a plain HTTP call — no vendor SDK, no MCP dependency — so
the agent keeps working even if MCP, Relevance AI, or any single integration
disappears. MCP tools are loaded on top of these, never instead of them.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import httpx
from langchain_core.tools import tool

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
META_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
META_PAGE_ID = os.environ.get("META_PAGE_ID", "")
IG_USER_ID = os.environ.get("IG_USER_ID", "")
GRAPH = "https://graph.facebook.com/v21.0"

_client = httpx.AsyncClient(timeout=90)


def _sb_headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
    }


def _clip(value: Any, limit: int = 6000) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return text[:limit]


# ---------------------------------------------------------------------------
# Backend: read/write anything in the business database, run any edge function
# ---------------------------------------------------------------------------

@tool
async def db_read(table: str, select: str = "*", filters: str = "", limit: int = 20,
                  order: str = "") -> str:
    """Read rows from a database table.

    filters: raw PostgREST query fragment, e.g. "status=eq.open&priority=lte.3".
    order:   e.g. "created_at.desc".
    """
    query = f"select={select}&limit={limit}"
    if filters:
        query += f"&{filters}"
    if order:
        query += f"&order={order}"
    r = await _client.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=_sb_headers())
    return _clip({"status": r.status_code, "rows": r.text})


@tool
async def db_write(table: str, rows_json: str, on_conflict: str = "") -> str:
    """Insert (or upsert, when on_conflict is set) rows into a table. rows_json is a JSON array or object."""
    headers = _sb_headers() | {"Prefer": "return=representation" + (",resolution=merge-duplicates" if on_conflict else "")}
    url = f"{SUPABASE_URL}/rest/v1/{table}" + (f"?on_conflict={on_conflict}" if on_conflict else "")
    r = await _client.post(url, headers=headers, content=rows_json)
    return _clip({"status": r.status_code, "body": r.text})


@tool
async def db_update(table: str, filters: str, patch_json: str) -> str:
    """Update rows matching a PostgREST filter fragment (required, never empty)."""
    if not filters:
        return "refused: an update without a filter would rewrite the whole table"
    headers = _sb_headers() | {"Prefer": "return=representation"}
    r = await _client.patch(f"{SUPABASE_URL}/rest/v1/{table}?{filters}", headers=headers, content=patch_json)
    return _clip({"status": r.status_code, "body": r.text})


@tool
async def invoke_function(name: str, body_json: str = "{}") -> str:
    """Invoke any backend edge function by name with a JSON body. This is how the
    agent reaches booking, quoting, outreach, telegram, whatsapp and voice."""
    r = await _client.post(
        f"{SUPABASE_URL}/functions/v1/{name}",
        headers={"Authorization": f"Bearer {SERVICE_KEY}", "content-type": "application/json"},
        content=body_json,
    )
    return _clip({"status": r.status_code, "body": r.text})


# ---------------------------------------------------------------------------
# Facebook / Instagram (Graph API — application identity, no browser session)
# ---------------------------------------------------------------------------

@tool
async def fb_list_conversations(limit: int = 10) -> str:
    """List the newest Page inbox conversations with their latest message."""
    r = await _client.get(
        f"{GRAPH}/{META_PAGE_ID}/conversations",
        params={"fields": "id,updated_time,participants,messages.limit(3){message,from,created_time}",
                "limit": limit, "access_token": META_TOKEN},
    )
    return _clip(r.text)


@tool
async def fb_send_message(recipient_id: str, message: str) -> str:
    """Reply to a person in the Page inbox (recipient_id is their PSID)."""
    r = await _client.post(
        f"{GRAPH}/{META_PAGE_ID}/messages",
        params={"access_token": META_TOKEN},
        json={"recipient": {"id": recipient_id}, "message": {"text": message},
              "messaging_type": "RESPONSE"},
    )
    return _clip(r.text)


@tool
async def fb_list_comments(limit: int = 10) -> str:
    """List recent comments on the Page's recent posts."""
    r = await _client.get(
        f"{GRAPH}/{META_PAGE_ID}/posts",
        params={"fields": "id,message,created_time,comments.limit(10){id,message,from,created_time}",
                "limit": limit, "access_token": META_TOKEN},
    )
    return _clip(r.text)


@tool
async def fb_reply_comment(comment_id: str, message: str) -> str:
    """Publicly reply to a Facebook comment."""
    r = await _client.post(f"{GRAPH}/{comment_id}/comments",
                           params={"access_token": META_TOKEN}, json={"message": message})
    return _clip(r.text)


@tool
async def fb_post(message: str, link: str = "") -> str:
    """Publish a post on the Facebook Page."""
    payload: dict[str, Any] = {"message": message}
    if link:
        payload["link"] = link
    r = await _client.post(f"{GRAPH}/{META_PAGE_ID}/feed",
                           params={"access_token": META_TOKEN}, json=payload)
    return _clip(r.text)


@tool
async def ig_recent_media(limit: int = 5) -> str:
    """List recent Instagram media with comment counts."""
    r = await _client.get(
        f"{GRAPH}/{IG_USER_ID}/media",
        params={"fields": "id,caption,permalink,timestamp,comments_count,comments{id,text,username}",
                "limit": limit, "access_token": META_TOKEN},
    )
    return _clip(r.text)


@tool
async def ig_reply_comment(comment_id: str, message: str) -> str:
    """Reply to an Instagram comment."""
    r = await _client.post(f"{GRAPH}/{comment_id}/replies",
                           params={"access_token": META_TOKEN, "message": message})
    return _clip(r.text)


# ---------------------------------------------------------------------------
# Reddit (read works anonymously; posting needs script-app credentials)
# ---------------------------------------------------------------------------

_reddit_token: Optional[str] = None


async def _reddit_auth() -> Optional[str]:
    global _reddit_token
    if _reddit_token:
        return _reddit_token
    cid, secret = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and secret):
        return None
    r = await _client.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=(cid, secret),
        data={"grant_type": "password",
              "username": os.environ.get("REDDIT_USERNAME", ""),
              "password": os.environ.get("REDDIT_PASSWORD", "")},
        headers={"User-Agent": os.environ.get("REDDIT_USER_AGENT", "loop-agent/1.0")},
    )
    _reddit_token = r.json().get("access_token")
    return _reddit_token


@tool
async def reddit_search(query: str, subreddit: str = "all", limit: int = 10) -> str:
    """Search Reddit for travel buyers or conversations worth joining."""
    r = await _client.get(
        f"https://www.reddit.com/r/{subreddit}/search.json",
        params={"q": query, "sort": "new", "limit": limit, "restrict_sr": subreddit != "all"},
        headers={"User-Agent": os.environ.get("REDDIT_USER_AGENT", "loop-agent/1.0")},
    )
    return _clip(r.text)


@tool
async def reddit_comment(thing_id: str, text: str) -> str:
    """Comment on a Reddit post or comment (thing_id looks like t3_abc123)."""
    token = await _reddit_auth()
    if not token:
        return "reddit posting not configured (REDDIT_CLIENT_ID/SECRET missing)"
    r = await _client.post(
        "https://oauth.reddit.com/api/comment",
        headers={"Authorization": f"Bearer {token}",
                 "User-Agent": os.environ.get("REDDIT_USER_AGENT", "loop-agent/1.0")},
        data={"thing_id": thing_id, "text": text},
    )
    return _clip(r.text)


# ---------------------------------------------------------------------------
# Phone
# ---------------------------------------------------------------------------

@tool
async def place_call(number: str, goal: str, agent: str = "loop-agent") -> str:
    """Place an outbound voice call. number must be E.164 (+1...)."""
    return await invoke_function.ainvoke(
        {"name": "vapi-call-start", "body_json": json.dumps({"number": number, "goal": goal, "agent": agent})}
    )


NATIVE_TOOLS = [
    db_read, db_write, db_update, invoke_function,
    fb_list_conversations, fb_send_message, fb_list_comments, fb_reply_comment, fb_post,
    ig_recent_media, ig_reply_comment,
    reddit_search, reddit_comment,
    place_call,
]
