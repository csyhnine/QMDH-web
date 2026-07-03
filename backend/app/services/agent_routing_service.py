"""Intent routing aligned with Codex/LazyCodex multi-agent dispatch patterns."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.agent_persona_service import (
    RESEARCH_ROUTE_KEYWORDS,
    STUDIO_ROUTE_KEYWORDS,
    AssignedAgentPersona,
    get_persona_from_roster,
)

GREETING_MARKERS: tuple[str, ...] = (
    "你好",
    "您好",
    "hi",
    "hello",
    "谢谢",
    "感谢",
    "再见",
    "在吗",
    "早上好",
    "晚上好",
)


@dataclass(frozen=True)
class RouteDecision:
    route: str  # research | studio | direct | research_then_studio
    reason: str
    confidence: float
    method: str  # rule | score


def _score_keywords(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


def resolve_route(message: str, *, roster: list[AssignedAgentPersona]) -> RouteDecision:
    text = (message or "").strip().lower()
    has_studio = any(item.role == "studio" for item in roster)
    has_research = any(item.role == "research" for item in roster)

    if not text:
        return RouteDecision(route="direct", reason="empty_message", confidence=1.0, method="rule")

    studio_score = _score_keywords(text, STUDIO_ROUTE_KEYWORDS) if has_studio else 0
    research_score = _score_keywords(text, RESEARCH_ROUTE_KEYWORDS) if has_research else 0
    greeting_only = len(text) <= 12 and any(marker in text for marker in GREETING_MARKERS)

    if greeting_only and studio_score == 0 and research_score == 0:
        return RouteDecision(route="direct", reason="greeting", confidence=0.95, method="rule")

    if studio_score > 0 and research_score > 0:
        return RouteDecision(
            route="research_then_studio",
            reason="composite_intent",
            confidence=min(0.95, 0.6 + 0.1 * (studio_score + research_score)),
            method="score",
        )

    if studio_score > 0 and has_studio:
        return RouteDecision(
            route="studio",
            reason="studio_keywords",
            confidence=min(0.95, 0.65 + 0.1 * studio_score),
            method="score",
        )

    if research_score > 0 and has_research:
        return RouteDecision(
            route="research",
            reason="research_keywords",
            confidence=min(0.95, 0.65 + 0.1 * research_score),
            method="score",
        )

    if has_research and len(text) > 4 and not greeting_only:
        return RouteDecision(route="research", reason="default_research_fallback", confidence=0.55, method="score")

    coordinator = get_persona_from_roster(roster, "coordinator")
    if coordinator is not None:
        return RouteDecision(route="direct", reason="coordinator_direct", confidence=0.7, method="rule")

    return RouteDecision(route="direct", reason="fallback", confidence=0.5, method="rule")


def classify_route(message: str, *, roster: list[AssignedAgentPersona]) -> str:
    """Backwards-compatible helper returning primary route key."""
    decision = resolve_route(message, roster=roster)
    if decision.route == "research_then_studio":
        return "research"
    return decision.route
