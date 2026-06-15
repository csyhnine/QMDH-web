import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.search.index_hooks import (
    delete_inspiration_post,
    delete_shared_template,
    upsert_inspiration_post,
    upsert_shared_template,
)
from app.models import InspirationPost, PromptTemplate, User
from app.services.bootstrap import seed_initial_data


class SearchIndexHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    @patch("app.integrations.search.index_hooks._meili_client")
    def test_upsert_inspiration_post_updates_document(self, mock_client_factory) -> None:
        index = MagicMock()
        client = MagicMock()
        client.index.return_value = index
        mock_client_factory.return_value = client

        with self.SessionLocal() as db:
            seed_initial_data(db)
            post = InspirationPost(
                title="测试幕墙",
                description="立面研究",
                category="建筑",
                tags=["玻璃"],
                source_type="external",
                source_name="ArchDaily",
                image_path="inspiration/demo.png",
            )
            db.add(post)
            db.commit()
            db.refresh(post)

            self.assertTrue(upsert_inspiration_post(post))

        index.update_documents.assert_called_once()
        document = index.update_documents.call_args.args[0][0]
        self.assertEqual(document["title"], "测试幕墙")

    @patch("app.integrations.search.index_hooks._meili_client")
    def test_delete_shared_template_skips_when_meilisearch_disabled(self, mock_client_factory) -> None:
        mock_client_factory.return_value = None
        self.assertFalse(delete_shared_template(99))

    @patch("app.integrations.search.index_hooks._meili_client")
    def test_upsert_shared_template_ignores_private_scope(self, mock_client_factory) -> None:
        index = MagicMock()
        client = MagicMock()
        client.index.return_value = index
        mock_client_factory.return_value = client

        with self.SessionLocal() as db:
            seed_initial_data(db)
            user = db.scalar(select(User).limit(1))
            template = PromptTemplate(
                scope="private",
                title="私有模板",
                prompt="private prompt",
                category="建筑",
                subcategory="住宅",
                label="私有模板",
                user_id=user.id,
            )

            self.assertFalse(upsert_shared_template(template))

        index.update_documents.assert_not_called()

    @patch("app.integrations.search.index_hooks._meili_client")
    def test_delete_inspiration_post_removes_document(self, mock_client_factory) -> None:
        index = MagicMock()
        client = MagicMock()
        client.index.return_value = index
        mock_client_factory.return_value = client

        self.assertTrue(delete_inspiration_post(12))
        index.delete_document.assert_called_once_with(12)


if __name__ == "__main__":
    unittest.main()
