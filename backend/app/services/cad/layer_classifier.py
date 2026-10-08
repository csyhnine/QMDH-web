"""Rule-based CAD layer role classification."""

from __future__ import annotations

from app.services.cad.constants import LAYER_ROLE_RULES


def classify_layer_name(layer_name: str) -> tuple[str, float]:
    normalized = (layer_name or "").strip().lower()
    if not normalized:
        return "other", 0.0

    best_role = "other"
    best_score = 0.0
    for role, keywords in LAYER_ROLE_RULES:
        for keyword in keywords:
            token = keyword.lower()
            if token == normalized:
                return role, 1.0
            if token in normalized:
                score = min(0.95, 0.55 + len(token) / max(len(normalized), 1))
                if score > best_score:
                    best_role = role
                    best_score = score
    return best_role, round(best_score, 2)
