from app.integrations.studio_agent.tools import StudioToolContext

# Avoid eager agent import here to prevent circular imports with chat_agent_task_service.

def __getattr__(name: str):
    if name in {"StudioAgentReply", "StudioAgentUnavailableError", "run_studio_agent"}:
        from app.integrations.studio_agent import agent as _agent

        return getattr(_agent, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "StudioAgentReply",
    "StudioAgentUnavailableError",
    "StudioToolContext",
    "run_studio_agent",
]
