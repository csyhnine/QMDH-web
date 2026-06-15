import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.studio_agent.tools import (
    StudioToolContext,
    list_active_workflows,
    search_inspiration_posts,
    search_shared_templates,
    summarize_generation_stack,
)
from app.models import InspirationPost, PromptTemplate, User
from app.services.bootstrap import seed_initial_data


class StudioAgentToolsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_search_inspiration_posts_returns_hits(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            db.add(
                InspirationPost(
                    title="曲面玻璃幕墙办公楼",
                    description="高层办公立面研究",
                    category="建筑",
                    tags=["玻璃"],
                    source_type="external",
                    source_name="ArchDaily",
                    image_path="inspiration/demo.png",
                )
            )
            db.commit()
            ctx = StudioToolContext(db=db, user_name="tester")
            payload = search_inspiration_posts(ctx, "玻璃幕墙", limit=5)

        self.assertGreaterEqual(len(payload), 1)
        self.assertEqual(payload[0]["title"], "曲面玻璃幕墙办公楼")

    def test_search_shared_templates_returns_hits(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            user = db.scalar(select(User).limit(1))
            db.add(
                PromptTemplate(
                    scope="shared",
                    title="夜景商业综合体",
                    prompt="night city commercial complex",
                    category="建筑",
                    subcategory="商业",
                    label="夜景商业综合体",
                    user_id=user.id,
                )
            )
            db.commit()
            ctx = StudioToolContext(db=db, user_name="tester")
            payload = search_shared_templates(ctx, "夜景商业", limit=5)

        self.assertGreaterEqual(len(payload), 1)
        self.assertEqual(payload[0]["title"], "夜景商业综合体")

    def test_summarize_generation_stack_has_core_sections(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            ctx = StudioToolContext(db=db, user_name="tester")
            payload = summarize_generation_stack(ctx)

        self.assertIn("providers", payload)
        self.assertIn("workflows", payload)
        self.assertIn("notes", payload)

    def test_list_active_workflows_returns_list(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            ctx = StudioToolContext(db=db, user_name="tester")
            payload = list_active_workflows(ctx)

        self.assertIsInstance(payload, list)
        self.assertGreaterEqual(len(payload), 1)
        self.assertIn("key", payload[0])


if __name__ == "__main__":
    unittest.main()
