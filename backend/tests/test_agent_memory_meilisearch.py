"""Tests for Meilisearch-backed agent memory search."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import AgentMemoryEntry, Base, User
from app.services.agent_memory_service import add_memory_entry, search_memory_entries


class AgentMemoryMeilisearchTests(unittest.TestCase):
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

    @patch("app.services.agent_memory_service.settings")
    @patch("app.integrations.search.agent_memory_index.search_agent_memory_entry_ids")
    def test_search_prefers_meilisearch_hits(self, mock_search_ids, mock_settings) -> None:
        mock_settings.meilisearch_enabled = True

        with self._session() as db:
            user = User(name="meili-user", display_name="Meili User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            entry = add_memory_entry(
                db,
                user_id=user.id,
                content="玻璃幕墙高层灵感",
                memory_type="fact",
            )
            db.commit()
            mock_search_ids.return_value = [entry.id]

            hits = search_memory_entries(db, user_id=user.id, query="玻璃幕墙")
            self.assertEqual(1, len(hits))
            self.assertEqual(entry.id, hits[0].id)


if __name__ == "__main__":
    unittest.main()
