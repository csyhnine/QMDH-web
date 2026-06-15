import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.integrations.search.service import search_domain
from app.models import InspirationPost, PromptTemplate
from app.services.bootstrap import seed_initial_data


class SearchIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_search_inspiration_falls_back_to_postgres(self) -> None:
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

            hits = search_domain(db, domain="inspiration", query="玻璃幕墙", limit=10)
            self.assertTrue(hits)
            self.assertEqual(hits[0].title, "曲面玻璃幕墙办公楼")
            self.assertEqual(hits[0].domain, "inspiration")

    def test_search_templates_falls_back_to_postgres(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            from sqlalchemy import select
            from app.models import User

            user = db.scalar(select(User).limit(1))
            self.assertIsNotNone(user)
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

            hits = search_domain(db, domain="templates", query="夜景商业", limit=10)
            self.assertTrue(hits)
            self.assertEqual(hits[0].title, "夜景商业综合体")
            self.assertEqual(hits[0].domain, "templates")


if __name__ == "__main__":
    unittest.main()
