"""Tests for agent memory service."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import AgentMemoryEntry, Base, User
from app.services.agent_memory_service import (
    add_memory_entry,
    build_memory_context,
    extract_preference_memory,
    search_memory_entries,
)


class AgentMemoryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def _session(self) -> Session:
        return self.session_factory()

    def test_search_and_context(self) -> None:
        with self._session() as db:
            user = User(name="mem-user", display_name="Mem User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            add_memory_entry(
                db,
                user_id=user.id,
                content="偏好 16:9 商业综合体效果图",
                memory_type="preference",
            )
            db.commit()

            hits = search_memory_entries(db, user_id=user.id, query="商业综合体")
            self.assertEqual(1, len(hits))

            context = build_memory_context(db, user_id=user.id, query="商业综合体")
            self.assertIn("16:9", context)

    def test_extract_preference_memory(self) -> None:
        with self._session() as db:
            user = User(name="pref-user", display_name="Pref User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            entry = extract_preference_memory(
                db,
                user_id=user.id,
                user_message="请记住我默认用 16:9",
                conversation_id=1,
            )
            db.commit()
            self.assertIsNotNone(entry)
            assert entry is not None
            self.assertEqual("preference", entry.memory_type)


if __name__ == "__main__":
    unittest.main()
