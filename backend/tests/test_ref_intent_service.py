"""Tests for ref-intent matching service."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.integrations.search.service import SearchHit
from app.models import Base, User
from app.services.ref_intent_service import match_reference_intent


class RefIntentServiceTests(unittest.TestCase):
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

    @patch("app.services.ref_intent_service.search_domain")
    def test_match_merges_inspiration_and_templates(self, mock_search) -> None:
        def _side_effect(db, *, domain, query, limit):
            del db, query, limit
            if domain == "inspiration":
                return [
                    SearchHit(
                        id=1,
                        domain="inspiration",
                        title="玻璃幕墙高层",
                        snippet="黄昏效果",
                        category="建筑",
                        tags=("高层",),
                        score=1.0,
                    )
                ]
            return [
                SearchHit(
                    id=2,
                    domain="templates",
                    title="商业综合体模板",
                    snippet="16:9",
                    category="建筑",
                    tags=("商业",),
                    score=0.9,
                )
            ]

        mock_search.side_effect = _side_effect

        with self._session() as db:
            user = User(name="ref-user", display_name="Ref User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            result = match_reference_intent(
                db,
                description="高层玻璃幕墙 退台",
                reference_image="/media/references/tower-demo.png",
            )
            self.assertEqual(2, len(result.hits))
            self.assertEqual({"inspiration", "templates"}, {hit.domain for hit in result.hits})
            self.assertIn("玻璃幕墙", result.query_used)

    def test_match_requires_input(self) -> None:
        with self._session() as db:
            result = match_reference_intent(db, description="", reference_image="")
            self.assertEqual(0, len(result.hits))
            self.assertIn("请提供", result.empty_reason)


if __name__ == "__main__":
    unittest.main()
