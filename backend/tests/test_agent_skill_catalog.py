"""Tests for admin skill catalog helpers (no DB fixture required for builtins)."""

from __future__ import annotations

from app.services.agent_skill_registry import builtin_skill_keys, list_filesystem_skills


def test_filesystem_skills_present() -> None:
    keys = builtin_skill_keys()
    assert "qmdh-image-generate" in keys
    assert "qmdh-image-edit" in keys
    assert len(list_filesystem_skills()) >= 5


def test_filesystem_skill_shape() -> None:
    skills = list_filesystem_skills()
    sample = next(item for item in skills if item["key"] == "qmdh-image-generate")
    assert sample["source"] == "builtin"
    assert sample["deletable"] is False
    assert sample["name"] == "QMDH 生图"
    assert "生图" in sample["description"]
    assert sample["runtime"] == "openclaw"
