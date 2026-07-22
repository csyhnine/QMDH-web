"""Tests for GitHub / npx skill install parsing and bundle storage."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentSkillCatalogEntry, AgentSkillRelease
from app.services.agent_policy_service import resolve_effective_chat_policy
from app.services.agent_skill_install_service import (
    SkillInstallError,
    discover_skill_dirs,
    install_skill_from_source,
    parse_skill_install_source,
    parse_skill_md_frontmatter,
    read_enabled_skill_resource,
)


class ParseSkillSourceTests(unittest.TestCase):
    def test_parse_npx_with_skill_flag(self) -> None:
        parsed = parse_skill_install_source(
            "npx skills add https://github.com/mattpocock/skills --skill grill-me"
        )
        self.assertEqual(parsed.owner, "mattpocock")
        self.assertEqual(parsed.repo, "skills")
        self.assertEqual(parsed.skill_name, "grill-me")

    def test_parse_owner_repo_skill(self) -> None:
        parsed = parse_skill_install_source("vercel-labs/agent-skills/web-design-guidelines")
        self.assertEqual(parsed.owner, "vercel-labs")
        self.assertEqual(parsed.repo, "agent-skills")
        self.assertEqual(parsed.skill_name, "web-design-guidelines")

    def test_parse_tree_url(self) -> None:
        parsed = parse_skill_install_source(
            "https://github.com/owner/repo/tree/main/skills/demo-skill"
        )
        self.assertEqual(parsed.owner, "owner")
        self.assertEqual(parsed.repo, "repo")
        self.assertEqual(parsed.ref, "main")
        self.assertEqual(parsed.path_hint, "skills/demo-skill")
        self.assertEqual(parsed.skill_name, "demo-skill")

    def test_reject_non_github(self) -> None:
        with self.assertRaises(SkillInstallError):
            parse_skill_install_source("https://gitlab.com/owner/repo")

    def test_discover_skill_dirs(self) -> None:
        roots = discover_skill_dirs(
            [
                "skills/a/SKILL.md",
                "skills/a/references/x.md",
                "skills/b/SKILL.md",
                "README.md",
            ]
        )
        self.assertEqual(roots, ["skills/a", "skills/b"])

    def test_frontmatter(self) -> None:
        meta = parse_skill_md_frontmatter(
            "---\nname: demo\ndescription: hello\n---\n\n# Body\n"
        )
        self.assertEqual(meta["name"], "demo")
        self.assertEqual(meta["description"], "hello")


class InstallSkillBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()

    def _mock_client(self) -> MagicMock:
        client = MagicMock()

        def get(url: str, **kwargs):  # noqa: ANN003
            resp = MagicMock()
            resp.status_code = 200
            if url.endswith("/repos/acme/skills"):
                resp.json.return_value = {"default_branch": "main"}
            elif "/git/trees/" in url:
                resp.json.return_value = {
                    "truncated": False,
                    "tree": [
                        {"type": "blob", "path": "skills/grill-me/SKILL.md"},
                        {"type": "blob", "path": "skills/grill-me/references/notes.md"},
                        {"type": "blob", "path": "skills/grill-me/scripts/run.sh"},
                        {"type": "blob", "path": "skills/other/SKILL.md"},
                    ],
                }
            elif "raw.githubusercontent.com" in url:
                if url.endswith("skills/grill-me/SKILL.md"):
                    resp.content = (
                        b"---\nname: Grill Me\ndescription: Ask hard questions\n---\n\n# Grill\nSee references/notes.md\n"
                    )
                elif url.endswith("skills/grill-me/references/notes.md"):
                    resp.content = b"# Notes\nDetail body\n"
                elif url.endswith("skills/grill-me/scripts/run.sh"):
                    resp.content = b"#!/bin/sh\necho hi\n"
                elif url.endswith("skills/other/SKILL.md"):
                    resp.content = b"---\nname: Other\ndescription: other\n---\n\n# Other\n"
                else:
                    resp.status_code = 404
                    resp.content = b""
            else:
                resp.status_code = 404
                resp.json.return_value = {}
                resp.content = b""
            return resp

        client.get.side_effect = get
        return client

    def test_needs_selection_when_multiple(self) -> None:
        with self.SessionLocal() as db:
            result = install_skill_from_source(
                db,
                source="https://github.com/acme/skills",
                client=self._mock_client(),
            )
            self.assertEqual(result["status"], "needs_selection")
            keys = {item["key"] for item in result["candidates"]}
            self.assertEqual(keys, {"grill-me", "other"})

    def test_install_bundle_and_read_resource(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                AgentSkillRelease(
                    key="rel-prod",
                    display_name="Prod",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    chat_tool_allowlist=["search_inspiration_posts"],
                    notes="",
                    is_active=True,
                )
            )
            db.commit()

            result = install_skill_from_source(
                db,
                source="npx skills add https://github.com/acme/skills --skill grill-me",
                client=self._mock_client(),
            )
            self.assertEqual(result["status"], "installed")
            db.commit()

            entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == "grill-me"))
            assert entry is not None
            self.assertIn("SKILL.md", entry.files_json)
            self.assertIn("references/notes.md", entry.files_json)
            self.assertTrue(entry.is_active)
            self.assertEqual(entry.source_repo, "acme/skills")

            ok = read_enabled_skill_resource(db, skill_key="grill-me", relative_path="references/notes.md")
            self.assertTrue(ok["ok"])
            self.assertIn("Detail body", str(ok["content"]))

            policy = resolve_effective_chat_policy(db, environment="prod")
            self.assertIn("grill-me", policy.system_prompt)
            self.assertIn("read_skill_resource", policy.chat_tool_allowlist)

            entry.is_active = False
            db.commit()
            denied = read_enabled_skill_resource(db, skill_key="grill-me", relative_path="references/notes.md")
            self.assertFalse(denied["ok"])
            policy2 = resolve_effective_chat_policy(db, environment="prod")
            self.assertNotIn("### Skill `grill-me`", policy2.system_prompt)


if __name__ == "__main__":
    unittest.main()
