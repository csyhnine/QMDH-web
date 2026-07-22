"""Tests for admin skill catalog enable/disable with SQLite."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentSkillCatalogEntry, AgentSkillRelease
from app.services.agent_skill_registry import (
    create_catalog_skill,
    delete_catalog_skill,
    enabled_skill_keys,
    list_official_skills,
    set_skill_active,
)


class AgentSkillCatalogTests(unittest.TestCase):
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

    def test_create_rejects_builtin_key(self) -> None:
        with self.SessionLocal() as db:
            with self.assertRaises(ValueError):
                create_catalog_skill(db, key="qmdh-image-generate", name="冲突")

    def test_create_delete_syncs_enabled_skills_to_release(self) -> None:
        with self.SessionLocal() as db:
            create_catalog_skill(
                db,
                key="qmdh-custom-demo",
                name="自定义演示",
                description="admin catalog",
                inputs=["title"],
                outputs=["status"],
            )
            release = AgentSkillRelease(
                key="rel-demo",
                display_name="Demo",
                environment="test",
                openclaw_version="latest",
                skill_keys=["qmdh-image-generate", "qmdh-custom-demo"],
                chat_tool_allowlist=["search_inspiration_posts"],
                notes="",
                is_active=True,
            )
            db.add(release)
            db.commit()

            merged = list_official_skills(db)
            assert any(item["key"] == "qmdh-custom-demo" and item["deletable"] for item in merged)

            delete_catalog_skill(db, skill_key="qmdh-custom-demo")
            db.commit()

            remaining = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == "qmdh-custom-demo"))
            self.assertIsNone(remaining)
            db.refresh(release)
            self.assertEqual(release.skill_keys, enabled_skill_keys(db))
            self.assertNotIn("qmdh-custom-demo", release.skill_keys)

    def test_disable_builtin_skill_syncs_releases(self) -> None:
        with self.SessionLocal() as db:
            release = AgentSkillRelease(
                key="rel-demo",
                display_name="Demo",
                environment="test",
                openclaw_version="latest",
                skill_keys=["qmdh-image-generate", "qmdh-image-edit"],
                chat_tool_allowlist=["search_inspiration_posts"],
                notes="",
                is_active=True,
            )
            db.add(release)
            db.commit()

            updated = set_skill_active(db, skill_key="qmdh-image-generate", is_active=False)
            db.commit()
            self.assertFalse(updated["is_active"])

            db.refresh(release)
            self.assertNotIn("qmdh-image-generate", release.skill_keys)
            self.assertIn("qmdh-image-edit", release.skill_keys)

            set_skill_active(db, skill_key="qmdh-image-generate", is_active=True)
            db.commit()
            db.refresh(release)
            self.assertIn("qmdh-image-generate", release.skill_keys)


if __name__ == "__main__":
    unittest.main()
