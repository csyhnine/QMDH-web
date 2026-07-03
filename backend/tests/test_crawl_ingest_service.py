"""Tests for crawl ingest service."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, InspirationPost, User
from app.services.crawl_ingest_service import (
    CrawlDomainNotAllowedError,
    assert_crawl_domain_allowed,
    import_reference_page_to_inspiration,
)
from app.services.reference_page_service import ReferencePageExtract


class CrawlIngestServiceTests(unittest.TestCase):
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

    def test_assert_crawl_domain_allowed(self) -> None:
        cleaned = assert_crawl_domain_allowed("https://www.archdaily.com/123/example")
        self.assertIn("archdaily.com", cleaned)

    def test_assert_crawl_domain_rejects_unknown_host(self) -> None:
        with self.assertRaises(CrawlDomainNotAllowedError):
            assert_crawl_domain_allowed("https://example.test/article")

    @patch("app.services.crawl_ingest_service.prepare_inspiration_image")
    @patch("app.services.crawl_ingest_service.extract_reference_page")
    @patch("app.services.crawl_ingest_service.upsert_inspiration_post")
    def test_import_creates_post_and_dedupes(self, mock_index, mock_extract, mock_prepare) -> None:
        mock_extract.return_value = ReferencePageExtract(
            source_url="https://www.archdaily.com/123/example",
            title="Example Tower",
            images=("https://images.example.test/cover.jpg",),
        )
        mock_prepare.return_value = "inspiration/external/example-tower.jpg"
        mock_index.return_value = True

        with self._session() as db:
            user = User(name="crawl-user", display_name="Crawl User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            first = import_reference_page_to_inspiration(
                db,
                url="https://www.archdaily.com/123/example",
                user_id=user.id,
            )
            self.assertEqual("created", first.status)
            self.assertIsNotNone(first.inspiration_post_id)

            second = import_reference_page_to_inspiration(
                db,
                url="https://www.archdaily.com/123/example/",
                user_id=user.id,
            )
            self.assertEqual("duplicate", second.status)

            count = len(db.scalars(select(InspirationPost)).all())
            self.assertEqual(1, count)


if __name__ == "__main__":
    unittest.main()
