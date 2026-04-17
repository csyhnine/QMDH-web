from __future__ import annotations

import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS_ROOT = REPO_ROOT / "docs"
PROJECTS_ROOT = DOCS_ROOT / "projects"
PROJECT_INDEX_FILE = PROJECTS_ROOT / "project-index.json"

SECTION_MAPPING = {
    "项目概览": "overview",
    "本阶段目标": "goals",
    "当前进展": "progress",
    "风险与阻塞": "risks",
    "最近决策": "decisions",
    "下一步动作": "next_actions",
}

OVERVIEW_MAPPING = {
    "项目名称": "name",
    "项目编号": "code",
    "当前阶段": "current_phase",
    "阶段状态": "phase_status",
    "最近更新时间": "last_updated",
}


def load_project_index() -> dict[str, dict[str, Any]]:
    if not PROJECT_INDEX_FILE.exists():
        return {}

    with PROJECT_INDEX_FILE.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    items = payload.get("projects", [])
    return {item["code"]: item for item in items if "code" in item}


def parse_status_markdown(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    sections: dict[str, list[str]] = {
        "goals": [],
        "progress": [],
        "risks": [],
        "decisions": [],
        "next_actions": [],
    }
    overview: dict[str, str] = {}
    current_section: str | None = None

    with path.open("r", encoding="utf-8") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line:
                continue

            if line.startswith("## "):
                title = line[3:].strip()
                current_section = SECTION_MAPPING.get(title)
                continue

            if not line.startswith("- "):
                continue

            item = line[2:].strip()
            if current_section == "overview":
                delimiter = "：" if "：" in item else ":"
                if delimiter in item:
                    key, value = item.split(delimiter, 1)
                    normalized_key = OVERVIEW_MAPPING.get(key.strip())
                    if normalized_key:
                        overview[normalized_key] = value.strip()
                continue

            if current_section and current_section in sections:
                sections[current_section].append(item)

    return {
        **overview,
        "goals": sections["goals"],
        "progress": sections["progress"],
        "risks": sections["risks"],
        "decisions": sections["decisions"],
        "next_actions": sections["next_actions"],
    }


def load_project_milestones(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    milestones = payload.get("milestones", [])
    return [item for item in milestones if isinstance(item, dict)]


def build_project_status_detail(project_code: str) -> dict[str, Any] | None:
    index = load_project_index()
    project_entry = index.get(project_code)
    if not project_entry:
        return None

    status_path = REPO_ROOT / project_entry["status_file"]
    milestones_path = REPO_ROOT / project_entry["milestones_file"]

    detail = parse_status_markdown(status_path)
    detail["milestones"] = load_project_milestones(milestones_path)
    detail["status_file"] = project_entry["status_file"]
    detail["milestones_file"] = project_entry["milestones_file"]
    detail["current_phase"] = detail.get("current_phase") or project_entry.get("current_phase")
    detail["code"] = detail.get("code") or project_code
    detail["name"] = detail.get("name") or project_entry.get("name", project_code)
    return detail


def build_project_status_map() -> dict[str, dict[str, Any]]:
    project_index = load_project_index()
    status_map: dict[str, dict[str, Any]] = {}

    for project_code in project_index:
        detail = build_project_status_detail(project_code)
        if not detail:
            continue
        status_map[project_code] = {
            "current_phase": detail.get("current_phase"),
            "phase_status": detail.get("phase_status"),
            "last_updated": detail.get("last_updated"),
            "summary": detail.get("progress", [""])[0] if detail.get("progress") else None,
            "next_action": detail.get("next_actions", [""])[0] if detail.get("next_actions") else None,
        }

    return status_map
