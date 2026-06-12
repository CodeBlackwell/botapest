"""Botapest City — event relay + city seeding.

Receives Claude Code hook payloads on POST /hook, normalizes them, and
broadcasts to browsers over SSE at GET /events. GET /city-data.json
seeds the configured repo's city on demand (cached per git HEAD).
"""
import asyncio
import json
import os
from collections import deque
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .seed import git, seed
from .zone import load_zone

app = FastAPI()
subscribers: set[asyncio.Queue] = set()
history: deque = deque(maxlen=100)
city = {"repo": ".", "zone_path": None, "head": None, "data": None}
runner = None       # uvicorn.Server, set by cli — lets SSE streams end on Ctrl+C


def configure(repo: str, zone_path: str | None) -> None:
    city.update(repo=repo, zone_path=zone_path, head=None, data=None)

MAX_DETAIL = 80


def normalize(raw: dict) -> dict:
    event = {
        "event": raw.get("hook_event_name", "unknown"),
        "session": (raw.get("session_id") or "")[:8],
    }
    if raw.get("agent_id"):                    # event fired inside a subagent
        event["agent_id"] = raw["agent_id"][:8]
        event["agent_type"] = raw.get("agent_type", "agent")
    tool = raw.get("tool_name")
    if tool:
        event["tool"] = tool
        tool_input = raw.get("tool_input") or {}
        detail = (
            tool_input.get("file_path")
            or tool_input.get("command")
            or tool_input.get("pattern")
            or tool_input.get("query")
            or tool_input.get("url")
            or tool_input.get("description")
            or ""
        )
        if detail.startswith("/"):
            detail = os.path.basename(detail)
        event["detail"] = str(detail)[:MAX_DETAIL]
        file_path, cwd = tool_input.get("file_path") or "", raw.get("cwd") or ""
        if cwd and file_path.startswith(cwd + "/"):
            event["path"] = file_path[len(cwd) + 1:]
        if tool == "Bash" and "git commit" in str(tool_input.get("command") or ""):
            event["commit"] = True
        if tool in ("Task", "Agent"):
            event["agent_type"] = tool_input.get("subagent_type", "agent")
            event["agent_name"] = str(tool_input.get("description", "agent"))[:40]
    if event["event"] == "UserPromptSubmit":
        event["detail"] = str(raw.get("prompt") or "")[:MAX_DETAIL]
    if event["event"] == "Notification":
        event["detail"] = str(raw.get("message") or "")[:MAX_DETAIL]
    return event


@app.post("/hook")
async def hook(request: Request) -> dict:
    raw = await request.json()
    event = normalize(raw)
    history.append(event)
    for queue in subscribers:
        queue.put_nowait(event)
    return {"ok": True}


@app.get("/city-data.json")
def city_data() -> dict:
    head = git(city["repo"], "rev-parse", "HEAD").strip()
    if city["head"] != head:
        city["data"] = seed(city["repo"], load_zone(city["repo"], city["zone_path"]))
        city["head"] = head
    return city["data"]


@app.get("/events")
async def events() -> StreamingResponse:
    queue: asyncio.Queue = asyncio.Queue()
    for event in history:                       # replay so late joiners see state
        queue.put_nowait(event)
    subscribers.add(queue)

    async def stream():
        try:
            yield "retry: 2000\n\n"
            while not (runner and runner.should_exit):
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.middleware("http")
async def no_stale_assets(request: Request, call_next):
    # static files change on every botapest upgrade; force revalidation (304s keep it cheap)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
