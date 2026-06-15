import os
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database import Base
from app.integrations.search.service import search_domain
from app.integrations.search.sync import sync_inspiration_index, sync_templates_index
from app.models import InspirationPost, PromptTemplate, User
from app.services.bootstrap import seed_initial_data


class MeilisearchIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    @patch("app.integrations.search.service.settings")
    @patch("app.integrations.search.service._meili_client")
    def test_search_uses_meilisearch_when_enabled(self, mock_client_factory, mock_settings) -> None:
        mock_settings.meilisearch_enabled = True
        mock_settings.meilisearch_inspiration_index = "qmdh_inspiration"
        mock_settings.meilisearch_templates_index = "qmdh_templates"

        index = MagicMock()
        index.search.return_value = {
            "hits": [
                {
                    "id": 42,
                    "title": "曲面玻璃幕墙办公楼",
                    "snippet": "高层办公立面研究",
                    "category": "建筑",
                    "tags": ["玻璃"],
                    "_rankingScore": 0.92,
                }
            ]
        }
        client = MagicMock()
        client.index.return_value = index
        mock_client_factory.return_value = client

        with self.SessionLocal() as db:
            hits = search_domain(db, domain="inspiration", query="玻璃幕墙", limit=10)

        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].id, 42)
        self.assertEqual(hits[0].title, "曲面玻璃幕墙办公楼")
        self.assertEqual(hits[0].score, 0.92)
        index.search.assert_called_once()

    @patch("app.integrations.search.sync._meili_client")
    def test_sync_indexes_push_documents(self, mock_client_factory) -> None:
        index = MagicMock()
        client = MagicMock()
        client.index.return_value = index
        mock_client_factory.return_value = client

        with self.SessionLocal() as db:
            seed_initial_data(db)
            user = db.scalar(select(User).limit(1))
            self.assertIsNotNone(user)
            db.add(
                InspirationPost(
                    title="曲面玻璃幕墙办公楼",
                    description="高层办公立面研究",
                    category="建筑",
                    tags=["玻璃", "幕墙"],
                    source_type="external",
                    source_name="ArchDaily",
                    image_path="inspiration/demo.png",
                )
            )
            db.add(
                PromptTemplate(
                    scope="shared",
                    title="夜景商业综合体",
                    prompt="night city commercial complex, cinematic lighting",
                    category="建筑",
                    subcategory="商业",
                    label="夜景商业综合体",
                    user_id=user.id,
                )
            )
            db.commit()

            inspiration_count = sync_inspiration_index(db)
            template_count = sync_templates_index(db)

        self.assertGreaterEqual(inspiration_count, 1)
        self.assertGreaterEqual(template_count, 1)
        self.assertEqual(index.update_documents.call_count, 2)
        self.assertEqual(index.update_searchable_attributes.call_count, 2)


@unittest.skipUnless(
    os.getenv("QMDH_MEILISEARCH_LIVE_TEST") == "1",
    "Set QMDH_MEILISEARCH_LIVE_TEST=1 to run against a live Meilisearch instance.",
)
class MeilisearchLiveIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_live_sync_and_search(self) -> None:
        with patch.object(settings, "meilisearch_enabled", True), patch.object(
            settings, "meilisearch_url", os.getenv("QMDH_MEILISEARCH_URL", "http://127.0.0.1:7700")
        ), patch.object(settings, "meilisearch_api_key", os.getenv("QMDH_MEILISEARCH_API_KEY", "qmdh_meili_dev_key")):
            with self.SessionLocal() as db:
                seed_initial_data(db)
                db.add(
                    InspirationPost(
                        title="曲面玻璃幕墙办公楼",
                        description="高层办公立面研究",
                        category="建筑",
                        tags=["玻璃", "幕墙"],
                        source_type="external",
                        source_name="ArchDaily",
                        image_path="inspiration/demo.png",
                    )
                )
                db.commit()

                sync_inspiration_index(db)
                hits = search_domain(db, domain="inspiration", query="玻璃幕墙", limit=10)

            self.assertTrue(hits)
            self.assertEqual(hits[0].title, "曲面玻璃幕墙办公楼")


if __name__ == "__main__":
    unittest.main()
