"""MCP server exposing QMDH Studio tools."""

from __future__ import annotations

import asyncio
import json

from app.database import SessionLocal
from app.core.audit import AuditEventType, write_audit_log
from app.integrations.studio_agent.tools import (
    StudioToolContext,
    list_active_workflows,
    list_enabled_image_providers,
    search_inspiration_posts,
    search_shared_templates,
    summarize_generation_stack,
)


def _json_text(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def run_mcp_tool(db, name: str, arguments: dict | None):
    args = arguments or {}
    ctx = StudioToolContext(db=db, user_name="mcp-client")
    if name == "search_inspiration_posts":
        payload = search_inspiration_posts(ctx, str(args.get("query") or ""), int(args.get("limit") or 8))
    elif name == "search_shared_templates":
        payload = search_shared_templates(ctx, str(args.get("query") or ""), int(args.get("limit") or 8))
    elif name == "list_enabled_image_providers":
        payload = list_enabled_image_providers(ctx)
    elif name == "list_active_workflows":
        payload = list_active_workflows(ctx)
    elif name == "summarize_generation_stack":
        payload = summarize_generation_stack(ctx)
    else:
        raise ValueError(f"Unknown tool: {name}")

    write_audit_log(
        db,
        event_type=AuditEventType.MCP_TOOL_CALL,
        actor_name="mcp-client",
        target_type="mcp_tool",
        target_name=name,
        details={
            "arguments_preview": {key: str(value)[:120] for key, value in args.items()},
            "result_preview": _json_text(payload)[:240],
        },
    )
    return payload


async def _run_stdio_server() -> None:
    try:
        from mcp.server import Server
        from mcp.server.stdio import stdio_server
        from mcp.types import TextContent, Tool
    except ImportError as exc:
        raise RuntimeError("mcp package is not installed.") from exc

    server = Server("qmdh-studio")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="search_inspiration_posts",
                description="Search inspiration library posts by title, tags, prompt, or source.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 8},
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="search_shared_templates",
                description="Search shared Studio prompt templates.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 8},
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="list_enabled_image_providers",
                description="List enabled image/video providers configured in QMDH.",
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="list_active_workflows",
                description="List active workflow keys and provider capabilities.",
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="summarize_generation_stack",
                description="Summarize providers, workflows, and async task execution notes.",
                inputSchema={"type": "object", "properties": {}},
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict | None):
        with SessionLocal() as db:
            payload = run_mcp_tool(db, name, arguments)
            db.commit()
        return [TextContent(type="text", text=_json_text(payload))]

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main() -> None:
    asyncio.run(_run_stdio_server())


if __name__ == "__main__":
    main()
